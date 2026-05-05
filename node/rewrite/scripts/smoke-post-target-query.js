#!/usr/bin/env node
'use strict';
/**
 * Smoke test: master_post_target_query 投入 (案A 統合)
 *
 * 既定: cardloan の最初の post_id (7170)
 *
 * Usage:
 *   node rewrite/scripts/smoke-post-target-query.js
 *   node rewrite/scripts/smoke-post-target-query.js 11077
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { buildPostTargetQuery } = require('../post-target-query/build');
const db = require('../db');

const post_id = parseInt(process.argv[2] || '7170', 10);

(async () => {
  const t0 = Date.now();
  const result = await buildPostTargetQuery(post_id);
  const elapsed = Date.now() - t0;

  console.log('--- smoke-post-target-query ---');
  console.log('post_id:', result.post_id);
  console.log('url:', result.url);
  console.log('days_window:', result.days_window);
  console.log('elapsed:', elapsed, 'ms');
  console.log('gsc_query_count:', result.gsc_query_count);
  if (result.primary) {
    console.log('primary (max impressions):');
    console.log(`  query: "${result.primary.query}"`);
    console.log(`  impressions: ${result.primary.impressions} / clicks: ${result.primary.clicks} / rank: ${result.primary.rank.toFixed(2)}`);
  } else {
    console.log('primary: (no GSC data)');
  }
  if (result.secondary) {
    console.log('secondary (max clicks):');
    console.log(`  query: "${result.secondary.query}"`);
    console.log(`  impressions: ${result.secondary.impressions} / clicks: ${result.secondary.clicks} / rank: ${result.secondary.rank.toFixed(2)}`);
  } else {
    console.log('secondary: (skip - same as primary, or no GSC data)');
  }
  console.log('inserted:', result.inserted.length, '件');
  result.inserted.forEach((r) => {
    console.log(`  id=${r.id} role=${r.query_role} query="${r.query}"`);
  });

  const conn = db.open();
  const total = conn
    .prepare('SELECT COUNT(*) AS n FROM master_post_target_query WHERE post_id=?')
    .get(post_id);
  console.log(`master_post_target_query (post_id=${post_id}): ${total.n} 件`);
  console.log('--- pass ---');
})().catch((err) => {
  console.error('--- FAIL ---');
  console.error(err.stack || err.message || err);
  process.exit(1);
});
