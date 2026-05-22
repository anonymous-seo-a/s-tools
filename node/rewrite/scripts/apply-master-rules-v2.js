#!/usr/bin/env node
'use strict';
/**
 * 段階C C-B-1: master_rules schema v2 migration 適用スクリプト。
 *
 * Usage:
 *   node node/rewrite/scripts/apply-master-rules-v2.js [--dry-run]
 *
 * idempotent: v2 適用済みなら skip。
 */
const db = require('../db');
const { applyMasterRulesV2, v2Applied } = require('../compliance/migration-master-rules-v2');

const dry = process.argv.includes('--dry-run');

const conn = db.open();

console.log('=== master_rules v2 migration ===');

const before = conn.prepare(`PRAGMA table_info(master_rules)`).all();
console.log(`before: ${before.length} columns`);
console.log(`  ${before.map((c) => c.name).join(', ')}`);

const countBefore = conn.prepare(`SELECT COUNT(*) c FROM master_rules`).get().c;
console.log(`rows: ${countBefore}`);

if (v2Applied(conn)) {
  console.log('=> already v2, skipping');
  process.exit(0);
}

if (dry) {
  console.log('=> dry-run, would apply v2 migration');
  process.exit(0);
}

const res = applyMasterRulesV2(conn);
console.log(`=> ${JSON.stringify(res)}`);

const after = conn.prepare(`PRAGMA table_info(master_rules)`).all();
console.log(`after: ${after.length} columns`);
console.log(`  ${after.map((c) => c.name).join(', ')}`);

const countAfter = conn.prepare(`SELECT COUNT(*) c FROM master_rules`).get().c;
console.log(`rows: ${countAfter} (delta=${countAfter - countBefore})`);

if (countBefore !== countAfter) {
  console.error('ABORT: row count mismatch');
  process.exit(1);
}

const newCols = ['target_partner', 'detection_layer', 'pattern_hint'];
const presents = after.map((c) => c.name);
for (const n of newCols) {
  if (!presents.includes(n)) {
    console.error(`MISSING new column: ${n}`);
    process.exit(1);
  }
}

const sample = conn.prepare(
  `SELECT id, rule_type, ng_text, target_partner, detection_layer, pattern_hint
   FROM master_rules WHERE category='cardloan' LIMIT 3`
).all();
console.log(`sample:`);
for (const s of sample) console.log(`  ${JSON.stringify(s)}`);

console.log('OK');
