'use strict';
/**
 * 削除候補の検出と「整合ゲート」(削除してよいかの厳密精査)。
 *
 * 削除は追加より本質的に危険 (競合網羅を落とす・参照を壊す・矛盾を生む)。
 * Daiki の 3 つの絶対要件をコードに落とす:
 *   ① 一次情報は絶対に削除しない (出典/外部リンク/fact根拠を含むブロックは不可)
 *   ② 削除で記事全体・タイトル・アイキャッチに矛盾が生じない
 *   ③ SEO 的に必要な見出しを削除しない (競合フロアの被覆/独自keyword)
 *
 * 段階:
 *   Level 0 = 記事内重複削除 (決定論・無リスク)。完全一致段落の後発を削除し先頭を残す。
 *             情報は残存コピーに保持され、参照・見出し・SEO被覆を一切減らさない → ゲート自動通過。
 *   Level 1 = LLM/人手が提案する冗長削除。consistencyGate で ①②③ を機械精査し、
 *             通過したものだけを Daiki 判定へ回す (自動適用しない)。
 */

const cheerio = require('cheerio');
const { parseTopLevelBlocks } = require('../apply/gutenberg-apply');

const EXTERNAL_LINK_RE = /<a\s[^>]*href\s*=\s*["']https?:\/\//i;
const plain = (m) => m.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const norm = (s) => (s || '').replace(/\s+/g, '').replace(/[、。，．・]/g, '');

// ── Level 0: 記事内重複段落の検出 ───────────────────────────────
// 完全一致(正規化後)の paragraph が 2 回以上 → 先頭を keep、後発を削除候補に。
// 返り値: [{ text, keep:{start,end}, deletes:[{start,end, run_index?}], type:'duplicate_paragraph' }]
function detectDuplicateParagraphs(raw, { minChars = 20 } = {}) {
  const blocks = parseTopLevelBlocks(raw);
  const byText = new Map();
  for (const b of blocks) {
    if (b.type !== 'paragraph') continue;
    if (EXTERNAL_LINK_RE.test(b.markup)) continue;          // ① 出典含む段落は対象外
    const t = norm(plain(b.markup));
    if (t.length < minChars) continue;                       // 短文(定型句)は除外
    if (!byText.has(t)) byText.set(t, []);
    byText.get(t).push(b);
  }
  const out = [];
  for (const [, occ] of byText) {
    if (occ.length < 2) continue;
    const [keep, ...dups] = occ;                             // 先頭を残す
    out.push({
      type: 'duplicate_paragraph',
      text: plain(keep.markup).slice(0, 80),
      count: occ.length,
      keep: { start: keep.start, end: keep.end },
      deletes: dups.map((b) => ({ start: b.start, end: b.end })),
    });
  }
  return out;
}

// ── Level 1: 整合ゲート (削除してよいか) ──────────────────────────
// target = 削除しようとする範囲の markup (run or section)。raw = 記事全体。
// opts.title / opts.eyecatchText / opts.competitorKeywords(任意) で ②③ を補強。
// 返り値: { safe:boolean, violations:[{code,detail}], warnings:[...] }
function consistencyGate(raw, targetMarkup, opts = {}) {
  const violations = [];
  const warnings = [];
  const target = targetMarkup || '';
  const rest = raw.replace(target, '');                      // 削除後に残る本文(近似)

  // ① 一次情報: 出典/外部リンクを含む範囲は削除不可
  if (EXTERNAL_LINK_RE.test(target)) {
    violations.push({ code: 'primary_source', detail: '外部リンク(出典=一次情報)を含む' });
  }

  // ② 参照整合: 範囲内の見出し id / アンカーが他所から参照されていないか
  const ids = [...target.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
  for (const id of ids) {
    if (new RegExp(`href=["']#${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(rest)) {
      violations.push({ code: 'broken_anchor', detail: `削除範囲の id="${id}" が本文/目次からリンク参照されている` });
    }
  }
  // 見出しテキストが目次(同一テキストの内部リンク)に載っているか
  const headingTexts = [...target.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((m) => norm(plain(m[1])));
  for (const ht of headingTexts) {
    if (ht && norm(rest).includes(ht)) {
      warnings.push({ code: 'heading_referenced', detail: `見出し「${ht.slice(0, 24)}」と同一文字列が他所(目次/相互参照の可能性)に存在` });
    }
  }
  // 「前述/上記/先述の通り」等の後方参照が削除で宙に浮かないか (粗い検知)
  if (/前述|上記|先述|前掲|先ほど(述べ|説明)/.test(rest) && headingTexts.length) {
    warnings.push({ code: 'backref_risk', detail: '本文に後方参照表現あり。削除セクションを指していないか要確認' });
  }

  // ③ SEO 見出し: 削除範囲の見出しkeywordが競合に共通被覆されていれば削除はSEO毀損
  const kws = opts.competitorKeywords || [];
  for (const ht of headingTexts) {
    const hit = kws.find((k) => ht.includes(norm(k)));
    if (hit) violations.push({ code: 'seo_coverage', detail: `見出しが競合共通被覆keyword「${hit}」を含む(競合フロア)` });
  }

  // ② タイトル/アイキャッチ矛盾: タイトル語が削除範囲にしか無いと、削除でタイトルが宙に浮く
  for (const claimSrc of [['title', opts.title], ['eyecatch', opts.eyecatchText]]) {
    const [label, text] = claimSrc;
    if (!text) continue;
    const tnorm = norm(text);
    // タイトル/アイキャッチ中の 2gram 以上の語が target にあり rest に無い → 矛盾候補
    const tokens = (text.match(/[一-龠ァ-ヶー]{2,}|[A-Za-z]{3,}/g) || []);
    for (const tok of tokens) {
      const n = norm(tok);
      if (n.length < 2) continue;
      if (norm(target).includes(n) && !norm(rest).includes(n) && tnorm.includes(n)) {
        warnings.push({ code: `${label}_consistency`, detail: `${label}の語「${tok}」が削除範囲のみに存在 → 削除で${label}が裏付け喪失の恐れ` });
      }
    }
  }

  return { safe: violations.length === 0, violations, warnings };
}

module.exports = { detectDuplicateParagraphs, consistencyGate };
