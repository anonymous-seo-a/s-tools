#!/usr/bin/env node
'use strict';
/**
 * Smoke test: shared/serpapi-adapter
 *   1 クエリのみ実行 (警戒 [i] SerpApi コスト浪費バイアス対処)
 *   organic / PAA / related searches / AI overview citations の構造化を確認
 *
 * Usage:
 *   node rewrite/scripts/smoke-serpapi-adapter.js
 *   node rewrite/scripts/smoke-serpapi-adapter.js "カードローン おすすめ"
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { searchSerp } = require('../../shared/serpapi-adapter');

const query = process.argv[2] || '即日融資 カードローン 金利 比較';

(async () => {
  const t0 = Date.now();
  const result = await searchSerp(query);
  const elapsed = Date.now() - t0;

  console.log('--- smoke-serpapi-adapter ---');
  console.log('query:', result.query);
  console.log('elapsed:', elapsed, 'ms');
  console.log('organic:', result.organic.length, '件');
  result.organic.slice(0, 3).forEach((r) => {
    console.log(`  [${r.position}] ${r.title}`);
    console.log(`       ${r.link}`);
  });
  console.log('paa:', result.paa.length, '件');
  result.paa.slice(0, 3).forEach((p, i) => {
    console.log(`  [${i + 1}] ${p.question}`);
  });
  console.log('related_searches:', result.related_searches.length, '件');
  result.related_searches.slice(0, 3).forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.query}`);
  });
  console.log('ai_overview_citations:', result.ai_overview_citations.length, '件');
  result.ai_overview_citations.slice(0, 3).forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.title || '(no title)'} - ${r.link || '(no link)'}`);
  });
  console.log('--- pass ---');
})().catch((err) => {
  console.error('--- FAIL ---');
  console.error(err.stack || err.message || err);
  process.exit(1);
});
