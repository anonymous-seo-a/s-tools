'use strict';
/**
 * 段落スプリッタ (決定論)。
 *
 * リライト本文の <p> を「折り返して2行以下に収まる分量」のブロックに分割する。
 * soico no1 のハウススタイル (各ブロック間に約40pxの空行リズム) を、LLM の遵守に依存せず保証する。
 *
 * 規則 (実測根拠 2026-06-23): 実記事4722の段落ブロック158個中148個(94%)が「1文1ブロック」。
 *   → soico no1 のハウススタイルは **1文 = 1ブロック**。短文でも結合しない (結合すると空行が減る)。
 *   - 句点 (。！？) ごとに必ず別ブロック
 *   - 1文が2行を超えても文の途中では切らない (その文だけで1ブロック)
 *   - inline タグ (<strong>/<a>/<em>等) は壊さず保持
 *
 * content_after は生HTML / Gutenberg ブロックmarkup どちらでも来るため両対応:
 *   - splitParagraphsInHtml: 生HTML の裸 <p> を分割 (htmlToBlocks の raw 経路)
 *   - splitBlockParagraphs : <!-- wp:paragraph --> ブロックを分割 (block markup 経路)
 */

const cheerio = require('cheerio');

// 単一 <p> の cheerio ノードを「1文1チャンク」に分割 (inner HTML 文字列の配列)
function splitPNode($, pNode) {
  const chunks = [];
  let sentHtml = ''; // 構築中の1文

  const flushSentence = () => {
    if (sentHtml.trim() !== '') chunks.push(sentHtml);
    sentHtml = '';
  };

  for (const node of pNode.children || []) {
    if (node.type === 'text') {
      const parts = (node.data || '').split(/(?<=[。！？])/);
      for (const part of parts) {
        if (part === '') continue;
        sentHtml += part;
        if (/[。！？]\s*$/.test(part)) flushSentence(); // 文末ごとに必ず区切る (結合しない)
      }
    } else if (node.type === 'tag') {
      sentHtml += $.html(node); // inline 要素は現在の文に丸ごと付ける
    }
  }
  flushSentence();
  return chunks.filter((c) => c.trim() !== '');
}

// 単一 <p>...</p> 文字列 → ["<p>..</p>", ...]
function splitSinglePHtml(pHtml) {
  const $ = cheerio.load(pHtml, { decodeEntities: false });
  const p = $('p').first();
  if (!p.length) return [pHtml];
  const chunks = splitPNode($, p[0]);
  if (chunks.length <= 1) return [pHtml];
  // 元 <p> の属性を保持
  const attrs = p[0].attribs || {};
  const attrStr = Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('');
  return chunks.map((c) => `<p${attrStr}>${c}</p>`);
}

// 生HTML: トップレベルの裸 <p> を分割 (他要素はそのまま)
function splitParagraphsInHtml(html) {
  if (typeof html !== 'string' || html.trim() === '') return html;
  const $ = cheerio.load(html, { decodeEntities: false });
  const root = $('body').length ? $('body')[0] : null;
  if (!root) return html;
  let out = '';
  for (const node of root.children) {
    if (node.type === 'tag' && node.tagName.toLowerCase() === 'p') {
      out += splitSinglePHtml($.html(node)).join('');
    } else {
      out += $.html(node);
    }
  }
  return out;
}

// ブロックmarkup: <!-- wp:paragraph --> <p>..</p> <!-- /wp:paragraph --> を分割
function splitBlockParagraphs(markup) {
  if (typeof markup !== 'string' || markup.trim() === '') return markup;
  return markup.replace(
    /<!--\s*wp:paragraph\s*-->\s*([\s\S]*?)\s*<!--\s*\/wp:paragraph\s*-->/g,
    (full, inner) => {
      if (!/^\s*<p[\s>]/i.test(inner)) return full; // <p> 以外 (画像段落等) は触らない
      const chunks = splitSinglePHtml(inner.trim());
      if (chunks.length <= 1) return full;
      return chunks.map((c) => `<!-- wp:paragraph -->\n${c}\n<!-- /wp:paragraph -->`).join('\n\n');
    }
  );
}

module.exports = { splitParagraphsInHtml, splitBlockParagraphs, splitSinglePHtml };
