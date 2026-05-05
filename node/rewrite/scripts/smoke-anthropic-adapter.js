#!/usr/bin/env node
/**
 * Smoke test: shared/llm-adapters/anthropic-adapter
 *   1+1=? を Sonnet 4.6 に投げて疎通確認。
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { sonnet, MODEL_SONNET } = require('../../shared/llm-adapters/anthropic-adapter');

(async () => {
  const t0 = Date.now();
  const result = await sonnet({
    system: 'あなたは簡潔に答えるアシスタントです。1〜2文で答えてください。',
    user: '1+1 はいくつ？',
    maxTokens: 50,
  });
  const elapsed = Date.now() - t0;

  console.log('--- smoke-anthropic-adapter ---');
  console.log('model:', MODEL_SONNET);
  console.log('elapsed:', elapsed, 'ms');
  console.log('text:', result.text);
  console.log('usage:', result.usage);
  console.log('--- pass ---');
})().catch((err) => {
  console.error('--- FAIL ---');
  console.error(err.message || err);
  process.exit(1);
});
