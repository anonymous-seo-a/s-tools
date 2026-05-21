#!/usr/bin/env node
'use strict';
/**
 * 案C C-B smoke: runAnalysis (工程6'-A Opus 4.7) E2E 動作確認。
 *
 * 通し動作:
 *   1. 一時 session INSERT (triggered_by='smoke-c-b')
 *   2. 案C B-6 の embedding-poc smoke を直前に走らせて bundle 系統を満たす
 *      ※ 本 smoke では事前 mock データ INSERT で代替
 *   3. runAnalysis 実行 (Opus 4.7 呼出 ~$0.5)
 *   4. analysis_output 検証 (必須フィールド + 構造)
 *   5. session.notes に bundle snapshot 保存確認
 *   6. status 遷移確認 ('analyzing' → 'awaiting_policy_judgment' or 'generating')
 *   7. --keep-session 指定なければ session DELETE (CASCADE)
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-analysis-runner.js \
 *     --post-id 11077 --query-fanout-id 11 [--keep-session]
 *
 * 注意: Opus 4.7 呼出で ~$0.5 課金される。
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

function getArg(name) {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}
const flag = (name) => process.argv.includes(`--${name}`);

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}

(async () => {
  const postId = parseInt(getArg('post-id'), 10);
  const queryFanoutId = parseInt(getArg('query-fanout-id'), 10);
  const keepSession = flag('keep-session');
  if (!Number.isFinite(postId) || !Number.isFinite(queryFanoutId)) {
    console.error('Usage: smoke-analysis-runner.js --post-id <P> --query-fanout-id <Q> [--keep-session]');
    process.exit(1);
  }

  const db = require('../db');
  const { applyMigration } = require('../embedding-poc/migration');
  const { runAnalysis } = require('../llm-execution/analysis-runner');

  const conn = db.open();
  applyMigration(conn);
  conn.pragma('foreign_keys = ON');

  // === 1. 一時 session INSERT ===
  console.log('=== 1. 一時 session INSERT ===');
  const info = conn
    .prepare(
      `INSERT INTO master_rewrite_session
         (post_id, model_analysis, model_generation, triggered_by, status)
       VALUES (?, 'claude-opus-4-7', 'claude-sonnet-4-6', 'smoke-c-b', 'planned')`
    )
    .run(postId);
  const sessionId = info.lastInsertRowid;
  console.log(`  session_id=${sessionId}`);

  try {
    // === 2. mock gap data INSERT (案C は bundle 取得が前提のため事前に投入) ===
    console.log('\n=== 2. mock gap data 投入 (bundle 取得 source) ===');
    const insertGap = conn.prepare(
      `INSERT INTO master_passage_gap
         (session_id, post_id, query_fanout_id, target_text, target_kind, fact_layer,
          self_max_cosine, competitor_max_cosine, delta, gap_flag, judge_type, model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    // B 系統: Q[i] embedding gap
    const fanout = conn.prepare('SELECT sub_query FROM master_query_fanout WHERE id=?').get(queryFanoutId);
    insertGap.run(sessionId, postId, queryFanoutId, fanout.sub_query, 'query', null, 0.55, 0.65, 0.05, 1, 'embedding', 'voyage-3-large');
    insertGap.run(sessionId, postId, queryFanoutId, fanout.sub_query, 'query', null, null, null, null, 1, 'factset', null);

    // C 系統: divergent fact 2 件 (embedding gap=1 ∩ factset gap=0)
    const divergentFacts = [
      { text: 'アコム', layer: 1, self: 0.45, comp: 0.58 },
      { text: 'プロミス', layer: 1, self: 0.40, comp: 0.55 },
    ];
    for (const f of divergentFacts) {
      insertGap.run(sessionId, postId, queryFanoutId, f.text, 'fact', f.layer, f.self, f.comp, -0.05, 1, 'embedding', 'voyage-3-large');
      insertGap.run(sessionId, postId, queryFanoutId, f.text, 'fact', f.layer, null, null, null, 0, 'factset', null);
    }
    console.log(`  inserted mock gap rows (B 系統 1 + C 系統 ${divergentFacts.length})`);

    // === 3. runAnalysis 実行 ===
    console.log('\n=== 3. runAnalysis (Opus 4.7 呼出) ===');
    const t0 = Date.now();
    const result = await runAnalysis({ session_id: sessionId, post_id: postId, query_fanout_id: queryFanoutId });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  elapsed=${elapsed}s`);
    console.log(`  usage: input=${result.usage?.input_tokens} output=${result.usage?.output_tokens}`);
    console.log(`  status=${result.status}`);
    console.log(`  high_risk_categories: ${JSON.stringify(result.high_risk_categories)}`);

    // === 4. analysis_output 検証 ===
    console.log('\n=== 4. analysis_output 検証 ===');
    const ao = result.analysis_output;
    assert(typeof ao.structural_analysis === 'string' && ao.structural_analysis.length > 50,
      'structural_analysis 50+ 字');
    assert(Array.isArray(ao.rewrite_policy) && ao.rewrite_policy.length > 0,
      `rewrite_policy 1+ 件 (got ${ao.rewrite_policy.length})`);
    assert(['high', 'medium', 'low'].includes(ao.confidence),
      `confidence in {high, medium, low} (got "${ao.confidence}")`);
    assert(typeof ao.protected_blocks_acknowledged === 'boolean',
      'protected_blocks_acknowledged boolean');
    assert(Array.isArray(ao.high_risk_categories),
      'high_risk_categories array');

    // rewrite_policy 各要素の構造確認
    for (let i = 0; i < ao.rewrite_policy.length; i++) {
      const p = ao.rewrite_policy[i];
      assert(typeof p.policy_text === 'string' && p.policy_text.length > 0,
        `policy[${i}].policy_text 非空文字列`);
      assert(typeof p.priority === 'number',
        `policy[${i}].priority 数値`);
      assert(p.uses_bundle_refs && typeof p.uses_bundle_refs === 'object',
        `policy[${i}].uses_bundle_refs オブジェクト`);
      assert(Array.isArray(p.target_change_types),
        `policy[${i}].target_change_types 配列`);
      assert(Array.isArray(p.target_change_categories),
        `policy[${i}].target_change_categories 配列`);
    }

    // === 5. session 更新確認 ===
    console.log('\n=== 5. session 更新確認 ===');
    const session = conn.prepare(
      `SELECT id, status, notes,
              analysis_output IS NOT NULL AS has_ao,
              notes IS NOT NULL AS has_notes,
              high_risk_categories,
              policy_summary,
              input_tokens_analysis, output_tokens_analysis,
              analysis_completed_at
       FROM master_rewrite_session WHERE id=?`
    ).get(sessionId);
    assert(session.has_ao === 1, 'session.analysis_output 保存済');
    assert(session.has_notes === 1, 'session.notes (bundle snapshot) 保存済');
    assert(['generating', 'awaiting_policy_judgment'].includes(session.status),
      `session.status in {generating, awaiting_policy_judgment} (got "${session.status}")`);
    assert(session.analysis_completed_at != null, 'analysis_completed_at 設定済');
    assert(session.input_tokens_analysis > 0, 'input_tokens_analysis > 0');
    assert(session.output_tokens_analysis > 0, 'output_tokens_analysis > 0');

    // === 6. bundle snapshot 復元確認 ===
    console.log('\n=== 6. bundle snapshot 復元確認 ===');
    const notes = JSON.parse(session.notes || '{}');
    assert(notes.bundle != null, 'notes.bundle 存在');
    assert(notes.captured_at != null, 'notes.captured_at 存在');
    assert(notes.bundle.session_id === sessionId, 'notes.bundle.session_id 一致');
    assert(notes.bundle.target_query === fanout.sub_query, 'notes.bundle.target_query 一致');

    // === 7. プレビュー表示 ===
    console.log('\n=== 7. analysis_output プレビュー ===');
    console.log(`  structural_analysis (${ao.structural_analysis.length} 字): ${ao.structural_analysis.slice(0, 150)}...`);
    console.log(`  confidence: ${ao.confidence}`);
    console.log(`  high_risk_categories: ${JSON.stringify(ao.high_risk_categories)}`);
    console.log(`  rewrite_policy: ${ao.rewrite_policy.length} 件`);
    for (let i = 0; i < Math.min(3, ao.rewrite_policy.length); i++) {
      const p = ao.rewrite_policy[i];
      console.log(`    [${i}] priority=${p.priority} types=${JSON.stringify(p.target_change_types)} cats=${JSON.stringify(p.target_change_categories)}`);
      console.log(`        policy: ${p.policy_text.slice(0, 100)}`);
      console.log(`        refs: ${JSON.stringify(p.uses_bundle_refs)}`);
    }
  } finally {
    if (keepSession) {
      console.log(`\n--keep-session: session_id=${sessionId} 保持`);
    } else {
      conn.prepare('DELETE FROM master_rewrite_session WHERE id=?').run(sessionId);
      console.log(`\nsession_id=${sessionId} 削除 (CASCADE cleanup)`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nsmoke OK');
})().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
