'use strict';

const express = require('express');
const { open } = require('../db');
const { runComplianceCheck } = require('../llm-execution/compliance-runner');
const { runAnalysis } = require('../llm-execution/analysis-runner');
const { runDiffGeneration } = require('../llm-execution/diff-runner');
const { sessionCostUsd } = require('../llm-execution/cost');
const { getModels, setModels, ALLOWED_MODELS } = require('../../shared/llm-adapters/anthropic-adapter');
const { planGutenbergApply, applyGutenbergOps, htmlToBlocks } = require('../apply/gutenberg-apply');
const { classifyDomain, collectCompetitorCorpus } = require('../competitor-corpus/collect');
const { extractForQueryFanout } = require('../fact-set/extract');
const { calcIgScore } = require('../fact-set/ig-score');

// in-memory job ストア (server プロセス再起動で消失、明示再実行で再投入)
//   key: session_id (number) → compliance job
//   key: job_id (string)     → generation job
const complianceJobs = new Map();
const generationJobs = new Map(); // job_id → { ... }
let activeGenerationJobId = null;

// β-1A: smoke-e2e.js の一気通貫フローを単独関数化。
// embedding-poc が未完成領域なので mock gap データを INSERT する (現状の Phase 2 と同質)。
async function runGenerationPipeline(job, conn) {
  const { post_id, query_fanout_id, enableCompliance, genre = 'cardloan' } = job.options;

  // 1. session INSERT
  job.step = 'session_init';
  const m = getModels();
  const info = conn.prepare(
    `INSERT INTO master_rewrite_session
       (post_id, model_analysis, model_generation, triggered_by, status, genre)
     VALUES (?, ?, ?, 'ui-generation', 'planned', ?)`
  ).run(post_id, m.analysis, m.generation, genre);
  const session_id = info.lastInsertRowid;
  job.session_id = session_id;

  // 2. 情報ゲイン pipeline (B): 競合コーパス → fact 抽出 → IG スコア。
  //    既に corpus がある fanout は skip (冪等、SerpApi/LLM の無駄打ち防止)。
  //    これにより auto-pick 生成も「競合にあり自記事に無い事実」のデータ駆動になる。
  const fanout = conn.prepare('SELECT sub_query FROM master_query_fanout WHERE id=?').get(query_fanout_id);
  if (!fanout) throw new Error(`query_fanout_id=${query_fanout_id} not found`);
  // corpus (fanout 単位) と IG (post×query 単位) は別条件でスキップ判定する:
  // fanout を別 post / リトライで再利用した場合、corpus はあっても
  // この post の fact 抽出・IG が未計算のことがある。
  const hasCorpus = conn.prepare('SELECT COUNT(*) n FROM master_competitor_corpus WHERE query_fanout_id=?').get(query_fanout_id).n;
  if (!hasCorpus) {
    job.step = 'competitor_corpus';
    await collectCompetitorCorpus(query_fanout_id, { topN: 5 });
  }
  const hasIg = conn.prepare(
    'SELECT COUNT(*) n FROM master_information_gain_score WHERE post_id=? AND target_query=?'
  ).get(post_id, fanout.sub_query).n;
  if (!hasIg) {
    job.step = 'fact_extraction';
    await extractForQueryFanout({ post_id, query_fanout_id });
    calcIgScore({ post_id, query_fanout_id });
  }

  // 3. runAnalysis (Opus 4.7)
  job.step = 'analyzing';
  const analysisRes = await runAnalysis({ session_id, post_id, query_fanout_id, genre });
  job.analysis = {
    usage: analysisRes.usage,
    status: analysisRes.status,
    high_risk_categories: analysisRes.high_risk_categories,
  };

  // 4. policy_judgment の扱い
  //   - 通常 (UI 単発生成 / 手動バッチ): smoke と同じく強制承認して生成へ進む。
  //   - holdOnPolicy (件数指定の自動モード): 致命的判断が必要な記事は Daiki に残す。
  //     diff 生成・compliance 前に停止し、session を awaiting_policy_judgment のまま据え置く
  //     (LLM コストも節約。Daiki が policy 承認すれば後から手動生成できる)。
  if (analysisRes.status === 'awaiting_policy_judgment') {
    if (job.options.holdOnPolicy) {
      job.policy_held = true;
      job.step = 'held_policy';
      return { session_id, policy_held: true };
    }
    conn.prepare(
      `UPDATE master_rewrite_session SET policy_judgment='approved', policy_judgment_at=CURRENT_TIMESTAMP, status='generating' WHERE id=?`
    ).run(session_id);
  }

  // 5. runDiffGeneration (Sonnet 4.6)
  job.step = 'generating';
  const diffRes = await runDiffGeneration({ session_id, genre });
  job.diff = {
    usage: diffRes.usage,
    diffs_inserted: diffRes.diffs_inserted,
    diffs_rejected: diffRes.diffs_rejected,
    content_before_server_resolved: diffRes.content_before_server_resolved,
  };

  // 6. (optional) runComplianceCheck
  if (enableCompliance) {
    job.step = 'compliance';
    const complianceRes = await runComplianceCheck({ session_id, enableLayer2: true });
    job.compliance = {
      diffs_scanned: complianceRes.diffs_scanned,
      diffs_with_violations: complianceRes.diffs_with_violations,
      total_violations: complianceRes.total_violations,
      layer2_llm_calls: complianceRes.layer2_llm_calls,
      layer2_usage: complianceRes.layer2_usage,
    };
  }

  job.step = 'done';
  return { session_id };
}

// ─────────────────────────────────────────────────────────────────────
// Step β-2: WP 適用 (apply step)
//   - approved diff を 1 件ずつ WP content 内で content_before を search → content_after に置換
//   - 全件成功で WP PUT (atomically)
//   - 1 件でも失敗すれば dry-run 結果としてエラー返し、WP は触らない
//   - 適用前 WP HTML を wp_snapshot_before_apply に保存 (ロールバック用)
//   - hallucination 旧 diff (content_before 短すぎ) は事前に排除
// ─────────────────────────────────────────────────────────────────────

function wpBase() {
  const raw = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  if (!raw) throw new Error('WP_API_BASE_URL not set');
  return raw.endsWith('/wp-json/wp/v2') ? raw : `${raw}/wp-json/wp/v2`;
}
function wpAuthHeader() {
  return 'Basic ' + Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
}

// content.raw (Gutenberg block markup) を取得。edit 権限が要る (soico-cvr-system / editor)。
async function fetchWpPost(postId) {
  const res = await fetch(`${wpBase()}/posts/${postId}?context=edit`, { headers: { Authorization: wpAuthHeader() } });
  if (!res.ok) {
    throw new Error(`WP fetch ${postId}: HTTP ${res.status} (context=edit 権限/認証を確認)`);
  }
  const p = await res.json();
  const content_raw = p.content?.raw;
  if (content_raw == null) {
    throw new Error(`WP post ${postId}: content.raw 取得不可 (edit 権限不足の可能性)`);
  }
  return { title_raw: p.title?.raw ?? p.title?.rendered ?? '', content_raw };
}

// payload: { content?, title? } を WP に PUT。
async function updateWpPost(postId, payload) {
  const res = await fetch(`${wpBase()}/posts/${postId}`, {
    method: 'POST', // WP REST は POST で update
    headers: { Authorization: wpAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`WP update ${postId}: HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json();
}

// title diff の content_after からタイトル文字列を取り出す (<title>…</title> or 素テキスト)。
function extractTitleText(after) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(after || '');
  return (m ? m[1] : (after || '')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// meta:description の content_after からディスクリプション文字列を取り出す。
function extractMetaDescription(after) {
  const m = /content\s*=\s*["']([^"']+)["']/i.exec(after || '');
  return (m ? m[1] : (after || '')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// 本文 diff (insert/rewrite) と別に meta diff (title/description) を仕分ける。
function planMetaDiffs(diffs) {
  const meta_planned = [];
  const meta_skipped = [];
  let newTitle = null;
  let newMetaDesc = null;
  let metaDescDiffId = null;
  for (const d of diffs) {
    if (d.daiki_judgment !== 'approved') continue;
    if (d.change_type === 'update_title') {
      const t = extractTitleText(d.daiki_edit_content || d.content_after || '');
      if (t) { newTitle = t; meta_planned.push({ diff_id: d.id, op: 'update_title', value: t }); }
      else meta_skipped.push({ diff_id: d.id, reason: 'title 抽出不可' });
    } else if (d.change_type === 'update_meta_description') {
      const desc = extractMetaDescription(d.daiki_edit_content || d.content_after || '');
      if (desc) { newMetaDesc = desc; metaDescDiffId = d.id; meta_planned.push({ diff_id: d.id, op: 'update_meta_description', value: desc }); }
      else meta_skipped.push({ diff_id: d.id, reason: 'meta description 抽出不可' });
    }
  }
  return { meta_planned, meta_skipped, newTitle, newMetaDesc, metaDescDiffId };
}

// AIOSEO meta description を mu-plugin 経由で更新。未配置(404)は graceful に false。
async function updateAioseoDescription(postId, description) {
  const base = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  // /wp-json/wp/v2 → /wp-json/soico/v1
  const root = base.replace(/\/wp\/v2$/, '').replace(/\/wp-json$/, '/wp-json');
  const url = `${root.endsWith('/wp-json') ? root : root.replace(/\/wp-json\/.*/, '/wp-json')}/soico/v1/aioseo-description`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: wpAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ post_id: postId, description }),
  });
  if (res.status === 404) return { ok: false, reason: 'mu-plugin 未配置 (soico-aioseo-rest.php)' };
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
  return { ok: true };
}

const VALID_SESSION_STATUSES = new Set([
  'planned',
  'analyzing',
  'awaiting_policy_judgment',
  'generating',
  'awaiting_diff_judgment',
  'completed',
  'failed',
  'cancelled',
]);

const VALID_JUDGMENTS = new Set(['pending', 'approved', 'rejected']);

function fetchSessions({ status, genre, limit }) {
  const conn = open();
  const params = [];
  const conds = [];
  if (status) { conds.push('s.status = ?'); params.push(status); }
  if (genre) { conds.push('s.genre = ?'); params.push(genre); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const sql = `
    SELECT
      s.id,
      s.post_id,
      s.status,
      s.genre,
      s.model_analysis,
      s.model_generation,
      s.input_tokens_analysis,
      s.output_tokens_analysis,
      s.input_tokens_generation,
      s.output_tokens_generation,
      s.policy_judgment,
      s.high_risk_categories,
      s.started_at,
      s.analysis_completed_at,
      s.generation_completed_at,
      s.triggered_by,
      COUNT(d.id) AS diff_count,
      SUM(CASE WHEN d.daiki_judgment = 'pending'  THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN d.daiki_judgment = 'approved' THEN 1 ELSE 0 END) AS approved_count,
      SUM(CASE WHEN d.daiki_judgment = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
    FROM master_rewrite_session s
    LEFT JOIN master_rewrite_diff d ON d.session_id = s.id
    ${where}
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT ?
  `;
  params.push(limit);
  // cost_total_usd は保存値ではなく token から算出 (cost.js、常に正)。
  return conn.prepare(sql).all(...params).map((s) => ({ ...s, cost_total_usd: sessionCostUsd(s) }));
}

function fetchSessionDetail(id) {
  const conn = open();
  const session = conn.prepare(`
    SELECT
      id, post_id, status, genre, model_analysis, model_generation,
      input_tokens_analysis, output_tokens_analysis,
      input_tokens_generation, output_tokens_generation,
      cost_total_usd, analysis_output, high_risk_categories,
      policy_summary, policy_judgment, policy_judgment_at,
      policy_reject_reason, policy_reject_note,
      started_at, analysis_completed_at, generation_completed_at, completed_at,
      triggered_by, notes
    FROM master_rewrite_session
    WHERE id = ?
  `).get(id);
  if (!session) return null;
  const diffs = conn.prepare(`
    SELECT
      id, session_id, diff_order, target_section, change_type, change_category,
      content_before, content_after, rationale, estimated_impact,
      llm_confidence, risk_flag, evidence_id,
      daiki_judgment, daiki_edit_content, daiki_reject_reason, daiki_reject_note,
      judged_at, applied_to_wp, applied_at, ab_test_id, created_at
    FROM master_rewrite_diff
    WHERE session_id = ?
    ORDER BY diff_order, id
  `).all(id);
  // content_after_blocks: 実際に WP へ適用される Gutenberg block markup (= htmlToBlocks の出力)。
  // UI の AFTER 表示を「投稿と同じブロック markup」にするための算出フィールド。
  const diffsWithBlocks = diffs.map((d) => {
    const after = d.daiki_edit_content || d.content_after || '';
    let blocks = '';
    try { blocks = htmlToBlocks(after); } catch { blocks = after; }
    return { ...d, content_after_blocks: blocks };
  });
  // cost_total_usd は token から算出して上書き (保存列は常に null のため)。
  return { ...session, cost_total_usd: sessionCostUsd(session), diffs: diffsWithBlocks };
}

// セッションの「情報ゲイン根拠データ」を集約して返す (UI で投入事実を全確認するため)。
//   - bundle: 生成時に注入した required_additions / shallow_* (session.notes のスナップショット)
//   - competitors: 競合コーパス + 各競合の抽出 fact (layer1/2)
//   - self_facts: 自記事の抽出 fact
//   - ig: 情報ゲインスコア (gap 件数 + サンプル)
function fetchSessionEvidence(id) {
  const conn = open();
  const session = conn.prepare(`SELECT id, post_id, genre, notes FROM master_rewrite_session WHERE id=?`).get(id);
  if (!session) return null;
  let bundle = null;
  try { bundle = JSON.parse(session.notes || '{}').bundle || null; } catch { bundle = null; }
  const qfid = bundle?.query_fanout_id ?? null;
  const targetQuery = bundle?.target_query ?? null;

  const parseSnap = (s) => { try { return JSON.parse(s || 'null'); } catch { return null; } };

  const competitors = qfid == null ? [] : conn.prepare(
    `SELECT competitor_url, rank_position, fact_set_snapshot
     FROM master_competitor_corpus WHERE query_fanout_id=? ORDER BY rank_position`
  ).all(qfid).map((r) => {
    const snap = parseSnap(r.fact_set_snapshot) || {};
    return {
      competitor_url: r.competitor_url, rank_position: r.rank_position,
      site_type: classifyDomain(r.competitor_url),
      layer1: Array.isArray(snap.layer1) ? snap.layer1 : [],
      layer2: Array.isArray(snap.layer2) ? snap.layer2 : [],
    };
  });

  const selfFacts = conn.prepare(
    `SELECT layer, content, source_url FROM master_fact_set WHERE post_id=? ORDER BY layer, id`
  ).all(session.post_id);

  let ig = null;
  if (targetQuery != null) {
    ig = conn.prepare(
      `SELECT layer1_gap_count, layer2_gap_count, competitor_url_count, notes, calculated_at
       FROM master_information_gain_score WHERE post_id=? AND target_query=? ORDER BY id DESC LIMIT 1`
    ).get(session.post_id, targetQuery) || null;
    if (ig) { ig.gap_samples = parseSnap(ig.notes)?.gap_fact_samples ?? null; delete ig.notes; }
  }

  return {
    session_id: id, post_id: session.post_id, genre: session.genre, target_query: targetQuery,
    bundle: bundle ? {
      required_additions: bundle.required_additions || [],
      shallow_queries: bundle.shallow_queries || [],
      shallow_facts: bundle.shallow_facts || [],
    } : null,
    ig, competitors, self_facts: selfFacts,
  };
}

// ─────────────────────────────────────────────────────────────
// リライト記事 自動ピック (順位モニタリング → 候補)
//   直近28日で平均順位 11-20 (ページ2=伸びしろ) の記事を impression 降順で候補化。
// ─────────────────────────────────────────────────────────────
const CANDIDATE_MIN_IMPR = 500;

async function fetchWpTitles(ids) {
  if (!ids.length) return {};
  try {
    const res = await fetch(`${wpBase()}/posts?include=${ids.join(',')}&per_page=${ids.length}&_fields=id,title`, { headers: { Authorization: wpAuthHeader() } });
    if (!res.ok) return {};
    const arr = await res.json();
    const m = {};
    for (const p of arr) m[p.id] = p.title?.rendered || '';
    return m;
  } catch { return {}; }
}

// セッションが存在する (失敗・キャンセル以外) 記事 = リライト済み or 進行中。候補から除外する。
function getRewrittenPostIds() {
  return new Set(
    open().prepare(
      `SELECT DISTINCT post_id FROM master_rewrite_session
       WHERE status NOT IN ('failed', 'cancelled')`
    ).all().map((r) => r.post_id)
  );
}

async function fetchRewriteCandidates(genre, limit) {
  const category = genre || 'cardloan';
  const mdb = require('../../monitor-db');
  const db = mdb.getDB();
  const rewritten = getRewrittenPostIds();
  // alias は daily_metrics の列名 (impressions/rank/ctr) と衝突させない (HAVING で集計が誤評価されるため)。
  // limit は除外後に適用するため、SQL 側は余裕を持って取る。
  const rows = db.prepare(`
    SELECT m.post_id, a.url,
           AVG(m.rank) AS avgRank, SUM(m.impressions) AS sumImpr,
           SUM(m.gsc_click) AS sumClick, AVG(m.ctr) AS avgCtr
    FROM daily_metrics m JOIN articles a ON a.post_id = m.post_id
    WHERE a.category = ?
      AND m.date >= date((SELECT MAX(date) FROM daily_metrics), '-28 day')
    GROUP BY m.post_id
    HAVING avgRank BETWEEN 11 AND 20 AND sumImpr >= ?
    ORDER BY sumImpr DESC
    LIMIT ?
  `).all(category, CANDIDATE_MIN_IMPR, limit + rewritten.size)
    .filter((r) => !rewritten.has(r.post_id))
    .slice(0, limit);
  const titles = await fetchWpTitles(rows.map((r) => r.post_id));
  return rows.map((r) => ({
    post_id: r.post_id,
    url: r.url,
    title: titles[r.post_id] || '',
    avg_rank: Number(r.avgRank.toFixed(1)),
    impressions: r.sumImpr,
    clicks: r.sumClick,
    ctr: Number(((r.avgCtr || 0) * 100).toFixed(2)),
  }));
}

// 候補記事の top query を取得し query_fanout を自動生成 (生成の target_query にする)。
async function prepareCandidate(postId, genre) {
  const mdb = require('../../monitor-db');
  const mc = require('../../monitor-collectors');
  const mconn = mdb.getDB();
  const art = mconn.prepare('SELECT url FROM articles WHERE post_id=?').get(postId);
  if (!art) throw new Error(`post ${postId} が monitor.db に無い`);
  const latest = mconn.prepare('SELECT MAX(date) d FROM daily_metrics').get().d;
  const start = mconn.prepare("SELECT date(?, '-28 day') d").get(latest).d;
  const top = await mc.fetchTopQueryForPage(art.url, { startDate: start, endDate: latest, topN: 1 });
  const targetQuery = top[0]?.query;
  if (!targetQuery) throw new Error('top query を取得できなかった');
  const conn = open();
  // 同一クエリの auto-pick fanout は再利用 (fanout 行の重複防止 + 収集済み競合コーパスの
  // 再利用で Yahoo SERP 取得を省略できる → throttle 負荷とリトライ時間を削減)。
  const existing = conn.prepare(
    `SELECT id FROM master_query_fanout
     WHERE sub_query=? AND generation_method='auto-pick' ORDER BY id DESC LIMIT 1`
  ).get(targetQuery);
  if (existing) {
    return { post_id: postId, query_fanout_id: existing.id, target_query: targetQuery, reused: true };
  }
  const info = conn.prepare(
    `INSERT INTO master_query_fanout (seed_query, sub_query, layer, generation_method, priority, notes)
     VALUES (?, ?, 1, 'auto-pick', 1, ?)`
  ).run(targetQuery, targetQuery, `auto-pick post ${postId} (${genre || 'cardloan'})`);
  return { post_id: postId, query_fanout_id: info.lastInsertRowid, target_query: targetQuery };
}

// ─────────────────────────────────────────────────────────────
// 自動承認 (一括リライト用)
//   実績データ (過去の Daiki 判定) に基づく保守的基準:
//     却下実績は rate_update の事実誤りと medium 確信度に集中
//   → 自動承認 = compliance violations なし × risk_flag なし × llm_confidence 'high'
//     それ以外は pending のまま残す (= 判断に迷う部分として Daiki に伺う)
// ─────────────────────────────────────────────────────────────
function diffHasViolations(rationale) {
  try {
    const p = typeof rationale === 'string' ? JSON.parse(rationale) : rationale;
    return Array.isArray(p?.compliance?.detected_violations) && p.compliance.detected_violations.length > 0;
  } catch {
    return true; // rationale が壊れている diff は安全側 (伺い) に倒す
  }
}

function autoJudgeSession(sessionId) {
  const conn = open();
  const diffs = conn.prepare(
    `SELECT id, rationale, risk_flag, llm_confidence, daiki_judgment
     FROM master_rewrite_diff WHERE session_id=? AND daiki_judgment='pending'`
  ).all(sessionId);
  const approve = conn.prepare(
    `UPDATE master_rewrite_diff SET daiki_judgment='approved', judged_at=CURRENT_TIMESTAMP WHERE id=?`
  );
  let autoApproved = 0;
  const held = [];
  for (const d of diffs) {
    const riskFree = !d.risk_flag || d.risk_flag === 'none';
    const confident = d.llm_confidence === 'high';
    const clean = !diffHasViolations(d.rationale);
    if (riskFree && confident && clean) {
      approve.run(d.id);
      autoApproved++;
    } else {
      held.push({
        diff_id: d.id,
        reasons: [
          !clean && 'compliance違反',
          !riskFree && `risk:${d.risk_flag}`,
          !confident && `conf:${d.llm_confidence}`,
        ].filter(Boolean),
      });
    }
  }
  return { auto_approved: autoApproved, held };
}

// ─────────────────────────────────────────────────────────────
// 一括リライトバッチ (生成 → 自動承認 → 全 diff クリーンなら WP 適用)
//   - 直列実行 (LLM/WP 負荷と生成排他を単純化)
//   - 1記事の失敗は記録して次へ進む (バッチ全体は止めない)
//   - held (伺い) が 1 件でもあるセッションは WP 適用せず判定待ちに残す
//     (部分適用すると残り diff を後から適用できなくなるため)
//   - in-memory state: サーバ再起動で進捗表示は消えるが、生成済み session は DB に残る
// ─────────────────────────────────────────────────────────────
const batchJobs = new Map(); // job_id → state
let activeBatchJobId = null;
const BATCH_MAX_POSTS = 20;       // 手動 (post_ids 指定) バッチの上限
const AUTO_BATCH_MAX_POSTS = 50;  // 件数指定の自動モードの上限

function isGenerationBusy() {
  if (activeGenerationJobId) {
    const g = generationJobs.get(activeGenerationJobId);
    if (g && g.status === 'running') return 'single generation in progress';
  }
  if (activeBatchJobId) {
    const b = batchJobs.get(activeBatchJobId);
    if (b && b.status === 'running') return 'batch in progress';
  }
  return null;
}

const BATCH_ITEM_COOLDOWN_MS = 15_000;   // Yahoo SERP 連続取得を避ける項目間クールダウン
const BATCH_THROTTLE_ABORT = 2;          // 連続 throttle 失敗でバッチ中断 (IP ブロック中の全滅突撃防止)

function isThrottleError(msg) {
  return /throttled|HTTP 429|HTTP 403/i.test(msg || '');
}

async function runBatchRewrite(job) {
  const { genre, enableCompliance, autoApply, holdOnPolicy } = job.options;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let consecutiveThrottle = 0;
  for (let i = 0; i < job.items.length; i++) {
    const item = job.items[i];
    job.current_index = i;
    if (consecutiveThrottle >= BATCH_THROTTLE_ABORT) {
      item.status = 'skipped';
      item.error = 'Yahoo throttle 連続検出のため中断 — 30分以上おいて失敗分を再選択してください';
      continue;
    }
    if (i > 0) await sleep(BATCH_ITEM_COOLDOWN_MS);
    try {
      // 1. top query → query_fanout 自動生成
      item.status = 'preparing';
      const prep = await prepareCandidate(item.post_id, genre);

      // 2. 一気通貫生成 (session_init → corpus → analysis → diff → compliance)
      item.status = 'generating';
      const genJob = {
        options: { post_id: item.post_id, query_fanout_id: prep.query_fanout_id, enableCompliance, genre, holdOnPolicy },
        session_id: null, step: 'init', analysis: null, diff: null, compliance: null, policy_held: false,
      };
      try {
        await runGenerationPipeline(genJob, open());
      } catch (e) {
        // 単発生成 route と同じ後始末: session を failed に落として復旧不能ストールを防ぐ
        if (genJob.session_id) {
          try {
            open().prepare(
              `UPDATE master_rewrite_session
               SET status='failed', notes=json_set(COALESCE(NULLIF(notes,''),'{}'), '$.pipeline_error', ?)
               WHERE id=?`
            ).run(e.message || String(e), genJob.session_id);
          } catch { /* noop */ }
        }
        throw e;
      }
      item.session_id = genJob.session_id;

      // 3a. policy 判断要で停止した記事 (auto モードのみ): 致命的判断は Daiki に残す。
      if (genJob.policy_held) {
        item.status = 'held';
        item.hold_reason = 'policy_judgment';
        consecutiveThrottle = 0;
        continue;
      }

      item.diff_count = genJob.diff?.diffs_inserted ?? 0;
      item.violations = genJob.compliance?.total_violations ?? null;

      // 3b. 自動承認 (基準外は pending のまま = 伺い)
      item.status = 'judging';
      const judged = autoJudgeSession(genJob.session_id);
      item.auto_approved = judged.auto_approved;
      item.held = judged.held.length;
      item.held_details = judged.held;

      // 4. WP 適用 (autoApply 時のみ。held があれば全体を判定待ちに残す)
      if (autoApply && judged.held.length === 0 && judged.auto_approved > 0) {
        item.status = 'applying';
        const applied = await applySessionCore(genJob.session_id, { dryRun: false });
        item.applied = applied.applied;
        item.applied_count = applied.applied_count || 0;
        item.status = 'done';
      } else if (judged.held.length > 0) {
        item.status = 'held'; // 伺い: 判定タブで pending diff を確認
        item.hold_reason = 'held_diff';
      } else {
        item.status = 'done'; // autoApply off or approved 0 (適用対象なし)
      }
      consecutiveThrottle = 0;
    } catch (e) {
      item.status = 'failed';
      item.error = e.message || String(e);
      if (isThrottleError(item.error)) consecutiveThrottle++;
      else consecutiveThrottle = 0;
      console.error(`[batch ${job.job_id}] post ${item.post_id}:`, e);
    }
  }
  job.current_index = job.items.length;
}

// ─────────────────────────────────────────────────────────────
// WP 適用コア (route /sessions/:id/apply と batch 共用)。
// throw: { httpStatus, message } 相当のエラー。成功時は route と同じ payload を返す。
// ─────────────────────────────────────────────────────────────
async function applySessionCore(id, { dryRun = false } = {}) {
  const conn = open();
  const session = conn.prepare(`SELECT id, post_id, status, wp_apply_completed_at FROM master_rewrite_session WHERE id=?`).get(id);
  if (!session) { const e = new Error('session not found'); e.httpStatus = 404; throw e; }
  if (!dryRun && session.wp_apply_completed_at) {
    const e = new Error('already applied'); e.httpStatus = 409; throw e;
  }
  const diffs = conn.prepare(
    `SELECT id, diff_order, target_section, change_type, daiki_judgment, daiki_edit_content,
            content_before, content_after
     FROM master_rewrite_diff WHERE session_id=? ORDER BY diff_order`
  ).all(id);
  const wp = await fetchWpPost(session.post_id);
  const plan = planGutenbergApply(wp.content_raw, diffs);     // 本文 (insert/rewrite)
  const meta = planMetaDiffs(diffs);                          // title / meta description
  const planned = [...plan.planned, ...meta.meta_planned];
  const skipped = [...plan.skipped, ...meta.meta_skipped];

  if (planned.length === 0) {
    return {
      dry_run: dryRun, post_id: session.post_id, applied: false,
      planned, skipped, reason: 'no diffs to apply',
    };
  }

  if (dryRun) {
    return { dry_run: true, post_id: session.post_id, applied: false, planned, skipped };
  }

  // 実適用。snapshot は raw content + title を JSON で保存 (rollback で完全復元)。
  const applied = applyGutenbergOps(wp.content_raw, plan.ops);
  conn.prepare(
    `UPDATE master_rewrite_session
     SET wp_snapshot_before_apply=?, wp_apply_started_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).run(JSON.stringify({ content_raw: wp.content_raw, title_raw: wp.title_raw }), id);

  const payload = { content: applied.raw };
  if (meta.newTitle) payload.title = meta.newTitle;
  await updateWpPost(session.post_id, payload);

  // meta description は AIOSEO mu-plugin 経由 (未配置なら skip 扱い)。
  let metaDescApplied = true;
  if (meta.newMetaDesc) {
    const r = await updateAioseoDescription(session.post_id, meta.newMetaDesc);
    if (!r.ok) {
      metaDescApplied = false;
      skipped.push({ diff_id: meta.metaDescDiffId, reason: `meta description 適用不可: ${r.reason}` });
    }
  }

  conn.prepare(
    `UPDATE master_rewrite_session
     SET wp_apply_completed_at=CURRENT_TIMESTAMP, status='completed', completed_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).run(id);

  const metaIds = meta.meta_planned
    .filter((m) => metaDescApplied || m.op !== 'update_meta_description')
    .map((m) => m.diff_id);
  const appliedIds = [...plan.planned.map((p) => p.diff_id), ...metaIds];
  const applyMark = conn.prepare(`UPDATE master_rewrite_diff SET applied_to_wp=1, applied_at=CURRENT_TIMESTAMP WHERE id=?`);
  for (const did of appliedIds) applyMark.run(did);

  return {
    dry_run: false, post_id: session.post_id, applied: true,
    planned, skipped, applied_count: appliedIds.length,
    conflicts: applied.conflicts,
  };
}

function updateDiffJudgment(id, { judgment, reject_reason, reject_note, edit_content }) {
  const conn = open();
  const existing = conn.prepare(`SELECT * FROM master_rewrite_diff WHERE id = ?`).get(id);
  if (!existing) return null;

  const sets = ['daiki_judgment = ?', 'judged_at = CURRENT_TIMESTAMP'];
  const params = [judgment];

  if (judgment === 'rejected') {
    sets.push('daiki_reject_reason = ?');
    params.push(reject_reason ?? null);
    sets.push('daiki_reject_note = ?');
    params.push(reject_note ?? null);
  } else {
    sets.push('daiki_reject_reason = NULL');
    sets.push('daiki_reject_note = NULL');
  }

  if (edit_content !== undefined) {
    sets.push('daiki_edit_content = ?');
    params.push(edit_content);
  }

  params.push(id);
  conn.prepare(`UPDATE master_rewrite_diff SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return conn.prepare(`SELECT * FROM master_rewrite_diff WHERE id = ?`).get(id);
}

function buildRouter() {
  const router = express.Router();

  // GET /api/rewrite/judgment/models — ロール別の現行モデルと選択肢
  router.get('/models', (_req, res) => {
    res.json({ current: getModels(), allowed: ALLOWED_MODELS });
  });

  // PUT /api/rewrite/judgment/models — { analysis?, generation? } を切替・永続化
  router.put('/models', (req, res) => {
    try {
      const current = setModels(req.body || {});
      res.json({ current, allowed: ALLOWED_MODELS });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/rewrite/judgment/sessions?status=awaiting_diff_judgment&limit=N
  router.get('/sessions', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
      let status = req.query.status;
      if (status === '' || status === 'all') status = undefined;
      if (status !== undefined && !VALID_SESSION_STATUSES.has(status)) {
        return res.status(400).json({ error: 'invalid status', allowed: [...VALID_SESSION_STATUSES] });
      }
      let genre = req.query.genre;
      if (genre === '' || genre === 'all') genre = undefined;
      const items = fetchSessions({ status, genre, limit });
      return res.json({
        limit,
        status: status || null,
        genre: genre || null,
        count: items.length,
        items,
      });
    } catch (e) {
      console.error('[GET /judgment/sessions]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rewrite/judgment/sessions/:id  → session + diffs[]
  router.get('/sessions/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'invalid id' });
      }
      const detail = fetchSessionDetail(id);
      if (!detail) return res.status(404).json({ error: 'session not found', id });
      return res.json(detail);
    } catch (e) {
      console.error('[GET /judgment/sessions/:id]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rewrite/judgment/rewrite-candidates?genre=securities&limit=20
  //   順位モニタリングから「平均順位11-20 (伸びしろ)」の記事を impression 降順で候補化。
  router.get('/rewrite-candidates', async (req, res) => {
    try {
      let genre = req.query.genre;
      if (!genre || genre === 'all') genre = 'cardloan';
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
      const items = await fetchRewriteCandidates(genre, limit);
      return res.json({ genre, count: items.length, items });
    } catch (e) {
      console.error('[GET /judgment/rewrite-candidates]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/judgment/rewrite-candidates/:postId/prepare  body:{genre}
  //   候補の top query から query_fanout を生成し、生成に使う {post_id, query_fanout_id, target_query} を返す。
  router.post('/rewrite-candidates/:postId/prepare', async (req, res) => {
    try {
      const postId = Number(req.params.postId);
      if (!Number.isInteger(postId) || postId <= 0) return res.status(400).json({ error: 'invalid postId' });
      const genre = (req.body && req.body.genre) || 'cardloan';
      const r = await prepareCandidate(postId, genre);
      return res.json(r);
    } catch (e) {
      console.error('[POST /judgment/rewrite-candidates/:postId/prepare]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rewrite/judgment/sessions/:id/evidence
  //   情報ゲイン根拠 (bundle / 競合 fact / 自記事 fact / IG) を集約して返す。
  router.get('/sessions/:id/evidence', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
      const ev = fetchSessionEvidence(id);
      if (!ev) return res.status(404).json({ error: 'session not found', id });
      return res.json(ev);
    } catch (e) {
      console.error('[GET /judgment/sessions/:id/evidence]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/judgment/sessions
  //   body: { post_id, query_fanout_id, enableCompliance: true }
  //   非同期: smoke-e2e.js の一気通貫フローを実行 (analysis → diff → compliance)
  //   同時実行 1 件まで (排他)
  router.post('/sessions', (req, res) => {
    try {
      const busy = isGenerationBusy();
      if (busy) {
        return res.status(409).json({ error: busy });
      }
      const body = req.body || {};
      const post_id = Number(body.post_id);
      const query_fanout_id = Number(body.query_fanout_id);
      if (!Number.isInteger(post_id) || post_id <= 0) {
        return res.status(400).json({ error: 'post_id (positive integer) required' });
      }
      if (!Number.isInteger(query_fanout_id) || query_fanout_id <= 0) {
        return res.status(400).json({ error: 'query_fanout_id (positive integer) required' });
      }
      const enableCompliance = body.enableCompliance !== false;
      const genre = typeof body.genre === 'string' ? body.genre : 'cardloan';

      const job_id = `gen-${Date.now()}`;
      const job = {
        job_id,
        status: 'running',
        step: 'init',
        options: { post_id, query_fanout_id, enableCompliance, genre },
        session_id: null,
        analysis: null,
        diff: null,
        compliance: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        error: null,
      };
      generationJobs.set(job_id, job);
      activeGenerationJobId = job_id;

      (async () => {
        try {
          await runGenerationPipeline(job, open());
          job.status = 'completed';
        } catch (e) {
          job.status = 'failed';
          job.error = e.message || String(e);
          console.error(`[generation job ${job_id}]`, e);
          // DB セッションを failed に落とす (これをしないと analyzing/generating で永久ストール、
          // UI から復旧不能になる)。session INSERT 前の失敗時は session_id=null なので skip。
          if (job.session_id) {
            try {
              open().prepare(
                `UPDATE master_rewrite_session
                 SET status='failed', notes=json_set(COALESCE(NULLIF(notes,''),'{}'), '$.pipeline_error', ?)
                 WHERE id=?`
              ).run(job.error, job.session_id);
            } catch (e2) {
              console.error(`[generation job ${job_id}] failed to mark session failed:`, e2.message);
            }
          }
        } finally {
          job.completed_at = new Date().toISOString();
        }
      })();

      return res.status(202).json(job);
    } catch (e) {
      console.error('[POST /judgment/sessions]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rewrite/judgment/generation/:job_id  → job 状態
  router.get('/generation/:job_id', (req, res) => {
    const job = generationJobs.get(req.params.job_id);
    if (!job) return res.status(404).json({ error: 'generation job not found', job_id: req.params.job_id });
    return res.json(job);
  });

  // GET /api/rewrite/judgment/generation  → 最新 job (job_id 不明な時用)
  router.get('/generation', (_req, res) => {
    if (!activeGenerationJobId) return res.status(404).json({ error: 'no generation job' });
    const job = generationJobs.get(activeGenerationJobId);
    if (!job) return res.status(404).json({ error: 'no generation job' });
    return res.json(job);
  });

  // POST /api/rewrite/judgment/batch
  //   body: { post_ids: number[], genre, enableCompliance?: true, autoApply?: true }
  //   候補記事を直列で 生成 → 自動承認 → (全クリーンなら) WP 適用。
  //   自動承認基準外の diff は pending に残り、セッションは判定待ち (伺い) になる。
  router.post('/batch', (req, res) => {
    try {
      const busy = isGenerationBusy();
      if (busy) return res.status(409).json({ error: busy });

      const body = req.body || {};
      const postIds = Array.isArray(body.post_ids)
        ? body.post_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
        : [];
      if (postIds.length === 0) return res.status(400).json({ error: 'post_ids (positive integers) required' });
      if (postIds.length > BATCH_MAX_POSTS) {
        return res.status(400).json({ error: `post_ids は最大 ${BATCH_MAX_POSTS} 件`, given: postIds.length });
      }
      const genre = typeof body.genre === 'string' ? body.genre : 'cardloan';
      const enableCompliance = body.enableCompliance !== false;
      const autoApply = body.autoApply !== false;

      const job_id = `batch-${Date.now()}`;
      const job = {
        job_id,
        status: 'running',
        options: { genre, enableCompliance, autoApply },
        total: postIds.length,
        current_index: 0,
        items: postIds.map((pid) => ({
          post_id: pid, status: 'queued', session_id: null,
          diff_count: null, violations: null,
          auto_approved: null, held: null, held_details: null,
          applied: false, applied_count: 0, error: null,
        })),
        started_at: new Date().toISOString(),
        completed_at: null,
      };
      batchJobs.set(job_id, job);
      activeBatchJobId = job_id;

      (async () => {
        try {
          await runBatchRewrite(job);
          job.status = 'completed';
        } catch (e) {
          job.status = 'failed';
          job.error = e.message || String(e);
          console.error(`[batch job ${job_id}]`, e);
        } finally {
          job.completed_at = new Date().toISOString();
        }
      })();

      return res.status(202).json(job);
    } catch (e) {
      console.error('[POST /judgment/batch]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/judgment/auto-batch
  //   body: { count: number, genre, enableCompliance?: true }
  //   件数指定の全自動モード: 候補 (順位11-20 × impr 降順 × 未リライト) を count 件 自動ピックし、
  //   生成 → 自動承認 → WP 反映 まで一気通貫。ただし「致命的判断が必要な記事」は除外:
  //     - policy 判断要 (high_risk_categories 有り) → diff 生成前に停止し held(policy)
  //     - 自動承認外の diff (risk有/conf≠high/compliance違反) を含む → 適用せず held(held_diff)
  //   除外された記事は判定タブで Daiki が確認する。クリーンな記事のみ自動反映される。
  router.post('/auto-batch', async (req, res) => {
    try {
      const busy = isGenerationBusy();
      if (busy) return res.status(409).json({ error: busy });

      const body = req.body || {};
      const genre = typeof body.genre === 'string' ? body.genre : 'cardloan';
      let count = parseInt(body.count, 10);
      if (!Number.isInteger(count) || count <= 0) {
        return res.status(400).json({ error: 'count (positive integer) required' });
      }
      const capped = count > AUTO_BATCH_MAX_POSTS;
      count = Math.min(count, AUTO_BATCH_MAX_POSTS);
      const enableCompliance = body.enableCompliance !== false;

      // 候補を自動ピック (既リライト記事は fetchRewriteCandidates 内で除外済み)
      const candidates = await fetchRewriteCandidates(genre, count);
      if (candidates.length === 0) {
        return res.status(404).json({ error: '候補記事が見つかりません (順位11-20 / impr≥500 / 未リライト)' });
      }

      const job_id = `auto-${Date.now()}`;
      const job = {
        job_id,
        mode: 'auto',
        status: 'running',
        options: { genre, enableCompliance, autoApply: true, holdOnPolicy: true },
        requested_count: count,
        capped,
        total: candidates.length,
        current_index: 0,
        items: candidates.map((c) => ({
          post_id: c.post_id, title: c.title, url: c.url,
          avg_rank: c.avg_rank, impressions: c.impressions,
          status: 'queued', session_id: null, diff_count: null, violations: null,
          auto_approved: null, held: null, held_details: null, hold_reason: null,
          applied: false, applied_count: 0, error: null,
        })),
        started_at: new Date().toISOString(),
        completed_at: null,
      };
      batchJobs.set(job_id, job);
      activeBatchJobId = job_id;

      (async () => {
        try {
          await runBatchRewrite(job);
          job.status = 'completed';
        } catch (e) {
          job.status = 'failed';
          job.error = e.message || String(e);
          console.error(`[auto-batch job ${job_id}]`, e);
        } finally {
          job.completed_at = new Date().toISOString();
        }
      })();

      return res.status(202).json(job);
    } catch (e) {
      console.error('[POST /judgment/auto-batch]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rewrite/judgment/batch — 最新バッチの進捗
  router.get('/batch', (_req, res) => {
    if (!activeBatchJobId) return res.status(404).json({ error: 'no batch job' });
    const job = batchJobs.get(activeBatchJobId);
    if (!job) return res.status(404).json({ error: 'no batch job' });
    return res.json(job);
  });

  // GET /api/rewrite/judgment/query-fanouts  → 候補リスト
  router.get('/query-fanouts', (_req, res) => {
    try {
      const rows = open().prepare(
        `SELECT id, seed_query, sub_query, intent_dimension, layer, priority
         FROM master_query_fanout
         ORDER BY id DESC LIMIT 200`
      ).all();
      return res.json({ count: rows.length, items: rows });
    } catch (e) {
      console.error('[GET /judgment/query-fanouts]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/judgment/sessions/:id/apply
  //   body: { dry_run?: boolean }
  //   approved diff を content.raw (Gutenberg) に適用: insert は再利用/CTA を保持して挿入、
  //   rewrite は保護ブロックを含まない section のみ置換 (含めば skip)、title は別 PUT。
  //   全文を content.raw として PUT (ブロック構造保持)。snapshot で rollback 可能。
  //   dry_run=true なら計画 (planned / skipped) を返すだけで WP は触らない。
  router.post('/sessions/:id/apply', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
      const dryRun = !!(req.body && req.body.dry_run);
      const result = await applySessionCore(id, { dryRun });
      return res.json(result);
    } catch (e) {
      if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message, id: Number(req.params.id) });
      console.error('[POST /judgment/sessions/:id/apply]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/judgment/sessions/:id/rollback
  //   wp_snapshot_before_apply で WP を上書き、status を awaiting_diff_judgment に戻す
  router.post('/sessions/:id/rollback', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
      const conn = open();
      const session = conn.prepare(
        `SELECT id, post_id, wp_snapshot_before_apply, wp_apply_completed_at
         FROM master_rewrite_session WHERE id=?`
      ).get(id);
      if (!session) return res.status(404).json({ error: 'session not found', id });
      if (!session.wp_apply_completed_at) return res.status(409).json({ error: 'not applied yet' });
      if (!session.wp_snapshot_before_apply) return res.status(409).json({ error: 'no snapshot saved' });

      // snapshot は {content_raw, title_raw} JSON (新方式)。旧データは素の content 文字列。
      const snap = session.wp_snapshot_before_apply;
      const payload = {};
      try {
        const o = JSON.parse(snap);
        if (o && typeof o === 'object' && 'content_raw' in o) {
          payload.content = o.content_raw;
          if (o.title_raw != null) payload.title = o.title_raw;
        } else { payload.content = snap; }
      } catch { payload.content = snap; }
      await updateWpPost(session.post_id, payload);

      conn.prepare(
        `UPDATE master_rewrite_session
         SET wp_apply_completed_at=NULL, completed_at=NULL, status='awaiting_diff_judgment'
         WHERE id=?`
      ).run(id);
      conn.prepare(`UPDATE master_rewrite_diff SET applied_to_wp=0, applied_at=NULL WHERE session_id=?`).run(id);

      return res.json({ rolled_back: true, post_id: session.post_id });
    } catch (e) {
      console.error('[POST /judgment/sessions/:id/rollback]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/judgment/sessions/:id/compliance
  //   body: { enableLayer2?: true }
  //   非同期: 即座に { job_id, status: 'running' } を返し、裏で compliance-runner を実行。
  //   進捗確認は GET /sessions/:id/compliance で取得。
  router.post('/sessions/:id/compliance', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'invalid id' });
      }
      const session = open().prepare(`SELECT id FROM master_rewrite_session WHERE id=?`).get(id);
      if (!session) return res.status(404).json({ error: 'session not found', id });

      const existing = complianceJobs.get(id);
      if (existing && existing.status === 'running') {
        return res.status(409).json({ error: 'compliance already running for this session', job: existing });
      }

      const enableLayer2 = req.body?.enableLayer2 !== false; // default true
      const job = {
        session_id: id,
        status: 'running',
        started_at: new Date().toISOString(),
        completed_at: null,
        result: null,
        error: null,
        options: { enableLayer2 },
      };
      complianceJobs.set(id, job);

      // 非同期実行
      (async () => {
        try {
          const r = await runComplianceCheck({ session_id: id, enableLayer2 });
          job.status = 'completed';
          job.result = r;
        } catch (e) {
          job.status = 'failed';
          job.error = e.message || String(e);
          console.error(`[compliance job session=${id}]`, e);
        } finally {
          job.completed_at = new Date().toISOString();
        }
      })();

      return res.status(202).json({ session_id: id, status: 'running', started_at: job.started_at, options: job.options });
    } catch (e) {
      console.error('[POST /judgment/sessions/:id/compliance]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rewrite/judgment/sessions/:id/compliance
  router.get('/sessions/:id/compliance', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'invalid id' });
      }
      const job = complianceJobs.get(id);
      if (!job) return res.status(404).json({ error: 'no compliance job for this session', id });
      return res.json(job);
    } catch (e) {
      console.error('[GET /judgment/sessions/:id/compliance]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/rewrite/judgment/diffs/:id
  //   body: { judgment, reject_reason?, reject_note?, edit_content? }
  router.patch('/diffs/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'invalid id' });
      }
      const body = req.body || {};
      const judgment = body.judgment;
      if (!VALID_JUDGMENTS.has(judgment)) {
        return res.status(400).json({ error: 'invalid judgment', allowed: [...VALID_JUDGMENTS] });
      }
      const updated = updateDiffJudgment(id, {
        judgment,
        reject_reason: body.reject_reason,
        reject_note: body.reject_note,
        edit_content: body.edit_content,
      });
      if (!updated) return res.status(404).json({ error: 'diff not found', id });
      return res.json(updated);
    } catch (e) {
      console.error('[PATCH /judgment/diffs/:id]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = {
  VALID_SESSION_STATUSES,
  VALID_JUDGMENTS,
  buildRouter,
  fetchSessions,
  fetchSessionDetail,
  updateDiffJudgment,
};
