#!/usr/bin/env node
'use strict';
/**
 * Smoke test: Step A-2 Layer2 micro-intent 展開
 *
 * Layer1 で投入済の sub_query (seed_query 配下) を全件取得し、
 * 各 sub_query に対して Sonnet 4.6 で micro-intent を細分化、
 * master_query_fanout に layer=2 で投入。
 *
 * Usage:
 *   node rewrite/scripts/smoke-layer2.js
 *   node rewrite/scripts/smoke-layer2.js "カードローン おすすめ 即日"
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { expandLayer2 } = require('../query-fanout/layer2-microintent');
const db = require('../db');

const seed_query = process.argv[2] || '即日融資 比較';

(async () => {
  const t0 = Date.now();
  const result = await expandLayer2(seed_query);
  const elapsed = Date.now() - t0;

  console.log('--- smoke-layer2 ---');
  console.log('seed_query:', result.seed_query);
  console.log('elapsed:', elapsed, 'ms');
  console.log('parents:', result.parents_count);
  console.log('total micro-intents:', result.total_micro_intents);
  result.results.forEach((r) => {
    console.log(`  Layer1[id=${r.parent.id}] ${r.parent.sub_query} → ${r.micro_intents.length} micro-intents`);
    r.micro_intents.forEach((m, i) => {
      console.log(`     [${i + 1}] id=${m.id} ${m.sub_query}`);
    });
  });
  console.log('total usage:', result.total_usage);

  const conn = db.open();
  const total = conn
    .prepare("SELECT COUNT(*) AS n FROM master_query_fanout WHERE layer=2 AND seed_query=?")
    .get(seed_query);
  console.log(`master_query_fanout (layer=2, seed_query="${seed_query}"): ${total.n} 件`);
  console.log('--- pass ---');
})().catch((err) => {
  console.error('--- FAIL ---');
  console.error(err.stack || err.message || err);
  process.exit(1);
});
