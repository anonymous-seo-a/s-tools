'use strict';

const { calculateAxis1, persistScores } = require('../target-selection/axis1-information-gain');

function parseArgs(argv) {
  const args = { asOf: null, persist: true, top: 10 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--as-of') args.asOf = new Date(argv[++i]);
    else if (a === '--no-persist') args.persist = false;
    else if (a === '--top') args.top = parseInt(argv[++i], 10);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const asOf = args.asOf || new Date();
  console.log('[calc-axis1]   (Phase 1 placeholder, real computation in Phase 2)');
  console.log('  as_of   :', asOf.toISOString().slice(0, 10));
  console.log('  persist :', args.persist);

  const t0 = Date.now();
  const results = calculateAxis1({ asOf });
  const t1 = Date.now();
  console.log(`  enrolled: ${results.length} posts in ${t1 - t0} ms`);

  if (results.length === 0) {
    console.log('  (monitor.articles is empty)');
    return;
  }

  console.log(`  sample (top ${args.top}):`);
  for (const r of results.slice(0, args.top)) {
    console.log(`    post=${r.post_id}  score_value=${r.score_value}  status=${r.components.status}`);
  }

  if (args.persist) {
    const r = persistScores(results, { calculatedAt: asOf });
    console.log('  persisted:', r);
  }
}

main();
