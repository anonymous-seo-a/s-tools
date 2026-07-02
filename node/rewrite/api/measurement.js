'use strict';

// 効果測定 API — リライト適用 (wp_apply_completed_at) を境界に、
// monitor.db の daily_metrics.rank (daily cron が毎朝収集済) を前後比較する。
// 新規収集・新規保存なし: 読み取り時に rewrite.db × monitor.db を join して計算。

const express = require('express');
const fs = require('fs');
const { open } = require('../db');

const PRE_WINDOW_DAYS = 28; // 候補選定 (rewrite-candidates) と同じ観測窓

// 地合い変動シグナル (seo-signals リポジトリが所有する signals.db, Read-Only)。
// 無ければ graceful skip = この連携が無かった時と完全に同一動作。
// パスは自己探索（env → 本番VPS → ローカル開発）。env 注入に依存せず auto-deploy に強い。
const SIGNALS_DB_CANDIDATES = [
  process.env.SIGNALS_DB,
  '/opt/seo-signals/db/signals.db',                        // 本番 VPS
  '/Users/daikinozawa/Projects/seo-signals/db/signals.db', // ローカル開発
].filter(Boolean);
let _sigConn; // undefined=未試行 / null=不在 / Database=接続
function getSignalsDB() {
  if (_sigConn !== undefined) return _sigConn;
  _sigConn = null;
  try {
    const p = SIGNALS_DB_CANDIDATES.find((x) => fs.existsSync(x));
    if (!p) return _sigConn;
    const Database = require('better-sqlite3');
    _sigConn = new Database(p, { readonly: true, fileMustExist: true });
  } catch (e) {
    console.warn('[measurement] signals.db 接続不可、交絡補正をskip:', e.message);
    _sigConn = null;
  }
  return _sigConn;
}

// 効果測定の本体計算。route と learning の効果フィードバックで共有する。
// apply 済み session ごとに 適用前28日平均順位 / 適用後平均順位 / 日次系列 + 交絡信頼度を返す。
// GSC は約4日遅れで確定するため、適用直後は days_after=0 になりうる。
function computeMeasurements() {
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
        return { count: 0, latest_metric_date: null, items: [] };
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
      // 同ジャンル市場のベースライン平均順位（地合いβ補正用）。当該記事も母集団に含むが
      // ジャンル記事数が多く1記事の寄与は希薄。pre/post 各窓の水準差 = 地合い成分。
      const marketAggStmt = m.prepare(`
        SELECT AVG(mm.rank) AS avgRank, COUNT(mm.rank) AS days
        FROM daily_metrics mm
        JOIN articles a ON a.post_id = mm.post_id
        WHERE a.category = ? AND mm.date BETWEEN ? AND ? AND mm.rank IS NOT NULL
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

      // 交絡 (地合い変動) シグナルを scope別に一括ロード。無ければ null = graceful skip。
      let shiftByScope = null; // Map: scope -> Set(date)
      let gapDates = null;     // Set(date)（measurement_gap, scope=global）
      const sig = getSignalsDB();
      if (sig) {
        try {
          const srows = sig.prepare(
            "SELECT date, scope, type FROM daily_shift WHERE type IN ('market_shift','measurement_gap')"
          ).all();
          shiftByScope = new Map();
          gapDates = new Set();
          for (const r of srows) {
            if (r.type === 'measurement_gap') { gapDates.add(r.date); continue; }
            if (!shiftByScope.has(r.scope)) shiftByScope.set(r.scope, new Set());
            shiftByScope.get(r.scope).add(r.date);
          }
        } catch (e) {
          console.warn('[measurement] daily_shift 読込失敗、交絡補正をskip:', e.message);
          shiftByScope = null; gapDates = null;
        }
      }

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

        // 地合いβ補正: 記事のΔrank から 同ジャンル市場のΔrank を引いた「実質効果」。
        // rankは小さいほど上位 → Δ正=改善。実質Δ = 記事Δ − 市場Δ。
        const rankDelta = rankBefore != null && rankAfter != null
          ? Number((rankBefore - rankAfter).toFixed(1)) : null;
        const mktBefore = marketAggStmt.get(s.genre, preStart, preEnd).avgRank;
        const mktAfter = marketAggStmt.get(s.genre, postStart, latest || s.applied_date).avgRank;
        const marketDelta = mktBefore != null && mktAfter != null
          ? Number((mktBefore - mktAfter).toFixed(2)) : null;
        const marketAdjustedDelta = rankDelta != null && marketDelta != null
          ? Number((rankDelta - marketDelta).toFixed(1)) : null;

        // 交絡 (地合い変動) による効果測定の信頼度。canon: market_shift→confidence割引 / gap→除外。
        // 既存の数値フィールドは一切変えない純粋加算（rank_delta 自体は補正しない=v1射程）。
        let measurementConfidence = null;
        let confounding = null;
        if (shiftByScope) {
          const windowEnd = latest || s.applied_date;
          const inWindow = (d) => d >= postStart && d <= windowEnd;
          const globalSet = shiftByScope.get('global') || new Set();
          const genreSet = shiftByScope.get(s.genre) || new Set();
          const seen = new Set();
          const shiftDates = [];
          for (const set of [globalSet, genreSet]) {
            for (const d of set) if (inWindow(d) && !seen.has(d)) { seen.add(d); shiftDates.push(d); }
          }
          shiftDates.sort();
          const gapInWindow = gapDates ? [...gapDates].filter(inWindow).sort() : [];
          const daysAfter = after.days || 0;
          const ratio = daysAfter > 0 ? shiftDates.length / daysAfter : null;
          measurementConfidence = ratio == null ? null
            : ratio < 0.2 ? 'high' : ratio < 0.5 ? 'medium' : 'low';
          confounding = {
            post_shift_days: shiftDates.length,
            post_gap_days: gapInWindow.length,
            shift_dates: shiftDates,
            gap_dates: gapInWindow,
          };
        }
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
          rank_delta: rankDelta,
          // 地合いβ補正後の実質効果（市場Δを差し引いた記事固有分）
          market_delta: marketDelta,
          market_adjusted_delta: marketAdjustedDelta,
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
          // 地合い変動による効果測定の信頼度（signals.db 連携。null=signals不在）
          measurement_confidence: measurementConfidence,
          confounding,
        };
      });

      return {
        count: items.length,
        latest_metric_date: latest,
        latest_yahoo_date: latestYahoo,
        items,
      };
}

function buildRouter() {
  const router = express.Router();
  // GET /api/rewrite/measurement
  router.get('/', (_req, res) => {
    try {
      return res.json(computeMeasurements());
    } catch (e) {
      console.error('[GET /rewrite/measurement]', e);
      return res.status(500).json({ error: e.message });
    }
  });
  return router;
}

module.exports = { buildRouter, computeMeasurements };
