'use strict';

const fs = require('fs');
const { open, attachMonitorReadOnly, detachMonitor, MONITOR_DB_PATH } = require('../db');

const DEFAULT_WINDOW_DAYS = 28;

// Phase 1 重み (案B 4-1-β、knowledge/05 第IX章「具体重み付けは Phase 1 実装時確定」)
//   click_drop_pct と impr_drop_pct は 0.0〜1.0 程度の比率
//   position_drop は 順位下落量 (例: 5 → 15 で +10)、/10 で同スケールに揃える
const DEFAULT_WEIGHTS = { click: 1.0, impressions: 1.0, position: 0.1 };

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function safeRatio(recent, prev) {
  if (prev == null || prev === 0) return null;
  return (recent - prev) / prev;
}

function aggregateWindow(conn, startIso, endIso) {
  return conn.prepare(`
    SELECT
      post_id,
      SUM(COALESCE(gsc_click, 0))   AS clicks,
      SUM(COALESCE(impressions, 0)) AS impressions,
      AVG(rank)                     AS avg_position,
      COUNT(*)                      AS days_with_data
    FROM monitor.daily_metrics
    WHERE date >= ? AND date <= ?
      AND rank IS NOT NULL
    GROUP BY post_id
  `).all(startIso, endIso);
}

function calculateAxis4({
  asOf = new Date(),
  windowDays = DEFAULT_WINDOW_DAYS,
  weights = DEFAULT_WEIGHTS,
} = {}) {
  if (!fs.existsSync(MONITOR_DB_PATH)) {
    throw new Error(`monitor.db not found at ${MONITOR_DB_PATH}; cannot compute axis4`);
  }
  const conn = open();
  attachMonitorReadOnly(conn);

  const recentEnd = new Date(asOf);
  const recentStart = new Date(recentEnd);
  recentStart.setDate(recentStart.getDate() - (windowDays - 1));
  const prevEnd = new Date(recentStart);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (windowDays - 1));

  const recentRows = aggregateWindow(conn, isoDate(recentStart), isoDate(recentEnd));
  const prevRows = aggregateWindow(conn, isoDate(prevStart), isoDate(prevEnd));
  const recentMap = new Map(recentRows.map((r) => [r.post_id, r]));
  const prevMap = new Map(prevRows.map((r) => [r.post_id, r]));

  const postIds = new Set([...recentMap.keys(), ...prevMap.keys()]);
  const results = [];
  for (const post_id of postIds) {
    const recent = recentMap.get(post_id) || { clicks: 0, impressions: 0, avg_position: null, days_with_data: 0 };
    const prev = prevMap.get(post_id) || { clicks: 0, impressions: 0, avg_position: null, days_with_data: 0 };

    const click_delta_pct = safeRatio(recent.clicks, prev.clicks);
    const impr_delta_pct = safeRatio(recent.impressions, prev.impressions);
    const position_delta =
      recent.avg_position != null && prev.avg_position != null
        ? recent.avg_position - prev.avg_position
        : null;

    const click_decay = click_delta_pct != null ? Math.max(0, -click_delta_pct) : 0;
    const impr_decay = impr_delta_pct != null ? Math.max(0, -impr_delta_pct) : 0;
    const position_decay = position_delta != null ? Math.max(0, position_delta) : 0;

    const score_value =
      click_decay * weights.click +
      impr_decay * weights.impressions +
      position_decay * weights.position;

    results.push({
      post_id,
      axis: 'axis4_decay',
      score_value,
      period_days: windowDays * 2,
      components: {
        recent: {
          window_start: isoDate(recentStart),
          window_end: isoDate(recentEnd),
          clicks: recent.clicks,
          impressions: recent.impressions,
          avg_position: recent.avg_position,
          days_with_data: recent.days_with_data,
        },
        prev: {
          window_start: isoDate(prevStart),
          window_end: isoDate(prevEnd),
          clicks: prev.clicks,
          impressions: prev.impressions,
          avg_position: prev.avg_position,
          days_with_data: prev.days_with_data,
        },
        deltas: {
          click_delta_pct,
          impr_delta_pct,
          position_delta,
        },
        decays: {
          click_decay,
          impr_decay,
          position_decay,
        },
        weights,
      },
    });
  }

  results.sort((a, b) => b.score_value - a.score_value);
  detachMonitor(conn);
  return results;
}

function persistScores(results, { calculatedAt = new Date() } = {}) {
  const conn = open();
  const insert = conn.prepare(`
    INSERT INTO master_rewrite_target_score
      (post_id, axis, score_value, score_components, calculated_at, period_days, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const calcIso = calculatedAt.toISOString();
  const tx = conn.transaction((rows) => {
    for (const r of rows) {
      insert.run(
        r.post_id,
        r.axis,
        r.score_value,
        JSON.stringify(r.components),
        calcIso,
        r.period_days,
        null
      );
    }
  });
  tx(results);
  return { inserted: results.length, calculated_at: calcIso };
}

module.exports = {
  DEFAULT_WINDOW_DAYS,
  DEFAULT_WEIGHTS,
  safeRatio,
  calculateAxis4,
  persistScores,
};
