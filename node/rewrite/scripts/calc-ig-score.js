#!/usr/bin/env node
'use strict';
/**
 * Step A-1 完成 smoke runner.
 *
 * Usage:
 *   node node/rewrite/scripts/calc-ig-score.js \
 *     --post-id 7170 --query-fanout-id 11
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

function getArg(name) {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}

const postIdArg = getArg('post-id');
const queryFanoutIdArg = getArg('query-fanout-id');
if (!postIdArg || !queryFanoutIdArg) {
  console.error('Usage: calc-ig-score.js --post-id <ID> --query-fanout-id <ID>');
  process.exit(1);
}

const { calcIgScore } = require('../fact-set/ig-score');

const t0 = Date.now();
const r = calcIgScore({
  post_id: parseInt(postIdArg, 10),
  query_fanout_id: parseInt(queryFanoutIdArg, 10),
});
const elapsed = Date.now() - t0;

console.log(`=== IG Score id=${r.id} ===`);
console.log(`post_id=${r.post_id} target_query="${r.target_query}"`);
console.log(`competitor_url_count=${r.competitor_url_count}`);
console.log('');
for (const layer of [1, 2, 3]) {
  const L = r.layers[layer];
  console.log(`Layer ${layer}: self=${L.self_count} comp_union=${L.competitor_union_count} gap=${L.gap_count}`);
  if (L.gap_samples.length) {
    console.log(`  samples:`);
    for (const s of L.gap_samples) console.log(`    - ${s}`);
  }
}
console.log(`\nelapsed: ${elapsed}ms`);
