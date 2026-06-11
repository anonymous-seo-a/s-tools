/**
 * Anthropic Adapter (shared/ layer)
 *
 * ロール (analysis / generation) → モデルの動的解決を行う薄いラッパ。
 * デフォルトは両ロールとも Fable 5。UI トグル (PUT /api/rewrite/judgment/models)
 * から setModels() で切替、node/data/llm-models.json に永続化する。
 *
 * 旧 API 互換: opus() = analysis ロール、sonnet() = generation ロール。
 * 呼び出し元 8 ファイルは関数名のまま無修正で現行モデル設定に追従する。
 *
 * 前提:
 *   ANTHROPIC_API_KEY は呼び出し側 (entry point) の dotenv で読み込み済。
 *   require('dotenv').config() を本モジュールでは呼ばない (層構造の独立性)。
 *
 * Retry:
 *   Anthropic SDK 内部の指数バックオフ retry を maxRetries=5 で利用 (論点2-1)。
 *   独自 retry ラッパは作らない (最小性、後段 LLM 追加時に再評価)。
 */
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// 選択可能モデル (id は API にそのまま渡す。日付サフィックスは付けない)
const ALLOWED_MODELS = [
  { id: 'claude-fable-5',    label: 'Fable 5' },
  { id: 'claude-opus-4-8',   label: 'Opus 4.8' },
  { id: 'claude-opus-4-7',   label: 'Opus 4.7' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5',  label: 'Haiku 4.5' },
];
const ALLOWED_IDS = new Set(ALLOWED_MODELS.map((m) => m.id));

const CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'llm-models.json');
const DEFAULTS = { analysis: 'claude-fable-5', generation: 'claude-fable-5' };

let models = { ...DEFAULTS };
try {
  const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  for (const role of ['analysis', 'generation']) {
    if (ALLOWED_IDS.has(saved[role])) models[role] = saved[role];
  }
} catch {
  // ファイル未作成 / 破損時はデフォルト (Fable 5) で続行
}

function getModels() {
  return { ...models };
}

function setModels(next) {
  for (const role of ['analysis', 'generation']) {
    if (next[role] === undefined) continue;
    if (!ALLOWED_IDS.has(next[role])) {
      throw new Error(`unknown model for ${role}: ${next[role]}`);
    }
    models[role] = next[role];
  }
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(models, null, 2) + '\n');
  return getModels();
}

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    'ANTHROPIC_API_KEY not set. Add to node/.env and ensure entry point calls require("dotenv").config()'
  );
}

const client = new Anthropic({ maxRetries: 5 });

async function sendMessage({ model, system, user, maxTokens = 2048 }) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  // Fable 5 は安全分類器が HTTP 200 + stop_reason:"refusal" を返しうる
  // (content 空 or 途中まで)。空文字を後段の JSON parse 失敗に化かさず即時に落とす。
  if (response.stop_reason === 'refusal') {
    const cat = response.stop_details?.category || 'unspecified';
    throw new Error(`LLM refusal (model=${model}, category=${cat})`);
  }
  const text = response.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text || '')
    .join('\n')
    .trim();
  const usage = {
    input_tokens: response.usage?.input_tokens || 0,
    output_tokens: response.usage?.output_tokens || 0,
  };
  return { text, usage, raw: response };
}

// generation ロール (旧 sonnet 固定)
async function sonnet(args) {
  return sendMessage({ ...args, model: models.generation });
}

// analysis ロール (旧 opus 固定)
async function opus(args) {
  return sendMessage({ ...args, model: models.analysis });
}

module.exports = {
  sonnet,
  opus,
  sendMessage,
  getModels,
  setModels,
  ALLOWED_MODELS,
};
