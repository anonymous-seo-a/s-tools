'use strict';
/**
 * LLM コスト算出 (USD)。token 数 × モデル単価。
 *
 * 設計判断:
 *   - 単価はモデル prefix マッチ (バージョン揺れに耐性)。未知モデルは 0 とせず null 寄与なし扱い。
 *   - cost_total_usd は DB に保存せず API 読み取り時に算出する (token が真実の源、migration 不要、
 *     smoke 生成分も含め常に正)。Layer2 コストは session token 列に無いため本算出には含まない
 *     (analysis + generation の主コストのみ。Layer2 は job/notes 側で別途記録)。
 *
 * 単価 (USD / 1M tokens、2026 時点):
 *   Opus  4.x : input $15  / output $75
 *   Sonnet 4.x: input $3   / output $15
 *   Haiku 4.x : input $1   / output $5
 */

const PRICING = [
  { prefix: 'claude-opus',   input: 15,  output: 75 },
  { prefix: 'claude-sonnet', input: 3,   output: 15 },
  { prefix: 'claude-haiku',  input: 1,   output: 5 },
];

function rateFor(model) {
  if (!model) return null;
  return PRICING.find((p) => model.startsWith(p.prefix)) || null;
}

// 1 モデル分のコスト (USD)。未知モデル / token 欠損は 0。
function modelCost(model, inputTokens, outputTokens) {
  const r = rateFor(model);
  if (!r) return 0;
  const inT = Number(inputTokens) || 0;
  const outT = Number(outputTokens) || 0;
  return (inT * r.input + outT * r.output) / 1e6;
}

/**
 * セッションの主コスト (analysis Opus + generation Sonnet) を算出。
 * token が全て null の場合は null を返す (未実行 = "—" 表示用)。
 *
 * @param {{model_analysis, model_generation,
 *          input_tokens_analysis, output_tokens_analysis,
 *          input_tokens_generation, output_tokens_generation}} s
 * @returns {number|null}
 */
function sessionCostUsd(s) {
  if (!s) return null;
  const hasAny = [s.input_tokens_analysis, s.output_tokens_analysis,
    s.input_tokens_generation, s.output_tokens_generation].some((v) => v != null);
  if (!hasAny) return null;
  return (
    modelCost(s.model_analysis, s.input_tokens_analysis, s.output_tokens_analysis) +
    modelCost(s.model_generation, s.input_tokens_generation, s.output_tokens_generation)
  );
}

module.exports = { PRICING, rateFor, modelCost, sessionCostUsd };
