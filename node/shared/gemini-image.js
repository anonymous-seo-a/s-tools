'use strict';

/**
 * Gemini 画像生成アダプタ (shared/ レイヤ)
 *
 * 本番 node サーバから Gemini REST API を直接叩いてアイキャッチ画像を生成する。
 * (Claude Code の image-gen スキルは Python venv なので本番では使えないため独立実装)
 *
 * 用途: リライトでタイトルを差し替える際、新タイトルを記載した 16:9 のアイキャッチを生成し
 *       WP の featured image に差し替える (judgment.js applySessionCore から呼ばれる)。
 *
 * 前提: GEMINI_API_KEY を node/.env に設定 (image-gen スキルと同じキーで可)。
 */

const DEFAULT_MODEL = 'gemini-3-pro-image-preview';
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// content_raw (Gutenberg/HTML) から本文の要旨を平文で抽出 (画像の視覚テーマ用、最大 maxLen 文字)。
function summarizeContent(contentRaw, maxLen = 400) {
  if (!contentRaw) return '';
  const text = String(contentRaw)
    .replace(/<!--[\s\S]*?-->/g, ' ')   // Gutenberg ブロックコメント除去
    .replace(/<[^>]+>/g, ' ')           // HTML タグ除去
    .replace(/&[a-z]+;/gi, ' ')         // エンティティ
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxLen);
}

// タイトル + 本文要旨 + ジャンルから英語の画像生成プロンプトを組む。
function buildEyecatchPrompt({ title, contentSummary, genre }) {
  const genreTheme = {
    cardloan: 'consumer finance / card loans',
    securities: 'stock investment / securities',
    cryptocurrency: 'cryptocurrency / digital assets',
    fx: 'foreign exchange / FX trading',
    realestate: 'real estate investment',
  }[genre] || 'personal finance';
  return [
    'Create a professional 16:9 hero / eyecatch image for a Japanese financial media article.',
    `Render this Japanese title text prominently, large and clearly legible on the image: 「${title}」.`,
    `Article theme: ${genreTheme}.`,
    contentSummary ? `Visual should reflect the content: ${contentSummary}` : '',
    'Style: clean, modern, trustworthy financial-media aesthetic; soft gradient or subtle abstract background;',
    'high-contrast, accurate, readable Japanese typography for the title; no watermarks, no logos, no gibberish text.',
  ].filter(Boolean).join('\n');
}

/**
 * アイキャッチ PNG を生成して Buffer で返す。
 * @returns {Promise<{ buffer: Buffer, mimeType: string, prompt: string }>}
 */
async function generateEyecatch({ title, contentRaw, contentSummary, genre, model = DEFAULT_MODEL, aspectRatio = '16:9' }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set (node/.env に設定してください)');
  if (!title) throw new Error('title required for eyecatch generation');

  const summary = contentSummary || summarizeContent(contentRaw);
  const prompt = buildEyecatchPrompt({ title, contentSummary: summary, genre });

  const res = await fetch(ENDPOINT(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: { aspectRatio },
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API HTTP ${res.status}: ${t.slice(0, 300)}`);
  }

  const json = await res.json();
  for (const cand of json.candidates || []) {
    for (const part of cand.content?.parts || []) {
      const inline = part.inlineData || part.inline_data;
      if (inline && inline.data) {
        return {
          buffer: Buffer.from(inline.data, 'base64'),
          mimeType: inline.mimeType || inline.mime_type || 'image/png',
          prompt,
        };
      }
    }
  }
  // 画像が無い (安全分類器でブロック等) 場合はテキストを添えて投げる
  const texts = (json.candidates || [])
    .flatMap((c) => (c.content?.parts || []).map((p) => p.text).filter(Boolean));
  throw new Error(`Gemini レスポンスに画像なし${texts.length ? ' (' + texts.join(' ').slice(0, 200) + ')' : ''}`);
}

module.exports = { generateEyecatch, summarizeContent, buildEyecatchPrompt, DEFAULT_MODEL };
