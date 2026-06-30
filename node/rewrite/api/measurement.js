'use strict';

// 効果測定 API — リライト適用 (wp_apply_completed_at) を境界に、
// monitor.db の daily_metrics.rank (daily cron が毎朝収集済) を前後比較する。
// 新規収集・新規保存なし: 読み取り時に rewrite.db × monitor.db を join して計算。

const express = require('express');
const { open } = require('../db');

const PRE_WINDOW_DAYS = 28; // 候補選定 (rewrite-candidates) と同じ観測窓

function buildRouter() {
  const router = express.Router();

  // GET /api/rewrite/measurement
  //   apply 済み session ごとに 適用前28日平均順位 / 適用後平均順位 / 日次系列を返す。
  //   GSC は約4日遅れで確定するため、適用直後は days_after=0 になりうる。
  router.get('/', (_req, res) => {
    try {
      const conn = open();
      const sessions = conn.prepare(`
        SELECT s.id AS session_id, s.post_id, s.genre,
               s.wp_apply_completed_at,
               date(s.wp_apply_completed_at, '+9 hours') AS applied_date,
               (SELECT COUNT(*) FROM master_rewrite_diff d
                 WHERE d.session_id = s.id AND d.applied_to_wp = 1) AS applied_diff_count
        FROM master_rewrite_session s
        WHERE s.wp_apply_completed_at IS NOT NULL
        ORDER BY s.wp_apply_completed_at DESC
      `).all();

      if (sessions.length === 0) {
        return res.json({ count: 0, latest_metric_date: null, items: [] });
      }

      const mdb = require('../../monitor-db');
      const m = mdb.getDB();
      const latest = m.prepare('SELECT MAX(date) AS d FROM daily_metrics').get().d;
      const latestYahoo = m.prepare(
        "SELECT MAX(date) AS d FROM daily_scraped_rank WHERE engine = 'yahoo'"
      ).get().d;
      const artStmt = m.prepare('SELECT url, title FROM articles WHERE post_id = ?');
      const aggStmt = m.prepare(`
        SELECT AVG(rank) AS avgRank, SUM(impressions) AS sumImpr,
               SUM(gsc_click) AS sumClick, COUNT(rank) AS days
        FROM daily_metrics
        WHERE post_id = ? AND date BETWEEN ? AND ? AND rank IS NOT NULL
      `);
      const seriesStmt = m.prepare(`
        SELECT date, rank FROM daily_metrics
        WHERE post_id = ? AND date >= ? AND rank IS NOT NULL
        ORDER BY date
      `);
      // Yahoo スクレイプ (当日値): GSC の約4日遅れを補う速報系列
      const yahooAggStmt = m.prepare(`
        SELECT AVG(rank) AS avgRank, COUNT(rank) AS days
        FROM daily_scraped_rank
        WHERE post_id = ? AND engine = 'yahoo' AND date BETWEEN ? AND ? AND rank IS NOT NULL
      `);
      const yahooSeriesStmt = m.prepare(`
        SELECT date, rank FROM daily_scraped_rank
        WHERE post_id = ? AND engine = 'yahoo' AND date >= ? AND rank IS NOT NULL
        ORDER BY date
      `);
      // afクリック(収益アクション=台帳直結)。疎なので AVG でなく SUM、窓長差は per-day で吸収。
      // aff/impr で「流入増」と「流入の転換効率」を分離する。
      const affAggStmt = m.prepare(`
        SELECT SUM(aff_click) AS sumAff, SUM(impressions) AS sumImpr,
               COUNT(CASE WHEN aff_click IS NOT NULL THEN 1 END) AS days
        FROM daily_metrics
        WHERE post_id = ? AND date BETWEEN ? AND ?
      `);
      const affSeriesStmt = m.prepare(`
        SELECT date, aff_click FROM daily_metrics
        WHERE post_id = ? AND date >= ? AND aff_click IS NOT NULL
        ORDER BY date
      `);
      const dateAdd = m.prepare('SELECT date(?, ?) AS d');

      const items = sessions.map((s) => {
        const art = artStmt.get(s.post_id) || {};
        const preStart = dateAdd.get(s.applied_date, `-${PRE_WINDOW_DAYS} day`).d;
        const preEnd = dateAdd.get(s.applied_date, '-1 day').d;
        // 適用当日は新旧混在のため除外、翌日から計測。
        const postStart = dateAdd.get(s.applied_date, '+1 day').d;
        const before = aggStmt.get(s.post_id, preStart, preEnd);
        const after = aggStmt.get(s.post_id, postStart, latest || s.applied_date);
        const rankBefore = before.avgRank != null ? Number(before.avgRank.toFixed(1)) : null;
        const rankAfter = after.avgRank != null ? Number(after.avgRank.toFixed(1)) : null;
        const yBefore = yahooAggStmt.get(s.post_id, preStart, preEnd);
        const yAfter = yahooAggStmt.get(s.post_id, postStart, latestYahoo || s.applied_date);
        const yahooBefore = yBefore.avgRank != null ? Number(yBefore.avgRank.toFixed(1)) : null;
        const yahooAfter = yAfter.avgRank != null ? Number(yAfter.avgRank.toFixed(1)) : null;
        // afクリック before/after（収益アクション）。rank と逆で「多いほど良い」。
        const affBefore = affAggStmt.get(s.post_id, preStart, preEnd);
        const affAfter = affAggStmt.get(s.post_id, postStart, latest || s.applied_date);
        const perDay = (sum, days) => (days > 0 ? Number((sum / days).toFixed(3)) : null);
        const ctr = (aff, impr) => (impr > 0 ? Number(((aff / impr) * 100).toFixed(3)) : null);
        const affSumBefore = affBefore.sumAff || 0;
        const affSumAfter = affAfter.sumAff || 0;
        const affPerDayBefore = perDay(affSumBefore, affBefore.days);
        const affPerDayAfter = perDay(affSumAfter, affAfter.days);
        const affCtrBefore = ctr(affSumBefore, affBefore.sumImpr || 0);
        const affCtrAfter = ctr(affSumAfter, affAfter.sumImpr || 0);
        return {
          session_id: s.session_id,
          post_id: s.post_id,
          genre: s.genre,
          url: art.url || null,
          title: art.title || '',
          applied_date: s.applied_date,
          applied_diff_count: s.applied_diff_count,
          rank_before: rankBefore,
          rank_after: rankAfter,
          // rank は小さいほど上位 → delta 正 = 改善
          rank_delta: rankBefore != null && rankAfter != null
            ? Number((rankBefore - rankAfter).toFixed(1)) : null,
          days_before: before.days,
          days_after: after.days,
          impressions_after: after.sumImpr || 0,
          clicks_after: after.sumClick || 0,
          yahoo_before: yahooBefore,
          yahoo_after: yahooAfter,
          yahoo_delta: yahooBefore != null && yahooAfter != null
            ? Number((yahooBefore - yahooAfter).toFixed(1)) : null,
          yahoo_days_after: yAfter.days,
          // afクリック（台帳直結＝真実の源）。多いほど良い → delta 正 = 改善。
          aff_before: affSumBefore,
          aff_after: affSumAfter,
          aff_per_day_before: affPerDayBefore,
          aff_per_day_after: affPerDayAfter,
          aff_per_day_delta: affPerDayBefore != null && affPerDayAfter != null
            ? Number((affPerDayAfter - affPerDayBefore).toFixed(3)) : null,
          aff_ctr_before: affCtrBefore,
          aff_ctr_after: affCtrAfter,
          aff_days_before: affBefore.days,
          aff_days_after: affAfter.days,
          series: seriesStmt.all(s.post_id, preStart),
          yahoo_series: yahooSeriesStmt.all(s.post_id, preStart),
          aff_series: affSeriesStmt.all(s.post_id, preStart),
        };
      });

      return res.json({
        count: items.length,
        latest_metric_date: latest,
        latest_yahoo_date: latestYahoo,
        items,
      });
    } catch (e) {
      console.error('[GET /rewrite/measurement]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { buildRouter };
