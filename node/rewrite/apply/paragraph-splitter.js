'use strict';
/**
 * 段落スプリッタ (決定論)。
 *
 * リライト本文の <p> を「折り返して2行以下に収まる分量」のブロックに分割する。
 * soico no1 のハウススタイル (各ブロック間に約40pxの空行リズム) を、LLM の遵守に依存せず保証する。
 *
 * 規則 (実測根拠 2026-06-25, 実記事 securities/4185): 1段落 = **1〜2文**。
 *   段落75個中 1文=36 / 2文=37 / 3文以上=0。文字数 median 65 / p90 84 / max 141。
 *   → ハウススタイルは **最大2文/段落**。1〜2文の段落はそのまま、3文以上の「壁」だけを2文単位に分割する。
 *   （旧Phase1の「1文=1ブロック」は改行過剰で house style から外れていた。2026-06-25 修正)
 *   - 句点 (。！？) 2つごとに区切る (= 最大2文/ブロック)
 *   - 1〜2文の段落は分割しない (chunks.length<=1 で原形維持)
 *   - 文の途中では切らない / inline タグ (<strong>/<a>/<em>等) は壊さず保持
 *
 * content_after は生HTML / Gutenberg ブロックmarkup どちらでも来るため両対応:
 *   - splitParagraphsInHtml: 生HTML の裸 <p> を分割 (htmlToBlocks の raw 経路)
 *   - splitBlockParagraphs : <!-- wp:paragraph --> ブロックを分割 (block markup 経路)
 */

const cheerio = require('cheerio');

const MAX_SENTENCES_PER_BLOCK = 2; // 1段落=最大2文 (実記事4185の house style)

// 単一 <p> の cheerio ノードを「最大2文/チャンク」に分割 (inner HTML 文字列の配列)
function splitPNode($, pNode) {
  const chunks = [];
  let buf = '';       // 構築中のチャンク
  let sentCount = 0;  // チャンク内の文数

  const flush = () => {
    if (buf.trim() !== '') chunks.push(buf);
    buf = '';
    sentCount = 0;
  };

  for (const node of pNode.children || []) {
    if (node.type === 'text') {
      const parts = (node.data || '').split(/(?<=[。！？])/);
      for (const part of parts) {
        if (part === '') continue;
        buf += part;
        if (/[。！？]\s*$/.test(part)) {
          sentCount++;
          if (sentCount >= MAX_SENTENCES_PER_BLOCK) flush(); // 2文ごとに区切る
        }
      }
    } else if (node.type === 'tag') {
      buf += $.html(node); // inline 要素は現在のチャンクに丸ごと付ける
    }
  }
  flush();
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
