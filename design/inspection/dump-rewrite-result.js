#!/usr/bin/env node
'use strict';
/**
 * 案C 検査ヘルパ: smoke-e2e / validation-run --keep で残した session を
 * markdown 1 ファイルにダンプする。
 *
 * Usage (互換):
 *   node design/inspection/dump-rewrite-result.js <sid_A> <sid_B> [output_path]
 *     → 出力: design/inspection/rewrite-result-<sid_A>-<sid_B>.md
 *
 * Usage (多 session):
 *   node design/inspection/dump-rewrite-result.js --sessions=12,13,14,15 [--out=path.md]
 *     → 出力: design/inspection/rewrite-result-multi-<min>-<max>.md
 */
// dotenv 不要 (DB アクセスのみ、API 呼出しなし)
const fs = require('fs');
const path = require('path');
const db = require('../../node/rewrite/db');

function header(s) { return `\n## ${s}\n`; }
function sub(s)    { return `\n### ${s}\n`; }
function fence(lang, body) { return '```' + lang + '\n' + body + '\n```'; }
function safeJson(s) { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } }

function dumpSession(conn, sessionId, label) {
  const out = [];
  const sess = conn.prepare(
    `SELECT id, post_id, model_analysis, model_generation, status, triggered_by,
            analysis_output, high_risk_categories, policy_summary, policy_judgment,
            input_tokens_analysis, output_tokens_analysis,
            input_tokens_generation, output_tokens_generation,
            started_at, analysis_completed_at, generation_completed_at, notes
     FROM master_rewrite_session WHERE id=?`
  ).get(sessionId);
  if (!sess) {
    out.push(`# Session ${sessionId} not found`);
    return out.join('\n');
  }

  out.push(`# ${label} — Session ${sess.id}`);
  out.push('');
  out.push(`- post_id: **${sess.post_id}**`);
  out.push(`- triggered_by: ${sess.triggered_by}`);
  out.push(`- model: analysis=${sess.model_analysis} / generation=${sess.model_generation}`);
  out.push(`- status (final): **${sess.status}**`);
  out.push(`- policy_judgment: ${sess.policy_judgment || '(null)'}`);
  out.push(`- high_risk_categories: ${sess.high_risk_categories}`);
  out.push(`- tokens: analysis ${sess.input_tokens_analysis}/${sess.output_tokens_analysis} | generation ${sess.input_tokens_generation}/${sess.output_tokens_generation}`);
  out.push(`- started_at: ${sess.started_at}`);
  out.push(`- analysis_completed_at: ${sess.analysis_completed_at}`);
  out.push(`- generation_completed_at: ${sess.generation_completed_at}`);

  // bundle snapshot 概要
  out.push(header('bundle snapshot (session.notes、3 系統)'));
  try {
    const notes = JSON.parse(sess.notes);
    const b = notes.bundle || {};
    out.push(`- target_query: **${b.target_query}**`);
    out.push(`- required_additions (A 系統): ${(b.required_additions || []).length} 件`);
    out.push(`- shallow_queries    (B 系統): ${(b.shallow_queries || []).length} 件`);
    out.push(`- shallow_facts      (C 系統): ${(b.shallow_facts || []).length} 件`);

    if ((b.required_additions || []).length > 0) {
      out.push(sub('A: required_additions (上位 5 件)'));
      out.push(fence('json', JSON.stringify((b.required_additions || []).slice(0, 5), null, 2)));
    }
    if ((b.shallow_queries || []).length > 0) {
      out.push(sub('B: shallow_queries'));
      out.push(fence('json', JSON.stringify(b.shallow_queries, null, 2)));
    }
    if ((b.shallow_facts || []).length > 0) {
      out.push(sub('C: shallow_facts'));
      out.push(fence('json', JSON.stringify(b.shallow_facts, null, 2)));
    }
  } catch (e) {
    out.push(`(notes parse error: ${e.message})`);
  }

  // analysis_output
  out.push(header('analysis_output (工程6\'-A Opus 4.7)'));
  out.push(fence('json', safeJson(sess.analysis_output)));

  // diffs
  const diffs = conn.prepare(
    `SELECT id, diff_order, target_section, change_type, change_category,
            content_before, content_after, rationale, estimated_impact,
            llm_confidence, risk_flag
     FROM master_rewrite_diff
     WHERE session_id=? ORDER BY diff_order`
  ).all(sessionId);

  out.push(header(`master_rewrite_diff (工程6'-B Sonnet 4.6) — ${diffs.length} 件`));

  // risk_flag 分布
  const dist = {};
  for (const d of diffs) {
    const k = d.risk_flag || '(null)';
    dist[k] = (dist[k] || 0) + 1;
  }
  out.push('risk_flag distribution: ' + JSON.stringify(dist));
  out.push('');

  // index table
  out.push('| # | target_section | change_type | change_category | risk | conf |');
  out.push('|---|---|---|---|---|---|');
  for (const d of diffs) {
    const ts = (d.target_section || '').replace(/\|/g, '\\|').slice(0, 60);
    out.push(`| ${d.diff_order} | ${ts} | ${d.change_type} | ${d.change_category} | ${d.risk_flag || ''} | ${d.llm_confidence} |`);
  }

  // 各 diff 詳細
  for (const d of diffs) {
    out.push(sub(`diff #${d.diff_order} — ${d.target_section}`));
    out.push(`- change_type: \`${d.change_type}\``);
    out.push(`- change_category: \`${d.change_category}\``);
    out.push(`- risk_flag: \`${d.risk_flag || '(null)'}\``);
    out.push(`- llm_confidence: ${d.llm_confidence}`);

    if (d.content_before) {
      out.push('\n**content_before**');
      out.push(fence('html', d.content_before));
    } else {
      out.push('\n**content_before**: (null)');
    }
    if (d.content_after) {
      out.push('\n**content_after**');
      out.push(fence('html', d.content_after));
    } else {
      out.push('\n**content_after**: (null)');
    }
    out.push('\n**rationale**');
    out.push(fence('json', safeJson(d.rationale)));
    if (d.estimated_impact) {
      out.push('\n**estimated_impact**');
      out.push(fence('json', safeJson(d.estimated_impact)));
    }
  }

  return out.join('\n');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flagVal = (name) => {
    const eq = args.find((a) => a.startsWith(`--${name}=`));
    if (eq) return eq.split('=').slice(1).join('=');
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : null;
  };
  const sessionsArg = flagVal('sessions');
  const outArg = flagVal('out');
  if (sessionsArg) {
    const ids = sessionsArg.split(',').map((s) => parseInt(s, 10)).filter(Number.isFinite);
    const out = outArg || path.join(__dirname, `rewrite-result-multi-${Math.min(...ids)}-${Math.max(...ids)}.md`);
    return { mode: 'multi', ids, out };
  }
  const sidA = parseInt(args[0], 10);
  const sidB = parseInt(args[1], 10);
  if (Number.isFinite(sidA) && Number.isFinite(sidB)) {
    return { mode: 'pair', ids: [sidA, sidB], out: args[2] || path.join(__dirname, `rewrite-result-${sidA}-${sidB}.md`) };
  }
  return null;
}

(() => {
  const parsed = parseArgs();
  if (!parsed) {
    console.error('Usage:');
    console.error('  dump-rewrite-result.js <sid_A> <sid_B> [output_path]');
    console.error('  dump-rewrite-result.js --sessions=12,13,14,... [--out=path.md]');
    process.exit(1);
  }
  const conn = db.open();
  const parts = [];
  parts.push('# リライト結果インスペクション');
  parts.push('');
  parts.push(`生成日: ${new Date().toISOString()}`);
  if (parsed.mode === 'pair') {
    const [a, b] = parsed.ids;
    parts.push(`対象 session: ${a} (inject=false), ${b} (inject=true)`);
    parts.push('');
    parts.push('参照: design/sessions/2026-05-22_case_c_e_implementation.md');
    parts.push('');
    parts.push('---');
    parts.push(dumpSession(conn, a, 'Pass A (inject=false)'));
    parts.push('\n---\n');
    parts.push(dumpSession(conn, b, 'Pass B (inject=true)'));
  } else {
    parts.push(`対象 sessions: ${parsed.ids.join(', ')} (計 ${parsed.ids.length} 件)`);
    parts.push('');
    // 索引: post_id, qf_id, diffs, violations を 1 表で
    parts.push('## 索引');
    parts.push('');
    parts.push('| session | post_id | qf_id | status | diffs | violations | high_risk |');
    parts.push('|---|---|---|---|---|---|---|');
    for (const sid of parsed.ids) {
      const s = conn.prepare(
        `SELECT id, post_id, status, high_risk_categories FROM master_rewrite_session WHERE id=?`
      ).get(sid);
      if (!s) { parts.push(`| ${sid} | (not found) | - | - | - | - | - |`); continue; }
      const diffCount = conn.prepare(`SELECT COUNT(*) AS n FROM master_rewrite_diff WHERE session_id=?`).get(sid).n;
      const violCount = conn.prepare(
        `SELECT COUNT(*) AS n FROM master_rewrite_diff WHERE session_id=? AND risk_flag IN ('block','warn')`
      ).get(sid).n;
      // qf_id は master_passage_gap から
      const qfRow = conn.prepare(`SELECT query_fanout_id FROM master_passage_gap WHERE session_id=? LIMIT 1`).get(sid);
      const qf = qfRow ? qfRow.query_fanout_id : '-';
      parts.push(`| ${s.id} | ${s.post_id} | ${qf} | ${s.status} | ${diffCount} | ${violCount} | ${(s.high_risk_categories || '').slice(0, 80)} |`);
    }
    parts.push('');
    parts.push('---');
    for (let i = 0; i < parsed.ids.length; i++) {
      const sid = parsed.ids[i];
      parts.push(dumpSession(conn, sid, `Session ${sid} (${i + 1}/${parsed.ids.length})`));
      parts.push('\n---\n');
    }
  }
  fs.writeFileSync(parsed.out, parts.join('\n'), 'utf8');
  console.log(`wrote: ${parsed.out}`);
  console.log(`bytes: ${fs.statSync(parsed.out).size}`);
})();
