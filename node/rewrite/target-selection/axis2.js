'use strict';

const fs = require('fs');
const { open, attachMonitorReadOnly, detachMonitor, MONITOR_DB_PATH } = require('../db');

const DEFAULT_PERIOD_DAYS = 28;

function positionGapFactor(rank) {
  if (rank == null) return 0;
  if (rank <= 3) return 0.1;
  if (rank <= 10) return 1.0;
  if (rank <= 20) return 0.7;
  if (rank <= 50) return 0.3;
  return 0.05;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function calculateAxis2({ asOf = new Date(), periodDays = DEFAULT_PERIOD_DAYS } = {}) {
  if (!fs.existsSync(MONITOR_DB_PATH)) {
    throw new Error(`monitor.db not found at ${MONITOR_DB_PATH}; cannot compute axis2`);
  }
  const conn = open();
  attachMonitorReadOnly(conn);

  const end = new Date(asOf);
  const start = new Date(end);
  start.setDate(start.getDate() - (periodDays - 1));

  const rows = conn.prepare(`
    SELECT post_id, date, rank, impressions
    FROM monitor.daily_metrics
    WHERE date >= ? AND date <= ?
      AND impressions IS NOT NULL
      AND rank IS NOT NULL
  `).all(isoDate(start), isoDate(end));

  const agg = new Map();
  for (const r of rows) {
    const f = positionGapFactor(r.rank);
    const contrib = r.impressions * f;
    let bucket = agg.get(r.post_id);
    if (!bucket) {
      bucket = {
        post_id: r.post_id,
        score_value: 0,
        sum_impressions: 0,
        weighted_position_sum: 0,
        impression_weighted_position_sum: 0,
        days_with_data: 0,
      };
      agg.set(r.post_id, bucket);
    }
    bucket.score_value += contrib;
    bucket.sum_impressions += r.impressions;
    bucket.weighted_position_sum += r.rank;
    bucket.impression_weighted_position_sum += r.rank * r.impressions;
    bucket.days_with_data += 1;
  }

  const results = Array.from(agg.values()).map((b) => ({
    post_id: b.post_id,
    axis: 'axis2_potential',
    score_value: b.score_value,
    period_days: periodDays,
    components: {
      sum_impressions: b.sum_impressions,
      avg_position: b.days_with_data ? b.weighted_position_sum / b.days_with_data : null,
      impression_weighted_avg_position:
        b.sum_impressions ? b.impression_weighted_position_sum / b.sum_impressions : null,
      days_with_data: b.days_with_data,
      window_start: isoDate(start),
      window_end: isoDate(end),
    },
  }));

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
  DEFAULT_PERIOD_DAYS,
  positionGapFactor,
  calculateAxis2,
  persistScores,
};
