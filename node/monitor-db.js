/**
 * 順位モニタリング: SQLite データ層
 *
 * Phase 1 scope:
 *   - articles (記事メタ)
 *   - daily_metrics (日次の URL 単位メトリクス)
 *   - daily_affiliate_clicks (商材別アフィリクリック, 収集は後段で)
 *   - weekly_kw_snapshot (Top 30 KW 分布, 収集は後段で)
 *   - analysis_comments (Claude 分析コメント, Phase 3 で使用)
 *   - collection_jobs (バッチ実行履歴)
 *   - backfill_progress (段階バックフィルのカーソル)
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.MONITOR_DB_PATH || path.join(__dirname, 'data', 'monitor.db');

let db = null;

function getDB() {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function initSchema(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      post_id     INTEGER PRIMARY KEY,
      url         TEXT UNIQUE NOT NULL,
      title       TEXT,
      category    TEXT,
      wp_modified TEXT,
      top_kw      TEXT,
      first_seen  TEXT,
      last_seen   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
    CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);

    CREATE TABLE IF NOT EXISTS daily_metrics (
      post_id     INTEGER NOT NULL,
      date        TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'gsc_ga4',
      rank        REAL,
      gsc_click   INTEGER,
      impressions INTEGER,
      ctr         REAL,
      pv          INTEGER,
      aff_click   INTEGER,
      PRIMARY KEY (post_id, date, source)
    );
    CREATE INDEX IF NOT EXISTS idx_dm_date ON daily_metrics(date);
    CREATE INDEX IF NOT EXISTS idx_dm_post ON daily_metrics(post_id);

    CREATE TABLE IF NOT EXISTS daily_affiliate_clicks (
      post_id INTEGER NOT NULL,
      date    TEXT NOT NULL,
      partner TEXT NOT NULL,
      clicks  INTEGER NOT NULL,
      PRIMARY KEY (post_id, date, partner)
    );
    CREATE INDEX IF NOT EXISTS idx_dac_date ON daily_affiliate_clicks(date);

    CREATE TABLE IF NOT EXISTS weekly_kw_snapshot (
      post_id     INTEGER NOT NULL,
      week_start  TEXT NOT NULL,
      rank_order  INTEGER NOT NULL,
      keyword     TEXT NOT NULL,
      rank        REAL,
      click       INTEGER,
      impressions INTEGER,
      PRIMARY KEY (post_id, week_start, rank_order)
    );

    CREATE TABLE IF NOT EXISTS analysis_comments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id       INTEGER NOT NULL,
      created_at    TEXT NOT NULL,
      comment       TEXT NOT NULL,
      context_days  INTEGER,
      tokens_used   INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_ac_post ON analysis_comments(post_id);

    CREATE TABLE IF NOT EXISTS collection_jobs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type       TEXT NOT NULL,
      started_at     TEXT NOT NULL,
      finished_at    TEXT,
      status         TEXT NOT NULL,
      rows_inserted  INTEGER DEFAULT 0,
      error_message  TEXT,
      metadata       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cj_started ON collection_jobs(started_at DESC);

    CREATE TABLE IF NOT EXISTS backfill_progress (
      id            TEXT PRIMARY KEY,
      cursor_date   TEXT,
      target_start  TEXT,
      target_end    TEXT,
      status        TEXT,
      updated_at    TEXT
    );
  `);
}

// ============================================================
// articles
// ============================================================
function upsertArticle({ post_id, url, title, category, wp_modified, top_kw }) {
  const d = getDB();
  const now = new Date().toISOString();
  d.prepare(`
    INSERT INTO articles (post_id, url, title, category, wp_modified, top_kw, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id) DO UPDATE SET
      url = excluded.url,
      title = COALESCE(excluded.title, articles.title),
      category = COALESCE(excluded.category, articles.category),
      wp_modified = COALESCE(excluded.wp_modified, articles.wp_modified),
      top_kw = COALESCE(excluded.top_kw, articles.top_kw),
      last_seen = excluded.last_seen
  `).run(post_id, url, title || null, category || null, wp_modified || null, top_kw || null, now, now);
}

function updateArticleTopKw(post_id, top_kw) {
  getDB().prepare('UPDATE articles SET top_kw = ? WHERE post_id = ?').run(top_kw, post_id);
}

function getArticle(post_id) {
  return getDB().prepare('SELECT * FROM articles WHERE post_id = ?').get(post_id);
}

function getArticleByUrl(url) {
  return getDB().prepare('SELECT * FROM articles WHERE url = ?').get(url);
}

function listAllArticles() {
  return getDB().prepare('SELECT * FROM articles ORDER BY post_id').all();
}

// ============================================================
// daily_metrics
// ============================================================
function upsertDailyMetric({ post_id, date, source = 'gsc_ga4', rank, gsc_click, impressions, ctr, pv, aff_click }) {
  const d = getDB();
  d.prepare(`
    INSERT INTO daily_metrics (post_id, date, source, rank, gsc_click, impressions, ctr, pv, aff_click)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id, date, source) DO UPDATE SET
      rank = COALESCE(excluded.rank, daily_metrics.rank),
      gsc_click = COALESCE(excluded.gsc_click, daily_metrics.gsc_click),
      impressions = COALESCE(excluded.impressions, daily_metrics.impressions),
      ctr = COALESCE(excluded.ctr, daily_metrics.ctr),
      pv = COALESCE(excluded.pv, daily_metrics.pv),
      aff_click = COALESCE(excluded.aff_click, daily_metrics.aff_click)
  `).run(
    post_id,
    date,
    source,
    rank ?? null,
    gsc_click ?? null,
    impressions ?? null,
    ctr ?? null,
    pv ?? null,
    aff_click ?? null,
  );
}

function bulkUpsertDailyMetrics(records) {
  const d = getDB();
  const stmt = d.prepare(`
    INSERT INTO daily_metrics (post_id, date, source, rank, gsc_click, impressions, ctr, pv, aff_click)
    VALUES (@post_id, @date, @source, @rank, @gsc_click, @impressions, @ctr, @pv, @aff_click)
    ON CONFLICT(post_id, date, source) DO UPDATE SET
      rank = COALESCE(excluded.rank, daily_metrics.rank),
      gsc_click = COALESCE(excluded.gsc_click, daily_metrics.gsc_click),
      impressions = COALESCE(excluded.impressions, daily_metrics.impressions),
      ctr = COALESCE(excluded.ctr, daily_metrics.ctr),
      pv = COALESCE(excluded.pv, daily_metrics.pv),
      aff_click = COALESCE(excluded.aff_click, daily_metrics.aff_click)
  `);
  const tx = d.transaction(rows => {
    let n = 0;
    for (const r of rows) {
      stmt.run({
        source: 'gsc_ga4',
        rank: null, gsc_click: null, impressions: null, ctr: null, pv: null, aff_click: null,
        ...r,
      });
      n++;
    }
    return n;
  });
  return tx(records);
}

// ============================================================
// daily_affiliate_clicks
// ============================================================
function bulkUpsertAffiliateClicks(records) {
  const d = getDB();
  const stmt = d.prepare(`
    INSERT INTO daily_affiliate_clicks (post_id, date, partner, clicks)
    VALUES (@post_id, @date, @partner, @clicks)
    ON CONFLICT(post_id, date, partner) DO UPDATE SET clicks = excluded.clicks
  `);
  const tx = d.transaction(rows => {
    for (const r of rows) stmt.run(r);
    return rows.length;
  });
  return tx(records);
}

// ============================================================
// weekly_kw_snapshot
// ============================================================
function bulkInsertKwSnapshot(records) {
  const d = getDB();
  const stmt = d.prepare(`
    INSERT OR REPLACE INTO weekly_kw_snapshot (post_id, week_start, rank_order, keyword, rank, click, impressions)
    VALUES (@post_id, @week_start, @rank_order, @keyword, @rank, @click, @impressions)
  `);
  const tx = d.transaction(rows => { for (const r of rows) stmt.run(r); return rows.length; });
  return tx(records);
}

// ============================================================
// collection_jobs
// ============================================================
function startJob(job_type, metadata = null) {
  const now = new Date().toISOString();
  const info = getDB().prepare(`
    INSERT INTO collection_jobs (job_type, started_at, status, metadata)
    VALUES (?, ?, 'running', ?)
  `).run(job_type, now, metadata ? JSON.stringify(metadata) : null);
  return info.lastInsertRowid;
}

function finishJob(id, { rows_inserted = 0, status = 'success', error_message = null } = {}) {
  getDB().prepare(`
    UPDATE collection_jobs SET finished_at = ?, status = ?, rows_inserted = ?, error_message = ?
    WHERE id = ?
  `).run(new Date().toISOString(), status, rows_inserted, error_message, id);
}

function listJobs(limit = 50) {
  return getDB().prepare(`
    SELECT * FROM collection_jobs ORDER BY started_at DESC LIMIT ?
  `).all(limit);
}

function isJobRunning(job_type) {
  return !!getDB().prepare(`
    SELECT 1 FROM collection_jobs WHERE job_type = ? AND status = 'running' LIMIT 1
  `).get(job_type);
}

// ============================================================
// backfill_progress
// ============================================================
function getBackfillProgress(id = 'main') {
  return getDB().prepare('SELECT * FROM backfill_progress WHERE id = ?').get(id);
}

function setBackfillProgress(id, { cursor_date, target_start, target_end, status }) {
  getDB().prepare(`
    INSERT INTO backfill_progress (id, cursor_date, target_start, target_end, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      cursor_date = excluded.cursor_date,
      target_start = excluded.target_start,
      target_end = excluded.target_end,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(id, cursor_date || null, target_start || null, target_end || null, status || null, new Date().toISOString());
}

// ============================================================
// analysis_comments
// ============================================================
function saveAnalysisComment({ post_id, comment, context_days, tokens_used }) {
  const info = getDB().prepare(`
    INSERT INTO analysis_comments (post_id, created_at, comment, context_days, tokens_used)
    VALUES (?, ?, ?, ?, ?)
  `).run(post_id, new Date().toISOString(), comment, context_days ?? null, tokens_used ?? null);
  return info.lastInsertRowid;
}

function getAnalysisComments(post_id, limit = 20) {
  return getDB().prepare(`
    SELECT * FROM analysis_comments WHERE post_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(post_id, limit);
}

// ============================================================
// 集計クエリ: 一覧ビュー用（前日比・7日比・30日比）
// ============================================================
/**
 * 全記事について、最新日付の値と、各比較期間の平均値を返す。
 *   latest:     直近1日 (最新)
 *   prev1:      1日前
 *   avg7:       最新日を起点に過去7日平均
 *   avg7_prev:  最新日の7日前を起点に過去7日平均
 *   avg30:      最新日を起点に過去30日平均
 *   avg30_prev: 最新日の30日前を起点に過去30日平均
 */
function getListView() {
  const d = getDB();
  // 最新日付（データが存在する最も新しい日）
  const latestRow = d.prepare(`SELECT MAX(date) AS max_date FROM daily_metrics WHERE source = 'gsc_ga4'`).get();
  const latest = latestRow && latestRow.max_date ? latestRow.max_date : null;
  if (!latest) return { latest: null, articles: [] };

  const articles = d.prepare(`
    SELECT a.post_id, a.url, a.title, a.category, a.top_kw, a.wp_modified
    FROM articles a
    WHERE EXISTS (SELECT 1 FROM daily_metrics m WHERE m.post_id = a.post_id)
    ORDER BY a.category, a.post_id
  `).all();

  const latestDate = latest;
  const prev1Date = addDaysISO(latestDate, -1);
  const avg7Start = addDaysISO(latestDate, -6);
  const avg7PrevEnd = addDaysISO(latestDate, -7);
  const avg7PrevStart = addDaysISO(latestDate, -13);
  const avg30Start = addDaysISO(latestDate, -29);
  const avg30PrevEnd = addDaysISO(latestDate, -30);
  const avg30PrevStart = addDaysISO(latestDate, -59);

  const getMetrics = d.prepare(`
    SELECT rank, gsc_click, impressions, ctr, pv, aff_click
    FROM daily_metrics
    WHERE post_id = ? AND date = ? AND source = 'gsc_ga4'
  `);
  const getAvg = d.prepare(`
    SELECT AVG(rank) AS rank, AVG(gsc_click) AS gsc_click,
           AVG(impressions) AS impressions, AVG(ctr) AS ctr,
           AVG(pv) AS pv, AVG(aff_click) AS aff_click
    FROM daily_metrics
    WHERE post_id = ? AND date BETWEEN ? AND ? AND source = 'gsc_ga4'
  `);

  const result = articles.map(a => ({
    ...a,
    latest: getMetrics.get(a.post_id, latestDate) || null,
    prev1: getMetrics.get(a.post_id, prev1Date) || null,
    avg7: getAvg.get(a.post_id, avg7Start, latestDate) || null,
    avg7_prev: getAvg.get(a.post_id, avg7PrevStart, avg7PrevEnd) || null,
    avg30: getAvg.get(a.post_id, avg30Start, latestDate) || null,
    avg30_prev: getAvg.get(a.post_id, avg30PrevStart, avg30PrevEnd) || null,
  }));

  return { latest: latestDate, articles: result };
}

function getArticleTimeline(post_id, days = 90) {
  const d = getDB();
  const latestRow = d.prepare(`SELECT MAX(date) AS max_date FROM daily_metrics`).get();
  if (!latestRow || !latestRow.max_date) return [];
  const start = addDaysISO(latestRow.max_date, -(days - 1));
  return d.prepare(`
    SELECT date, source, rank, gsc_click, impressions, ctr, pv, aff_click
    FROM daily_metrics
    WHERE post_id = ? AND date >= ?
    ORDER BY date ASC
  `).all(post_id, start);
}

// ============================================================
// ユーティリティ
// ============================================================
function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getLatestDate() {
  const row = getDB().prepare(`SELECT MAX(date) AS max_date FROM daily_metrics`).get();
  return row && row.max_date ? row.max_date : null;
}

function getArticleCount() {
  return getDB().prepare('SELECT COUNT(*) AS n FROM articles').get().n;
}

function getMetricsRowCount() {
  return getDB().prepare('SELECT COUNT(*) AS n FROM daily_metrics').get().n;
}

module.exports = {
  getDB,
  addDaysISO,
  // articles
  upsertArticle, updateArticleTopKw, getArticle, getArticleByUrl, listAllArticles,
  // metrics
  upsertDailyMetric, bulkUpsertDailyMetrics,
  bulkUpsertAffiliateClicks, bulkInsertKwSnapshot,
  // jobs
  startJob, finishJob, listJobs, isJobRunning,
  // backfill
  getBackfillProgress, setBackfillProgress,
  // analysis
  saveAnalysisComment, getAnalysisComments,
  // queries
  getListView, getArticleTimeline,
  // stats
  getLatestDate, getArticleCount, getMetricsRowCount,
};
