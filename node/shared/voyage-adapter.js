'use strict';
/**
 * Voyage Adapter (shared/ layer) — embedding-poc 用
 *
 * voyage-3-large 1024 次元 embedding を取得する薄いラッパ。
 * Anthropic adapter 同様、層独立性のため dotenv は呼ばない (entry point で読込前提)。
 *
 * Retry:
 *   軽量に独自指数バックオフ (max 3 回、初期 1s)。Voyage SDK 未利用 (REST 直叩き)。
 *   失敗時は throw、呼出側で扱う。
 *
 * batch:
 *   1 リクエスト最大 128 string まで分割。
 *   入力配列が空なら [] を返却。
 *
 * 警戒バイアス対チェック:
 *   [11] Adapter 過剰抽象化: 関数 2 つ (embed, embedBatched) のみ
 *   [12] スケルトン隠れたコスト: ajv なし、入力検証は最小限
 *   [22] 環境変数値構造仮定: ENDPOINT は固定、KEY のみ env 参照
 */

const ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
const DEFAULT_MODEL = 'voyage-3-large';
const DEFAULT_BATCH_SIZE = 128;
const MAX_RETRIES = 3;

if (!process.env.VOYAGE_API_KEY) {
  throw new Error(
    'VOYAGE_API_KEY not set. Add to node/.env and ensure entry point calls require("dotenv").config()'
  );
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedSingle({ texts, model, inputType, outputDimension }) {
  const body = {
    input: texts,
    model,
    ...(inputType ? { input_type: inputType } : {}),
    ...(outputDimension ? { output_dimension: outputDimension } : {}),
  };

  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`Voyage HTTP ${res.status}: ${text.slice(0, 300)}`);
        if (res.status >= 500 || res.status === 429) {
          lastErr = err;
          await sleep(1000 * Math.pow(2, attempt));
          continue;
        }
        throw err;
      }
      const json = await res.json();
      if (!Array.isArray(json.data)) throw new Error(`Voyage unexpected payload: ${JSON.stringify(json).slice(0, 200)}`);
      const sorted = [...json.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return {
        embeddings: sorted.map((d) => d.embedding),
        usage: json.usage || {},
        model: json.model || model,
      };
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(1000 * Math.pow(2, attempt));
      }
    }
  }
  throw lastErr || new Error('Voyage embed failed (unknown)');
}

/**
 * テキスト配列を embed。128 件超は内部で自動バッチ分割。
 *
 * @param {string[]} texts
 * @param {object} [opts]
 * @param {string} [opts.model='voyage-3-large']
 * @param {'document'|'query'|null} [opts.inputType='document']
 * @param {number} [opts.outputDimension=1024]
 * @param {number} [opts.batchSize=128]
 * @returns {Promise<{embeddings: number[][], usage: {total_tokens: number}, model: string, batches: number}>}
 */
async function embed(texts, opts = {}) {
  if (!Array.isArray(texts)) throw new Error('embed: texts must be array');
  if (texts.length === 0) return { embeddings: [], usage: { total_tokens: 0 }, model: opts.model || DEFAULT_MODEL, batches: 0 };

  const model = opts.model || DEFAULT_MODEL;
  const inputType = opts.inputType === null ? null : (opts.inputType || 'document');
  const outputDimension = opts.outputDimension || 1024;
  const batchSize = opts.batchSize || DEFAULT_BATCH_SIZE;

  const allEmbeddings = [];
  let totalTokens = 0;
  let batches = 0;
  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const r = await embedSingle({ texts: chunk, model, inputType, outputDimension });
    allEmbeddings.push(...r.embeddings);
    totalTokens += r.usage.total_tokens || 0;
    batches++;
  }
  return { embeddings: allEmbeddings, usage: { total_tokens: totalTokens }, model, batches };
}

module.exports = {
  embed,
  DEFAULT_MODEL,
};
