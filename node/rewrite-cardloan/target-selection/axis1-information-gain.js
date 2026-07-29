'use strict';

// 軸1: 構造的不足 (IG Score + 検索意図3層カバレッジ)
// 本実装は Phase 2 の Step A-1 / Step A-2 整備後に行う。
// Phase 1 では各 post_id に対して NULL スコアの placeholder 行を生成し、
// 4軸の I/F (insert / API レスポンス) を統一する。

const fs = require('fs');
const { open, attachMonitorReadOnly, detachMonitor, MONITOR_DB_PATH } = require('../db');

const PHASE1_PLACEHOLDER_COMPONENTS = {
  status: 'pending_phase2',
  reason: 'IG Score requires Step A-1 (Information Gain) / A-2 (Query Fan-out) implementation',
};

function calculate(post_id) {
  return {
    post_id,
    axis: 'axis1_information_gain',
    score_value: null,
    period_days: null,
    components: { ...PHASE1_PLACEHOLDER_COMPONENTS },
  };
}

function calculateAxis1({ asOf = new Date() } = {}) {
  if (!fs.existsSync(MONITOR_DB_PATH)) {
    throw new Error(`monitor.db not found at ${MONITOR_DB_PATH}; cannot enumerate posts for axis1 placeholder`);
  }
  const conn = open();
  attachMonitorReadOnly(conn);
  const rows = conn.prepare(`SELECT post_id FROM monitor.articles ORDER BY post_id`).all();
  detachMonitor(conn);
  void asOf;
  return rows.map((r) => calculate(r.post_id));
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
  PHASE1_PLACEHOLDER_COMPONENTS,
  calculate,
  calculateAxis1,
  persistScores,
};
