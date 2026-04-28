/**
 * SEO リライトシステム: マスター管理 API ルーター
 *
 * /api/masters/* 配下のエンドポイントを提供する。
 * server.js から `app.use('/api/masters', require('./masters-routes'))` として mount する。
 *
 * 全 POST/PUT/DELETE は master-db.js 側で audit_log を自動記録。
 * 変更ユーザーは固定値 'Daiki'（X-User ヘッダがあればそれを優先）。
 */
const express = require('express');
const masterDb = require('./master-db');

const router = express.Router();

function getChangedBy(req) {
  return req.get('X-User') || 'Daiki';
}

function handle(res, fn) {
  try {
    const result = fn();
    res.json(result);
  } catch (e) {
    const code = /missing required field|unknown table|invalid/i.test(e.message) ? 400 : 500;
    res.status(code).json({ error: e.message });
  }
}

function parseListQuery(q) {
  return {
    category:   q.category || undefined,
    product_id: q.product_id || undefined,
    rule_type:  q.rule_type || undefined,
    status:     q.status || undefined,
    limit:      q.limit ? Math.min(parseInt(q.limit, 10) || 200, 1000) : 200,
    offset:     q.offset ? parseInt(q.offset, 10) || 0 : 0,
  };
}

// ============================================================
// annotations
// ============================================================
router.get('/annotations', (req, res) => {
  handle(res, () => masterDb.listAnnotations(parseListQuery(req.query)));
});

router.get('/annotations/:id', (req, res) => {
  handle(res, () => {
    const row = masterDb.getAnnotation(parseInt(req.params.id, 10));
    if (!row) { res.status(404); throw new Error('not found'); }
    return row;
  });
});

router.post('/annotations', (req, res) => {
  handle(res, () => masterDb.createAnnotation(req.body, getChangedBy(req)));
});

router.put('/annotations/:id', (req, res) => {
  handle(res, () => {
    const row = masterDb.updateAnnotation(parseInt(req.params.id, 10), req.body, getChangedBy(req));
    if (!row) { res.status(404); throw new Error('not found'); }
    return row;
  });
});

router.delete('/annotations/:id', (req, res) => {
  handle(res, () => {
    const row = masterDb.deleteAnnotation(parseInt(req.params.id, 10), getChangedBy(req));
    if (!row) { res.status(404); throw new Error('not found'); }
    return row;
  });
});

// ============================================================
// rules
// ============================================================
router.get('/rules', (req, res) => {
  handle(res, () => masterDb.listRules(parseListQuery(req.query)));
});

router.get('/rules/:id', (req, res) => {
  handle(res, () => {
    const row = masterDb.getRule(parseInt(req.params.id, 10));
    if (!row) { res.status(404); throw new Error('not found'); }
    return row;
  });
});

router.post('/rules', (req, res) => {
  handle(res, () => masterDb.createRule(req.body, getChangedBy(req)));
});

router.put('/rules/:id', (req, res) => {
  handle(res, () => {
    const row = masterDb.updateRule(parseInt(req.params.id, 10), req.body, getChangedBy(req));
    if (!row) { res.status(404); throw new Error('not found'); }
    return row;
  });
});

router.delete('/rules/:id', (req, res) => {
  handle(res, () => {
    const row = masterDb.deleteRule(parseInt(req.params.id, 10), getChangedBy(req));
    if (!row) { res.status(404); throw new Error('not found'); }
    return row;
  });
});

// ============================================================
// checklist
// ============================================================
router.get('/checklist', (req, res) => {
  handle(res, () => masterDb.listChecklist(parseListQuery(req.query)));
});

router.put('/checklist/:id', (req, res) => {
  handle(res, () => {
    const row = masterDb.updateChecklistItem(parseInt(req.params.id, 10), req.body, getChangedBy(req));
    if (!row) { res.status(404); throw new Error('not found'); }
    return row;
  });
});

// ============================================================
// audit log
// ============================================================
router.get('/audit-log', (req, res) => {
  handle(res, () => masterDb.listAuditLog({
    table_name: req.query.table_name || undefined,
    record_id:  req.query.record_id ? parseInt(req.query.record_id, 10) : undefined,
    since:      req.query.since || undefined,
    until:      req.query.until || undefined,
    limit:      req.query.limit ? Math.min(parseInt(req.query.limit, 10) || 200, 1000) : 200,
    offset:     req.query.offset ? parseInt(req.query.offset, 10) || 0 : 0,
  }));
});

// ============================================================
// 完成度ダッシュボード
// ============================================================
router.get('/completeness-summary', (req, res) => {
  handle(res, () => masterDb.getCompletenessSummary());
});

// ============================================================
// CSV インポート/エクスポート
// ============================================================
const ALLOWED_TABLES = ['master_annotations', 'master_rules', 'master_completeness_checklist'];

function rowsToCsv(rows, columns) {
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = columns.join(',');
  const body = rows.map(r => columns.map(c => escape(r[c])).join(',')).join('\n');
  return '﻿' + header + '\n' + body + '\n';
}

router.get('/export', (req, res) => {
  try {
    const table = req.query.table;
    if (!ALLOWED_TABLES.includes(table)) {
      return res.status(400).json({ error: 'invalid table' });
    }
    const filter = {};
    if (req.query.category)   filter.category = req.query.category;
    if (req.query.product_id) filter.product_id = req.query.product_id;
    if (req.query.status)     filter.status = req.query.status;

    const rows = masterDb.exportRows(table, filter);
    const columns = ['id', ...masterDb.TABLE_COLUMNS[table], 'created_at', 'updated_at'];
    const csv = rowsToCsv(rows, columns);

    const filename = `${table}_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/import', (req, res) => {
  handle(res, () => {
    const { table, rows } = req.body;
    if (!ALLOWED_TABLES.includes(table)) throw new Error('invalid table');
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('rows must be a non-empty array');
    const inserted = masterDb.importRows(table, rows, getChangedBy(req));
    return { inserted_count: inserted.length, rows: inserted };
  });
});

module.exports = router;
