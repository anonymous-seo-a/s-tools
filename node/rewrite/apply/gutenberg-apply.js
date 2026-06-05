'use strict';
/**
 * Gutenberg (content.raw) ベースの適用エンジン。
 *
 * 背景 (2026-06-05 確定):
 *   soico の記事は見出し→次見出しの section 内に、段落・再利用ブロック(wp:block ref)・
 *   独自 CTA ブロック(soico-cta/*)・画像が混在する密な Gutenberg 文書。rendered HTML を
 *   PUT すると再利用/CTA ブロックが平坦化・参照消失するため、content.raw (ブロック markup)
 *   を読み書きする必要がある。
 *
 * Daiki 決定 (適用エンジン初版スコープ):
 *   - insert (insert_before/after/evidence): content_after をブロック markup 化して挿入 (全対応)
 *   - rewrite (rewrite_section/paragraph): section が「保護ブロック」を含まなければ置換、
 *     含めば skip + 報告 (安全な section のみ自動置換)
 *   - meta:* / p# / outline: この層では非対象 (judgment.js で別処理)
 *
 * 設計:
 *   - target_section (h*#見出し) を「アンカー」として raw 内の見出しブロックを特定する。
 *     content_before の完全一致照合はしない (rendered 由来で raw と不一致のため)。
 *   - 全操作を {start,end,markup} の char-offset op に落とし、末尾から splice して適用。
 *
 * 警戒バイアス対チェック:
 *   [11] Adapter 過剰抽象化: 純粋関数群、DB/WP 依存なし
 *   [14] 細分化暴走: ブロックパーサは top-level のみ (入れ子は深さカウントで丸ごと1ブロック扱い)
 */

const cheerio = require('cheerio');

// run (本文の連続塊) を構成できる = 安全に書き換えてよいブロック型。
const SAFE_BLOCK_TYPES = new Set([
  'paragraph', 'list', 'list-item', 'quote', 'table', 'separator', 'spacer',
]);

// content_before(run markup) に紛れていてはいけない保護ブロックの検出 (run 分割不正の防御)。
const PROTECTED_MARKUP_RE = /<!--\s*wp:(?:block|image|html|embed|shortcode)\b|<!--\s*wp:[a-z0-9-]+\//;

// ─────────────────────────────────────────────────────────────
// Gutenberg ブロックパーサ (top-level、入れ子は深さで1ブロックに畳む)
// ─────────────────────────────────────────────────────────────

const BLOCK_DELIM = /<!--\s*(\/?)wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)(\s+\{[\s\S]*?\})?\s*(\/)?-->/g;

/**
 * @param {string} raw content.raw (Gutenberg block markup)
 * @returns {Array<{type, start, end, markup, attrsJson, selfClosing, headingLevel, headingText, isProtected}>}
 */
function parseTopLevelBlocks(raw) {
  const blocks = [];
  const re = new RegExp(BLOCK_DELIM.source, 'g');
  let depth = 0;
  let openStart = -1;
  let openType = null;
  let openAttrs = null;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const [full, closing, type, attrsJson, selfClose] = m;
    if (selfClose) {
      // 自己完結ブロック (例: 再利用ブロック ref, CTA)。depth に影響しない。
      if (depth === 0) blocks.push(makeBlock(raw, m.index, m.index + full.length, type, attrsJson, true));
    } else if (closing) {
      if (depth > 0) {
        depth--;
        if (depth === 0 && openStart >= 0) {
          blocks.push(makeBlock(raw, openStart, m.index + full.length, openType, openAttrs, false));
          openStart = -1; openType = null; openAttrs = null;
        }
      }
    } else {
      // 開始タグ
      if (depth === 0) { openStart = m.index; openType = type; openAttrs = attrsJson || null; }
      depth++;
    }
  }
  return blocks;
}

function makeBlock(raw, start, end, type, attrsJson, selfClosing) {
  const markup = raw.slice(start, end);
  const b = {
    type, start, end, markup,
    attrsJson: attrsJson ? attrsJson.trim() : null,
    selfClosing,
    headingLevel: null,
    headingText: null,
    isProtected: isProtectedType(type),
  };
  if (type === 'heading') {
    const hm = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/i.exec(markup);
    if (hm) {
      b.headingLevel = Number(hm[1].slice(1));
      b.headingText = hm[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }
  }
  return b;
}

function isProtectedType(type) {
  if (type === 'block') return true;          // 再利用ブロック (wp:block {ref})
  if (type === 'image') return true;
  if (type === 'html') return true;           // 生 HTML ブロック (著者挿入、再生成不可)
  if (type === 'embed' || type === 'shortcode') return true;
  if (type.includes('/')) return true;        // 名前空間付き = 独自ブロック (soico-cta/* 等)
  return false;
}

// ─────────────────────────────────────────────────────────────
// target_section → アンカー見出しブロック / section 範囲
// ─────────────────────────────────────────────────────────────

function parseTarget(targetSection) {
  const m = /^h([1-4])#(.+)$/.exec((targetSection || '').trim());
  if (!m) return null;
  return { level: Number(m[1]), text: m[2].trim() };
}

// 見出しブロック index を探す (level + text 一致、先頭一致)
function findHeadingIndex(blocks, target) {
  return blocks.findIndex(
    (b) => b.type === 'heading' && b.headingLevel === target.level && b.headingText === target.text
  );
}

// section 範囲 = アンカー見出し + 次見出しブロック直前まで (extractSelfArticle の nextUntil(headings) と同義)
function sectionBlockRange(blocks, headingIdx) {
  let endIdx = blocks.length - 1;
  for (let i = headingIdx + 1; i < blocks.length; i++) {
    if (blocks[i].type === 'heading') { endIdx = i - 1; break; }
  }
  return { startIdx: headingIdx, endIdx };
}

// section 本文を「run」(保護ブロックで区切られた連続本文ブロックの塊) に分割する。
// 生成側 (diff-runner) が各 run を rewrite 単位として LLM に提示し、content_before に run の
// raw markup を入れる。apply 側はその markup を照合して run の位置で置換する。
//   @returns Array<{ run_index, start, end, markup, text }>
function segmentSectionRuns(raw, blocks, headingIdx) {
  const { endIdx } = sectionBlockRange(blocks, headingIdx);
  const runs = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const first = cur[0], last = cur[cur.length - 1];
    const markup = raw.slice(first.start, last.end);
    runs.push({ run_index: runs.length, start: first.start, end: last.end, markup, text: blocksPlainText(cur) });
    cur = [];
  };
  for (let i = headingIdx + 1; i <= endIdx; i++) {
    const b = blocks[i];
    const editable = !b.isProtected && b.type !== 'heading' && SAFE_BLOCK_TYPES.has(b.type);
    if (editable) cur.push(b); else flush();
  }
  flush();
  return runs;
}

function blocksPlainText(blocks) {
  return blocks.map((b) => b.markup.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

// 保護ブロック型 → 生成プロンプト用の日本語ラベル。
function protectedLabel(type) {
  if (type === 'block') return '再利用ブロック';
  if (type === 'image') return '画像';
  if (type === 'html') return 'HTMLブロック';
  if (type === 'embed') return '埋め込み';
  if (type.startsWith('soico-cta/')) return `部品(${type.replace('soico-cta/', '')})`;
  if (type.includes('/')) return `独自ブロック(${type})`;
  return type;
}

/**
 * content.raw を「見出し section → run(本文塊) と保護ブロックのプレースホルダ」の順序付き
 * 構造に変換する。生成側 (diff-runner) が LLM に提示し、rewrite_run の run_index から
 * content_before(run の raw markup) を解決するのに使う。
 *
 * @returns Array<{ target_section, level, heading,
 *   items: Array<{kind:'run', run_index, text} | {kind:'protected', type, label}>,
 *   runs: Array<{run_index, start, end, markup, text}> }>
 */
function buildRunStructuredView(raw) {
  const blocks = parseTopLevelBlocks(raw);
  const sections = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type !== 'heading' || blocks[i].headingLevel == null) continue;
    const h = blocks[i];
    const { endIdx } = sectionBlockRange(blocks, i);
    const items = [];
    const runs = [];
    let cur = [];
    const flush = () => {
      if (!cur.length) return;
      const first = cur[0], last = cur[cur.length - 1];
      const run = { run_index: runs.length, start: first.start, end: last.end, markup: raw.slice(first.start, last.end), text: blocksPlainText(cur) };
      runs.push(run);
      items.push({ kind: 'run', run_index: run.run_index, text: run.text });
      cur = [];
    };
    for (let j = i + 1; j <= endIdx; j++) {
      const b = blocks[j];
      const editable = !b.isProtected && b.type !== 'heading' && SAFE_BLOCK_TYPES.has(b.type);
      if (editable) cur.push(b);
      else { flush(); items.push({ kind: 'protected', type: b.type, label: protectedLabel(b.type) }); }
    }
    flush();
    sections.push({ target_section: `h${h.headingLevel}#${h.headingText}`, level: h.headingLevel, heading: h.headingText, items, runs });
  }
  return sections;
}

// (target_section, run_index) → run の raw markup を引く resolver を作る。
function makeRunResolver(view) {
  const map = new Map();
  for (const s of view) for (const r of s.runs) map.set(`${s.target_section}#run${r.run_index}`, r.markup);
  return (target_section, runIndex) => map.get(`${target_section}#run${runIndex}`) || null;
}

// ─────────────────────────────────────────────────────────────
// HTML → Gutenberg ブロック markup
// ─────────────────────────────────────────────────────────────

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * content_after (LLM 生成の HTML 断片) を Gutenberg ブロック markup に変換する。
 * 既知の要素のみ native ブロック化、未知要素は wp:html で包んで保全。
 */
function htmlToBlocks(html) {
  if (typeof html !== 'string' || html.trim() === '') return '';
  const $ = cheerio.load(html, { decodeEntities: false });
  const root = $('body').length ? $('body')[0] : null;
  const nodes = root ? root.children : [];
  const out = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      if (!$(node).text().trim()) continue;
      // 裸テキスト → 段落として包む
      out.push(wrapBlock('paragraph', `<p>${$(node).text().trim()}</p>`));
      continue;
    }
    if (node.type === 'comment') {
      // 既に wp: コメントなら素通し (LLM がブロック markup を出した場合)
      out.push($.html(node));
      continue;
    }
    if (node.type !== 'tag') continue;
    const tag = node.tagName.toLowerCase();
    const outer = $.html(node);
    if (tag === 'p') out.push(wrapBlock('paragraph', outer));
    else if (HEADING_TAGS.has(tag)) {
      const lvl = Number(tag.slice(1));
      out.push(wrapBlock('heading', outer, lvl === 2 ? null : { level: lvl }));
    } else if (tag === 'ul' || tag === 'ol') {
      out.push(wrapBlock('list', outer, tag === 'ol' ? { ordered: true } : null));
    } else if (tag === 'table') out.push(wrapBlock('table', `<figure class="wp-block-table">${outer}</figure>`));
    else if (tag === 'blockquote') out.push(wrapBlock('quote', outer));
    else if (tag === 'section' || tag === 'div') {
      // ラッパは展開して子を再帰処理
      const inner = $(node).html() || '';
      const innerBlocks = htmlToBlocks(inner);
      if (innerBlocks) out.push(innerBlocks);
      else out.push(wrapBlock('html', outer)); // 子が無ければ生 HTML 保全
    } else {
      out.push(wrapBlock('html', outer));
    }
  }
  return out.join('\n\n');
}

function wrapBlock(type, innerHtml, attrs) {
  const attrStr = attrs ? ` ${JSON.stringify(attrs)}` : '';
  return `<!-- wp:${type}${attrStr} -->\n${innerHtml}\n<!-- /wp:${type} -->`;
}

// ─────────────────────────────────────────────────────────────
// plan / apply
// ─────────────────────────────────────────────────────────────

const INSERT_TYPES = new Set(['insert_before', 'insert_after', 'insert_evidence']);
const REWRITE_TYPES = new Set(['rewrite_section', 'rewrite_paragraph', 'rewrite_run']);

/**
 * @param {string} raw content.raw
 * @param {Array<{id, target_section, change_type, daiki_judgment, daiki_edit_content, content_after}>} diffs
 * @returns {{planned: Array, skipped: Array, ops: Array}}
 *   ops: {diff_id, start, end, markup}  (end>start=置換, end===start=挿入)
 */
function planGutenbergApply(raw, diffs) {
  const blocks = parseTopLevelBlocks(raw);
  const planned = [];
  const skipped = [];
  const ops = [];

  for (const d of diffs) {
    if (d.daiki_judgment !== 'approved') {
      skipped.push({ diff_id: d.id, reason: `not approved (${d.daiki_judgment})` });
      continue;
    }
    const after = (d.daiki_edit_content || d.content_after || '').trim();
    const isInsert = INSERT_TYPES.has(d.change_type);
    const isRewrite = REWRITE_TYPES.has(d.change_type);
    if (!isInsert && !isRewrite) {
      skipped.push({ diff_id: d.id, reason: `change_type ${d.change_type} はこの層では非対象 (meta/p#/outline は別処理)` });
      continue;
    }
    if (!after) { skipped.push({ diff_id: d.id, reason: 'content_after 空' }); continue; }

    const target = parseTarget(d.target_section);
    if (!target) { skipped.push({ diff_id: d.id, reason: `target_section が h*# でない (${d.target_section})` }); continue; }

    const hIdx = findHeadingIndex(blocks, target);
    if (hIdx < 0) { skipped.push({ diff_id: d.id, reason: 'アンカー見出しが raw に見つからない (記事が変動した可能性)' }); continue; }

    const markup = htmlToBlocks(after);
    if (!markup) { skipped.push({ diff_id: d.id, reason: 'content_after をブロック化できない' }); continue; }

    const anchor = blocks[hIdx];
    const { endIdx } = sectionBlockRange(blocks, hIdx);

    if (isInsert) {
      if (d.change_type === 'insert_before') {
        ops.push({ diff_id: d.id, start: anchor.start, end: anchor.start, markup: markup + '\n\n' });
      } else {
        // insert_after / insert_evidence: section の末尾ブロックの後ろ (次見出し直前)
        const pos = blocks[endIdx].end;
        ops.push({ diff_id: d.id, start: pos, end: pos, markup: '\n\n' + markup });
      }
      planned.push({ diff_id: d.id, target_section: d.target_section, op: d.change_type, after_len: after.length });
      continue;
    }

    // rewrite: content_before(= run の raw markup) を target section 内で照合し、その範囲だけ置換。
    // 保護ブロック(再利用/CTA/画像)は content_before に含まれない=不動。run の位置も保たれるため
    // 「表の後ろの独立本文」も元位置で書き換わる。
    const before = (d.content_before || '').trim();
    if (!before) {
      skipped.push({ diff_id: d.id, reason: 'rewrite に content_before(run markup) が無い (raw/run ベース生成が必要)' });
      continue;
    }
    if (PROTECTED_MARKUP_RE.test(before)) {
      skipped.push({ diff_id: d.id, reason: 'content_before に保護ブロックが含まれる (run 分割不正) → skip' });
      continue;
    }
    const sectionEnd = blocks[endIdx].end;
    const matchAt = raw.indexOf(before, anchor.start);
    if (matchAt < 0 || matchAt >= sectionEnd) {
      skipped.push({ diff_id: d.id, reason: 'run が target section 内に見つからない (記事変動 or content_before 不一致)' });
      continue;
    }
    ops.push({ diff_id: d.id, start: matchAt, end: matchAt + before.length, markup });
    planned.push({ diff_id: d.id, target_section: d.target_section, op: 'rewrite', after_len: after.length });
  }

  return { planned, skipped, ops };
}

/**
 * ops を raw に適用 (末尾から splice して char-offset を保つ)。重なる op は後勝ちを避け skip。
 * @returns {{ raw: string, applied: number, conflicts: Array }}
 */
function applyGutenbergOps(raw, ops) {
  const sorted = [...ops].sort((a, b) => b.start - a.start);
  const conflicts = [];
  let lastStart = Infinity;
  let out = raw;
  let applied = 0;
  for (const op of sorted) {
    if (op.end > lastStart) { conflicts.push(op.diff_id); continue; } // 直前(より後ろ)の op と範囲が重なる
    out = out.slice(0, op.start) + op.markup + out.slice(op.end);
    lastStart = op.start;
    applied++;
  }
  return { raw: out, applied, conflicts };
}

module.exports = {
  parseTopLevelBlocks,
  isProtectedType,
  SAFE_BLOCK_TYPES,
  parseTarget,
  findHeadingIndex,
  sectionBlockRange,
  segmentSectionRuns,
  buildRunStructuredView,
  makeRunResolver,
  protectedLabel,
  htmlToBlocks,
  planGutenbergApply,
  applyGutenbergOps,
};
