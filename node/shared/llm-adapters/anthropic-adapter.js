/**
 * Anthropic Adapter (shared/ layer)
 *
 * Sonnet 4.6 / Opus 4.7 への薄いラッパ。
 *
 * 前提:
 *   ANTHROPIC_API_KEY は呼び出し側 (entry point) の dotenv で読み込み済。
 *   require('dotenv').config() を本モジュールでは呼ばない (層構造の独立性)。
 *
 * Retry:
 *   Anthropic SDK 内部の指数バックオフ retry を maxRetries=5 で利用 (論点2-1)。
 *   独自 retry ラッパは作らない (最小性、後段 LLM 追加時に再評価)。
 */
const Anthropic = require('@anthropic-ai/sdk');

const MODEL_SONNET = 'claude-sonnet-4-6';
const MODEL_OPUS = 'claude-opus-4-7';

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
  const text = response.content.map((c) => c.text || '').join('\n').trim();
  const usage = {
    input_tokens: response.usage?.input_tokens || 0,
    output_tokens: response.usage?.output_tokens || 0,
  };
  return { text, usage, raw: response };
}

async function sonnet(args) {
  return sendMessage({ ...args, model: MODEL_SONNET });
}

async function opus(args) {
  return sendMessage({ ...args, model: MODEL_OPUS });
}

module.exports = {
  sonnet,
  opus,
  sendMessage,
  MODEL_SONNET,
  MODEL_OPUS,
};
