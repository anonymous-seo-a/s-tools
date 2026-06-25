'use strict';
/**
 * 可読性バリデータ (決定論)。
 *
 * soico no1 ハウススタイルの実測 (Playwright 実機DOM・人間執筆24記事) に基づく定量ガード。
 * content_after (diff 単位の HTML 断片) を検査し、過剰統合・本文の壁を違反フラグ化する。
 * 自動承認ラインからの除外判定に使う (LLM 指示は柔らかいため、機械チェックで担保する層)。
 *
 * 実測根拠 (2026-06-23):
 *   段落字数      : mean 82 / p90 127 / p95 144 / max 302
 *   連続プレーン run: median 111 / p90 265 / p95 312 / max 723
 *   → 規範を超える過剰統合・本文の壁のみを検出する保守的な上限に設定。
 *
 * 視覚要素率(85%)・太字密度(5/1000字) は記事全体の集計値で diff 断片では強制できないため、
 * ここでは検査しない (生成プロンプトの既定値で担保)。
 */

const cheerio = require('cheerio');

// ハードNG 閾値 (これを超えたら違反)。ソフト目標 (段落≤120 / run≤300) はプロンプト側。
// 規範 = 人間執筆実測。閾値は「規範の実上限を超える明確な逸脱」のみ捕捉する保守設定:
//   段落  : 人間規範 max 302 (定型ボイラープレートで 279〜302 が実在) → 320 超のみ違反 (5737の384を捕捉)
//   プレーンrun: 人間規範(実機DOM) p95 312 / 過半が ≤312 → 450 超を違反 (劣化リライトの壁を捕捉)
// 280〜320 のグレー段落・300〜450 の中程度 run はプロンプトのソフト目標で抑える (バリデータは明確逸脱のみ)。
const PARAGRAPH_MAX_CHARS = 320; // 規範 max 302 の上。過剰統合(改行欠落)の明確逸脱を捕捉
const PLAIN_RUN_MAX_CHARS = 450; // 規範 p95 312 の上。視覚要素なしの本文の壁を捕捉

const VISUAL_TAGS = new Set(['ul', 'ol', 'table', 'figure', 'blockquote', 'img', 'iframe']);
const HEADING_RE = /^h[1-6]$/;

// 空白を除いた実文字数 (日本語の体感行数に対応させるため)
const jaLen = (s) => (s || '').replace(/\s+/g, '').length;

/**
 * cheerio ノードが視覚要素か (実機DOMの computed-style 判定を断片用に近似)。
 *   - 視覚タグ、または視覚タグを子孫に持つ
 *   - class が box-* / soico-cta / swell 系
 *   - inline style に背景色 or border (装飾divボックス)
 */
function isVisual($, node) {
  if (node.type !== 'tag') return false;
  const tag = node.tagName.toLowerCase();
  if (VISUAL_TAGS.has(tag)) return true;
  const $el = $(node);
  const cls = ($el.attr('class') || '').toLowerCase();
  if (/box-|soico-cta|swell|rkt-pr|wp-block-(table|image|quote|gallery)/.test(cls)) return true;
  if ($el.find('table, img, ul, ol, figure, iframe').length > 0) return true;
  const style = ($el.attr('style') || '').toLowerCase();
  if (/background(-color)?\s*:\s*(?!(transparent|#fff|#ffffff|white|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0))/.test(style)) return true;
  if (/border(-[a-z]+)?\s*:\s*[^;]*\b([1-9]\d*)(px|em|rem)/.test(style)) return true;
  // 直下に装飾divを持つラッパ
  for (const ch of node.children || []) {
    if (ch.type === 'tag' && ch.tagName.toLowerCase() === 'div') {
      const cstyle = ($(ch).attr('style') || '').toLowerCase();
      if (/background(-color)?\s*:/.test(cstyle) || /border(-[a-z]+)?\s*:\s*[^;]*\b[1-9]/.test(cstyle)) return true;
    }
  }
  return false;
}

/**
 * @param {string} html  content_after (HTML 断片 / Gutenberg block markup 可)
 * @returns {{ violations: Array<{type, detail, chars}> }}
 */
function checkReadability(html) {
  const violations = [];
  if (typeof html !== 'string' || html.trim() === '') return { violations };

  const $ = cheerio.load(html, { decodeEntities: false });
  const root = $('body').length ? $('body')[0] : null;
  const nodes = root ? root.children : [];

  let plainRun = 0; // 視覚要素・見出しを挟まない連続プレーン本文の文字数

  const flushRun = () => {
    if (plainRun > PLAIN_RUN_MAX_CHARS) {
      violations.push({ type: 'plain_run_too_long', detail: `視覚要素なしで本文が ${plainRun} 字連続 (上限 ${PLAIN_RUN_MAX_CHARS})`, chars: plainRun });
    }
    plainRun = 0;
  };

  for (const node of nodes) {
    if (node.type === 'comment') continue; // wp: コメントは構造に影響しない
    if (node.type === 'text') {
      const L = jaLen($(node).text());
      if (L > 0) plainRun += L;
      continue;
    }
    if (node.type !== 'tag') continue;
    const tag = node.tagName.toLowerCase();

    if (HEADING_RE.test(tag)) { flushRun(); continue; }

    if (isVisual($, node)) { flushRun(); continue; }

    // プレーン本文 (p / 装飾なし div など)
    const L = jaLen($(node).text());
    if (tag === 'p' && L > PARAGRAPH_MAX_CHARS) {
      violations.push({ type: 'paragraph_too_long', detail: `段落が ${L} 字 (上限 ${PARAGRAPH_MAX_CHARS}・過剰統合)`, chars: L });
    }
    plainRun += L;
  }
  flushRun();

  return { violations };
}

module.exports = {
  checkReadability,
  PARAGRAPH_MAX_CHARS,
  PLAIN_RUN_MAX_CHARS,
};
