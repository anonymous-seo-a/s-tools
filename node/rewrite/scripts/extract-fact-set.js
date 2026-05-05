#!/usr/bin/env node
'use strict';
/**
 * Step A-1 後半 smoke runner.
 *
 * Usage:
 *   node node/rewrite/scripts/extract-fact-set.js \
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

(async () => {
  const postIdArg = getArg('post-id');
  const queryFanoutIdArg = getArg('query-fanout-id');

  if (!postIdArg || !queryFanoutIdArg) {
    console.error('Usage: extract-fact-set.js --post-id <ID> --query-fanout-id <ID>');
    process.exit(1);
  }

  const { extractForQueryFanout } = require('../fact-set/extract');

  const t0 = Date.now();
  const r = await extractForQueryFanout({
    post_id: parseInt(postIdArg, 10),
    query_fanout_id: parseInt(queryFanoutIdArg, 10),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('=== Self ===');
  console.log(`post_id=${r.selfResult.post_id} url=${r.selfResult.source_url}`);
  console.log(`title=${r.selfResult.title}`);
  console.log(`struct_chars=${r.selfResult.struct_chars} body_used=${r.selfResult.facts.body_chars}`);
  console.log(
    `facts: layer1=${r.selfResult.facts.layer1.length} layer2=${r.selfResult.facts.layer2.length} layer3=${r.selfResult.facts.layer3.length}`
  );
  console.log('  layer1:', r.selfResult.facts.layer1);
  console.log('  layer2:', r.selfResult.facts.layer2);
  console.log('  layer3:', r.selfResult.facts.layer3);
  console.log(
    `usage: in=${r.selfResult.facts.usage.input_tokens} out=${r.selfResult.facts.usage.output_tokens}`
  );

  console.log('\n=== Competitors ===');
  for (const c of r.competitorResults) {
    console.log(`corpus_id=${c.corpus_id} url=${c.competitor_url}`);
    console.log(`  title=${c.title}`);
    console.log(
      `  struct_chars=${c.struct_chars} body_used=${c.facts.body_chars} facts: l1=${c.facts.layer1.length} l2=${c.facts.layer2.length} l3=${c.facts.layer3.length}`
    );
    console.log(
      `  usage: in=${c.facts.usage.input_tokens} out=${c.facts.usage.output_tokens}`
    );
  }

  console.log('\n=== Persisted ===');
  console.log(r.persisted);
  console.log(`elapsed: ${elapsed}s`);
})().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
