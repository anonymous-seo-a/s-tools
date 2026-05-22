'use strict';

const express = require('express');
const { open } = require('../db');
const { runComplianceCheck } = require('../llm-execution/compliance-runner');
const { runAnalysis } = require('../llm-execution/analysis-runner');
const { runDiffGeneration } = require('../llm-execution/diff-runner');

// in-memory job ストア (server プロセス再起動で消失、明示再実行で再投入)
//   key: session_id (number) → compliance job
//   key: job_id (string)     → generation job
const complianceJobs = new Map();
const generationJobs = new Map(); // job_id → { ... }
let activeGenerationJobId = null;

// β-1A: smoke-e2e.js の一気通貫フローを単独関数化。
// embedding-poc が未完成領域なので mock gap データを INSERT する (現状の Phase 2 と同質)。
async function runGenerationPipeline(job, conn) {
  const { post_id, query_fanout_id, enableCompliance } = job.options;

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
  const analysisRes = await runAnalysis({ session_id, post_id, query_fanout_id });
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
  const diffRes = await runDiffGeneration({ session_id });
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
      s.cost_total_usd,
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
  return conn.prepare(sql).all(...params);
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
  return { ...session, diffs };
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

      const job_id = `gen-${Date.now()}`;
      const job = {
        job_id,
        status: 'running',
        step: 'init',
        options: { post_id, query_fanout_id, enableCompliance },
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
