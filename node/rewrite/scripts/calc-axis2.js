'use strict';

const { calculateAxis2, persistScores, DEFAULT_PERIOD_DAYS } = require('../target-selection/axis2');

function parseArgs(argv) {
  const args = { periodDays: DEFAULT_PERIOD_DAYS, asOf: null, persist: true, top: 20 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--period-days') args.periodDays = parseInt(argv[++i], 10);
    else if (a === '--as-of') args.asOf = new Date(argv[++i]);
    else if (a === '--no-persist') args.persist = false;
    else if (a === '--top') args.top = parseInt(argv[++i], 10);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const asOf = args.asOf || new Date();
  console.log('[calc-axis2]');
  console.log('  as_of       :', asOf.toISOString().slice(0, 10));
  console.log('  period_days :', args.periodDays);
  console.log('  persist     :', args.persist);

  const t0 = Date.now();
  const results = calculateAxis2({ asOf, periodDays: args.periodDays });
  const t1 = Date.now();
  console.log(`  computed    : ${results.length} posts in ${t1 - t0} ms`);

  if (results.length === 0) {
    console.log('  (no rows; empty monitor.daily_metrics window?)');
    return;
  }

  console.log(`  top ${args.top}:`);
  for (const r of results.slice(0, args.top)) {
    console.log(
      `    post=${r.post_id}  score=${r.score_value.toFixed(2)}  ` +
      `impr=${r.components.sum_impressions}  ` +
      `iwap=${(r.components.impression_weighted_avg_position ?? 0).toFixed(2)}  ` +
      `days=${r.components.days_with_data}`
    );
  }

  if (args.persist) {
    const r = persistScores(results, { calculatedAt: asOf });
    console.log('  persisted   :', r);
  }
}

main();
