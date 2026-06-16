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
// リッチなアイキャッチには文脈量が要るので長めに渡す (テキスト入力は安価)。
function summarizeContent(contentRaw, maxLen = 1800) {
  if (!contentRaw) return '';
  const text = String(contentRaw)
    .replace(/<!--[\s\S]*?-->/g, ' ')   // Gutenberg ブロックコメント除去
    .replace(/<[^>]+>/g, ' ')           // HTML タグ除去
    .replace(/&[a-z]+;/gi, ' ')         // エンティティ
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxLen);
}

const GENRE_THEME = {
  cardloan: 'カードローン・消費者金融',
  securities: '証券・株式投資',
  cryptocurrency: '仮想通貨・暗号資産',
  fx: 'FX・外国為替',
  realestate: '不動産投資',
};

// 記事内容を渡して「この記事向けの SEO アフィリエイト用アイキャッチ」を作らせる。
// 日本の金融アフィリエイトメディアの実物 (濃紺ブランド背景 / フラットイラスト / 短い
// キャッチコピー + アクセント色キーワード / 要点チップ / 年バッジ) に寄せたプロンプト。
// 旧版は「タイトル全文を大きく描画」と指示したため長文タイトルが重複・崩れていた → 短い
// 見出しに圧縮させ、文字崩れ・重複を明示的に禁止する。
function buildEyecatchPrompt({ title, contentSummary, genre }) {
  const theme = GENRE_THEME[genre] || 'パーソナルファイナンス';
  return [
    '以下の記事に最適化した、SEO アフィリエイトサイト用のプロ品質アイキャッチ画像を 16:9 のアスペクト比で作成してください。',
    '',
    `【ジャンル】${theme}`,
    `【記事タイトル】${title}`,
    contentSummary ? `【記事の内容（抜粋）】${contentSummary}` : '',
    '',
    '【デザイン要件（日本の金融アフィリエイトメディアの定番スタイル）】',
    '- フラットなベクターイラスト調。記事テーマに合った人物・アイコン・モチーフ（スマホ/カード/グラフ/建物等）を配置',
    '- 背景は濃紺〜ブルー基調のブランドカラーで、信頼感・清潔感のある配色',
    '- 記事の要点を端的に表す「短いキャッチコピー」を主役にする。タイトルを長文のまま全部入れず、最も重要なキーワードだけ大きく、数字や訴求語はアクセントカラー（黄/オレンジ等）で強調',
    '- 要点を表す小さなチップ/バッジ（2〜4個）や「2026年最新」等の年バッジを添えて情報量を持たせる',
    '- レイアウトは左にテキスト、右にイラストのような明快な構図。余白と階層を意識した完成度の高いデザイン',
    '',
    '【厳守】',
    '- 日本語の文字は正確に。文字の重複・崩れ・意味不明な文字列・スペルミスを絶対に入れない',
    '- 同じ語句を繰り返さない。読みやすいフォントと高コントラスト',
    '- ロゴ・透かし・URL・人物の顔のアップは入れない',
  ].filter((l) => l !== undefined && l !== null).join('\n');
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
