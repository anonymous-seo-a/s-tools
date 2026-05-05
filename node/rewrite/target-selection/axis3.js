'use strict';

const fs = require('fs');
const { open, attachMonitorReadOnly, detachMonitor, MONITOR_DB_PATH } = require('../db');

const DAYS_PER_MONTH = 30.4375; // 平均月長 (365.25 / 12)

function monthsBetween(from, to) {
  const ms = to.getTime() - from.getTime();
  return ms / (DAYS_PER_MONTH * 24 * 3600 * 1000);
}

function calculateAxis3({ asOf = new Date() } = {}) {
  if (!fs.existsSync(MONITOR_DB_PATH)) {
    throw new Error(`monitor.db not found at ${MONITOR_DB_PATH}; cannot compute axis3`);
  }
  const conn = open();
  attachMonitorReadOnly(conn);

  const rows = conn.prepare(`
    SELECT post_id, wp_modified
    FROM monitor.articles
    WHERE wp_modified IS NOT NULL
  `).all();

  const results = [];
  for (const r of rows) {
    const modified = new Date(r.wp_modified);
    if (Number.isNaN(modified.getTime())) continue;
    const months = monthsBetween(modified, asOf);
    results.push({
      post_id: r.post_id,
      axis: 'axis3_freshness',
      score_value: months,
      period_days: null,
      components: {
        wp_modified: r.wp_modified,
        as_of: asOf.toISOString(),
        months_elapsed: months,
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
  monthsBetween,
  calculateAxis3,
  persistScores,
};
