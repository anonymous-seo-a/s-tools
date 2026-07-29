'use strict';

// 日次バッチ: 4軸スコア計算 (Phase 1)
// 冪等性: master_rewrite_target_score の MAX(calculated_at) を参照、
//          直近 24h 以内の実行があれば skip (--force で上書き可)。
// monitor.db 不在: warn ログ + exit 0 (cron 環境で正常終了扱い)。

const fs = require('fs');
const { open, MONITOR_DB_PATH } = require('../db');
const axis1 = require('../target-selection/axis1-information-gain');
const axis2 = require('../target-selection/axis2');
const axis3 = require('../target-selection/axis3');
const axis4 = require('../target-selection/axis4');

const IDEMPOTENCY_HOURS = 24;
const EXIT_OK = 0;
const EXIT_PARTIAL = 1;
const EXIT_FATAL = 2;

function parseArgs(argv) {
  const args = { force: false, asOf: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') args.force = true;
    else if (a === '--as-of') args.asOf = new Date(argv[++i]);
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

function ts() {
  return `[${new Date().toISOString()}]`;
}

function getLastRunAt(conn) {
  const row = conn.prepare(`SELECT MAX(calculated_at) AS last FROM master_rewrite_target_score`).get();
  return row && row.last ? new Date(row.last) : null;
}

function shouldSkip(lastRunAt, asOf) {
  if (!lastRunAt) return false;
  const diffHours = (asOf.getTime() - lastRunAt.getTime()) / (3600 * 1000);
  return diffHours >= 0 && diffHours < IDEMPOTENCY_HOURS;
}

function main() {
  const args = parseArgs(process.argv);
  const asOf = args.asOf || new Date();
  console.log(`${ts()} [daily-target-selection] start  as_of=${asOf.toISOString()}  force=${args.force}  dry_run=${args.dryRun}`);

  let conn;
  try {
    conn = open();
  } catch (e) {
    console.error(`${ts()} [FATAL] cannot open rewrite.db: ${e.message}`);
    process.exit(EXIT_FATAL);
  }

  const lastRun = getLastRunAt(conn);
  if (lastRun) console.log(`${ts()} last_run_at=${lastRun.toISOString()}`);
  if (!args.force && shouldSkip(lastRun, asOf)) {
    const diffHours = ((asOf.getTime() - lastRun.getTime()) / (3600 * 1000)).toFixed(2);
    console.log(`${ts()} [skip] last run was ${diffHours}h ago (< ${IDEMPOTENCY_HOURS}h). use --force to override.`);
    process.exit(EXIT_OK);
  }

  if (!fs.existsSync(MONITOR_DB_PATH)) {
    console.warn(`${ts()} [warn] monitor.db not found at ${MONITOR_DB_PATH}; skipping all axes. exit 0.`);
    process.exit(EXIT_OK);
  }

  const stats = {
    axis1: { computed: 0, persisted: 0, error: null },
    axis2: { computed: 0, persisted: 0, error: null },
    axis3: { computed: 0, persisted: 0, error: null },
    axis4: { computed: 0, persisted: 0, error: null },
  };

  const tasks = [
    ['axis1', axis1, () => axis1.calculateAxis1({ asOf })],
    ['axis2', axis2, () => axis2.calculateAxis2({ asOf })],
    ['axis3', axis3, () => axis3.calculateAxis3({ asOf })],
    ['axis4', axis4, () => axis4.calculateAxis4({ asOf })],
  ];

  const t0 = Date.now();
  for (const [name, mod, calcFn] of tasks) {
    try {
      const results = calcFn();
      stats[name].computed = results.length;
      if (!args.dryRun) {
        const r = mod.persistScores(results, { calculatedAt: asOf });
        stats[name].persisted = r.inserted;
      }
      console.log(`${ts()} [${name}] computed=${stats[name].computed} persisted=${stats[name].persisted}`);
    } catch (e) {
      stats[name].error = e.message;
      console.error(`${ts()} [${name}] [error] ${e.message}`);
    }
  }
  const elapsed = Date.now() - t0;

  const errorAxes = Object.entries(stats).filter(([, s]) => s.error).map(([k]) => k);
  const totalComputed = Object.values(stats).reduce((sum, s) => sum + s.computed, 0);
  const totalPersisted = Object.values(stats).reduce((sum, s) => sum + s.persisted, 0);

  console.log(
    `${ts()} [done] elapsed=${elapsed}ms total_computed=${totalComputed} ` +
    `total_persisted=${totalPersisted} errors=${errorAxes.length}` +
    (errorAxes.length ? ` (failed: ${errorAxes.join(',')})` : '')
  );

  if (errorAxes.length === 0) process.exit(EXIT_OK);
  if (errorAxes.length < 4) process.exit(EXIT_PARTIAL);
  process.exit(EXIT_FATAL);
}

main();
