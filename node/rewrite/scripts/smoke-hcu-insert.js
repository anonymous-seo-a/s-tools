#!/usr/bin/env node
'use strict';
/**
 * 案B (#5) HCU master_hcu_checklist 投入 smoke runner.
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-hcu-insert.js --post-id 7170
 *
 * 通し動作:
 *   1. evaluateHcuForPost (LLM 評価)
 *   2. insertHcuEvaluation (DB 投入、polarity 補正)
 *   3. SELECT 確認 (書き捨て、共通化禁止)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

function getArg(name) {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}

(async () => {
  const postIdArg = getArg('post-id');
  if (!postIdArg) {
    console.error('Usage: smoke-hcu-insert.js --post-id <ID>');
    process.exit(1);
  }
  const postId = parseInt(postIdArg, 10);

  const { evaluateHcuForPost } = require('../hcu-checklist/extract');
  const { insertHcuEvaluation } = require('../hcu-checklist/insert');
  const db = require('../db');

  // --- 1. 評価
  const t0 = Date.now();
  const llmResult = await evaluateHcuForPost(postId);
  const evalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('=== 1. LLM Evaluation ===');
  console.log(`post_id=${llmResult.post_id} evaluations_returned=${llmResult.evaluations.length}/${llmResult.total_count}`);
  console.log(`elapsed: ${evalElapsed}s`);

  // --- 2. 投入
  const inserted = insertHcuEvaluation({
    llmResult,
    extraNotes: { eval_elapsed_sec: parseFloat(evalElapsed) },
  });
  console.log('\n=== 2. DB Insertion ===');
  console.log(`inserted_id=${inserted.inserted_id}`);
  console.log(`pass_count=${inserted.pass_count} total_count=${inserted.total_count} pass_rate=${inserted.pass_rate.toFixed(3)}`);
  console.log(`missing_ids: ${inserted.missing_ids.length === 0 ? 'none' : inserted.missing_ids.join(',')}`);

  // --- 3. SELECT 確認 (書き捨て、共通化禁止)
  const conn = db.open();
  const row = conn
    .prepare(
      `SELECT id, post_id, checklist_version, evaluation_method, pass_count, total_count,
              pass_rate, evaluated_at, evaluated_by, length(item_results) AS item_results_bytes,
              length(notes) AS notes_bytes
       FROM master_hcu_checklist WHERE id=?`
    )
    .get(inserted.inserted_id);
  console.log('\n=== 3. SELECT 確認 ===');
  console.log(row);

  // item_results JSON 整合性確認 (書き捨て)
  const fullRow = conn.prepare(`SELECT item_results, notes FROM master_hcu_checklist WHERE id=?`).get(inserted.inserted_id);
  const ir = JSON.parse(fullRow.item_results);
  const compliantInJson = ir.items.filter((i) => i.compliant).length;
  console.log(`item_results: version=${ir.version} items=${ir.items.length} compliant_in_json=${compliantInJson}`);

  if (compliantInJson !== inserted.pass_count) {
    console.error(`MISMATCH: pass_count=${inserted.pass_count} vs compliant_in_json=${compliantInJson}`);
    process.exit(2);
  }

  // section 別 compliance breakdown (書き捨て)
  const bySection = {};
  for (const item of ir.items) {
    if (!bySection[item.section]) bySection[item.section] = { total: 0, compliant: 0 };
    bySection[item.section].total++;
    if (item.compliant) bySection[item.section].compliant++;
  }
  console.log('\n=== Section breakdown ===');
  for (const [sec, c] of Object.entries(bySection)) {
    console.log(`  ${sec}: ${c.compliant}/${c.total} (${(c.compliant / c.total * 100).toFixed(1)}%)`);
  }

  // 履歴 row 数確認 (post_id + checklist_version での重複許容を確認)
  const history = conn
    .prepare(
      `SELECT count(*) AS n FROM master_hcu_checklist
       WHERE post_id=? AND checklist_version=?`
    )
    .get(postId, ir.version);
  console.log(`\nhistory_rows for post_id=${postId} version=${ir.version}: ${history.n}`);

  console.log('\nsmoke OK');
})().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
