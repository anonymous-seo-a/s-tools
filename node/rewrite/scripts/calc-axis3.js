'use strict';

const { calculateAxis3, persistScores } = require('../scoring/axis3');

function parseArgs(argv) {
  const args = { asOf: null, persist: true, top: 20 };
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
  console.log('[calc-axis3]');
  console.log('  as_of   :', asOf.toISOString().slice(0, 10));
  console.log('  persist :', args.persist);

  const t0 = Date.now();
  const results = calculateAxis3({ asOf });
  const t1 = Date.now();
  console.log(`  computed: ${results.length} posts in ${t1 - t0} ms`);

  if (results.length === 0) {
    console.log('  (no rows; articles に wp_modified なし?)');
    return;
  }

  console.log(`  top ${args.top}:`);
  for (const r of results.slice(0, args.top)) {
    console.log(
      `    post=${r.post_id}  months=${r.score_value.toFixed(2)}  ` +
      `wp_modified=${r.components.wp_modified.slice(0, 10)}`
    );
  }

  if (args.persist) {
    const r = persistScores(results, { calculatedAt: asOf });
    console.log('  persisted:', r);
  }
}

main();
