'use strict';
/**
 * 工程6'-D 前段: 適用直前 class/style 補完 (issue #1 α)。
 *
 * 背景:
 *   wp-structured.extractSelfArticle は .text() 抽出のため、Sonnet (工程6'-B) には
 *   plain_text + heading level/text のみが渡る。Sonnet が再構成する content_after は
 *   素 HTML (class/style なし) になる。本番 WP に適用すると theme / Gutenberg block
 *   class が当たらず見た目が崩れる。
 *
 * 戦略 α (最小):
 *   - WP raw content.rendered からタグ別の canonical class set を抽出 (頻度多数決)
 *   - 素 HTML の各タグに canonical class を補完 (既存 class はそのまま尊重)
 *
 * 真=美テスト:
 *   必然性: WP raw を見ないと class は復元不可、入力情報として必須
 *   閉合性: 入力 (素 HTML + WP raw) → 出力 (class 付き HTML)、副作用なし
 *   最小性: 多数決 1 関数。タグ別の context-aware はしない (将来拡張)。
 *
 * 警戒バイアス:
 *   [11] Adapter 過剰抽象化: theme 個別 class セットを別レイヤー化しない、cardloan サイト固有値で動く
 *   [10] JSON Schema 過剰汎用化: 入出力は文字列 HTML、検証なし
 *   [12] スケルトン隠れたコスト: WP raw が空でも素 HTML を素通し
 *
 * 入出力:
 *   buildClassMap(originalWpHtml) → Map<tag, Array<{class, style, n}>>
 *   injectClasses({ contentHtml, classMap }) → { html, stats }
 */

const cheerio = require('cheerio');

const TARGET_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span', 'strong', 'em', 'a', 'img', 'figure', 'blockquote'];

/**
 * 元 WP HTML からタグ別の class / style 多数決マップを構築。
 * @param {string} originalWpHtml
 * @returns {Map<string, Array<{cls: string, style: string|null, count: number}>>}
 */
function buildClassMap(originalWpHtml) {
  const map = new Map();
  if (!originalWpHtml || typeof originalWpHtml !== 'string') return map;
  const $ = cheerio.load(originalWpHtml, { decodeEntities: true });
  for (const tag of TARGET_TAGS) {
    const buckets = new Map(); // key = "cls|style" → count
    $(tag).each((_, el) => {
      const cls = ($(el).attr('class') || '').trim();
      const style = ($(el).attr('style') || '').trim() || null;
      // plain も bucketing 対象 (majority plain なら inject されない)
      const key = `${cls}${style || ''}`;
      const cur = buckets.get(key) || { cls, style, count: 0 };
      cur.count += 1;
      buckets.set(key, cur);
    });
    if (buckets.size > 0) {
      const arr = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
      map.set(tag, arr);
    }
  }
  return map;
}

/**
 * 素 HTML に canonical class/style を補完。
 * @param {object} args
 * @param {string} args.contentHtml      Sonnet 生成 HTML (cheerio パース可能)
 * @param {Map} args.classMap            buildClassMap の結果
 * @param {boolean} [args.overwrite]     既存 class を上書きするか (既定 false)
 * @returns {{ html: string, stats: { injected: number, skipped: number, by_tag: Object } }}
 */
function injectClasses({ contentHtml, classMap, overwrite = false }) {
  if (!contentHtml || typeof contentHtml !== 'string') {
    return { html: contentHtml ?? '', stats: { injected: 0, skipped: 0, by_tag: {} } };
  }
  if (!(classMap instanceof Map) || classMap.size === 0) {
    return { html: contentHtml, stats: { injected: 0, skipped: 0, by_tag: {} } };
  }

  const $ = cheerio.load(contentHtml, { decodeEntities: true, xmlMode: false });
  const stats = { injected: 0, skipped: 0, by_tag: {} };

  for (const tag of TARGET_TAGS) {
    const candidates = classMap.get(tag);
    if (!candidates || candidates.length === 0) continue;
    const top = candidates[0]; // canonical: 最頻
    if (!top.cls && !top.style) continue; // plain majority → 何も注入しない
    $(tag).each((_, el) => {
      const $el = $(el);
      const hasCls = !!($el.attr('class') || '').trim();
      const hasStyle = !!($el.attr('style') || '').trim();
      if (!overwrite && (hasCls || hasStyle)) {
        stats.skipped += 1;
        return;
      }
      if (top.cls) $el.attr('class', top.cls);
      if (top.style) $el.attr('style', top.style);
      stats.injected += 1;
      stats.by_tag[tag] = (stats.by_tag[tag] || 0) + 1;
    });
  }

  // cheerio.load は fragment を <html><head><body>... でラップするため body 内側を返す
  const html = $('body').html() || $.html();
  return { html, stats };
}

module.exports = {
  buildClassMap,
  injectClasses,
  TARGET_TAGS,
};
