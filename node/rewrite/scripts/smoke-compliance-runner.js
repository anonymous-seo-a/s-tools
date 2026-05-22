#!/usr/bin/env node
'use strict';
/**
 * 案C C-D smoke: runComplianceCheck (工程6'-C) E2E 動作確認。
 *
 * 通し動作:
 *   1. 一時 session INSERT + mock gap data
 *   2. runAnalysis (Opus 4.7) → analysis_output
 *   3. policy_judgment=approved → status=generating
 *   4. runDiffGeneration (Sonnet 4.6) → master_rewrite_diff 群
 *   5. ★ master_rules 21 件を一時 verified に昇格 (BEGIN tx)
 *   6. ★ 違反 mock: diffs[0].content_after に "審査が甘い" を inject (純粋ロジック検証用)
 *   7. runComplianceCheck → violations 検出 + risk_flag 更新
 *   8. master_rewrite_diff レコード状態検証
 *   9. master_rules 状態 revert (rollback) + session DELETE (CASCADE)
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-compliance-runner.js \
 *     --post-id 11077 --query-fanout-id 11 [--keep-session]
 *
 * 注意: Opus ~$0.05 + Sonnet ~$0.13 = 約 $0.18 課金。
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
    console.error('Usage: smoke-compliance-runner.js --post-id <P> --query-fanout-id <Q> [--keep-session]');
    process.exit(1);
  }

  const db = require('../db');
  const { applyMigration } = require('../embedding-poc/migration');
  const { runAnalysis } = require('../llm-execution/analysis-runner');
  const { runDiffGeneration } = require('../llm-execution/diff-runner');
  const { runComplianceCheck } = require('../llm-execution/compliance-runner');

  const conn = db.open();
  applyMigration(conn);
  conn.pragma('foreign_keys = ON');

  // === master_rules 一時 verified 昇格 ===
  console.log('=== master_rules 一時 verified 昇格 ===');
  const rulesBefore = conn.prepare(
    `SELECT id, status FROM master_rules WHERE category='cardloan'`
  ).all();
  const promote = conn.prepare(
    `UPDATE master_rules SET status='verified' WHERE category='cardloan' AND status='draft'`
  );
  const promoteRes = promote.run();
  console.log(`  promoted ${promoteRes.changes} draft rules → verified (smoke 中のみ)`);

  // === 1. 一時 session INSERT ===
  console.log('\n=== 1. 一時 session INSERT ===');
  const info = conn.prepare(
    `INSERT INTO master_rewrite_session
       (post_id, model_analysis, model_generation, triggered_by, status)
     VALUES (?, 'claude-opus-4-7', 'claude-sonnet-4-6', 'smoke-c-d', 'planned')`
  ).run(postId);
  const sessionId = info.lastInsertRowid;
  console.log(`  session_id=${sessionId}`);

  try {
    // === 2. mock gap data ===
    console.log('\n=== 2. mock gap data 投入 ===');
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
    console.log('  inserted mock gap rows');

    // === 3. runAnalysis ===
    console.log('\n=== 3. runAnalysis (Opus 4.7) ===');
    const analysisRes = await runAnalysis({ session_id: sessionId, post_id: postId, query_fanout_id: queryFanoutId });
    console.log(`  status=${analysisRes.status} high_risk=${JSON.stringify(analysisRes.high_risk_categories)}`);

    // === 4. policy 強制承認 ===
    if (analysisRes.status === 'awaiting_policy_judgment') {
      conn.prepare(
        `UPDATE master_rewrite_session SET policy_judgment='approved', policy_judgment_at=CURRENT_TIMESTAMP, status='generating' WHERE id=?`
      ).run(sessionId);
      console.log('  → status=generating (smoke 強制遷移)');
    }

    // === 5. runDiffGeneration ===
    console.log('\n=== 5. runDiffGeneration (Sonnet 4.6) ===');
    const diffRes = await runDiffGeneration({ session_id: sessionId });
    console.log(`  diffs_inserted=${diffRes.diffs_inserted} rejected=${diffRes.diffs_rejected}`);

    // === 6. 違反 mock: 1 件目に "審査が甘い" を inject ===
    console.log('\n=== 6. 違反 mock inject (diff_order=1.content_after に "審査が甘い" 追記) ===');
    const firstDiff = conn.prepare(
      `SELECT id, content_after, risk_flag FROM master_rewrite_diff
       WHERE session_id=? ORDER BY diff_order LIMIT 1`
    ).get(sessionId);
    const tainted = (firstDiff.content_after || '') + '<p>審査が甘いので安心です。</p>';
    conn.prepare(`UPDATE master_rewrite_diff SET content_after=? WHERE id=?`).run(tainted, firstDiff.id);
    console.log(`  injected → diff_id=${firstDiff.id} (risk_flag_before='${firstDiff.risk_flag}')`);

    // === 7. runComplianceCheck (Layer 1 のみ、Layer 2 は smoke-compliance-layer2.js で個別検証) ===
    console.log('\n=== 7. runComplianceCheck (Layer 1 only) ===');
    const complianceRes = await runComplianceCheck({ session_id: sessionId, enableLayer2: false });
    console.log(`  rules_loaded=${complianceRes.rules_loaded}`);
    console.log(`  diffs_scanned=${complianceRes.diffs_scanned}`);
    console.log(`  diffs_with_violations=${complianceRes.diffs_with_violations}`);
    console.log(`  total_violations=${complianceRes.total_violations}`);
    console.log(`  risk_flag_set_count=${complianceRes.risk_flag_set_count}`);

    // === 8. 検証 ===
    console.log('\n=== 8. 検証 ===');
    assert(complianceRes.rules_loaded > 0, `rules_loaded > 0 (got ${complianceRes.rules_loaded})`);
    assert(complianceRes.diffs_scanned === diffRes.diffs_inserted,
      `diffs_scanned (${complianceRes.diffs_scanned}) === diffs_inserted (${diffRes.diffs_inserted})`);
    assert(complianceRes.total_violations >= 1, `total_violations >= 1 (inject 1 件)`);
    assert(complianceRes.diffs_with_violations >= 1, `diffs_with_violations >= 1`);

    // 該当 diff の rationale + risk_flag を確認
    const updated = conn.prepare(
      `SELECT id, rationale, risk_flag FROM master_rewrite_diff WHERE id=?`
    ).get(firstDiff.id);
    const rationale = JSON.parse(updated.rationale);
    const violations = rationale?.compliance?.detected_violations || [];
    assert(violations.length >= 1, `diff[0].rationale.compliance.detected_violations.length >= 1 (got ${violations.length})`);
    const ngHit = violations.find((v) => v.ng_text === '審査が甘い');
    assert(!!ngHit, `violations に "審査が甘い" が含まれる`);
    if (ngHit) {
      assert(typeof ngHit.rule_id === 'number', `violation.rule_id 数値 (got ${ngHit.rule_id})`);
      assert(typeof ngHit.position === 'number' && ngHit.position >= 0, `violation.position 数値`);
    }

    // risk_flag: 既存 null なら 'regulation_citation' セット、それ以外は不変
    if (firstDiff.risk_flag == null) {
      assert(updated.risk_flag === 'regulation_citation',
        `risk_flag null → 'regulation_citation' (got '${updated.risk_flag}')`);
    } else {
      assert(updated.risk_flag === firstDiff.risk_flag,
        `risk_flag 既存値保持 ('${firstDiff.risk_flag}' → '${updated.risk_flag}')`);
    }

    // === 9. プレビュー ===
    console.log('\n=== 9. per_diff プレビュー (違反検出のみ) ===');
    for (const pd of complianceRes.per_diff) {
      if (pd.violations.length === 0) continue;
      console.log(`  diff[${pd.diff_order}] target=${pd.target_section}`);
      console.log(`    risk: ${pd.risk_flag_before} → ${pd.risk_flag_after}`);
      for (const v of pd.violations) {
        console.log(`    violation: rule_id=${v.rule_id} ng="${v.ng_text}" pos=${v.position}`);
      }
    }
  } finally {
    // === master_rules revert ===
    const draftIds = rulesBefore.filter((r) => r.status === 'draft').map((r) => r.id);
    if (draftIds.length > 0) {
      const stmt = conn.prepare(`UPDATE master_rules SET status='draft' WHERE id IN (${draftIds.map(() => '?').join(',')})`);
      stmt.run(...draftIds);
      console.log(`\nmaster_rules revert: ${draftIds.length} rules → draft`);
    }

    if (keepSession) {
      console.log(`--keep-session: session_id=${sessionId} 保持`);
    } else {
      conn.prepare('DELETE FROM master_rewrite_diff WHERE session_id=?').run(sessionId);
      conn.prepare('DELETE FROM master_rewrite_session WHERE id=?').run(sessionId);
      console.log(`session_id=${sessionId} 削除 (diff + session)`);
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
