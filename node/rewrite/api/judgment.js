'use strict';

const express = require('express');
const { open } = require('../db');
const { runComplianceCheck } = require('../llm-execution/compliance-runner');

// in-memory job ストア (server プロセス再起動で消失、明示再実行で再投入)
//   key: session_id (number)
//   value: { status: 'running'|'completed'|'failed', started_at, completed_at, result?, error?, options }
const complianceJobs = new Map();

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
