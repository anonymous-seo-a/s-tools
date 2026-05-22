#!/usr/bin/env node
'use strict';
/**
 * 段階C C-B-2 適用スクリプト:
 *   1. Daiki 指摘 Layer 2 規制 2 件投入 (idempotent)
 *   2. 既存 21 件 (Layer 1, draft) を verified に一括昇格 (Daiki 承認 2026-05-22)
 *
 * Usage:
 *   node node/rewrite/scripts/seed-layer2-and-promote.js [--dry-run]
 */
const db = require('../db');
const { v2Applied } = require('../compliance/migration-master-rules-v2');
const {
  LAYER2_REGULATIONS,
  seedLayer2Regulations,
  promoteCardloanDraftToVerified,
} = require('../compliance/seed-layer2-regulations');

const dry = process.argv.includes('--dry-run');

const conn = db.open();

if (!v2Applied(conn)) {
  console.error('ABORT: master_rules schema is not v2. Run apply-master-rules-v2.js first.');
  process.exit(1);
}

console.log('=== 投入前 状態 ===');
const before = conn.prepare(
  `SELECT detection_layer, status, COUNT(*) c
   FROM master_rules WHERE category='cardloan'
   GROUP BY detection_layer, status ORDER BY detection_layer, status`
).all();
for (const b of before) console.log(`  layer=${b.detection_layer} status=${b.status}: ${b.c} 件`);

if (dry) {
  console.log('\n--- dry-run ---');
  console.log(`予定 1: Layer 2 規制 ${LAYER2_REGULATIONS.length} 件投入`);
  for (const r of LAYER2_REGULATIONS) {
    console.log(`  - ${r.rule_type} / ${r.ng_text} (partner=${r.target_partner || 'null'})`);
  }
  console.log(`予定 2: 既存 cardloan draft (Layer 1) を verified に昇格`);
  process.exit(0);
}

console.log('\n=== 1. Layer 2 規制投入 ===');
const seedRes = seedLayer2Regulations(conn);
console.log(`  inserted=${seedRes.inserted} skipped=${seedRes.skipped}`);

console.log('\n=== 2. cardloan draft → verified 一括昇格 ===');
const promoteRes = promoteCardloanDraftToVerified(conn);
console.log(`  promoted=${promoteRes.promoted}`);

console.log('\n=== 投入後 状態 ===');
const after = conn.prepare(
  `SELECT detection_layer, status, COUNT(*) c
   FROM master_rules WHERE category='cardloan'
   GROUP BY detection_layer, status ORDER BY detection_layer, status`
).all();
for (const a of after) console.log(`  layer=${a.detection_layer} status=${a.status}: ${a.c} 件`);

console.log('\n=== Layer 2 規制 (verified) ===');
const layer2 = conn.prepare(
  `SELECT id, rule_type, ng_text, target_partner, pattern_hint, legal_basis
   FROM master_rules WHERE category='cardloan' AND detection_layer=2 ORDER BY id`
).all();
for (const r of layer2) {
  console.log(`  [${r.id}] ${r.rule_type} / ${r.ng_text}`);
  console.log(`       partner=${r.target_partner || 'null'}  legal=${r.legal_basis}`);
  console.log(`       hint=${(r.pattern_hint || '').slice(0, 100)}...`);
}

console.log('\nOK');
