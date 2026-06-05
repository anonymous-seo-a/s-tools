'use strict';

const express = require('express');
const { open } = require('../db');
const { runComplianceCheck } = require('../llm-execution/compliance-runner');
const { runAnalysis } = require('../llm-execution/analysis-runner');
const { runDiffGeneration } = require('../llm-execution/diff-runner');
const { sessionCostUsd } = require('../llm-execution/cost');
const { planGutenbergApply, applyGutenbergOps } = require('../apply/gutenberg-apply');

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
  const info = conn.prepare(
    `INSERT INTO master_rewrite_session
       (post_id, model_analysis, model_generation, triggered_by, status)
     VALUES (?, 'claude-opus-4-7', 'claude-sonnet-4-6', 'ui-generation', 'planned')`
  ).run(post_id);
  const session_id = info.lastInsertRowid;
  job.session_id = session_id;

  // 2. mock gap データ (smoke-e2e と同パターン、本物 passage_gap は段階C-B 領域)
  const fanout = conn.prepare('SELECT sub_query FROM master_query_fanout WHERE id=?').get(query_fanout_id);
  if (!fanout) throw new Error(`query_fanout_id=${query_fanout_id} not found`);

  const insertGap = conn.prepare(
    `INSERT INTO master_passage_gap
       (session_id, post_id, query_fanout_id, target_text, target_kind, fact_layer,
        self_max_cosine, competitor_max_cosine, delta, gap_flag, judge_type, model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertGap.run(session_id, post_id, query_fanout_id, fanout.sub_query, 'query', null, 0.55, 0.65, 0.05, 1, 'embedding', 'voyage-3-large');
  insertGap.run(session_id, post_id, query_fanout_id, fanout.sub_query, 'query', null, null, null, null, 1, 'factset', null);
  for (const f of [
    { text: 'アコム', layer: 1, self: 0.45, comp: 0.58 },
    { text: 'プロミス', layer: 1, self: 0.40, comp: 0.55 },
  ]) {
    insertGap.run(session_id, post_id, query_fanout_id, f.text, 'fact', f.layer, f.self, f.comp, -0.05, 1, 'embedding', 'voyage-3-large');
    insertGap.run(session_id, post_id, query_fanout_id, f.text, 'fact', f.layer, null, null, null, 0, 'factset', null);
  }

  // 3. runAnalysis (Opus 4.7)
  job.step = 'analyzing';
  const analysisRes = await runAnalysis({ session_id, post_id, query_fanout_id, genre });
  job.analysis = {
    usage: analysisRes.usage,
    status: analysisRes.status,
    high_risk_categories: analysisRes.high_risk_categories,
  };

  // 4. policy_judgment 自動 approved (UI 生成は smoke と同じく強制承認)
  if (analysisRes.status === 'awaiting_policy_judgment') {
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

// 本文 diff (insert/rewrite) と別に meta diff (title/description) を仕分ける。
function planMetaDiffs(diffs) {
  const meta_planned = [];
  const meta_skipped = [];
  let newTitle = null;
  for (const d of diffs) {
    if (d.daiki_judgment !== 'approved') continue;
    if (d.change_type === 'update_title') {
      const t = extractTitleText(d.daiki_edit_content || d.content_after || '');
      if (t) { newTitle = t; meta_planned.push({ diff_id: d.id, op: 'update_title', value: t }); }
      else meta_skipped.push({ diff_id: d.id, reason: 'title 抽出不可' });
    } else if (d.change_type === 'update_meta_description') {
      // Yoast 管理の meta description は標準 REST で書けないため当面手動。
      meta_skipped.push({ diff_id: d.id, reason: 'meta description は Yoast 管理 (REST 自動更新 未対応) → 手動' });
    }
  }
  return { meta_planned, meta_skipped, newTitle };
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

function fetchSessions({ status, limit }) {
  const conn = open();
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE s.status = ?';
    params.push(status);
  }
  const sql = `
    SELECT
      s.id,
      s.post_id,
      s.status,
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
      id, post_id, status, model_analysis, model_generation,
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
  // cost_total_usd は token から算出して上書き (保存列は常に null のため)。
  return { ...session, cost_total_usd: sessionCostUsd(session), diffs };
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

  // GET /api/rewrite/judgment/sessions?status=awaiting_diff_judgment&limit=N
  router.get('/sessions', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
      let status = req.query.status;
      if (status === '' || status === 'all') status = undefined;
      if (status !== undefined && !VALID_SESSION_STATUSES.has(status)) {
        return res.status(400).json({ error: 'invalid status', allowed: [...VALID_SESSION_STATUSES] });
      }
      const items = fetchSessions({ status, limit });
      return res.json({
        limit,
        status: status || null,
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

  // POST /api/rewrite/judgment/sessions
  //   body: { post_id, query_fanout_id, enableCompliance: true }
  //   非同期: smoke-e2e.js の一気通貫フローを実行 (analysis → diff → compliance)
  //   同時実行 1 件まで (排他)
  router.post('/sessions', (req, res) => {
    try {
      if (activeGenerationJobId) {
        const cur = generationJobs.get(activeGenerationJobId);
        if (cur && cur.status === 'running') {
          return res.status(409).json({ error: 'another generation in progress', job: cur });
        }
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
      const conn = open();
      const session = conn.prepare(`SELECT id, post_id, status, wp_apply_completed_at FROM master_rewrite_session WHERE id=?`).get(id);
      if (!session) return res.status(404).json({ error: 'session not found', id });
      if (!dryRun && session.wp_apply_completed_at) {
        return res.status(409).json({ error: 'already applied', wp_apply_completed_at: session.wp_apply_completed_at });
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
        return res.json({
          dry_run: dryRun, post_id: session.post_id, applied: false,
          planned, skipped, reason: 'no diffs to apply',
        });
      }

      if (dryRun) {
        return res.json({ dry_run: true, post_id: session.post_id, applied: false, planned, skipped });
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

      conn.prepare(
        `UPDATE master_rewrite_session
         SET wp_apply_completed_at=CURRENT_TIMESTAMP, status='completed', completed_at=CURRENT_TIMESTAMP
         WHERE id=?`
      ).run(id);

      const appliedIds = [...plan.planned.map((p) => p.diff_id), ...meta.meta_planned.map((m) => m.diff_id)];
      const applyMark = conn.prepare(`UPDATE master_rewrite_diff SET applied_to_wp=1, applied_at=CURRENT_TIMESTAMP WHERE id=?`);
      for (const did of appliedIds) applyMark.run(did);

      return res.json({
        dry_run: false, post_id: session.post_id, applied: true,
        planned, skipped, applied_count: appliedIds.length,
        conflicts: applied.conflicts,
      });
    } catch (e) {
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
