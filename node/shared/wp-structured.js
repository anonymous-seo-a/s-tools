/**
 * WP / Competitor 構造化抽出 (shared/ layer)
 *
 * 中間案スコープ (Phase 4 Part 5、Step A-1 後半):
 *   含む:
 *     - cheerio ベース HTML パース
 *     - 自記事用 extractSelfArticle: h タグ階層 (h1〜h4) + 段落テキスト保持
 *     - 競合用 extractCompetitorContent: cheerio.text() フォールバック
 *   含まない (案C 着手時に拡張):
 *     - 監修者ブロック除去
 *     - 目次 (ez-toc) 除去
 *     - CTA バナーマーカー化
 *     - 82% 削減実測の最終形
 *
 * 設計:
 *   依存方向クリーン重視で「自記事用」と「競合用」を別関数に分離。
 *   共通の HTML→cheerio ロード処理は内部 helper。
 *
 * 警戒バイアス対チェック:
 *   [c] Adapter 過剰抽象化  → mode 引数による分岐ではなく別関数
 *   [d] スケルトン作成隠れたコスト → 機能 2 つに限定、案C 機能は実装しない
 */
'use strict';

const cheerio = require('cheerio');

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4'];

function load(html) {
  if (typeof html !== 'string' || html.length === 0) {
    throw new Error('extract: html must be a non-empty string');
  }
  return cheerio.load(html, { decodeEntities: true });
}

function normalizeWhitespace(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * 自記事用: WP REST API content.rendered を想定。
 * h タグ階層 + 段落テキストを保持した構造化結果を返す。
 *
 * @param {string} html
 * @returns {{
 *   headings: Array<{ level: number, text: string }>,
 *   sections: Array<{ heading: string|null, level: number|null, text: string }>,
 *   plain_text: string,
 *   char_count: number,
 * }}
 */
function extractSelfArticle(html) {
  const $ = load(html);

  $('script, style, noscript').remove();

  const headings = [];
  $(HEADING_TAGS.join(',')).each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const level = Number(tag.slice(1));
    const text = normalizeWhitespace($(el).text());
    if (text) headings.push({ level, text });
  });

  const sections = [];
  let current = { heading: null, level: null, parts: [] };

  $('body').length ? $('body').children() : $.root().children();
  const root = $('body').length ? $('body') : $.root();

  root.find('*').each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    if (!tag) return;
    if (HEADING_TAGS.includes(tag)) {
      if (current.parts.length || current.heading) {
        sections.push({
          heading: current.heading,
          level: current.level,
          text: normalizeWhitespace(current.parts.join(' ')),
        });
      }
      current = {
        heading: normalizeWhitespace($(el).text()),
        level: Number(tag.slice(1)),
        parts: [],
      };
    } else if (tag === 'p' || tag === 'li') {
      const t = normalizeWhitespace($(el).text());
      if (t) current.parts.push(t);
    }
  });
  if (current.parts.length || current.heading) {
    sections.push({
      heading: current.heading,
      level: current.level,
      text: normalizeWhitespace(current.parts.join(' ')),
    });
  }

  const plain_text = normalizeWhitespace(root.text());

  return {
    headings,
    sections,
    plain_text,
    char_count: plain_text.length,
  };
}

/**
 * 競合用: 任意 HTML → text() フォールバック。
 * 階層は崩れている前提、純粋プレーンテキスト。
 *
 * @param {string} html
 * @returns {{ plain_text: string, char_count: number, title: string|null }}
 */
function extractCompetitorContent(html) {
  const $ = load(html);

  $('script, style, noscript, header, footer, nav, aside').remove();

  const title = normalizeWhitespace($('title').first().text()) || null;

  const root = $('body').length ? $('body') : $.root();
  const plain_text = normalizeWhitespace(root.text());

  return {
    plain_text,
    char_count: plain_text.length,
    title,
  };
}

/**
 * 段階A PoC 用: passage 分割関数 (additive、既存ロジック非接続)。
 *
 * 既存 extractSelfArticle / extractCompetitorContent の出力を入力に取り、
 * 文字数上限 (既定 400) で passage 配列に分割する。境界優先順位:
 *   1. sections[] (extractSelfArticle が返す heading 区切り) があればそれを基本単位
 *   2. 上限超過したら句読点 (。!? ! ?) で更に分割
 *   3. 句読点なしでも超過する場合は文字数で機械分割
 *
 * competitor 側は sections[] を持たないため plain_text 単一塊から開始する。
 *
 * @param {object} input
 *   self: { sections: Array<{text:string}> } (extractSelfArticle 出力)
 *   competitor: { plain_text: string } (extractCompetitorContent 出力)
 * @param {object} [opts]
 * @param {number} [opts.maxChars=400]
 * @param {number} [opts.minChars=80]
 * @returns {Array<{idx: number, text: string, char_count: number}>}
 */
function splitToPassages(input, opts = {}) {
  const maxChars = opts.maxChars || 400;
  const minChars = opts.minChars || 80;

  const seeds = [];
  if (Array.isArray(input.sections) && input.sections.length > 0) {
    for (const s of input.sections) {
      const t = (s.text || '').trim();
      if (t) seeds.push(t);
    }
  } else if (typeof input.plain_text === 'string' && input.plain_text.trim()) {
    seeds.push(input.plain_text.trim());
  }

  const out = [];
  const punct = /([。！？!?])/g;

  for (const seed of seeds) {
    if (seed.length <= maxChars) {
      out.push(seed);
      continue;
    }
    const sentences = seed.split(punct).reduce((acc, cur, i, arr) => {
      if (i % 2 === 0) {
        const next = arr[i + 1] || '';
        const merged = (cur + next).trim();
        if (merged) acc.push(merged);
      }
      return acc;
    }, []);

    let buf = '';
    for (const s of sentences) {
      if (s.length >= maxChars) {
        if (buf) {
          out.push(buf);
          buf = '';
        }
        for (let i = 0; i < s.length; i += maxChars) {
          out.push(s.slice(i, i + maxChars));
        }
        continue;
      }
      if (buf.length + s.length > maxChars) {
        out.push(buf);
        buf = s;
      } else {
        buf = buf ? `${buf}${s}` : s;
      }
    }
    if (buf) out.push(buf);
  }

  const merged = [];
  for (const t of out) {
    if (merged.length > 0 && t.length < minChars && merged[merged.length - 1].length + t.length <= maxChars) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}${t}`;
    } else {
      merged.push(t);
    }
  }

  return merged.map((text, idx) => ({ idx, text, char_count: text.length }));
}

module.exports = {
  extractSelfArticle,
  extractCompetitorContent,
  splitToPassages,
};
