'use strict';
/**
 * 案C C-C: 工程6'-B Sonnet 4.6 差分生成ランナー。
 *
 * 入力: session_id (analysis_output / notes.bundle 保存済、status='generating')
 * 出力: master_rewrite_diff レコード群 (1 session 内 diff_order 連番)
 *       session.status='awaiting_diff_judgment' に遷移
 *
 * V-A-3-5 情報伝搬フロー (該当区間):
 *   analysis_output + 元記事 HTML + protected_blocks
 *   → Sonnet 4.6 呼出 → diffs[] パース + cheerio 検証 → bulk INSERT
 *
 * 警戒バイアス対チェック:
 *   [9]  LLM プロンプト過剰精緻化: case-c-diff-prompt.js に集約
 *   [10] JSON Schema 過剰汎用化: 緩い検証 (必須フィールド存在 + enum 値 + cheerio パース)
 *   [11] Adapter 過剰抽象化: anthropic-adapter.sonnet 直接利用
 *   [12] スケルトン隠れたコスト: ajv なし、不正 diff は skip し errors[] に蓄積
 *   [14] 細分化暴走: MAX_DIFFS_TOTAL でクライアント側も上限カット
 *   [21] LLM 出力構造化保証: cheerio パース必須 (content_before/after)
 */

const cheerio = require('cheerio');
const db = require('../db');
const { sonnet } = require('../../shared/llm-adapters/anthropic-adapter');
const { buildRunStructuredView, makeRunResolver } = require('../apply/gutenberg-apply');
const {
  SYSTEM_PROMPT,
  buildDiffUserPrompt,
  CHANGE_TYPES,
  CHANGE_CATEGORIES,
  RISK_FLAGS,
  MAX_DIFFS_TOTAL,
} = require('./case-c-diff-prompt');

// content.raw (Gutenberg block markup) を取得。run 単位の diff 生成・適用は raw が前提。
async function fetchWpContent(postId) {
  const raw = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  const apiRoot = /\/wp-json\/wp\/v\d+/.test(raw) ? raw : `${raw}/wp-json/wp/v2`;
  const auth = Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
  const url = `${apiRoot}/posts/${postId}?context=edit&_fields=id,title,content`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WP REST ${res.status} for post ${postId} (context=edit 権限を確認)`);
  const p = await res.json();
  const content_raw = p.content?.raw;
  if (content_raw == null) throw new Error(`post ${postId}: content.raw 取得不可 (edit 権限不足)`);
  return { post_id: p.id, title: p.title?.raw ?? p.title?.rendered ?? '', content_raw };
}

function parseDiffsJson(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  // try strict parse
  try {
    const json = JSON.parse(stripped);
    if (!json || !Array.isArray(json.diffs)) throw new Error('output must be { "diffs": [...] }');
    return json.diffs;
  } catch (_strictErr) {
    // recover from truncation: extract complete diff objects from the diffs array
    const startIdx = stripped.indexOf('"diffs"');
    if (startIdx < 0) throw new Error(`diffs JSON parse failed: ${_strictErr.message}`);
    const arrOpen = stripped.indexOf('[', startIdx);
    if (arrOpen < 0) throw new Error(`diffs JSON parse failed: ${_strictErr.message}`);
    const diffs = [];
    let i = arrOpen + 1;
    while (i < stripped.length) {
      while (i < stripped.length && /\s|,/.test(stripped[i])) i++;
      if (stripped[i] === ']') break;
      if (stripped[i] !== '{') break;
      // find matching closing brace, respecting strings + escapes
      let depth = 0;
      let inStr = false;
      let esc = false;
      let j = i;
      for (; j < stripped.length; j++) {
        const c = stripped[j];
        if (inStr) {
          if (esc) { esc = false; continue; }
          if (c === '\\') { esc = true; continue; }
          if (c === '"') inStr = false;
        } else {
          if (c === '"') inStr = true;
          else if (c === '{') depth++;
          else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
        }
      }
      if (depth !== 0) break; // truncated mid-object
      const objText = stripped.slice(i, j);
      try {
        diffs.push(JSON.parse(objText));
      } catch {
        break;
      }
      i = j;
    }
    if (diffs.length === 0) throw new Error(`diffs JSON parse failed: ${_strictErr.message}`);
    return diffs;
  }
}

function cheerioParseOk(html) {
  if (html == null) return true;
  if (typeof html !== 'string') return false;
  if (html.trim().length === 0) return true;
  try {
    cheerio.load(html, { decodeEntities: true });
    return true;
  } catch {
    return false;
  }
}

function validateDiff(d, idx) {
  const errs = [];
  if (typeof d.target_section !== 'string' || !d.target_section.trim()) errs.push('target_section');
  if (!CHANGE_TYPES.includes(d.change_type)) errs.push(`change_type=${d.change_type}`);
  if (d.change_type === 'rewrite_run' && !Number.isInteger(d.run_index)) errs.push('run_index(rewrite_run必須)');
  if (!CHANGE_CATEGORIES.includes(d.change_category)) errs.push(`change_category=${d.change_category}`);
  if (d.risk_flag != null && !RISK_FLAGS.includes(d.risk_flag)) errs.push(`risk_flag=${d.risk_flag}`);
  if (!['high', 'medium', 'low'].includes(d.llm_confidence)) errs.push(`llm_confidence=${d.llm_confidence}`);
  if (!d.rationale || typeof d.rationale !== 'object') errs.push('rationale');
  if (!cheerioParseOk(d.content_before)) errs.push('content_before(cheerio)');
  if (!cheerioParseOk(d.content_after)) errs.push('content_after(cheerio)');
  if (errs.length > 0) return { ok: false, reason: `[diff ${idx}] ${errs.join(', ')}` };
  return { ok: true };
}

/**
 * @param {object} args
 * @param {number} args.session_id
 * @returns {Promise<{ session_id, diffs_inserted, errors, usage, status }>}
 */
async function runDiffGeneration({ session_id }) {
  if (!Number.isInteger(session_id)) throw new Error('runDiffGeneration: session_id required');
  const conn = db.open();

  const session = conn.prepare(
    `SELECT id, post_id, status, analysis_output, notes
     FROM master_rewrite_session WHERE id=?`
  ).get(session_id);
  if (!session) throw new Error(`session ${session_id} not found`);
  if (session.status !== 'generating') {
    throw new Error(`session.status must be 'generating', got '${session.status}'`);
  }
  if (!session.analysis_output) throw new Error('session.analysis_output empty');
  if (!session.notes) throw new Error('session.notes (bundle snapshot) empty');

  const analysis = JSON.parse(session.analysis_output);
  const snapshot = JSON.parse(session.notes);
  const bundle = snapshot.bundle;
  if (!bundle) throw new Error('session.notes.bundle empty');

  const masterRules = conn.prepare(
    `SELECT rule_type, ng_text, correct_text, condition, legal_basis
     FROM master_rules
     WHERE category='cardloan' AND status='verified'`
  ).all();

  const wp = await fetchWpContent(session.post_id);
  const articleView = buildRunStructuredView(wp.content_raw);
  const resolveRun = makeRunResolver(articleView);

  const userPrompt = buildDiffUserPrompt({
    post_id: session.post_id,
    title: wp.title,
    target_query: bundle.target_query,
    analysis_output: analysis,
    article_view: articleView,
    bundle,
    master_rules: masterRules,
  });

  const llmRes = await sonnet({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 16384,
  });

  let diffs = parseDiffsJson(llmRes.text);
  if (diffs.length > MAX_DIFFS_TOTAL) diffs = diffs.slice(0, MAX_DIFFS_TOTAL);

  const errors = [];
  const accepted = [];
  diffs.forEach((d, i) => {
    const v = validateDiff(d, i);
    if (v.ok) accepted.push(d);
    else errors.push(v.reason);
  });

  if (accepted.length === 0) {
    throw new Error(`no valid diffs (parsed=${diffs.length}, errors=${errors.length}): ${errors.slice(0, 3).join(' | ')}`);
  }

  const insertDiff = conn.prepare(
    `INSERT INTO master_rewrite_diff
       (session_id, diff_order, target_section, change_type, change_category,
        content_before, content_after, rationale, estimated_impact,
        llm_confidence, risk_flag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // rewrite_run の content_before は (target_section, run_index) から run の raw markup を
  // server side で補填する (LLM の hallucination 排除 + apply の照合キーになる)。
  // insert 系 / meta 系 / run 解決不可は content_before = null。
  let server_resolved_count = 0;
  const tx = conn.transaction((rows) => {
    rows.forEach((d, idx) => {
      let contentBefore = null;
      if (d.change_type === 'rewrite_run' && Number.isInteger(d.run_index)) {
        const runMarkup = resolveRun(d.target_section, d.run_index);
        if (runMarkup) { contentBefore = runMarkup; server_resolved_count++; }
      }
      insertDiff.run(
        session_id,
        idx + 1,
        d.target_section,
        d.change_type,
        d.change_category,
        contentBefore,
        d.content_after ?? null,
        JSON.stringify(d.rationale || {}),
        d.estimated_impact ? JSON.stringify(d.estimated_impact) : null,
        d.llm_confidence,
        d.risk_flag ?? null
      );
    });
  });
  tx(accepted);

  // errors[] を notes に追記 (root cause 観測用、空配列のときも明示記録)
  let notesObj = {};
  try { notesObj = JSON.parse(session.notes || '{}'); } catch {}
  notesObj.diff_errors = errors;
  notesObj.diff_parsed_total = diffs.length;
  notesObj.content_before_server_resolved = server_resolved_count;

  conn.prepare(
    `UPDATE master_rewrite_session
     SET input_tokens_generation=?,
         output_tokens_generation=?,
         status='awaiting_diff_judgment',
         generation_completed_at=CURRENT_TIMESTAMP,
         notes=?
     WHERE id=?`
  ).run(
    llmRes.usage?.input_tokens || null,
    llmRes.usage?.output_tokens || null,
    JSON.stringify(notesObj),
    session_id
  );

  return {
    session_id,
    diffs_inserted: accepted.length,
    diffs_rejected: errors.length,
    content_before_server_resolved: server_resolved_count,
    errors,
    usage: llmRes.usage,
    status: 'awaiting_diff_judgment',
  };
}

module.exports = {
  runDiffGeneration,
  parseDiffsJson,
  validateDiff,
  cheerioParseOk,
};
