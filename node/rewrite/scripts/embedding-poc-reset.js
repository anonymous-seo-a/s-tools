#!/usr/bin/env node
'use strict';
/**
 * 段階B B-2: PoC 段階の 3 テーブルを DROP して B-2 schema で CREATE。
 *
 * Daiki 5 論点承認 (V-A-2-6):
 *   - PoC データは throw-away、smoke 再実行で再現可能
 *   - 新 schema は session_id NOT NULL FK + source_key + content_hash で本実装化
 *
 * 注意:
 *   - 既存 PoC データ (3196 + 8 + 1278 行) は破棄される
 *   - smoke-embedding-poc.js は B-6 で更新するまで一時的に動かない (schema 不一致)
 *
 * Usage:
 *   node node/rewrite/scripts/embedding-poc-reset.js          # 確認プロンプトなし即実行 (--force 同等)
 *   node node/rewrite/scripts/embedding-poc-reset.js --dry-run # 件数表示のみ、実行しない
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

const db = require('../db');
const { dropAndRecreate } = require('../embedding-poc/migration');

const dryRun = process.argv.includes('--dry-run');
const conn = db.open();

function tableExists(name) {
  return !!conn.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function rowCount(name) {
  if (!tableExists(name)) return null;
  return conn.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
}

console.log('=== embedding-poc reset (B-2 schema 移行) ===');
console.log('既存テーブル状態:');
for (const t of ['master_passage_embedding', 'master_query_coverage_baseline', 'master_passage_gap']) {
  const n = rowCount(t);
  console.log(`  ${t}: ${n == null ? 'NOT EXISTS' : n + ' rows'}`);
}

if (dryRun) {
  console.log('\n--dry-run: actual DROP/CREATE は実行しない');
  process.exit(0);
}

console.log('\nDROP TABLE 3 件 + CREATE TABLE 3 件 (B-2 schema)...');
dropAndRecreate(conn);

console.log('\n再構築後:');
for (const t of ['master_passage_embedding', 'master_query_coverage_baseline', 'master_passage_gap']) {
  const n = rowCount(t);
  console.log(`  ${t}: ${n} rows`);
}

// schema 検証 (主要列のみ)
console.log('\nschema 検証:');
for (const t of ['master_passage_embedding', 'master_query_coverage_baseline', 'master_passage_gap']) {
  const cols = conn.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  console.log(`  ${t}: ${cols.join(', ')}`);
}

// FK 設定確認
console.log('\nFK 設定:');
for (const t of ['master_query_coverage_baseline', 'master_passage_gap']) {
  const fks = conn.prepare(`PRAGMA foreign_key_list(${t})`).all();
  for (const fk of fks) {
    console.log(`  ${t}.${fk.from} → ${fk.table}.${fk.to} (on_delete=${fk.on_delete})`);
  }
}

console.log('\nreset OK');
