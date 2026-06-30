'use strict';

// アフィリクリック分析 API — 台帳(wp_soico_aff_clicks=真実の源)を WP の breakdown
// エンドポイント経由でライブ照会し、記事 × リンク × クリック数 × ユニークユーザを返す。
// daily cron / monitor.db を経由しないため常に最新（cron 遅延の影響を受けない）。

const express = require('express');
const config = require('../../config');
const { open } = require('../db');

// 指定記事のリライト適用日(JST)を rewrite.db から取得。時系列トレンドの施策マーカー用。
function applyMarkersForPost(postId) {
  try {
    const conn = open();
    const rows = conn.prepare(`
      SELECT date(wp_apply_completed_at, '+9 hours') AS d
      FROM master_rewrite_session
      WHERE post_id = ? AND wp_apply_completed_at IS NOT NULL
      ORDER BY wp_apply_completed_at
    `).all(postId);
    return rows.map((r) => r.d);
  } catch (e) {
    console.warn('[aff-clicks] apply markers skip:', e.message);
    return [];
  }
}

function wpRoot() {
  const b = process.env.WP_API_BASE_URL || config.site.url || '';
  return b.replace(/\/$/, '').replace(/\/wp-json.*$/, '');
}
function wpAuth() {
  const u = process.env.WP_API_USERNAME || config.wp.username;
  const p = process.env.WP_API_APP_PASSWORD || config.wp.appPassword;
  return Buffer.from(`${u}:${p}`).toString('base64');
}

// 最小 CSV パーサ（引用符・カンマ・改行対応）。ASP 成果CSV取込用。
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else { field += c; }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).filter((r) => r.some((c) => c !== '')).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
  return { headers, records };
}

function buildRouter() {
  const router = express.Router();

  // GET /api/rewrite/aff-clicks/breakdown?start=&end=&post_id=&advertiser=&limit=
  router.get('/breakdown', async (req, res) => {
    try {
      const qs = new URLSearchParams();
      for (const k of ['start', 'end', 'post_id', 'advertiser', 'limit']) {
        if (req.query[k]) qs.set(k, String(req.query[k]));
      }
      const url = `${wpRoot()}/wp-json/soico/v1/aff-clicks/breakdown?${qs.toString()}`;
      const r = await fetch(url, { headers: { Authorization: `Basic ${wpAuth()}` } });
      if (!r.ok) {
        const body = await r.text();
        return res.status(502).json({ error: `WP ${r.status}`, detail: body.slice(0, 300) });
      }
      const json = await r.json();
      // 単一記事に絞り込み中なら、その記事のリライト適用日を施策マーカーとして同梱。
      const postId = parseInt(req.query.post_id, 10);
      json.apply_markers = postId > 0 ? applyMarkersForPost(postId) : [];
      return res.json(json);
    } catch (e) {
      console.error('[GET /rewrite/aff-clicks/breakdown]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/aff-clicks/conversions/import
  //   body: { asp, csv, mapping:{subid,reward,status,order_id,occurred_at} }  または  { asp, rows:[...] }
  //   CSV を列マッピングで正規化し WP の成果台帳へ冪等 upsert。ASP 書式非依存。
  router.post('/conversions/import', async (req, res) => {
    try {
      const { asp, csv, mapping, rows } = req.body || {};
      if (!asp) return res.status(400).json({ error: 'asp は必須' });
      let norm = [];
      if (Array.isArray(rows)) {
        norm = rows;
      } else if (csv && mapping && mapping.subid) {
        const { records } = parseCsv(csv);
        norm = records.map((r) => ({
          subid: r[mapping.subid],
          reward: mapping.reward ? r[mapping.reward] : 0,
          status: mapping.status ? r[mapping.status] : '',
          order_id: mapping.order_id ? r[mapping.order_id] : '',
          occurred_at: mapping.occurred_at ? r[mapping.occurred_at] : '',
        })).filter((r) => r.subid);
      } else {
        return res.status(400).json({ error: 'csv+mapping(subid) または rows が必要' });
      }
      const r = await fetch(`${wpRoot()}/wp-json/soico/v1/conversions`, {
        method: 'POST',
        headers: { Authorization: `Basic ${wpAuth()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ asp, rows: norm }),
      });
      const body = await r.json();
      if (!r.ok) return res.status(502).json({ error: `WP ${r.status}`, detail: body });
      return res.json(body);
    } catch (e) {
      console.error('[POST /rewrite/aff-clicks/conversions/import]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { buildRouter };
