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
const { splitParagraphsInHtml, splitBlockParagraphs } = require('./paragraph-splitter');

// run (本文の連続塊) を構成できる = 安全に書き換えてよいブロック型。
const SAFE_BLOCK_TYPES = new Set([
  'paragraph', 'list', 'list-item', 'quote', 'table', 'separator', 'spacer',
]);

// content_before(run markup) に紛れていてはいけない保護ブロックの検出 (run 分割不正の防御)。
const PROTECTED_MARKUP_RE = /<!--\s*wp:(?:block|image|html|embed|shortcode)\b|<!--\s*wp:[a-z0-9-]+\//;

// 外部リンク (出典/参照) を含むブロックは絶対に書き換え・削除しない = run から除外して保護する。
const EXTERNAL_LINK_RE = /<a\s[^>]*href\s*=\s*["']https?:\/\//i;
function hasExternalLink(markup) {
  return EXTERNAL_LINK_RE.test(markup || '');
}

// run を構成できる「編集可能ブロック」か。外部リンク含有ブロック(出典)は除外し保護する。
function isEditableBlock(b) {
  return !b.isProtected && b.type !== 'heading' && SAFE_BLOCK_TYPES.has(b.type) && !hasExternalLink(b.markup);
}

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
// 注: run 分割/rewrite 照合がこれに依存するため「任意レベルの次見出しで止まる」挙動は変えない。
function sectionBlockRange(blocks, headingIdx) {
  let endIdx = blocks.length - 1;
  for (let i = headingIdx + 1; i < blocks.length; i++) {
    if (blocks[i].type === 'heading') { endIdx = i - 1; break; }
  }
  return { startIdx: headingIdx, endIdx };
}

// insert 位置専用の「真のセクション末尾」= 次の level<=L 見出しの直前 (子 H3/H4 は内包する)。
// sectionBlockRange は任意レベルの見出しで止まるため、H3 子を持つ H2 に insert_after すると
// 「H2概要と最初のH3の間」に挿入され階層が壊れる (2026-06-26 securities/8735 で発覚)。
// 階層を考慮し、親見出しセクション全体の末尾を返す。
function sectionEndForInsert(blocks, headingIdx) {
  const level = blocks[headingIdx].headingLevel;
  let endIdx = blocks.length - 1;
  for (let i = headingIdx + 1; i < blocks.length; i++) {
    if (blocks[i].type === 'heading' && blocks[i].headingLevel != null && blocks[i].headingLevel <= level) {
      endIdx = i - 1; break;
    }
  }
  return endIdx;
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
    if (isEditableBlock(b)) cur.push(b); else flush();
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
      if (isEditableBlock(b)) cur.push(b);
      else {
        flush();
        const label = hasExternalLink(b.markup) ? '出典/参照リンク(編集不可)' : protectedLabel(b.type);
        items.push({ kind: 'protected', type: b.type, label });
      }
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

// 箇条書きの house style 装飾 (A: 薄色BOX。既存記事で最多の箇条書き表現)。
function decorateListBoxA(listOuter) {
  // ul/ol に padding-left が無ければ付与 (素のリストを既存スタイルに合わせる)
  const styled = listOuter.replace(/^<(ul|ol)\b([^>]*)>/i, (m, tag, attrs) =>
    /style=/i.test(attrs) ? m : `<${tag}${attrs} style="padding-left:20px; margin:0;">`);
  return `<div style="margin-bottom:15px; padding:12px 16px; background-color:#e6f2ff; border-radius:5px;">\n${styled}\n</div>`;
}

// div/section が「装飾BOX」か (inline style に背景/枠、または box-/swell class)。
function isDecoratedBox($, node) {
  const $el = $(node);
  const cls = ($el.attr('class') || '').toLowerCase();
  if (/box-|soico-cta|swell/.test(cls)) return true;
  const style = ($el.attr('style') || '').toLowerCase();
  if (/background(-color)?\s*:/.test(style) && !/transparent|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0/.test(style)) return true;
  if (/border\s*:\s*[^;]*\b[1-9]/.test(style) || /border-(top|right|bottom|left)\s*:\s*[^;]*\b[1-9]/.test(style)) return true;
  // 直下に装飾された子divを持つ (B ヘッダー付きBOX の外枠など)
  return false;
}

/**
 * content_after (LLM 生成の HTML 断片) を Gutenberg ブロック markup に変換する。
 * 既知の要素のみ native ブロック化、未知要素は wp:html で包んで保全。
 */
function htmlToBlocks(html) {
  if (typeof html !== 'string' || html.trim() === '') return '';
  // 既に Gutenberg block markup なら二重ラップしない (編集欄でブロック markup を直接編集した場合)。
  // ただし wp:paragraph 内の長い <p> は2行ブロックに分割する (空行リズムの保証)。
  if (/^\s*<!--\s*wp:/.test(html)) return splitBlockParagraphs(html.trim());
  // 生HTML: 裸 <p> を2行ブロックに分割してから native ブロック化する。
  html = splitParagraphsInHtml(html);
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
      // 素の箇条書きは house style の薄色BOX(A)で自動装飾 (95%が装飾BOX)。
      out.push(wrapBlock('html', decorateListBoxA(outer)));
    } else if (tag === 'table') out.push(wrapBlock('table', `<figure class="wp-block-table">${outer}</figure>`));
    else if (tag === 'blockquote') out.push(wrapBlock('quote', outer));
    else if (tag === 'section' || tag === 'div') {
      // 装飾BOX (LLM が出した B ヘッダー付きBOX 等、inline style の背景/枠 or box-class) は
      // そのまま wp:html で保全 (再帰すると中の <ul> を二重装飾してしまう)。
      if (isDecoratedBox($, node)) { out.push(wrapBlock('html', outer)); continue; }
      // ただのラッパは展開して子を再帰処理
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

// 段落間の空ブロック挿入は廃止 (2026-06-25)。
//   実記事(securities/4185)の実リズム計測で空SPACERブロックは 0、段落間は通常のブロック余白のみ。
//   Phase1 の `<p>&nbsp;</p>` 挿入は「改行入れすぎ」で house style から外れていた (Daiki 実環境確認)。
//   段落リズムは paragraph-splitter (1段落=最大2文) のみで担保する。

// ─────────────────────────────────────────────────────────────
// plan / apply
// ─────────────────────────────────────────────────────────────

const INSERT_TYPES = new Set(['insert_before', 'insert_after', 'insert_evidence']);
const REWRITE_TYPES = new Set(['rewrite_section', 'rewrite_paragraph', 'rewrite_run']);
const DELETE_TYPES = new Set(['delete_run', 'delete_section']);

// 末尾/先頭の余分な空行を1つに畳む (削除で空行が連続するのを防ぐ)。
function trimDeletionSeam(raw, start, end) {
  // 削除範囲の前後に連続する改行を 2つ(段落区切り1つ)に正規化する。
  let s = start, e = end;
  while (s > 0 && /\s/.test(raw[s - 1])) s--;
  while (e < raw.length && /\s/.test(raw[e])) e++;
  return { start: s, end: e, sep: '\n\n' };
}

/**
 * 削除 op を計画する。安全第一: 一次情報(外部リンク=出典)・保護ブロック(再利用/CTA/画像/html/
 * embed)を含む範囲は決して削除しない。範囲特定はこの apply 層の責務に限定し、
 * 「削除してよいか」の意味判断(SEO見出し/参照整合/タイトル矛盾)は生成側ゲート(deletion-analyzer)が担う。
 *   - delete_run:     content_before(run markup) を section 内で一意照合し、その範囲を削除。
 *   - delete_section: target_section の見出しから 次の同格以上見出し直前まで(子H3含む)を削除。
 * @returns {{start,end} | {skip}}
 */
function planDelete(raw, blocks, d) {
  if (d.change_type === 'delete_run') {
    const before = (d.content_before || '').trim();
    if (!before) return { skip: 'delete_run: content_before(run markup) が無い' };
    if (PROTECTED_MARKUP_RE.test(before)) return { skip: 'delete対象に保護ブロックが含まれる → 拒否' };
    if (hasExternalLink(before)) return { skip: 'delete対象に外部リンク(出典=一次情報) → 拒否' };
    const idx = raw.indexOf(before);
    if (idx < 0) return { skip: 'delete対象 run が raw に見つからない (記事変動)' };
    if (raw.indexOf(before, idx + 1) >= 0) return { skip: 'delete対象 run markup が複数一致 (一意特定できず) → 拒否' };
    const seam = trimDeletionSeam(raw, idx, idx + before.length);
    return { start: seam.start, end: seam.end };
  }
  // delete_section
  const target = parseTarget(d.target_section);
  if (!target) return { skip: `delete_section: target_section が h*# でない (${d.target_section})` };
  const hIdx = findHeadingIndex(blocks, target);
  if (hIdx < 0) return { skip: 'delete_section: アンカー見出しが raw に見つからない' };
  const endIdx = sectionEndForInsert(blocks, hIdx); // 子H3/H4 を内包する真のセクション末尾
  const rangeStart = blocks[hIdx].start;
  const rangeEnd = blocks[endIdx].end;
  const slice = raw.slice(rangeStart, rangeEnd);
  // セクション内に保護ブロックや出典を一つでも含むなら削除しない (一次情報/再利用ブロック保護)。
  if (PROTECTED_MARKUP_RE.test(slice)) return { skip: 'delete_section: 範囲に保護ブロック(再利用/CTA/画像/html)を含む → 拒否' };
  if (hasExternalLink(slice)) return { skip: 'delete_section: 範囲に外部リンク(出典=一次情報)を含む → 拒否' };
  const seam = trimDeletionSeam(raw, rangeStart, rangeEnd);
  return { start: seam.start, end: seam.end };
}

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

    // 空BOX補完: content_before(空BOX markup) を raw 内で照合し、その範囲を filled BOX に置換。
    // 見出しアンカーではなく markup 一致で位置特定する (offset 変動に強い)。
    if (d.change_type === 'fill_empty_box') {
      const before = (d.content_before || '').trim();
      if (!before || !after) { skipped.push({ diff_id: d.id, reason: 'fill_empty_box: content_before/after 空' }); continue; }
      const idx = raw.indexOf(before);
      if (idx < 0) { skipped.push({ diff_id: d.id, reason: '空BOX が raw に見つからない (記事変動の可能性)' }); continue; }
      if (raw.indexOf(before, idx + 1) >= 0) { skipped.push({ diff_id: d.id, reason: '空BOX markup が複数一致 (一意特定できず) → skip' }); continue; }
      ops.push({ diff_id: d.id, start: idx, end: idx + before.length, markup: after });
      planned.push({ diff_id: d.id, target_section: d.target_section, op: 'fill_empty_box', after_len: after.length });
      continue;
    }

    // 削除 (delete_run / delete_section)。content_after 不要。安全ガードを最優先で適用:
    //   保護ブロック(再利用/CTA/画像/html) と 外部リンク(出典=一次情報) を含む範囲は絶対に削除しない。
    if (DELETE_TYPES.has(d.change_type)) {
      const del = planDelete(raw, blocks, d);
      if (del.skip) { skipped.push({ diff_id: d.id, reason: del.skip }); continue; }
      ops.push({ diff_id: d.id, start: del.start, end: del.end, markup: '' });
      planned.push({ diff_id: d.id, target_section: d.target_section, op: d.change_type, after_len: 0 });
      continue;
    }

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
        // insert_after / insert_evidence: 親セクション全体の末尾(子H3/H4を内包)に挿入し、
        // さらに末尾の CTA/ボタン(再利用ブロック・soico-cta/*)があればその手前へ巻き戻す。
        //   - 階層対応: securities/8735 (新H2が親H2の最初のH3の前に入る不具合)
        //   - CTA巻き戻し: securities/7344 (CTAボタンの下に本文が入る不具合)
        let insIdx = sectionEndForInsert(blocks, hIdx);
        const isTailCta = (b) => b.type === 'block' || b.type.startsWith('soico-cta/');
        while (insIdx > hIdx && isTailCta(blocks[insIdx])) insIdx--;
        const pos = blocks[insIdx].end;
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
    if (hasExternalLink(before)) {
      // 出典/参照リンクを含む範囲は絶対に書き換えない (リンク消失防止)。
      skipped.push({ diff_id: d.id, reason: 'content_before に外部リンク(出典)が含まれる → 保護のため skip' });
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
  // start 降順で末尾から splice。同一 start の挿入(複数 op が同一アンカー末尾を指す)は、
  // 元の ops 配列順(=diff_order 昇順)が出力で保たれるよう index 降順をタイブレークにする。
  // (末尾から処理するため、後に処理した op ほど左=先頭に来る → index 大を先に処理させる)
  const decorated = ops.map((op, i) => ({ op, i }));
  decorated.sort((a, b) => (b.op.start - a.op.start) || (b.i - a.i));
  const conflicts = [];
  let lastStart = Infinity;
  let out = raw;
  let applied = 0;
  for (const { op } of decorated) {
    if (op.end > lastStart) { conflicts.push(op.diff_id); continue; } // 直前(より後ろ)の op と範囲が重なる
    out = out.slice(0, op.start) + op.markup + out.slice(op.end);
    lastStart = op.start;
    applied++;
  }
  return { raw: out, applied, conflicts };
}

/**
 * バッチ適用 (二段/反復)。op 間の依存 — あるinsertが生成した見出しを別diffが
 * アンカーにするケース — を解決する。plan は元raw1回パースのため、新規見出しを
 * 参照する diff は「アンカー未検出」で skip される (2026-06-26 securities/8735)。
 * 「アンカー未検出」で落ちた diff だけを、前段適用後の新raw で再プランして反復する。
 *
 * @returns {{ raw, planned: Array, skipped: Array, conflicts: Array }}
 *   planned/skipped は plan*() と同形 (diff_id を含む)。
 */
const ANCHOR_MISS_RE = /アンカー見出しが raw に見つからない/;
function applyBatch(raw, diffs) {
  let cur = raw;
  let remaining = diffs;
  const planned = [];
  const conflicts = [];
  const skipped = [];
  // 反復上限 = diff 数 + 1 (アンカーが永久に現れない diff は ops 0 で確定 skip に落ちる)
  for (let pass = 0; pass <= diffs.length; pass++) {
    const p = planGutenbergApply(cur, remaining);
    if (p.ops.length) {
      const a = applyGutenbergOps(cur, p.ops);
      cur = a.raw;
      conflicts.push(...a.conflicts);
    }
    planned.push(...p.planned);
    const noProgress = p.ops.length === 0;
    const retryIds = new Set(
      p.skipped.filter((s) => !noProgress && ANCHOR_MISS_RE.test(s.reason)).map((s) => s.diff_id)
    );
    // 再試行対象でない skip は確定 (noProgress 時はアンカー未検出も解決不能=確定)
    for (const s of p.skipped) if (!retryIds.has(s.diff_id)) skipped.push(s);
    if (noProgress || retryIds.size === 0) break;
    remaining = remaining.filter((d) => retryIds.has(d.id));
  }
  return { raw: cur, planned, skipped, conflicts };
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
  sectionEndForInsert,
  planDelete,
  DELETE_TYPES,
  planGutenbergApply,
  applyGutenbergOps,
  applyBatch,
};
