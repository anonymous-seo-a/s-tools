'use strict';

const express = require('express');
const { open } = require('../db');

const AXIS_MAP = {
  '1': 'axis1_information_gain',
  '2': 'axis2_potential',
  '3': 'axis3_freshness',
  '4': 'axis4_decay',
};
const VALID_AXES = new Set(Object.values(AXIS_MAP));
const VALID_STATUSES = new Set(['queued', 'in_progress', 'completed', 'cancelled']);

function parseAxis(input) {
  if (!input) return null;
  if (AXIS_MAP[String(input)]) return AXIS_MAP[String(input)];
  if (VALID_AXES.has(String(input))) return String(input);
  return undefined; // 不正値
}

function fetchCandidates(axis, limit) {
  const conn = open();
  const latest = conn.prepare(
    `SELECT MAX(calculated_at) AS latest FROM master_rewrite_target_score WHERE axis = ?`
  ).get(axis);
  if (!latest || !latest.latest) {
    return { axis, calculated_at: null, items: [] };
  }
  const rows = conn.prepare(`
    SELECT id, post_id, axis, score_value, score_components, period_days, calculated_at, notes
    FROM master_rewrite_target_score
    WHERE axis = ? AND calculated_at = ?
    ORDER BY (score_value IS NULL), score_value DESC
    LIMIT ?
  `).all(axis, latest.latest, limit);
  return {
    axis,
    calculated_at: latest.latest,
    items: rows.map((r) => ({
      ...r,
      score_components: r.score_components ? JSON.parse(r.score_components) : null,
    })),
  };
}

function fetchQueue({ status, limit }) {
  const conn = open();
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE status = ?';
    params.push(status);
  }
  const sql = `
    SELECT id, post_id, selected_axis, selected_score, selected_at, selected_by, status,
           rewrite_target_score_id, notes
    FROM master_rewrite_queue
    ${where}
    ORDER BY selected_at DESC
    LIMIT ?
  `;
  params.push(limit);
  return conn.prepare(sql).all(...params);
}

function createQueueEntry({ post_id, selected_axis, selected_score, rewrite_target_score_id, notes }) {
  const conn = open();
  const result = conn.prepare(`
    INSERT INTO master_rewrite_queue
      (post_id, selected_axis, selected_score, selected_by, status, rewrite_target_score_id, notes)
    VALUES (?, ?, ?, 'daiki_manual', 'queued', ?, ?)
  `).run(
    post_id,
    selected_axis ?? null,
    selected_score ?? null,
    rewrite_target_score_id ?? null,
    notes ?? null
  );
  return conn.prepare(`SELECT * FROM master_rewrite_queue WHERE id = ?`).get(result.lastInsertRowid);
}

function updateQueueEntry(id, { status, notes }) {
  const conn = open();
  const existing = conn.prepare(`SELECT * FROM master_rewrite_queue WHERE id = ?`).get(id);
  if (!existing) return null;

  const sets = [];
  const params = [];
  if (status !== undefined) { sets.push('status = ?'); params.push(status); }
  if (notes !== undefined)  { sets.push('notes = ?');  params.push(notes); }
  if (sets.length === 0) return existing;
  params.push(id);
  conn.prepare(`UPDATE master_rewrite_queue SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return conn.prepare(`SELECT * FROM master_rewrite_queue WHERE id = ?`).get(id);
}

function buildRouter() {
  const router = express.Router();

  // GET /api/rewrite/queue
  //   ?axis=1|2|3|4|axis1_information_gain|... &limit=N → 候補 (target_score Top N)
  //   ?status=queued|in_progress|completed|cancelled    → 登録済キュー
  //   (params なし)                                      → 全登録済キュー
  router.get('/queue', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);

      if (req.query.axis !== undefined) {
        const axis = parseAxis(req.query.axis);
        if (axis === undefined) {
          return res.status(400).json({ error: 'invalid axis', allowed: Object.keys(AXIS_MAP) });
        }
        return res.json({ mode: 'candidates', limit, ...fetchCandidates(axis, limit) });
      }

      const status = req.query.status;
      if (status !== undefined && !VALID_STATUSES.has(status)) {
        return res.status(400).json({ error: 'invalid status', allowed: [...VALID_STATUSES] });
      }
      const items = fetchQueue({ status, limit });
      return res.json({ mode: 'registered', limit, status: status || null, count: items.length, items });
    } catch (e) {
      console.error('[GET /queue]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/queue
  //   { post_id, selected_axis?, selected_score?, rewrite_target_score_id?, notes? }
  router.post('/queue', (req, res) => {
    try {
      const body = req.body || {};
      const post_id = Number(body.post_id);
      if (!Number.isInteger(post_id) || post_id <= 0) {
        return res.status(400).json({ error: 'post_id (positive integer) required' });
      }
      let selected_axis = body.selected_axis;
      if (selected_axis !== undefined && selected_axis !== null) {
        selected_axis = parseAxis(selected_axis);
        if (selected_axis === undefined) {
          return res.status(400).json({ error: 'invalid selected_axis', allowed: Object.keys(AXIS_MAP) });
        }
      }
      const entry = createQueueEntry({
        post_id,
        selected_axis,
        selected_score: body.selected_score,
        rewrite_target_score_id: body.rewrite_target_score_id,
        notes: body.notes,
      });
      return res.status(201).json(entry);
    } catch (e) {
      console.error('[POST /queue]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/rewrite/queue/:id
  //   { status?, notes? }
  router.patch('/queue/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'invalid id' });
      }
      const body = req.body || {};
      if (body.status !== undefined && !VALID_STATUSES.has(body.status)) {
        return res.status(400).json({ error: 'invalid status', allowed: [...VALID_STATUSES] });
      }
      const updated = updateQueueEntry(id, { status: body.status, notes: body.notes });
      if (!updated) return res.status(404).json({ error: 'queue entry not found', id });
      return res.json(updated);
    } catch (e) {
      console.error('[PATCH /queue/:id]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = {
  AXIS_MAP,
  VALID_AXES,
  VALID_STATUSES,
  buildRouter,
  // テスト用に内部関数も export
  parseAxis,
  fetchCandidates,
  fetchQueue,
  createQueueEntry,
  updateQueueEntry,
};
