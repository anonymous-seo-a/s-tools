#!/usr/bin/env node
'use strict';
/**
 * 段階C C-B-5 smoke: Compliance Layer 2 (LLM パターン検出) 動作確認。
 *
 * 通し動作:
 *   1. 一時 session INSERT + mock gap
 *   2. runAnalysis (Opus 4.7)
 *   3. policy 強制承認 → status=generating
 *   4. runDiffGeneration (Sonnet 4.6)
 *   5. ★ 違反 mock 2 件 inject:
 *      - diff[0]: "審査が甘い" 追記 (Layer 1 rule_id=1)
 *      - diff[1]: アコムの具体的返済額シミュレーション HTML 追記 (Layer 2 rule_id=23)
 *   6. runComplianceCheck (Layer 1+2)
 *   7. 検証:
 *      - Layer 1 ヒット 1 件 (rule_id=1)
 *      - Layer 2 ヒット 1 件 (rule_id=23, target_partner=acom)
 *      - pre-filter で他 diff の Layer 2 (acom) はスキップ確認
 *      - 規則 22 (比較構造禁止、target_partner=null) は全 diff で LLM 呼出 (false 期待が多い)
 *   8. cleanup
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-compliance-layer2.js \
 *     --post-id 11077 --query-fanout-id 11 [--keep-session]
 *
 * 注意: Opus + Sonnet (diff) + Sonnet (Layer 2 N call) で ~$0.22 課金。
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
    console.error('Usage: smoke-compliance-layer2.js --post-id <P> --query-fanout-id <Q> [--keep-session]');
    process.exit(1);
  }

  const db = require('../db');
  const { applyMigration } = require('../embedding-poc/migration');
  const { runAnalysis } = require('../llm-execution/analysis-runner');
  const { runDiffGeneration } = require('../llm-execution/diff-runner');
  const { runComplianceCheck, loadLayer1Rules, loadLayer2Rules } = require('../llm-execution/compliance-runner');

  const conn = db.open();
  applyMigration(conn);
  conn.pragma('foreign_keys = ON');

  // === 0. master_rules 状態確認 (verified Layer 1 + Layer 2) ===
  const l1 = loadLayer1Rules(conn);
  const l2 = loadLayer2Rules(conn);
  console.log(`=== master_rules ===`);
  console.log(`  Layer 1 verified: ${l1.length} 件`);
  console.log(`  Layer 2 verified: ${l2.length} 件`);
  for (const r of l2) console.log(`    [${r.id}] ${r.rule_type} / partner=${r.target_partner || 'null'} / ng="${r.ng_text}"`);
  if (l2.length === 0) {
    console.error('ABORT: Layer 2 rules not seeded. Run apply-master-rules-v2.js + seed-layer2-and-promote.js first.');
    process.exit(1);
  }

  // === 1. session INSERT ===
  console.log('\n=== 1. session INSERT ===');
  const llmModels = require('../../shared/llm-adapters/anthropic-adapter').getModels();
  const info = conn.prepare(
    `INSERT INTO master_rewrite_session
       (post_id, model_analysis, model_generation, triggered_by, status)
     VALUES (?, ?, ?, 'smoke-c-b-5', 'planned')`
  ).run(postId, llmModels.analysis, llmModels.generation);
  const sessionId = info.lastInsertRowid;
  console.log(`  session_id=${sessionId}`);

  try {
    // === 2. mock gap ===
    const insertGap = conn.prepare(
      `INSERT INTO master_passage_gap
         (session_id, post_id, query_fanout_id, target_text, target_kind, fact_layer,
          self_max_cosine, competitor_max_cosine, delta, gap_flag, judge_type, model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const fanout = conn.prepare('SELECT sub_query FROM master_query_fanout WHERE id=?').get(queryFanoutId);
    insertGap.run(sessionId, postId, queryFanoutId, fanout.sub_query, 'query', null, 0.55, 0.65, 0.05, 1, 'embedding', 'voyage-3-large');
    insertGap.run(sessionId, postId, queryFanoutId, fanout.sub_query, 'query', null, null, null, null, 1, 'factset', null);
    for (const f of [
      { text: 'アコム', layer: 1, self: 0.45, comp: 0.58 },
      { text: 'プロミス', layer: 1, self: 0.40, comp: 0.55 },
    ]) {
      insertGap.run(sessionId, postId, queryFanoutId, f.text, 'fact', f.layer, f.self, f.comp, -0.05, 1, 'embedding', 'voyage-3-large');
      insertGap.run(sessionId, postId, queryFanoutId, f.text, 'fact', f.layer, null, null, null, 0, 'factset', null);
    }

    // === 3. runAnalysis ===
    console.log('\n=== 3. runAnalysis (Opus 4.7) ===');
    const analysisRes = await runAnalysis({ session_id: sessionId, post_id: postId, query_fanout_id: queryFanoutId });
    console.log(`  status=${analysisRes.status} high_risk=${JSON.stringify(analysisRes.high_risk_categories)}`);

    // === 4. 強制承認 ===
    if (analysisRes.status === 'awaiting_policy_judgment') {
      conn.prepare(
        `UPDATE master_rewrite_session SET policy_judgment='approved', policy_judgment_at=CURRENT_TIMESTAMP, status='generating' WHERE id=?`
      ).run(sessionId);
      console.log('  → status=generating (smoke 強制)');
    }

    // === 5. runDiffGeneration ===
    console.log('\n=== 5. runDiffGeneration (Sonnet 4.6) ===');
    const diffRes = await runDiffGeneration({ session_id: sessionId });
    console.log(`  diffs_inserted=${diffRes.diffs_inserted} rejected=${diffRes.diffs_rejected}`);

    const diffs = conn.prepare(
      `SELECT id, diff_order, content_after, risk_flag FROM master_rewrite_diff WHERE session_id=? ORDER BY diff_order`
    ).all(sessionId);
    if (diffs.length < 2) throw new Error(`need 2+ diffs for inject, got ${diffs.length}`);

    // === 6. 違反 mock inject 2 件 ===
    console.log('\n=== 6. 違反 mock inject 2 件 ===');
    // diff[0]: Layer 1 (審査が甘い)
    const l1Inject = (diffs[0].content_after || '') + '<p>審査が甘いので安心です。</p>';
    conn.prepare(`UPDATE master_rewrite_diff SET content_after=? WHERE id=?`).run(l1Inject, diffs[0].id);
    console.log(`  diff[0] (id=${diffs[0].id}) ← Layer 1 inject: "審査が甘い"`);

    // diff[1]: Layer 2 (アコム × 具体的返済額シミュレーション)
    const l2Inject = (diffs[1].content_after || '') +
      '<div class="acom-sim"><h4>アコムでの返済シミュレーション</h4>' +
      '<p>アコムで10万円を借入し、3年で返済する場合、月々の返済額は約3,500円、総返済額は約12.5万円となります。</p>' +
      '<table><tr><th>借入額</th><th>返済期間</th><th>月返済額</th><th>総返済額</th></tr>' +
      '<tr><td>10万円</td><td>3年</td><td>3,500円</td><td>12.5万円</td></tr>' +
      '<tr><td>30万円</td><td>5年</td><td>7,200円</td><td>43.2万円</td></tr></table></div>';
    conn.prepare(`UPDATE master_rewrite_diff SET content_after=? WHERE id=?`).run(l2Inject, diffs[1].id);
    console.log(`  diff[1] (id=${diffs[1].id}) ← Layer 2 inject: アコム返済額シミュレーション (具体数値含む)`);

    // === 7. runComplianceCheck (Layer 1+2) ===
    console.log('\n=== 7. runComplianceCheck (Layer 1+2) ===');
    const tC0 = Date.now();
    const complianceRes = await runComplianceCheck({ session_id: sessionId, enableLayer2: true });
    const elapsedC = ((Date.now() - tC0) / 1000).toFixed(1);
    console.log(`  elapsed=${elapsedC}s`);
    console.log(`  rules_loaded: ${complianceRes.rules_loaded} (L1=${complianceRes.layer1_rules} + L2=${complianceRes.layer2_rules})`);
    console.log(`  diffs_scanned=${complianceRes.diffs_scanned}`);
    console.log(`  diffs_with_violations=${complianceRes.diffs_with_violations}`);
    console.log(`  total_violations=${complianceRes.total_violations}`);
    console.log(`  risk_flag_set_count=${complianceRes.risk_flag_set_count}`);
    console.log(`  layer2_llm_calls=${complianceRes.layer2_llm_calls} (skipped=${complianceRes.layer2_llm_calls_skipped})`);
    console.log(`  layer2_usage: in=${complianceRes.layer2_usage.input_tokens} out=${complianceRes.layer2_usage.output_tokens}`);

    // === 8. 検証 ===
    console.log('\n=== 8. 検証 ===');
    assert(complianceRes.layer1_rules >= 21, `Layer 1 ルール 21+ 件 (got ${complianceRes.layer1_rules})`);
    assert(complianceRes.layer2_rules >= 2,  `Layer 2 ルール 2+ 件 (got ${complianceRes.layer2_rules})`);
    assert(complianceRes.diffs_scanned === diffRes.diffs_inserted, `diffs_scanned 一致`);

    // diff[0] Layer 1 ヒット確認
    const d0 = conn.prepare(`SELECT rationale, risk_flag FROM master_rewrite_diff WHERE id=?`).get(diffs[0].id);
    const d0r = JSON.parse(d0.rationale);
    const d0v = d0r?.compliance?.violations || [];
    const l1Hit = d0v.find((v) => v.ng_text === '審査が甘い' && (v.detection_layer === 1 || v.detection_layer == null));
    assert(!!l1Hit, `diff[0] に Layer 1 違反 "審査が甘い" 検出`);
    if (l1Hit) {
      assert(l1Hit.rule_id === 1, `Layer 1 rule_id=1 (got ${l1Hit.rule_id})`);
    }

    // diff[1] Layer 2 ヒット確認
    const d1 = conn.prepare(`SELECT rationale, risk_flag FROM master_rewrite_diff WHERE id=?`).get(diffs[1].id);
    const d1r = JSON.parse(d1.rationale);
    const d1v = d1r?.compliance?.violations || [];
    const l2AcomHit = d1v.find((v) => v.detection_layer === 2);
    assert(!!l2AcomHit, `diff[1] に Layer 2 違反検出`);
    if (l2AcomHit) {
      assert(l2AcomHit.rule_id >= 22, `Layer 2 rule_id 22+ (got ${l2AcomHit.rule_id})`);
      assert(typeof l2AcomHit.evidence_snippet === 'string' && l2AcomHit.evidence_snippet.length > 0,
        `evidence_snippet 抽出済`);
      assert(['high', 'medium', 'low'].includes(l2AcomHit.severity), `severity in {high,medium,low}`);
    }

    // pre-filter 動作確認: target_partner=acom rule で「アコム言及なし」diff はスキップ
    // 規則 22 (target_partner=null) は全 diff で LLM 呼出されるはず
    // 規則 23 (target_partner=acom) はアコム言及 diff のみ呼出
    // 合計呼出 = 15 (rule22) + N (rule23 = アコム言及数) と推定
    const skipped = complianceRes.layer2_llm_calls_skipped;
    assert(skipped > 0, `pre-filter スキップ 1+ 件 (target_partner=acom unmention)`);

    console.log(`\n=== 9. per_diff (Layer 2 ヒット) ===`);
    for (const pd of complianceRes.per_diff) {
      if (pd.layer2_count === 0) continue;
      console.log(`  diff[${pd.diff_order}] (id=${pd.diff_id}) target=${pd.target_section}`);
      console.log(`    Layer 1: ${pd.layer1_count} 件 / Layer 2: ${pd.layer2_count} 件`);
      console.log(`    risk: ${pd.risk_flag_before} → ${pd.risk_flag_after}`);
      for (const v of pd.violations.filter((x) => x.detection_layer === 2)) {
        console.log(`    L2 violation: rule_id=${v.rule_id} sev=${v.severity}`);
        console.log(`      evidence: "${(v.evidence_snippet || '').slice(0, 80)}"`);
        console.log(`      reason  : ${(v.reason || '').slice(0, 80)}`);
      }
    }
  } finally {
    if (keepSession) {
      console.log(`\n--keep-session: session_id=${sessionId} 保持`);
    } else {
      conn.prepare('DELETE FROM master_rewrite_diff WHERE session_id=?').run(sessionId);
      conn.prepare('DELETE FROM master_rewrite_session WHERE id=?').run(sessionId);
      console.log(`\nsession_id=${sessionId} 削除`);
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
