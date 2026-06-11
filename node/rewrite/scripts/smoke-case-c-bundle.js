#!/usr/bin/env node
'use strict';
/**
 * 段階B B-5 smoke: buildCaseCInputBundle が 3 系統 (A/B/C) を正しく集約するか検証。
 *
 * 通し動作:
 *   1. 一時 session (master_rewrite_session) を INSERT
 *   2. master_passage_gap に mock データを INSERT
 *      - Q[i] embedding gap (B 系統対応)
 *      - fact embedding gap × fact factset no-gap (C 系統対応)
 *      - fact embedding gap × fact factset gap (両系統一致、divergent ではない)
 *   3. buildCaseCInputBundle 実行
 *   4. 3 系統が期待件数で返るか assert
 *   5. session DELETE → CASCADE で gap 全削除確認
 *
 * 既存 master_information_gain_score (post 7170 / target_query='即日融資...') を A 系統 source として利用。
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-case-c-bundle.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

const db = require('../db');
const { applyMigration } = require('../embedding-poc/migration');
const { buildCaseCInputBundle } = require('../embedding-poc/case-c-bundle');

const conn = db.open();
applyMigration(conn);

let failed = 0;
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    console.error(`  ✗ ${msg}\n      actual=${JSON.stringify(actual)}  expected=${JSON.stringify(expected)}`);
    failed++;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

// 既存データから既知の (post_id, query_fanout_id) を取得
const ig = conn
  .prepare(
    `SELECT ig.id, ig.post_id, ig.target_query, qf.id AS qf_id
     FROM master_information_gain_score ig
     JOIN master_query_fanout qf ON ig.target_query = qf.sub_query
     LIMIT 1`
  )
  .get();
if (!ig) {
  console.error('FATAL: master_information_gain_score に既存 row がない (Step A-1 smoke を先に実行)');
  process.exit(1);
}
console.log(`=== source: post_id=${ig.post_id} query_fanout_id=${ig.qf_id} Q[i]="${ig.target_query}" ===\n`);

// === 1. 一時 session INSERT ===
console.log('=== 1. 一時 session INSERT ===');
conn.pragma('foreign_keys = ON');
const llmModels = require('../../shared/llm-adapters/anthropic-adapter').getModels();
const sessionInsert = conn
  .prepare(
    `INSERT INTO master_rewrite_session
       (post_id, model_analysis, model_generation, triggered_by, status)
     VALUES (?, ?, ?, ?, ?)`
  )
  .run(ig.post_id, llmModels.analysis, llmModels.generation, 'smoke-test', 'planned');
const session_id = sessionInsert.lastInsertRowid;
console.log(`  session_id=${session_id}`);

// === 2. mock gap データ INSERT ===
console.log('\n=== 2. mock gap データ INSERT ===');
const insertGap = conn.prepare(
  `INSERT INTO master_passage_gap
     (session_id, post_id, query_fanout_id, target_text, target_kind, fact_layer,
      self_max_cosine, competitor_max_cosine, delta, gap_flag, judge_type, model, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

// B 系統: Q[i] embedding gap 2 件
insertGap.run(session_id, ig.post_id, ig.qf_id, ig.target_query, 'query', null, 0.50, 0.65, 0.05, 1, 'embedding', 'voyage-3-large', null);
insertGap.run(session_id, ig.post_id, ig.qf_id, ig.target_query, 'query', null, null, null, null, 1, 'factset', null, null);

// C 系統: fact embedding gap × factset no-gap (divergent) 3 件
const cFacts = [
  { text: 'アコム',      layer: 1, self: 0.45, comp: 0.58 },
  { text: 'プロミス',    layer: 1, self: 0.40, comp: 0.55 },
  { text: 'アイフル',    layer: 1, self: 0.42, comp: 0.50 },
];
for (const f of cFacts) {
  insertGap.run(session_id, ig.post_id, ig.qf_id, f.text, 'fact', f.layer, f.self, f.comp, -0.05, 1, 'embedding', 'voyage-3-large', null);
  insertGap.run(session_id, ig.post_id, ig.qf_id, f.text, 'fact', f.layer, null, null, null, 0, 'factset', null, null);
}

// 両系統一致 gap (C 系統には現れないことを確認、5 件)
const bothGap = [
  { text: '楽天銀行スーパーローンの金利は年率1.9％〜14.5％', layer: 2 },
  { text: 'プロミスの実質年率は2.5〜18.0%、限度額1〜800万円', layer: 2 },
  { text: 'アコム利用者の体験：手続きが簡単で初めてでもスムーズ', layer: 3 },
  { text: 'レイク利用者の体験：Web申込後最短10分融資', layer: 3 },
  { text: 'SMBCモビット利用者：会社員年収400〜600万円', layer: 3 },
];
for (const f of bothGap) {
  insertGap.run(session_id, ig.post_id, ig.qf_id, f.text, 'fact', f.layer, 0.30, 0.60, 0.05, 1, 'embedding', 'voyage-3-large', null);
  insertGap.run(session_id, ig.post_id, ig.qf_id, f.text, 'fact', f.layer, null, null, null, 1, 'factset', null, null);
}

const gapTotal = conn.prepare(`SELECT COUNT(*) AS n FROM master_passage_gap WHERE session_id=?`).get(session_id).n;
console.log(`  inserted ${gapTotal} rows (B:2 + C divergent:6 + both-gap:10)`);

// === 3. buildCaseCInputBundle ===
console.log('\n=== 3. buildCaseCInputBundle 実行 ===');
const bundle = buildCaseCInputBundle({ session_id, post_id: ig.post_id, query_fanout_id: ig.qf_id });

console.log(`  required_additions: ${bundle.required_additions.length} 件`);
console.log(`  shallow_queries:    ${bundle.shallow_queries.length} 件`);
console.log(`  shallow_facts:      ${bundle.shallow_facts.length} 件`);
console.log(`  meta: ${JSON.stringify(bundle.meta)}`);

// === 4. assertions ===
console.log('\n=== 4. assertions ===');
assertEq(bundle.session_id, session_id, 'session_id 一致');
assertEq(bundle.post_id, ig.post_id, 'post_id 一致');
assertEq(bundle.query_fanout_id, ig.qf_id, 'query_fanout_id 一致');
assertEq(bundle.target_query, ig.target_query, 'target_query 解決');

// A 系統: existing notes.gap_fact_samples が反映されるか
assertEq(bundle.required_additions.length > 0, true, 'A 系統: required_additions が空でない (既存 IG notes 由来)');

// B 系統: 1 件 (Q[i] embedding gap 1 件のみ、factset は別 row)
assertEq(bundle.shallow_queries.length, 1, 'B 系統: shallow_queries=1');
assertEq(bundle.shallow_queries[0].query_text, ig.target_query, 'B 系統: query_text 一致');

// C 系統: 3 件 (divergent fact のみ、両系統一致 gap は除外)
assertEq(bundle.shallow_facts.length, 3, 'C 系統: shallow_facts=3 (divergent のみ)');
const cTextSet = new Set(bundle.shallow_facts.map((f) => f.fact_text));
assertEq(cTextSet.has('アコム'), true, 'C 系統: アコム 含む');
assertEq(cTextSet.has('プロミス'), true, 'C 系統: プロミス 含む');
assertEq(cTextSet.has('アイフル'), true, 'C 系統: アイフル 含む');
assertEq(cTextSet.has('楽天銀行スーパーローンの金利は年率1.9％〜14.5％'), false, 'C 系統: 両系統一致 gap は除外');

// meta
assertEq(bundle.meta.embedding_query_gap_count, 1, 'meta.embedding_query_gap_count=1');
assertEq(bundle.meta.embedding_fact_gap_count_divergent, 3, 'meta.embedding_fact_gap_count_divergent=3');
assertEq(bundle.meta.delta_calibration, 'query_length_bucket', 'meta.delta_calibration=query_length_bucket');

// === 5. CASCADE 削除確認 ===
console.log('\n=== 5. session DELETE → CASCADE 確認 ===');
const beforeDelete = conn.prepare(`SELECT COUNT(*) AS n FROM master_passage_gap WHERE session_id=?`).get(session_id).n;
conn.prepare(`DELETE FROM master_rewrite_session WHERE id=?`).run(session_id);
const afterDelete = conn.prepare(`SELECT COUNT(*) AS n FROM master_passage_gap WHERE session_id=?`).get(session_id).n;
console.log(`  before delete: gap rows=${beforeDelete}`);
console.log(`  after delete:  gap rows=${afterDelete}`);
assertEq(afterDelete, 0, 'CASCADE で全 gap row 削除');

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nsmoke OK');
