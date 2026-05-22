#!/usr/bin/env node
'use strict';
/**
 * 案C C-E: E2E smoke (6'-A → 6'-B → 6'-C 公認版)。
 *
 * 通し動作 (2 pass):
 *   Pass A: 違反 inject なし (リアル違反検出率測定)
 *           Opus → Sonnet → Compliance → violations 数を観測
 *   Pass B: 違反 inject あり (diff[0].content_after に "審査が甘い" 追記)
 *           Compliance の検出経路を検証
 *
 * 各 pass 終了時に集計レポート出力。
 * 2 pass の usage / cost / violations / risk_flag distribution を 1 表で表示。
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-e2e.js \
 *     --post-id 11077 --query-fanout-id 11 [--keep-sessions]
 *
 * 注意: 1 pass で Opus + Sonnet = ~$0.18、2 pass で ~$0.36 課金。
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

// 概算コスト (USD)。価格更新時に同期。
const COST_OPUS_IN = 15 / 1_000_000;   // $15/MTok input
const COST_OPUS_OUT = 75 / 1_000_000;  // $75/MTok output
const COST_SONNET_IN = 3 / 1_000_000;  // $3/MTok input
const COST_SONNET_OUT = 15 / 1_000_000;// $15/MTok output

function estCost({ a_in, a_out, d_in, d_out }) {
  return (
    (a_in || 0) * COST_OPUS_IN + (a_out || 0) * COST_OPUS_OUT +
    (d_in || 0) * COST_SONNET_IN + (d_out || 0) * COST_SONNET_OUT
  );
}

async function runOnePass({ label, injectViolation, postId, queryFanoutId, conn }) {
  const { applyMigration } = require('../embedding-poc/migration');
  const { runAnalysis } = require('../llm-execution/analysis-runner');
  const { runDiffGeneration } = require('../llm-execution/diff-runner');
  const { runComplianceCheck } = require('../llm-execution/compliance-runner');

  applyMigration(conn);
  conn.pragma('foreign_keys = ON');

  console.log(`\n========================================`);
  console.log(`Pass [${label}] inject=${injectViolation}`);
  console.log(`========================================`);

  // session INSERT
  const info = conn.prepare(
    `INSERT INTO master_rewrite_session
       (post_id, model_analysis, model_generation, triggered_by, status)
     VALUES (?, 'claude-opus-4-7', 'claude-sonnet-4-6', 'smoke-c-e', 'planned')`
  ).run(postId);
  const sessionId = info.lastInsertRowid;
  console.log(`  session_id=${sessionId}`);

  // mock gap
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

  // runAnalysis
  const tA = Date.now();
  const analysisRes = await runAnalysis({ session_id: sessionId, post_id: postId, query_fanout_id: queryFanoutId });
  const elapsedA = ((Date.now() - tA) / 1000).toFixed(1);
  console.log(`  [6'-A Opus] ${elapsedA}s in=${analysisRes.usage?.input_tokens} out=${analysisRes.usage?.output_tokens} status=${analysisRes.status} high_risk=${JSON.stringify(analysisRes.high_risk_categories)}`);

  if (analysisRes.status === 'awaiting_policy_judgment') {
    conn.prepare(
      `UPDATE master_rewrite_session SET policy_judgment='approved', policy_judgment_at=CURRENT_TIMESTAMP, status='generating' WHERE id=?`
    ).run(sessionId);
  }

  // runDiffGeneration
  const tD = Date.now();
  const diffRes = await runDiffGeneration({ session_id: sessionId });
  const elapsedD = ((Date.now() - tD) / 1000).toFixed(1);
  console.log(`  [6'-B Sonnet] ${elapsedD}s in=${diffRes.usage?.input_tokens} out=${diffRes.usage?.output_tokens} diffs=${diffRes.diffs_inserted} rejected=${diffRes.diffs_rejected}`);

  // optional violation inject
  if (injectViolation) {
    const firstDiff = conn.prepare(
      `SELECT id, content_after FROM master_rewrite_diff WHERE session_id=? ORDER BY diff_order LIMIT 1`
    ).get(sessionId);
    const tainted = (firstDiff.content_after || '') + '<p>審査が甘いので安心です。</p>';
    conn.prepare(`UPDATE master_rewrite_diff SET content_after=? WHERE id=?`).run(tainted, firstDiff.id);
    console.log(`  [inject] diff_id=${firstDiff.id} に "審査が甘い" 追記`);
  }

  // runComplianceCheck
  const tC = Date.now();
  const complianceRes = await runComplianceCheck({ session_id: sessionId });
  const elapsedC = ((Date.now() - tC) / 1000).toFixed(2);
  console.log(`  [6'-C Compliance] ${elapsedC}s diffs_scanned=${complianceRes.diffs_scanned} violations=${complianceRes.total_violations} risk_flag_set=${complianceRes.risk_flag_set_count}`);

  // post-state collection
  const diffsFinal = conn.prepare(
    `SELECT diff_order, change_type, change_category, risk_flag, content_after, rationale
     FROM master_rewrite_diff WHERE session_id=? ORDER BY diff_order`
  ).all(sessionId);

  const riskDist = {};
  let violationsRowsTotal = 0;
  for (const d of diffsFinal) {
    const k = d.risk_flag || '(null)';
    riskDist[k] = (riskDist[k] || 0) + 1;
    try {
      const r = JSON.parse(d.rationale);
      violationsRowsTotal += (r?.compliance?.violations || []).length;
    } catch {}
  }

  const cost = estCost({
    a_in: analysisRes.usage?.input_tokens,
    a_out: analysisRes.usage?.output_tokens,
    d_in: diffRes.usage?.input_tokens,
    d_out: diffRes.usage?.output_tokens,
  });

  return {
    label,
    session_id: sessionId,
    inject: injectViolation,
    elapsed: { a: parseFloat(elapsedA), d: parseFloat(elapsedD), c: parseFloat(elapsedC) },
    analysis: analysisRes,
    diff: diffRes,
    compliance: complianceRes,
    diffs_count: diffsFinal.length,
    risk_distribution: riskDist,
    violations_rows_total: violationsRowsTotal,
    cost_usd: cost,
  };
}

(async () => {
  const postId = parseInt(getArg('post-id'), 10);
  const queryFanoutId = parseInt(getArg('query-fanout-id'), 10);
  const keep = flag('keep-sessions');
  if (!Number.isFinite(postId) || !Number.isFinite(queryFanoutId)) {
    console.error('Usage: smoke-e2e.js --post-id <P> --query-fanout-id <Q> [--keep-sessions]');
    process.exit(1);
  }

  const db = require('../db');
  const conn = db.open();

  // master_rules 一時 verified 昇格
  const rulesBefore = conn.prepare(
    `SELECT id, status FROM master_rules WHERE category='cardloan'`
  ).all();
  const promote = conn.prepare(
    `UPDATE master_rules SET status='verified' WHERE category='cardloan' AND status='draft'`
  );
  const promoteRes = promote.run();
  console.log(`master_rules 一時 verified 昇格: ${promoteRes.changes} 件`);

  const sessionIds = [];
  let resA = null, resB = null;
  try {
    resA = await runOnePass({ label: 'A (inject=false)', injectViolation: false, postId, queryFanoutId, conn });
    sessionIds.push(resA.session_id);
    resB = await runOnePass({ label: 'B (inject=true)',  injectViolation: true,  postId, queryFanoutId, conn });
    sessionIds.push(resB.session_id);

    // assertions
    console.log('\n=== 検証 ===');
    assert(resA.diff.diffs_inserted > 0, `[A] diffs_inserted > 0 (got ${resA.diff.diffs_inserted})`);
    assert(resB.diff.diffs_inserted > 0, `[B] diffs_inserted > 0 (got ${resB.diff.diffs_inserted})`);
    assert(resA.compliance.diffs_scanned === resA.diff.diffs_inserted, `[A] compliance scanned all diffs`);
    assert(resB.compliance.diffs_scanned === resB.diff.diffs_inserted, `[B] compliance scanned all diffs`);
    assert(resB.compliance.total_violations >= 1, `[B] inject violation 検出 (got ${resB.compliance.total_violations})`);
    // status final 確認
    const finalA = conn.prepare(`SELECT status FROM master_rewrite_session WHERE id=?`).get(resA.session_id);
    const finalB = conn.prepare(`SELECT status FROM master_rewrite_session WHERE id=?`).get(resB.session_id);
    assert(finalA.status === 'awaiting_diff_judgment', `[A] final status='awaiting_diff_judgment' (got '${finalA.status}')`);
    assert(finalB.status === 'awaiting_diff_judgment', `[B] final status='awaiting_diff_judgment' (got '${finalB.status}')`);

    // 集計レポート
    console.log('\n=== E2E 集計レポート ===');
    const header = ['metric', 'Pass A (inject=false)', 'Pass B (inject=true)'];
    const rows = [
      ['session_id',           resA.session_id,                              resB.session_id],
      ['Opus elapsed (s)',     resA.elapsed.a,                               resB.elapsed.a],
      ['Sonnet elapsed (s)',   resA.elapsed.d,                               resB.elapsed.d],
      ['Compliance elapsed',   resA.elapsed.c,                               resB.elapsed.c],
      ['Opus in/out',          `${resA.analysis.usage.input_tokens}/${resA.analysis.usage.output_tokens}`,
                               `${resB.analysis.usage.input_tokens}/${resB.analysis.usage.output_tokens}`],
      ['Sonnet in/out',        `${resA.diff.usage.input_tokens}/${resA.diff.usage.output_tokens}`,
                               `${resB.diff.usage.input_tokens}/${resB.diff.usage.output_tokens}`],
      ['diffs_inserted',       resA.diff.diffs_inserted,                     resB.diff.diffs_inserted],
      ['diffs_rejected',       resA.diff.diffs_rejected,                     resB.diff.diffs_rejected],
      ['violations (real)',    resA.compliance.total_violations,             resB.compliance.total_violations],
      ['risk_flag_set',        resA.compliance.risk_flag_set_count,          resB.compliance.risk_flag_set_count],
      ['risk_distribution',    JSON.stringify(resA.risk_distribution),       JSON.stringify(resB.risk_distribution)],
      ['high_risk (analysis)', JSON.stringify(resA.analysis.high_risk_categories),
                               JSON.stringify(resB.analysis.high_risk_categories)],
      ['cost (USD)',           resA.cost_usd.toFixed(4),                     resB.cost_usd.toFixed(4)],
    ];
    const w0 = Math.max(...rows.map((r) => String(r[0]).length), header[0].length);
    const w1 = Math.max(...rows.map((r) => String(r[1]).length), header[1].length);
    const w2 = Math.max(...rows.map((r) => String(r[2]).length), header[2].length);
    const fmt = (a, b, c) => `  ${String(a).padEnd(w0)}  ${String(b).padEnd(w1)}  ${String(c).padEnd(w2)}`;
    console.log(fmt(header[0], header[1], header[2]));
    console.log(fmt('-'.repeat(w0), '-'.repeat(w1), '-'.repeat(w2)));
    rows.forEach((r) => console.log(fmt(r[0], r[1], r[2])));

    const totalCost = (resA.cost_usd + resB.cost_usd).toFixed(4);
    console.log(`\n  total cost: $${totalCost}`);

    // リアル違反検出有無
    console.log(`\n  リアル違反検出 (Pass A): ${resA.compliance.total_violations} 件`);
    if (resA.compliance.total_violations === 0) {
      console.log(`    → LLM 上流 (Opus + Sonnet プロンプト YMYL 制約) のフィルタが効いている可能性大`);
    } else {
      console.log(`    → 6'-C で検出された違反:`);
      for (const pd of resA.compliance.per_diff) {
        if (pd.violations.length === 0) continue;
        for (const v of pd.violations) {
          console.log(`      diff[${pd.diff_order}] ${pd.target_section}: rule_id=${v.rule_id} ng="${v.ng_text}"`);
        }
      }
    }
  } finally {
    // master_rules revert
    const draftIds = rulesBefore.filter((r) => r.status === 'draft').map((r) => r.id);
    if (draftIds.length > 0) {
      conn.prepare(`UPDATE master_rules SET status='draft' WHERE id IN (${draftIds.map(() => '?').join(',')})`).run(...draftIds);
      console.log(`\nmaster_rules revert: ${draftIds.length} rules → draft`);
    }

    if (keep) {
      console.log(`--keep-sessions: session_ids=${sessionIds.join(',')} 保持`);
    } else {
      for (const sid of sessionIds) {
        conn.prepare('DELETE FROM master_rewrite_diff WHERE session_id=?').run(sid);
        conn.prepare('DELETE FROM master_rewrite_session WHERE id=?').run(sid);
      }
      console.log(`sessions ${sessionIds.join(',')} 削除`);
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
