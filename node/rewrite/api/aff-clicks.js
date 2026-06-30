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

  return router;
}

module.exports = { buildRouter };
