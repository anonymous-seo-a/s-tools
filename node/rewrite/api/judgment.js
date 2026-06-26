'use strict';

const express = require('express');
const { open } = require('../db');
const { runComplianceCheck } = require('../llm-execution/compliance-runner');
const { runAnalysis } = require('../llm-execution/analysis-runner');
const { runDiffGeneration } = require('../llm-execution/diff-runner');
const { runBoxFill } = require('../llm-execution/empty-box-filler');
const { sessionCostUsd } = require('../llm-execution/cost');
const { checkReadability } = require('../llm-execution/readability-checker');
const { getModels, setModels, ALLOWED_MODELS } = require('../../shared/llm-adapters/anthropic-adapter');
const { planGutenbergApply, applyGutenbergOps, applyBatch, htmlToBlocks } = require('../apply/gutenberg-apply');
const { detectEmptyTitleBoxes } = require('../apply/empty-box-detector');
const { classifyDomain, collectCompetitorCorpus } = require('../competitor-corpus/collect');
const { extractForQueryFanout } = require('../fact-set/extract');
const { calcIgScore } = require('../fact-set/ig-score');
const { generateEyecatch } = require('../../shared/gemini-image');

// in-memory job ストア (server プロセス再起動で消失、明示再実行で再投入)
//   key: session_id (number) → compliance job
//   key: job_id (string)     → generation job
const complianceJobs = new Map();
const generationJobs = new Map(); // job_id → { ... }
let activeGenerationJobId = null;

// ─────────────────────────────────────────────────────────────
// リライト一時停止ジャンル (2026-06-16 Daiki 指示: カードローンをしばらく停止)
//   生成系の入口 (sessions / batch / auto-batch / candidate prepare) で 403 で弾く。
//   再開する場合はこの Set を空にする (UI の DISABLED_GENRES も同時に更新)。
// ─────────────────────────────────────────────────────────────
const DISABLED_REWRITE_GENRES = new Set(['cardloan']);
function genreDisabledResponse(res, genre) {
  return res.status(403).json({ error: `「${genre}」のリライトは現在停止中です (一時停止ジャンル)` });
}

// β-1A: smoke-e2e.js の一気通貫フローを単独関数化。
// embedding-poc が未完成領域なので mock gap データを INSERT する (現状の Phase 2 と同質)。
async function runGenerationPipeline(job, conn) {
  const { post_id, query_fanout_id, enableCompliance, genre = 'cardloan' } = job.options;

  // 0. 重複ガード: 同じ post に未失敗のセッションが既にあれば二重リライトしない。
  //   候補リスト(fetchRewriteCandidates)も除外するが、UI が古い/手動 post_id 指定でも
  //   二重生成を防ぐ最終防壁。意図的な再リライトは options.force で上書き可。
  if (!job.options.force) {
    const dup = conn.prepare(
      `SELECT id, status FROM master_rewrite_session
       WHERE post_id=? AND status NOT IN ('failed','cancelled') ORDER BY id DESC LIMIT 1`
    ).get(post_id);
    if (dup) {
      const e = new Error(`post ${post_id} は既にリライト済み/進行中 (session #${dup.id}, status=${dup.status})。再リライトは既存セッションを取消すか force 指定が必要。`);
      e.duplicate = true;
      throw e;
    }
  }

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
  //   - 通常 (UI 単発生成 / 手動バッチ): 強制承認して生成へ進む。
  //   - holdOnPolicy (件数指定の自動モード): 致命的判断が必要でも **diff は生成する**
  //     (Daiki のレビュー材料になるため)。policy_held フラグで auto-batch の自動適用だけ抑止し、
  //     全 diff を pending のまま awaiting_diff_judgment に残す。
  //     (旧実装は diff 生成前に停止していたが、承認すべき差分が無く判定不能になる不具合があった)
  if (analysisRes.status === 'awaiting_policy_judgment') {
    if (job.options.holdOnPolicy) job.policy_held = true;
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

  // 5b. 空テンプレBOX 補完 (検出→fact で中身生成→fill_empty_box diff として判定フローへ)。
  //     失敗してもリライト本体は止めない (補助工程)。
  try {
    job.step = 'box_fill';
    const boxRes = await runBoxFill({ session_id });
    job.box_fill = { detected: boxRes.detected, filled: boxRes.filled, held: boxRes.held };
  } catch (e) {
    console.error(`[runGenerationPipeline] box_fill 失敗 (非致命): ${e.message}`);
    job.box_fill = { error: e.message };
  }

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

// PNG Buffer を WP メディアにアップロードし、media id を返す。
async function uploadWpMedia(buffer, filename, { mimeType = 'image/png', altText = '', title = '' } = {}) {
  const res = await fetch(`${wpBase()}/media`, {
    method: 'POST',
    headers: {
      Authorization: wpAuthHeader(),
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body: buffer,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`WP media upload: HTTP ${res.status} ${t.slice(0, 200)} (upload_files 権限を確認)`);
  }
  const media = await res.json();
  // alt / title を補完 (任意・失敗は無視)
  if ((altText || title) && media.id) {
    try {
      await fetch(`${wpBase()}/media/${media.id}`, {
        method: 'POST',
        headers: { Authorization: wpAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt_text: altText || title, title }),
      });
    } catch { /* noop */ }
  }
  return { id: media.id, source_url: media.source_url };
}

// 新タイトルから 16:9 アイキャッチを Gemini 生成 → WP メディア化 → featured_media に設定。
// 失敗しても本文適用は壊さない (呼び出し側で try/catch して skipped 報告)。
async function applyEyecatchForTitle(postId, { title, contentRaw, genre }) {
  const img = await generateEyecatch({ title, contentRaw, genre });
  // 拡張子は mimeType に合わせる (WP は Content-Type と拡張子の不一致を弾くため)。
  const ext = img.mimeType === 'image/png' ? 'png' : img.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const safeName = `eyecatch-${postId}-${Date.now()}.${ext}`;
  const media = await uploadWpMedia(img.buffer, safeName, { mimeType: img.mimeType, title, altText: title });
  await updateWpPost(postId, { featured_media: media.id });
  return { media_id: media.id, source_url: media.source_url };
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
//   → 自動承認 = compliance violations なし × risk_flag OK × llm_confidence OK × 可読性ガード通過
//     それ以外は pending のまま残す (= 判断に迷う部分として Daiki に伺う)
//     可読性ガード: ハウススタイル逸脱 (段落>250字 / 視覚要素なし本文>450字) を held に倒す
// ─────────────────────────────────────────────────────────────
function diffHasViolations(rationale) {
  try {
    const p = typeof rationale === 'string' ? JSON.parse(rationale) : rationale;
    return Array.isArray(p?.compliance?.detected_violations) && p.compliance.detected_violations.length > 0;
  } catch {
    return true; // rationale が壊れている diff は安全側 (伺い) に倒す
  }
}

// 自動承認の許容セット (2026-06-16 Daiki 指示で緩和: 旧 risk=none × conf=high のみ → 下記)。
//   - risk_flag: none / low まで許可 (medium 以上は held)
//   - llm_confidence: high / medium まで許可 (low は held)
//   - compliance 違反は引き続きハードブロック (YMYL 法令ライン)
const AUTO_RISK_OK = new Set([null, undefined, '', 'none', 'low']);
const AUTO_CONF_OK = new Set(['high', 'medium']);

// ─────────────────────────────────────────────────────────────
// 学習型 auto 承認 (過去の Daiki 判定から held を自己縮小)。
//   セル = change_type | llm_confidence | risk_flag。
//   そのセルの実績 (approved/rejected) が「承認率 ≥ LEARN_MIN_RATE かつ サンプル ≥ LEARN_MIN_SAMPLE」
//   なら学習済み安全 = static ルール (risk none/low) を超えて auto 承認に追加する。
//   Daiki が判定を重ねるほど閾値超えセルが増え held が減っていく。
//   compliance / 可読性 / grounding は全セルで常にハードゲート維持 (YMYL 法令・品質ライン)。
//   conf=low は学習対象外 (常に held)。
const LEARN_MIN_RATE = 0.95;   // バランス設定 (2026-06-25 Daiki 選択)
const LEARN_MIN_SAMPLE = 20;
const cellKey = (changeType, conf, risk) => `${changeType}|${conf}|${risk || 'none'}`;

function learnSafeCells(conn) {
  const rows = conn.prepare(
    `SELECT change_type, llm_confidence AS conf, risk_flag AS risk,
            SUM(daiki_judgment='approved') AS approved,
            SUM(daiki_judgment='rejected') AS rejected
     FROM master_rewrite_diff
     WHERE daiki_judgment IN ('approved','rejected') AND llm_confidence IN ('high','medium')
     GROUP BY change_type, llm_confidence, risk_flag`
  ).all();
  const safe = new Set();
  const learned = [];
  for (const r of rows) {
    const decided = (r.approved || 0) + (r.rejected || 0);
    if (decided < LEARN_MIN_SAMPLE) continue;
    const rate = (r.approved || 0) / decided;
    if (rate < LEARN_MIN_RATE) continue;
    const key = cellKey(r.change_type, r.conf, r.risk);
    safe.add(key);
    learned.push({ key, rate: Math.round(rate * 1000) / 10, n: decided });
  }
  return { safe, learned };
}

function autoJudgeSession(sessionId) {
  const conn = open();
  const { safe: safeCells, learned } = learnSafeCells(conn);
  const diffs = conn.prepare(
    `SELECT id, change_type, rationale, risk_flag, llm_confidence, daiki_judgment, content_after, daiki_edit_content
     FROM master_rewrite_diff WHERE session_id=? AND daiki_judgment='pending'`
  ).all(sessionId);
  const approve = conn.prepare(
    `UPDATE master_rewrite_diff SET daiki_judgment='approved', judged_at=CURRENT_TIMESTAMP WHERE id=?`
  );
  let autoApproved = 0;
  const held = [];
  // 削除系は本質的に高リスク(競合網羅喪失/参照破壊/矛盾)。Daiki 指示で常に手動判定必須とし
  // 自動承認から無条件除外する (2026-06-26 削除機能導入時の安全弁)。
  const DELETE_CHANGE_TYPES = new Set(['delete_run', 'delete_section']);
  for (const d of diffs) {
    if (DELETE_CHANGE_TYPES.has(d.change_type)) {
      held.push({ diff_id: d.id, reasons: ['削除は手動判定必須 (自動承認対象外)'] });
      continue;
    }
    const confident = AUTO_CONF_OK.has(d.llm_confidence);
    const learnedSafe = confident && safeCells.has(cellKey(d.change_type, d.llm_confidence, d.risk_flag));
    // risk: static ルール (none/low) または 学習済み安全セル なら OK。
    const riskOk = AUTO_RISK_OK.has(d.risk_flag) || learnedSafe;
    const clean = !diffHasViolations(d.rationale);
    // 可読性ガード: ハウススタイル逸脱 (過剰統合・本文の壁) は自動承認から除外し伺いに残す。
    const readVios = checkReadability(d.daiki_edit_content || d.content_after).violations;
    const readable = readVios.length === 0;
    if (riskOk && confident && clean && readable) {
      approve.run(d.id);
      autoApproved++;
    } else {
      held.push({
        diff_id: d.id,
        reasons: [
          !clean && 'compliance違反',
          !riskOk && `risk:${d.risk_flag}`,
          !confident && `conf:${d.llm_confidence}`,
          ...readVios.map((v) => `可読性:${v.type}(${v.chars})`),
        ].filter(Boolean),
      });
    }
  }
  return { auto_approved: autoApproved, held, learned_cells: learned };
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
      item.diff_count = genJob.diff?.diffs_inserted ?? 0;
      item.violations = genJob.compliance?.total_violations ?? null;

      // 3a. policy 判断要: diff は生成済 (レビュー材料あり)。自動承認も自動適用もせず、
      //     全 diff を pending のまま awaiting_diff_judgment に残して Daiki の判定に委ねる。
      if (genJob.policy_held) {
        item.status = 'held';
        item.hold_reason = 'policy_judgment';
        consecutiveThrottle = 0;
        continue;
      }

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
      // 重複ガード由来は「中断」ではなく「スキップ(既リライト)」として扱う。
      if (e.duplicate) {
        item.status = 'skipped';
        item.error = e.message || String(e);
        consecutiveThrottle = 0;
        continue;
      }
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
  const session = conn.prepare(`SELECT id, post_id, status, genre, wp_apply_completed_at FROM master_rewrite_session WHERE id=?`).get(id);
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
  // 二段適用: insert が生成した見出しを別 diff がアンカーにする依存も解決する。
  const plan = applyBatch(wp.content_raw, diffs);             // 本文 (insert/rewrite) → {raw,planned,skipped,conflicts}
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

  // 実適用済みの raw は applyBatch が算出済 (plan.raw)。snapshot は raw+title を JSON 保存 (rollback 用)。
  // 完全性チェック: 適用後の本文に「中身が空のままのテンプレBOX」が残っていないか検査。
  //   box_fill が拾えなかった/リライト restructure が新規追加した 等で空BOXが残ると、
  //   従来は気付かず公開されていた (securities/5093)。残存したら warning として表面化させる。
  const emptyBoxesRemaining = detectEmptyTitleBoxes(plan.raw).map((b) => b.label);
  if (emptyBoxesRemaining.length) {
    console.warn(`[applySessionCore] session ${id} post ${session.post_id}: 空BOX残存 ${emptyBoxesRemaining.length}件 → ${emptyBoxesRemaining.join(' / ')}`);
    skipped.push({ diff_id: null, reason: `⚠空BOX残存(${emptyBoxesRemaining.length}): ${emptyBoxesRemaining.join(' / ')} — 補完されず公開。要確認` });
  }
  conn.prepare(
    `UPDATE master_rewrite_session
     SET wp_snapshot_before_apply=?, wp_apply_started_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).run(JSON.stringify({ content_raw: wp.content_raw, title_raw: wp.title_raw }), id);

  const payload = { content: plan.raw };
  if (meta.newTitle) payload.title = meta.newTitle;
  await updateWpPost(session.post_id, payload);

  // タイトル差し替え時: Gemini で 16:9 アイキャッチ生成 → featured_media に差し替え。
  // 画像生成/アップロード失敗は本文適用を壊さず skipped に記録 (graceful)。
  let eyecatch = null;
  if (meta.newTitle) {
    try {
      eyecatch = await applyEyecatchForTitle(session.post_id, {
        title: meta.newTitle, contentRaw: wp.content_raw, genre: session.genre || 'cardloan',
      });
    } catch (e) {
      skipped.push({ diff_id: null, reason: `アイキャッチ生成/差替に失敗: ${e.message}` });
    }
  }

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
    empty_boxes_remaining: emptyBoxesRemaining,
    conflicts: plan.conflicts,
    eyecatch,
  };
}

// ─────────────────────────────────────────────────────────────
// 承認済み変更の一括 WP 適用
//   承認 diff を持ち未適用のセッションを全件 applySessionCore で適用する。
//   停止ジャンル (cardloan) は対象外。直列・1記事失敗は記録して継続。
// ─────────────────────────────────────────────────────────────
const applyApprovedJobs = new Map();
let activeApplyApprovedJobId = null;

function findApprovedUnappliedSessions() {
  const conn = open();
  const rows = conn.prepare(`
    SELECT s.id, s.post_id, s.genre,
           SUM(CASE WHEN d.daiki_judgment='approved' THEN 1 ELSE 0 END) AS approved_count
    FROM master_rewrite_session s
    JOIN master_rewrite_diff d ON d.session_id = s.id
    WHERE s.wp_apply_completed_at IS NULL
      AND s.status NOT IN ('failed','cancelled')
    GROUP BY s.id
    HAVING approved_count > 0
    ORDER BY s.id
  `).all();
  return rows.filter((r) => !DISABLED_REWRITE_GENRES.has(r.genre));
}

async function runApplyApproved(job) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < job.items.length; i++) {
    const item = job.items[i];
    job.current_index = i;
    try {
      item.status = 'applying';
      const r = await applySessionCore(item.session_id, { dryRun: false });
      item.applied = !!r.applied;
      item.applied_count = r.applied_count || 0;
      item.eyecatch = !!r.eyecatch;
      if (r.applied) {
        item.status = 'done';
      } else {
        item.status = 'skipped';
        item.reason = r.reason || 'no diffs to apply';
      }
    } catch (e) {
      item.status = 'failed';
      item.error = e.message || String(e);
      console.error(`[apply-approved ${job.job_id}] session ${item.session_id}:`, e);
    }
    await sleep(800);
  }
  job.current_index = job.items.length;
}

// ─────────────────────────────────────────────────────────────
// policy 保留セッションの diff 生成 (resume)
//   auto-batch の旧仕様で diff 未生成のまま awaiting_policy_judgment に残った空セッションを、
//   policy 承認 → diff 生成 → compliance まで進めて awaiting_diff_judgment にする。
//   analysis/corpus は収集済みなので Yahoo SERP は叩かない (Sonnet diff 生成のみ)。
// ─────────────────────────────────────────────────────────────
const resumePolicyJobs = new Map();
let activeResumePolicyJobId = null;

function findPolicyHeldSessions() {
  return open().prepare(
    `SELECT s.id, s.post_id, s.genre, COUNT(d.id) AS diff_count
     FROM master_rewrite_session s
     LEFT JOIN master_rewrite_diff d ON d.session_id = s.id
     WHERE s.status = 'awaiting_policy_judgment'
     GROUP BY s.id
     ORDER BY s.id`
  ).all();
}

async function runResumePolicyHeld(job) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < job.items.length; i++) {
    const item = job.items[i];
    job.current_index = i;
    try {
      const conn = open();
      const s = conn.prepare(`SELECT id, genre, status FROM master_rewrite_session WHERE id=?`).get(item.session_id);
      if (!s) { item.status = 'failed'; item.error = 'session not found'; continue; }
      if (s.status !== 'awaiting_policy_judgment') { item.status = 'skipped'; item.reason = `status=${s.status}`; continue; }
      // policy 承認 → generating (diff 生成の前提)
      conn.prepare(
        `UPDATE master_rewrite_session SET policy_judgment='approved', policy_judgment_at=CURRENT_TIMESTAMP, status='generating' WHERE id=?`
      ).run(s.id);
      item.status = 'generating';
      const diffRes = await runDiffGeneration({ session_id: s.id, genre: s.genre || 'cardloan' });
      item.diff_count = diffRes.diffs_inserted ?? 0;
      item.status = 'compliance';
      const compRes = await runComplianceCheck({ session_id: s.id, enableLayer2: true });
      item.violations = compRes.total_violations ?? null;
      item.status = 'done'; // → awaiting_diff_judgment
    } catch (e) {
      item.status = 'failed';
      item.error = e.message || String(e);
      // 失敗時は awaiting_policy_judgment に戻して再実行可能にする (generating で stuck させない)
      try {
        open().prepare(
          `UPDATE master_rewrite_session SET status='awaiting_policy_judgment' WHERE id=? AND status='generating'`
        ).run(item.session_id);
      } catch { /* noop */ }
      console.error(`[resume-policy ${job.job_id}] session ${item.session_id}:`, e);
    }
    await sleep(500);
  }
  job.current_index = job.items.length;
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
      if (DISABLED_REWRITE_GENRES.has(genre)) return genreDisabledResponse(res, genre);
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
      if (DISABLED_REWRITE_GENRES.has(genre)) return genreDisabledResponse(res, genre);

      const job_id = `gen-${Date.now()}`;
      const job = {
        job_id,
        status: 'running',
        step: 'init',
        options: { post_id, query_fanout_id, enableCompliance, genre, force: body.force === true },
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
      if (DISABLED_REWRITE_GENRES.has(genre)) return genreDisabledResponse(res, genre);
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
      if (DISABLED_REWRITE_GENRES.has(genre)) return genreDisabledResponse(res, genre);
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

  // GET /api/rewrite/judgment/apply-approved/preview → 適用対象 (承認済み未適用) の件数と一覧
  router.get('/apply-approved/preview', (_req, res) => {
    try {
      const sessions = findApprovedUnappliedSessions();
      return res.json({
        count: sessions.length,
        total_diffs: sessions.reduce((s, r) => s + r.approved_count, 0),
        sessions,
      });
    } catch (e) {
      console.error('[GET /judgment/apply-approved/preview]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/judgment/apply-approved → 承認済み未適用セッションを一括 WP 適用 (背景実行)
  router.post('/apply-approved', (_req, res) => {
    try {
      if (activeApplyApprovedJobId) {
        const j = applyApprovedJobs.get(activeApplyApprovedJobId);
        if (j && j.status === 'running') return res.status(409).json({ error: '一括適用が既に実行中です' });
      }
      const sessions = findApprovedUnappliedSessions();
      if (sessions.length === 0) {
        return res.json({ started: false, total: 0, message: '適用対象の承認済みセッションがありません' });
      }
      const job_id = `applyall-${Date.now()}`;
      const job = {
        job_id,
        status: 'running',
        total: sessions.length,
        current_index: 0,
        items: sessions.map((s) => ({
          session_id: s.id, post_id: s.post_id, genre: s.genre,
          approved_count: s.approved_count, status: 'queued',
          applied: false, applied_count: 0, eyecatch: false, reason: null, error: null,
        })),
        started_at: new Date().toISOString(),
        completed_at: null,
      };
      applyApprovedJobs.set(job_id, job);
      activeApplyApprovedJobId = job_id;
      (async () => {
        try { await runApplyApproved(job); job.status = 'completed'; }
        catch (e) { job.status = 'failed'; job.error = e.message || String(e); console.error(`[apply-approved ${job_id}]`, e); }
        finally { job.completed_at = new Date().toISOString(); }
      })();
      return res.status(202).json(job);
    } catch (e) {
      console.error('[POST /judgment/apply-approved]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rewrite/judgment/apply-approved → 最新の一括適用ジョブ進捗
  router.get('/apply-approved', (_req, res) => {
    if (!activeApplyApprovedJobId) return res.status(404).json({ error: 'no apply-approved job' });
    const job = applyApprovedJobs.get(activeApplyApprovedJobId);
    if (!job) return res.status(404).json({ error: 'no apply-approved job' });
    return res.json(job);
  });

  // GET /api/rewrite/judgment/resume-policy-held/preview → diff 未生成の policy 保留件数
  router.get('/resume-policy-held/preview', (_req, res) => {
    try {
      const sessions = findPolicyHeldSessions();
      return res.json({ count: sessions.length, sessions });
    } catch (e) {
      console.error('[GET /judgment/resume-policy-held/preview]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/judgment/resume-policy-held → policy 保留セッションの diff を一括生成 (背景)
  router.post('/resume-policy-held', (_req, res) => {
    try {
      const busy = isGenerationBusy();
      if (busy) return res.status(409).json({ error: busy });
      if (activeResumePolicyJobId) {
        const j = resumePolicyJobs.get(activeResumePolicyJobId);
        if (j && j.status === 'running') return res.status(409).json({ error: 'resume が既に実行中です' });
      }
      const sessions = findPolicyHeldSessions();
      if (sessions.length === 0) return res.json({ started: false, total: 0, message: 'policy 保留セッションがありません' });
      const job_id = `resume-${Date.now()}`;
      const job = {
        job_id, status: 'running', total: sessions.length, current_index: 0,
        items: sessions.map((s) => ({
          session_id: s.id, post_id: s.post_id, genre: s.genre,
          status: 'queued', diff_count: null, violations: null, reason: null, error: null,
        })),
        started_at: new Date().toISOString(), completed_at: null,
      };
      resumePolicyJobs.set(job_id, job);
      activeResumePolicyJobId = job_id;
      (async () => {
        try { await runResumePolicyHeld(job); job.status = 'completed'; }
        catch (e) { job.status = 'failed'; job.error = e.message || String(e); console.error(`[resume-policy ${job_id}]`, e); }
        finally { job.completed_at = new Date().toISOString(); }
      })();
      return res.status(202).json(job);
    } catch (e) {
      console.error('[POST /judgment/resume-policy-held]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rewrite/judgment/resume-policy-held → 最新 resume ジョブ進捗
  router.get('/resume-policy-held', (_req, res) => {
    if (!activeResumePolicyJobId) return res.status(404).json({ error: 'no resume job' });
    const job = resumePolicyJobs.get(activeResumePolicyJobId);
    if (!job) return res.status(404).json({ error: 'no resume job' });
    return res.json(job);
  });

  // POST /api/rewrite/judgment/regenerate-eyecatch  body:{ post_id, genre? }
  //   既存記事の現タイトル+本文から 16:9 アイキャッチを再生成し featured_media を差替える。
  //   旧プロンプトで生成した低品質アイキャッチの貼り直し / 手動再生成に使う。
  router.post('/regenerate-eyecatch', async (req, res) => {
    try {
      const postId = Number(req.body && req.body.post_id);
      if (!Number.isInteger(postId) || postId <= 0) return res.status(400).json({ error: 'post_id (positive integer) required' });
      let genre = typeof (req.body && req.body.genre) === 'string' ? req.body.genre : null;
      if (!genre) {
        const s = open().prepare(
          `SELECT genre FROM master_rewrite_session WHERE post_id=? AND genre IS NOT NULL ORDER BY id DESC LIMIT 1`
        ).get(postId);
        genre = (s && s.genre) || 'cardloan';
      }
      const wp = await fetchWpPost(postId);
      const r = await applyEyecatchForTitle(postId, { title: wp.title_raw, contentRaw: wp.content_raw, genre });
      return res.json({ post_id: postId, genre, ...r });
    } catch (e) {
      console.error('[POST /judgment/regenerate-eyecatch]', e);
      return res.status(500).json({ error: e.message });
    }
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
