#!/usr/bin/env node
'use strict';
/**
 * 段階C 品質観測用 多 post validation runner。
 *
 * smoke-e2e の core (6'-A → 6'-B → 6'-C) を多 post 連続実行版にした派生品。
 * - inject pass なし (品質観測専用、Layer 1 検出検証は smoke-e2e 側で実施済)
 * - --keep 既定 (全 session DB に残す)
 * - 1 post 失敗で全体中断しない (個別 try/catch)
 * - 各 session の (cost / diffs / violations / risk_dist / high_risk) を集計
 *
 * Usage:
 *   node node/rewrite/scripts/validation-run.js \
 *     --pairs 11077:11,11078:11,...   # post_id:qf_id カンマ区切り
 *   node node/rewrite/scripts/validation-run.js \
 *     --posts 11077,11078,11082 --query-fanout-id 11
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

function getArg(name) {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}

// 概算コスト (smoke-e2e と同期)
const COST_OPUS_IN = 15 / 1_000_000;
const COST_OPUS_OUT = 75 / 1_000_000;
const COST_SONNET_IN = 3 / 1_000_000;
const COST_SONNET_OUT = 15 / 1_000_000;

function estCost({ a_in, a_out, d_in, d_out }) {
  return (
    (a_in || 0) * COST_OPUS_IN + (a_out || 0) * COST_OPUS_OUT +
    (d_in || 0) * COST_SONNET_IN + (d_out || 0) * COST_SONNET_OUT
  );
}

function parsePairs() {
  const pairsArg = getArg('pairs');
  if (pairsArg) {
    return pairsArg.split(',').map((s) => {
      const [p, q] = s.split(':').map((x) => parseInt(x, 10));
      return { post_id: p, qf_id: q };
    });
  }
  const postsArg = getArg('posts');
  const qfArg = parseInt(getArg('query-fanout-id'), 10);
  if (postsArg && Number.isFinite(qfArg)) {
    return postsArg.split(',').map((p) => ({ post_id: parseInt(p, 10), qf_id: qfArg }));
  }
  return null;
}

async function runOne({ post_id, qf_id, conn }) {
  const { applyMigration } = require('../embedding-poc/migration');
  const { runAnalysis } = require('../llm-execution/analysis-runner');
  const { runDiffGeneration } = require('../llm-execution/diff-runner');
  const { runComplianceCheck } = require('../llm-execution/compliance-runner');

  applyMigration(conn);
  conn.pragma('foreign_keys = ON');

  const llmModels = require('../../shared/llm-adapters/anthropic-adapter').getModels();
  const info = conn.prepare(
    `INSERT INTO master_rewrite_session
       (post_id, model_analysis, model_generation, triggered_by, status)
     VALUES (?, ?, ?, 'validation-run', 'planned')`
  ).run(post_id, llmModels.analysis, llmModels.generation);
  const sessionId = info.lastInsertRowid;

  // smoke-e2e と同じ mock gap (アコム / プロミス を共通 fact gap として注入)
  const fanout = conn.prepare('SELECT sub_query FROM master_query_fanout WHERE id=?').get(qf_id);
  if (!fanout) throw new Error(`master_query_fanout id=${qf_id} not found`);

  const insertGap = conn.prepare(
    `INSERT INTO master_passage_gap
       (session_id, post_id, query_fanout_id, target_text, target_kind, fact_layer,
        self_max_cosine, competitor_max_cosine, delta, gap_flag, judge_type, model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertGap.run(sessionId, post_id, qf_id, fanout.sub_query, 'query', null, 0.55, 0.65, 0.05, 1, 'embedding', 'voyage-3-large');
  insertGap.run(sessionId, post_id, qf_id, fanout.sub_query, 'query', null, null, null, null, 1, 'factset', null);
  for (const f of [
    { text: 'アコム', layer: 1, self: 0.45, comp: 0.58 },
    { text: 'プロミス', layer: 1, self: 0.40, comp: 0.55 },
  ]) {
    insertGap.run(sessionId, post_id, qf_id, f.text, 'fact', f.layer, f.self, f.comp, -0.05, 1, 'embedding', 'voyage-3-large');
    insertGap.run(sessionId, post_id, qf_id, f.text, 'fact', f.layer, null, null, null, 0, 'factset', null);
  }

  const tA = Date.now();
  const analysisRes = await runAnalysis({ session_id: sessionId, post_id, query_fanout_id: qf_id });
  const elapsedA = ((Date.now() - tA) / 1000).toFixed(1);

  if (analysisRes.status === 'awaiting_policy_judgment') {
    conn.prepare(
      `UPDATE master_rewrite_session SET policy_judgment='approved', policy_judgment_at=CURRENT_TIMESTAMP, status='generating' WHERE id=?`
    ).run(sessionId);
  }

  const tD = Date.now();
  const diffRes = await runDiffGeneration({ session_id: sessionId });
  const elapsedD = ((Date.now() - tD) / 1000).toFixed(1);

  const tC = Date.now();
  const complianceRes = await runComplianceCheck({ session_id: sessionId });
  const elapsedC = ((Date.now() - tC) / 1000).toFixed(2);

  // risk_flag distribution
  const diffsFinal = conn.prepare(
    `SELECT risk_flag FROM master_rewrite_diff WHERE session_id=?`
  ).all(sessionId);
  const riskDist = {};
  for (const d of diffsFinal) {
    const k = d.risk_flag || '(null)';
    riskDist[k] = (riskDist[k] || 0) + 1;
  }

  const cost = estCost({
    a_in: analysisRes.usage?.input_tokens,
    a_out: analysisRes.usage?.output_tokens,
    d_in: diffRes.usage?.input_tokens,
    d_out: diffRes.usage?.output_tokens,
  });

  return {
    session_id: sessionId,
    post_id,
    qf_id,
    elapsed: { a: parseFloat(elapsedA), d: parseFloat(elapsedD), c: parseFloat(elapsedC) },
    analysis: {
      status: analysisRes.status,
      high_risk_categories: analysisRes.high_risk_categories,
      usage: analysisRes.usage,
    },
    diff: {
      diffs_inserted: diffRes.diffs_inserted,
      diffs_rejected: diffRes.diffs_rejected,
      usage: diffRes.usage,
    },
    compliance: {
      diffs_scanned: complianceRes.diffs_scanned,
      total_violations: complianceRes.total_violations,
      risk_flag_set_count: complianceRes.risk_flag_set_count,
      per_diff: complianceRes.per_diff,
    },
    risk_distribution: riskDist,
    cost_usd: cost,
  };
}

(async () => {
  const pairs = parsePairs();
  if (!pairs || pairs.length === 0) {
    console.error('Usage:');
    console.error('  validation-run.js --pairs <postId:qfId>,<postId:qfId>,...');
    console.error('  validation-run.js --posts <p1>,<p2>,... --query-fanout-id <qf>');
    process.exit(1);
  }

  console.log(`validation-run: ${pairs.length} sessions`);
  console.log(`pairs: ${pairs.map((p) => `${p.post_id}:${p.qf_id}`).join(', ')}`);

  const db = require('../db');
  const conn = db.open();

  // master_rules 一時 verified 昇格 (smoke-e2e と同じ扱い)
  const rulesBefore = conn.prepare(
    `SELECT id, status FROM master_rules WHERE category='cardloan'`
  ).all();
  const promoteRes = conn.prepare(
    `UPDATE master_rules SET status='verified' WHERE category='cardloan' AND status='draft'`
  ).run();
  console.log(`master_rules 一時 verified 昇格: ${promoteRes.changes} 件`);

  const results = [];
  const errors = [];
  try {
    for (let i = 0; i < pairs.length; i++) {
      const { post_id, qf_id } = pairs[i];
      const tag = `[${i + 1}/${pairs.length}] post=${post_id} qf=${qf_id}`;
      console.log(`\n========== ${tag} ==========`);
      try {
        const res = await runOne({ post_id, qf_id, conn });
        const v = res.compliance.total_violations;
        const rj = res.diff.diffs_rejected;
        const ins = res.diff.diffs_inserted;
        const hr = JSON.stringify(res.analysis.high_risk_categories);
        console.log(`  ${tag} session=${res.session_id} cost=$${res.cost_usd.toFixed(4)} diffs=${ins} rejected=${rj} violations=${v} high_risk=${hr}`);
        results.push(res);
      } catch (e) {
        console.error(`  ${tag} FAILED: ${e.message}`);
        errors.push({ post_id, qf_id, error: e.message });
      }
    }
  } finally {
    const draftIds = rulesBefore.filter((r) => r.status === 'draft').map((r) => r.id);
    if (draftIds.length > 0) {
      conn.prepare(
        `UPDATE master_rules SET status='draft' WHERE id IN (${draftIds.map(() => '?').join(',')})`
      ).run(...draftIds);
      console.log(`\nmaster_rules revert: ${draftIds.length} rules → draft`);
    }
  }

  // 集計レポート
  console.log('\n=== validation 集計 ===');
  const cols = ['#', 'sess', 'post', 'qf', 'diffs', 'rej', 'viol', 'risk_set', 'opus_s', 'sonnet_s', 'cost'];
  const widths = cols.map((c) => c.length);
  const rows = results.map((r, i) => [
    String(i + 1),
    String(r.session_id),
    String(r.post_id),
    String(r.qf_id),
    String(r.diff.diffs_inserted),
    String(r.diff.diffs_rejected),
    String(r.compliance.total_violations),
    String(r.compliance.risk_flag_set_count),
    r.elapsed.a.toFixed(1),
    r.elapsed.d.toFixed(1),
    '$' + r.cost_usd.toFixed(3),
  ]);
  for (const row of rows) {
    row.forEach((v, i) => { widths[i] = Math.max(widths[i], v.length); });
  }
  const fmt = (vals) => '  ' + vals.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  console.log(fmt(cols));
  console.log(fmt(widths.map((w) => '-'.repeat(w))));
  rows.forEach((r) => console.log(fmt(r)));

  const totalCost = results.reduce((s, r) => s + r.cost_usd, 0);
  const totalViolations = results.reduce((s, r) => s + r.compliance.total_violations, 0);
  const totalDiffs = results.reduce((s, r) => s + r.diff.diffs_inserted, 0);
  const totalRejected = results.reduce((s, r) => s + r.diff.diffs_rejected, 0);

  console.log('');
  console.log(`  total sessions  : ${results.length} ok / ${errors.length} failed`);
  console.log(`  total cost      : $${totalCost.toFixed(4)}`);
  console.log(`  total diffs     : ${totalDiffs} inserted, ${totalRejected} rejected`);
  console.log(`  total violations: ${totalViolations}`);

  if (errors.length > 0) {
    console.log('\nfailed pairs:');
    errors.forEach((e) => console.log(`  post=${e.post_id} qf=${e.qf_id}: ${e.error}`));
  }

  // 各 session の violations 詳細
  const sessionsWithViol = results.filter((r) => r.compliance.total_violations > 0);
  if (sessionsWithViol.length > 0) {
    console.log('\n=== 検出された violations ===');
    for (const r of sessionsWithViol) {
      console.log(`\n  session=${r.session_id} post=${r.post_id} qf=${r.qf_id}`);
      for (const pd of r.compliance.per_diff) {
        if ((pd.violations || []).length === 0) continue;
        for (const v of pd.violations) {
          console.log(`    diff[${pd.diff_order}] ${pd.target_section}: rule_id=${v.rule_id} ng="${v.ng_text}"`);
        }
      }
    }
  }

  console.log(`\nsession_ids: ${results.map((r) => r.session_id).join(',')}`);
})().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
