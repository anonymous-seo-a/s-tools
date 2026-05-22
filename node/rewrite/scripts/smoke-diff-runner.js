#!/usr/bin/env node
'use strict';
/**
 * 案C C-C smoke: runDiffGeneration (工程6'-B Sonnet 4.6) E2E 動作確認。
 *
 * 通し動作:
 *   1. 一時 session INSERT (triggered_by='smoke-c-c')
 *   2. mock gap data 投入 (C-B smoke と同パターン)
 *   3. runAnalysis 実行 (Opus 4.7、analysis_output 保存)
 *   4. high_risk があれば policy_judgment='approved' で 'generating' へ手動遷移
 *   5. runDiffGeneration 実行 (Sonnet 4.6)
 *   6. master_rewrite_diff レコード検証
 *   7. session.status / token usage 確認
 *   8. --keep-session 指定なければ session DELETE (CASCADE)
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-diff-runner.js \
 *     --post-id 11077 --query-fanout-id 11 [--keep-session]
 *
 * 注意: Opus 4.7 ~$0.05 + Sonnet 4.6 ~$0.10 = 約 $0.15 課金。
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
    console.error('Usage: smoke-diff-runner.js --post-id <P> --query-fanout-id <Q> [--keep-session]');
    process.exit(1);
  }

  const db = require('../db');
  const { applyMigration } = require('../embedding-poc/migration');
  const { runAnalysis } = require('../llm-execution/analysis-runner');
  const { runDiffGeneration } = require('../llm-execution/diff-runner');
  const {
    CHANGE_TYPES,
    CHANGE_CATEGORIES,
    RISK_FLAGS,
  } = require('../llm-execution/case-c-diff-prompt');

  const conn = db.open();
  applyMigration(conn);
  conn.pragma('foreign_keys = ON');

  // === 1. 一時 session INSERT ===
  console.log('=== 1. 一時 session INSERT ===');
  const info = conn.prepare(
    `INSERT INTO master_rewrite_session
       (post_id, model_analysis, model_generation, triggered_by, status)
     VALUES (?, 'claude-opus-4-7', 'claude-sonnet-4-6', 'smoke-c-c', 'planned')`
  ).run(postId);
  const sessionId = info.lastInsertRowid;
  console.log(`  session_id=${sessionId}`);

  try {
    // === 2. mock gap data 投入 ===
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
    const divergentFacts = [
      { text: 'アコム', layer: 1, self: 0.45, comp: 0.58 },
      { text: 'プロミス', layer: 1, self: 0.40, comp: 0.55 },
    ];
    for (const f of divergentFacts) {
      insertGap.run(sessionId, postId, queryFanoutId, f.text, 'fact', f.layer, f.self, f.comp, -0.05, 1, 'embedding', 'voyage-3-large');
      insertGap.run(sessionId, postId, queryFanoutId, f.text, 'fact', f.layer, null, null, null, 0, 'factset', null);
    }
    console.log(`  inserted mock gap rows`);

    // === 3. runAnalysis (Opus 4.7) ===
    console.log('\n=== 3. runAnalysis (Opus 4.7) ===');
    const tA0 = Date.now();
    const analysisRes = await runAnalysis({ session_id: sessionId, post_id: postId, query_fanout_id: queryFanoutId });
    console.log(`  elapsed=${((Date.now() - tA0) / 1000).toFixed(1)}s usage=${JSON.stringify(analysisRes.usage)}`);
    console.log(`  status=${analysisRes.status} high_risk=${JSON.stringify(analysisRes.high_risk_categories)}`);

    // === 4. policy_judgment 手動承認 (smoke は高リスクも通す) ===
    if (analysisRes.status === 'awaiting_policy_judgment') {
      console.log('\n=== 4. policy_judgment=approved → status=generating (smoke 強制遷移) ===');
      conn.prepare(
        `UPDATE master_rewrite_session
         SET policy_judgment='approved', policy_judgment_at=CURRENT_TIMESTAMP, status='generating'
         WHERE id=?`
      ).run(sessionId);
      console.log('  → status=generating');
    } else {
      console.log('\n=== 4. high_risk 空 → status=generating のまま ===');
    }

    // === 5. runDiffGeneration (Sonnet 4.6) ===
    console.log('\n=== 5. runDiffGeneration (Sonnet 4.6) ===');
    const tD0 = Date.now();
    const diffRes = await runDiffGeneration({ session_id: sessionId });
    console.log(`  elapsed=${((Date.now() - tD0) / 1000).toFixed(1)}s usage=${JSON.stringify(diffRes.usage)}`);
    console.log(`  diffs_inserted=${diffRes.diffs_inserted} rejected=${diffRes.diffs_rejected}`);
    if (diffRes.errors.length) {
      console.log(`  errors: ${diffRes.errors.slice(0, 5).join(' | ')}`);
    }

    // === 6. master_rewrite_diff レコード検証 ===
    console.log('\n=== 6. master_rewrite_diff レコード検証 ===');
    const diffs = conn.prepare(
      `SELECT id, diff_order, target_section, change_type, change_category,
              content_before, content_after, rationale, estimated_impact,
              llm_confidence, risk_flag
       FROM master_rewrite_diff WHERE session_id=? ORDER BY diff_order`
    ).all(sessionId);
    assert(diffs.length > 0, `diff レコード 1+ 件 (got ${diffs.length})`);
    assert(diffs.length === diffRes.diffs_inserted, `diff 件数一致 (db=${diffs.length} runner=${diffRes.diffs_inserted})`);

    diffs.forEach((d, i) => {
      assert(d.diff_order === i + 1, `[${i}] diff_order=${i + 1} 連番`);
      assert(CHANGE_TYPES.includes(d.change_type), `[${i}] change_type='${d.change_type}' enum`);
      assert(CHANGE_CATEGORIES.includes(d.change_category), `[${i}] change_category='${d.change_category}' enum`);
      assert(d.risk_flag == null || RISK_FLAGS.includes(d.risk_flag), `[${i}] risk_flag enum`);
      assert(['high', 'medium', 'low'].includes(d.llm_confidence), `[${i}] llm_confidence`);
      let rationale;
      try { rationale = JSON.parse(d.rationale); } catch { rationale = null; }
      assert(rationale && typeof rationale === 'object', `[${i}] rationale JSON parse OK`);
      assert(typeof rationale?.primary_source === 'string', `[${i}] rationale.primary_source 文字列`);
    });

    // === 6.5. content_before server side 補完検証 ===
    console.log('\n=== 6.5. content_before server side 補完検証 ===');
    const headingDiffs = diffs.filter((d) => /^h[1-4]#/.test(d.target_section));
    const resolved = headingDiffs.filter((d) => d.content_before && d.content_before.length > 50);
    console.log(`  h*#… target=${headingDiffs.length} server_resolved=${resolved.length} runner_count=${diffRes.content_before_server_resolved}`);
    assert(
      headingDiffs.length === 0 || resolved.length === headingDiffs.length,
      `h*#… 系 diff の content_before が全て server 補完 (${resolved.length}/${headingDiffs.length})`
    );
    assert(
      diffRes.content_before_server_resolved === resolved.length,
      `runner 報告 server_resolved 件数一致 (runner=${diffRes.content_before_server_resolved} db=${resolved.length})`
    );
    // 補完された content_before はテーブル含む生 HTML のはず
    if (resolved.length > 0) {
      const withTable = resolved.filter((d) => /<table/.test(d.content_before));
      console.log(`  うち <table> 含有: ${withTable.length}/${resolved.length}`);
    }

    // === 7. session 更新確認 ===
    console.log('\n=== 7. session 更新確認 ===');
    const sess = conn.prepare(
      `SELECT status, input_tokens_generation, output_tokens_generation, generation_completed_at
       FROM master_rewrite_session WHERE id=?`
    ).get(sessionId);
    assert(sess.status === 'awaiting_diff_judgment', `status=awaiting_diff_judgment (got '${sess.status}')`);
    assert(sess.input_tokens_generation > 0, `input_tokens_generation > 0 (got ${sess.input_tokens_generation})`);
    assert(sess.output_tokens_generation > 0, `output_tokens_generation > 0 (got ${sess.output_tokens_generation})`);
    assert(sess.generation_completed_at != null, 'generation_completed_at 設定済');

    // === 8. プレビュー ===
    console.log('\n=== 8. diff プレビュー (上位 3 件) ===');
    diffs.slice(0, 3).forEach((d, i) => {
      console.log(`  [${i + 1}] ${d.target_section} | type=${d.change_type} cat=${d.change_category} risk=${d.risk_flag} conf=${d.llm_confidence}`);
      const beforeLen = d.content_before ? d.content_before.length : 0;
      const before = (d.content_before || '(null)').replace(/\s+/g, ' ').slice(0, 80);
      const after = (d.content_after || '(null)').replace(/\s+/g, ' ').slice(0, 80);
      console.log(`      before [${beforeLen}c]: ${before}`);
      console.log(`      after : ${after}`);
    });
  } finally {
    if (keepSession) {
      console.log(`\n--keep-session: session_id=${sessionId} 保持`);
    } else {
      conn.prepare('DELETE FROM master_rewrite_diff WHERE session_id=?').run(sessionId);
      conn.prepare('DELETE FROM master_rewrite_session WHERE id=?').run(sessionId);
      console.log(`\nsession_id=${sessionId} 削除 (diff + session)`);
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
