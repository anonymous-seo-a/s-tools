'use strict';
/**
 * 案C C-B: 工程6'-A Opus 4.7 分析実行ランナー。
 *
 * 入力: session_id + post_id + query_fanout_id
 * 出力: analysis_output JSON を master_rewrite_session に保存
 *       status を 'awaiting_policy_judgment' / 'generating' に更新
 *
 * V-A-3-5 情報伝搬フロー:
 *   buildCaseCInputBundle → session.notes に bundle snapshot (V-A-3-7)
 *   → Opus 4.7 呼出 → analysis_output 保存 → high_risk 判定 → status 更新
 *
 * 警戒バイアス対チェック:
 *   [9]  LLM プロンプト過剰精緻化: case-c-prompt.js に集約、本ランナーは オーケストレーション
 *   [10] JSON Schema 過剰汎用化: 緩い検証 (parse + 必須フィールド存在のみ、C-B-3 確定)
 *   [11] Adapter 過剰抽象化: anthropic-adapter.opus 直接利用
 *   [12] スケルトン隠れたコスト: ajv なし、try-catch で parse 失敗時 throw のみ
 *   [22] 環境変数値構造仮定: ANTHROPIC_API_KEY のみ (anthropic-adapter 経由)
 *   [23] fact 概念意味論曖昧: bundle snapshot で 3 系統 (A/B/C) を維持
 */

const db = require('../db');
const { opus } = require('../../shared/llm-adapters/anthropic-adapter');
const { buildCaseCInputBundle } = require('../embedding-poc/case-c-bundle');
const { SYSTEM_PROMPT, buildUserPrompt } = require('./case-c-prompt');
const { extractSelfArticle } = require('../../shared/wp-structured');
const { genreConfig } = require('./genre-config');

const REQUIRED_FIELDS = [
  'structural_analysis',
  'rewrite_policy',
  'confidence',
];

async function fetchWpContent(postId) {
  const raw = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  const apiRoot = /\/wp-json\/wp\/v\d+/.test(raw) ? raw : `${raw}/wp-json/wp/v2`;
  const auth = Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
  const url = `${apiRoot}/posts/${postId}?_fields=id,title,content,link`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WP REST ${res.status} for post ${postId}`);
  const p = await res.json();
  return { post_id: p.id, title: p.title?.rendered || '', content_html: p.content?.rendered || '' };
}

function parseAnalysisOutput(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let json;
  try {
    json = JSON.parse(stripped);
  } catch (e) {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) {
      try { json = JSON.parse(m[0]); }
      catch { throw new Error(`analysis_output JSON parse failed: ${e.message}`); }
    } else {
      throw new Error(`analysis_output JSON parse failed: ${e.message}`);
    }
  }
  for (const f of REQUIRED_FIELDS) {
    if (!(f in json)) throw new Error(`analysis_output missing required field: ${f}`);
  }
  if (!Array.isArray(json.rewrite_policy)) {
    throw new Error('analysis_output.rewrite_policy must be array');
  }
  if (typeof json.confidence !== 'string') {
    throw new Error('analysis_output.confidence must be string');
  }
  if (!Array.isArray(json.high_risk_categories)) {
    json.high_risk_categories = [];
  }
  if (typeof json.protected_blocks_acknowledged !== 'boolean') {
    json.protected_blocks_acknowledged = false;
  }
  return json;
}

function loadHcuSummary(conn, post_id) {
  const row = conn
    .prepare(
      `SELECT pass_count, total_count, pass_rate, item_results
       FROM master_hcu_checklist
       WHERE post_id=?
       ORDER BY evaluated_at DESC LIMIT 1`
    )
    .get(post_id);
  if (!row) return null;
  let nonCompliantSample = [];
  try {
    const ir = JSON.parse(row.item_results || '{}');
    if (Array.isArray(ir.items)) {
      nonCompliantSample = ir.items
        .filter((it) => !it.compliant)
        .slice(0, 5)
        .map((it) => ({ id: it.id, section: it.section, comment: it.comment }));
    }
  } catch {}
  return {
    pass_count: row.pass_count,
    total_count: row.total_count,
    pass_rate: row.pass_rate,
    non_compliant_sample: nonCompliantSample,
  };
}

function loadSimilarArticles(conn, post_id, topK = 5) {
  return conn
    .prepare(
      `SELECT target_post_id, text_similarity, rank_in_source
       FROM master_article_similarity
       WHERE source_post_id=?
       ORDER BY calculated_at DESC, rank_in_source ASC
       LIMIT ?`
    )
    .all(post_id, topK);
}

function loadMasterRules(conn, category = 'cardloan') {
  return conn
    .prepare(
      `SELECT rule_type, ng_text, correct_text, condition, legal_basis
       FROM master_rules
       WHERE category=? AND status='verified'`
    )
    .all(category);
}

function determineStatus(highRiskCategories) {
  return Array.isArray(highRiskCategories) && highRiskCategories.length > 0
    ? 'awaiting_policy_judgment'
    : 'generating';
}

/**
 * @param {object} args
 * @param {number} args.session_id        master_rewrite_session.id (事前 INSERT 済)
 * @param {number} args.post_id
 * @param {number} args.query_fanout_id
 * @returns {Promise<{ analysis_output, high_risk_categories, status, usage, bundle }>}
 */
async function runAnalysis({ session_id, post_id, query_fanout_id, genre = 'cardloan' }) {
  const gcfg = genreConfig(genre);
  if (!Number.isInteger(session_id)) throw new Error('runAnalysis: session_id required');
  if (!Number.isInteger(post_id)) throw new Error('runAnalysis: post_id required');
  if (!Number.isInteger(query_fanout_id)) throw new Error('runAnalysis: query_fanout_id required');

  const conn = db.open();

  // 1. bundle 取得 (段階B B-5)
  const bundle = buildCaseCInputBundle({ session_id, post_id, query_fanout_id });

  // 2. session.notes に bundle snapshot (V-A-3-7)
  const snapshot = { bundle, captured_at: new Date().toISOString() };
  conn.prepare(`UPDATE master_rewrite_session SET notes=? WHERE id=?`)
    .run(JSON.stringify(snapshot), session_id);

  // 3. 関連データ取得
  const hcuSummary = loadHcuSummary(conn, post_id);
  const similarArticles = loadSimilarArticles(conn, post_id);
  const masterRules = loadMasterRules(conn, gcfg.ruleCategory);

  // 4. self 記事 WP REST
  const wp = await fetchWpContent(post_id);
  const struct = extractSelfArticle(wp.content_html);

  // 5. プロンプト構築
  const userPrompt = buildUserPrompt({
    post_id,
    title: wp.title,
    target_query: bundle.target_query,
    self_plain_text_excerpt: struct.plain_text,
    bundle,
    hcu_summary: hcuSummary,
    similar_articles: similarArticles,
    master_rules: masterRules,
    genre: gcfg,
  });

  // 6. Opus 4.7 呼出
  conn.prepare(`UPDATE master_rewrite_session SET status='analyzing' WHERE id=?`).run(session_id);
  const llmRes = await opus({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 4096,
  });

  // 7. JSON パース + 緩いバリデーション
  const analysisOutput = parseAnalysisOutput(llmRes.text);

  // 8. status + analysis_output 更新
  const status = determineStatus(analysisOutput.high_risk_categories);
  conn.prepare(
    `UPDATE master_rewrite_session
     SET analysis_output=?,
         high_risk_categories=?,
         policy_summary=?,
         input_tokens_analysis=?,
         output_tokens_analysis=?,
         status=?,
         analysis_completed_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).run(
    JSON.stringify(analysisOutput),
    JSON.stringify(analysisOutput.high_risk_categories || []),
    analysisOutput.structural_analysis || null,
    llmRes.usage?.input_tokens || null,
    llmRes.usage?.output_tokens || null,
    status,
    session_id
  );

  return {
    session_id,
    analysis_output: analysisOutput,
    high_risk_categories: analysisOutput.high_risk_categories || [],
    status,
    usage: llmRes.usage,
    bundle,
  };
}

module.exports = {
  runAnalysis,
  parseAnalysisOutput,
  determineStatus,
};
