#!/usr/bin/env node
'use strict';
/**
 * Smoke test: master_competitor_corpus 投入
 *
 * 既定: query_fanout_id=11 (Step A-2 で投入済の Layer1 sub_query "即日融資 カードローン 金利 比較")
 *
 * Usage:
 *   node rewrite/scripts/smoke-competitor-corpus.js
 *   node rewrite/scripts/smoke-competitor-corpus.js 12
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { collectCompetitorCorpus } = require('../competitor-corpus/collect');
const db = require('../db');

const query_fanout_id = parseInt(process.argv[2] || '11', 10);

(async () => {
  const t0 = Date.now();
  const result = await collectCompetitorCorpus(query_fanout_id);
  const elapsed = Date.now() - t0;

  console.log('--- smoke-competitor-corpus ---');
  console.log('query_fanout_id:', result.query_fanout_id);
  console.log('target_query:', result.target_query);
  console.log('elapsed:', elapsed, 'ms');
  console.log('organic_count:', result.organic_count);
  console.log('inserted_count:', result.inserted_count);
  console.log('serp_features:', result.serp_features);
  console.log('inserted:');
  result.inserted.forEach((r) => {
    console.log(`  [${r.position}] id=${r.id} ${r.url}`);
  });

  const conn = db.open();
  const total = conn
    .prepare('SELECT COUNT(*) AS n FROM master_competitor_corpus WHERE query_fanout_id=?')
    .get(query_fanout_id);
  console.log(`master_competitor_corpus (query_fanout_id=${query_fanout_id}): ${total.n} 件`);
  console.log('--- pass ---');
})().catch((err) => {
  console.error('--- FAIL ---');
  console.error(err.stack || err.message || err);
  process.exit(1);
});
