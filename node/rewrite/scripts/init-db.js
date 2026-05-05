'use strict';

const { open, initSchema, attachMonitorReadOnly, detachMonitor, DB_PATH, MONITOR_DB_PATH } = require('../db');

function main() {
  console.log('[rewrite/init-db]');
  console.log('  DB_PATH         :', DB_PATH);
  console.log('  MONITOR_DB_PATH :', MONITOR_DB_PATH);

  const result = initSchema();
  console.log('  initSchema      :', result);

  const conn = open();
  const tables = conn.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'master_%' ORDER BY name"
  ).all();
  console.log(`  master_* tables : ${tables.length}`);
  for (const t of tables) console.log('    -', t.name);
  if (tables.length !== 26) {
    console.error(`  [WARN] expected 26 tables, got ${tables.length}`);
    process.exit(1);
  }

  const att = attachMonitorReadOnly(conn);
  console.log('  ATTACH monitor  :', att);
  if (att.attached) {
    try {
      const sample = conn.prepare("SELECT count(*) AS n FROM monitor.sqlite_master WHERE type='table'").get();
      console.log('  monitor tables  :', sample.n);
    } catch (e) {
      console.error('  [ERROR] monitor read failed:', e.message);
    }
    detachMonitor(conn);
  }

  console.log('[rewrite/init-db] OK');
}

main();
