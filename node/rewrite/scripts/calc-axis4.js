'use strict';

const { calculateAxis4, persistScores, DEFAULT_WINDOW_DAYS } = require('../target-selection/axis4');

function parseArgs(argv) {
  const args = { windowDays: DEFAULT_WINDOW_DAYS, asOf: null, persist: true, top: 20 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--window-days') args.windowDays = parseInt(argv[++i], 10);
    else if (a === '--as-of') args.asOf = new Date(argv[++i]);
    else if (a === '--no-persist') args.persist = false;
    else if (a === '--top') args.top = parseInt(argv[++i], 10);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const asOf = args.asOf || new Date();
  console.log('[calc-axis4]');
  console.log('  as_of       :', asOf.toISOString().slice(0, 10));
  console.log('  window_days :', args.windowDays, '(× 2 windows)');
  console.log('  persist     :', args.persist);

  const t0 = Date.now();
  const results = calculateAxis4({ asOf, windowDays: args.windowDays });
  const t1 = Date.now();
  console.log(`  computed    : ${results.length} posts in ${t1 - t0} ms`);

  if (results.length === 0) {
    console.log('  (no rows; monitor.daily_metrics 過去56日が空?)');
    return;
  }

  console.log(`  top ${args.top}:`);
  for (const r of results.slice(0, args.top)) {
    const d = r.components.deltas;
    console.log(
      `    post=${r.post_id}  score=${r.score_value.toFixed(3)}  ` +
      `Δclick=${pct(d.click_delta_pct)}  ` +
      `Δimpr=${pct(d.impr_delta_pct)}  ` +
      `Δpos=${(d.position_delta ?? 0).toFixed(2)}`
    );
  }

  if (args.persist) {
    const r = persistScores(results, { calculatedAt: asOf });
    console.log('  persisted   :', r);
  }
}

function pct(v) {
  if (v == null) return 'n/a';
  return (v * 100).toFixed(1) + '%';
}

main();
