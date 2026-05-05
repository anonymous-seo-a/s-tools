#!/usr/bin/env node
'use strict';
/**
 * Smoke test: Step A-2 Layer1 主題分解
 *
 * seed_query を引数または既定値で渡し、Sonnet 4.6 で主題分解 → master_query_fanout 投入。
 * 既定 seed_query: "即日融資 比較" (複合検索、主題分解の真価が出る)
 *
 * Usage:
 *   node rewrite/scripts/smoke-layer1.js
 *   node rewrite/scripts/smoke-layer1.js "カードローン おすすめ 即日"
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { decomposeLayer1 } = require('../query-fanout/layer1-decompose');
const db = require('../db');

const seed_query = process.argv[2] || '即日融資 比較';

(async () => {
  const t0 = Date.now();
  const result = await decomposeLayer1(seed_query);
  const elapsed = Date.now() - t0;

  console.log('--- smoke-layer1 ---');
  console.log('seed_query:', result.seed_query);
  console.log('elapsed:', elapsed, 'ms');
  console.log('sub_queries:', result.sub_queries.length);
  result.sub_queries.forEach((s, i) => {
    console.log(`  [${i + 1}] id=${s.id} ${s.sub_query}`);
  });
  console.log('usage:', result.usage);

  const conn = db.open();
  const total = conn
    .prepare("SELECT COUNT(*) AS n FROM master_query_fanout WHERE layer=1 AND seed_query=?")
    .get(seed_query);
  console.log(`master_query_fanout (layer=1, seed_query="${seed_query}"): ${total.n} 件`);
  console.log('--- pass ---');
})().catch((err) => {
  console.error('--- FAIL ---');
  console.error(err.stack || err.message || err);
  process.exit(1);
});
