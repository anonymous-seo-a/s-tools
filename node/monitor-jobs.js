/**
 * 順位モニタリング: ジョブオーケストレーション層
 *   - daily: 日次バッチ（最新確定日までを追いかける）
 *   - backfill: 段階バックフィル（最近 30 日 → 過去 16 ヶ月）
 *   - kwSnapshot: 週次 Top 30 KW スナップショット
 */
const db = require('./monitor-db');
const col = require('./monitor-collectors');

// GSC は約 3 日、GA4 は約 2 日の遅延。安全側で 4 日前を「最新確定日」として扱う
const GSC_LAG_DAYS = 3;
const GA4_LAG_DAYS = 2;
const BACKFILL_MONTHS = 16;

// ============================================================
// 日付ユーティリティ
// ============================================================
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso, days) {
  return db.addDaysISO(iso, days);
}
function maxDate(a, b) { return a > b ? a : b; }
function minDate(a, b) { return a < b ? a : b; }

// ============================================================
// 一つの日付範囲について GSC+GA4 を取得して DB に書き込む
// ============================================================
async function collectRange(startDate, endDate) {
  const metricsMap = new Map(); // post_id|date → record

  // 1) GSC
  const gsc = await col.fetchGscDaily(startDate, endDate);
  for (const r of gsc) {
    const key = `${r.post_id}|${r.date}`;
    metricsMap.set(key, {
      post_id: r.post_id,
      date: r.date,
      rank: r.rank,
      gsc_click: r.gsc_click,
      impressions: r.impressions,
      ctr: r.ctr,
      _url: r.url,
      _category: r.category,
    });
  }

  // 2) GA4 PV
  const pvData = await col.fetchGa4PageViews(startDate, endDate);
  for (const r of pvData) {
    const key = `${r.post_id}|${r.date}`;
    const rec = metricsMap.get(key) || { post_id: r.post_id, date: r.date };
    rec.pv = r.pv;
    metricsMap.set(key, rec);
  }

  // 3) GA4 affiliate_click 合計
  const affData = await col.fetchGa4AffiliateClicks(startDate, endDate);
  for (const r of affData) {
    const key = `${r.post_id}|${r.date}`;
    const rec = metricsMap.get(key) || { post_id: r.post_id, date: r.date };
    rec.aff_click = r.aff_click;
    metricsMap.set(key, rec);
  }

  const records = [...metricsMap.values()];

  // 4) 記事メタデータ upsert（GSC/GA4 に出現した URL から post_id 抽出済）
  const seenArticles = new Map();
  for (const r of records) {
    if (!seenArticles.has(r.post_id) && r._url) {
      seenArticles.set(r.post_id, { post_id: r.post_id, url: r._url, category: r._category });
    }
  }
  for (const a of seenArticles.values()) {
    db.upsertArticle(a);
  }

  // 5) 日次メトリクス書き込み
  const toInsert = records.map(r => ({
    post_id: r.post_id,
    date: r.date,
    source: 'gsc_ga4',
    rank: r.rank ?? null,
    gsc_click: r.gsc_click ?? null,
    impressions: r.impressions ?? null,
    ctr: r.ctr ?? null,
    pv: r.pv ?? null,
    aff_click: r.aff_click ?? null,
  }));
  const inserted = db.bulkUpsertDailyMetrics(toInsert);

  // 6) 商材別アフィリクリック（失敗してもメインは継続）
  let affPartnerInserted = 0;
  try {
    const byPartner = await col.fetchGa4AffiliateClicksByPartner(startDate, endDate);
    if (byPartner.length > 0) {
      affPartnerInserted = db.bulkUpsertAffiliateClicks(byPartner);
    }
  } catch (e) {
    console.warn(`[monitor] affiliate_click_by_partner failed (custom dim 'link_url' 未登録の可能性): ${e.message}`);
  }

  return { metrics: inserted, articles: seenArticles.size, affByPartner: affPartnerInserted };
}

// ============================================================
// 日次ジョブ: DB にまだないところから「確定日」まで追いかける
// ============================================================
async function runDailyJob() {
  if (db.isJobRunning('daily')) return { skipped: true, reason: 'already running' };
  const jobId = db.startJob('daily');
  try {
    const latest = db.getLatestDate();
    const confirmedEnd = addDays(todayISO(), -GSC_LAG_DAYS);
    const start = latest ? addDays(latest, 1) : addDays(confirmedEnd, -29); // 初回は直近30日
    if (start > confirmedEnd) {
      db.finishJob(jobId, { rows_inserted: 0, status: 'success' });
      return { noop: true, reason: 'up to date' };
    }
    const result = await collectRange(start, confirmedEnd);
    db.finishJob(jobId, { rows_inserted: result.metrics, status: 'success' });
    return { start, end: confirmedEnd, ...result };
  } catch (e) {
    db.finishJob(jobId, { status: 'failed', error_message: e.message });
    throw e;
  }
}

// ============================================================
// バックフィル: 段階実行
//   Stage 1: 直近 30 日を即座に埋める（UI で最速に使える状態にする）
//   Stage 2: Stage 1 完了後、月単位でチャンクしながら 16 ヶ月前まで遡る
// 実行中は collection_jobs に 'backfill_stage1' / 'backfill_stage2' として残る
// ============================================================
let backfillRunning = false;

async function startBackfill() {
  if (backfillRunning || db.isJobRunning('backfill_stage1') || db.isJobRunning('backfill_stage2')) {
    return { skipped: true, reason: 'already running' };
  }
  backfillRunning = true;
  // バックグラウンドで実行（await しないで即座に return）
  runBackfillStages().finally(() => { backfillRunning = false; });
  return { started: true };
}

async function runBackfillStages() {
  const confirmedEnd = addDays(todayISO(), -GSC_LAG_DAYS);

  // === Stage 1: 直近 30 日 ===
  const stage1Start = addDays(confirmedEnd, -29);
  const stage1Id = db.startJob('backfill_stage1', { start: stage1Start, end: confirmedEnd });
  try {
    const r = await collectRange(stage1Start, confirmedEnd);
    db.finishJob(stage1Id, { rows_inserted: r.metrics, status: 'success' });
    db.setBackfillProgress('main', {
      cursor_date: stage1Start,
      target_start: addDays(confirmedEnd, -(BACKFILL_MONTHS * 30) + 1),
      target_end: confirmedEnd,
      status: 'stage1_done',
    });
  } catch (e) {
    db.finishJob(stage1Id, { status: 'failed', error_message: e.message });
    return; // Stage 1 が失敗したら Stage 2 も実行しない
  }

  // === Stage 2: 30 日ずつ過去に遡って BACKFILL_MONTHS まで ===
  const stage2Id = db.startJob('backfill_stage2');
  try {
    let cursorEnd = addDays(stage1Start, -1);
    const globalStart = addDays(confirmedEnd, -(BACKFILL_MONTHS * 30) + 1);
    let totalRows = 0;
    while (cursorEnd >= globalStart) {
      const chunkStart = maxDate(globalStart, addDays(cursorEnd, -29));
      try {
        const r = await collectRange(chunkStart, cursorEnd);
        totalRows += r.metrics;
      } catch (e) {
        console.warn(`[backfill] chunk ${chunkStart}..${cursorEnd} failed: ${e.message}`);
      }
      db.setBackfillProgress('main', {
        cursor_date: chunkStart,
        target_start: globalStart,
        target_end: confirmedEnd,
        status: 'stage2_running',
      });
      cursorEnd = addDays(chunkStart, -1);
    }
    db.finishJob(stage2Id, { rows_inserted: totalRows, status: 'success' });
    db.setBackfillProgress('main', {
      cursor_date: globalStart,
      target_start: globalStart,
      target_end: confirmedEnd,
      status: 'done',
    });
  } catch (e) {
    db.finishJob(stage2Id, { status: 'failed', error_message: e.message });
  }
}

// ============================================================
// 週次 Top 30 KW スナップショット
// ============================================================
async function runWeeklyKwSnapshot() {
  const end = addDays(todayISO(), -GSC_LAG_DAYS);
  const start = addDays(end, -6);
  return runKwSnapshotForWeek(monday(start), { updateTopKw: true });
}

/**
 * 指定週の月曜を weekStart として、その週の Top30 KW snapshot を収集する。
 * updateTopKw=false にすると articles.top_kw は上書きしない（過去週 backfill 用）
 */
async function runKwSnapshotForWeek(weekStart, { updateTopKw = false } = {}) {
  if (db.isJobRunning('kw_weekly')) return { skipped: true };
  const jobId = db.startJob('kw_weekly', { week_start: weekStart });
  try {
    const start = weekStart;
    const end = addDays(start, 6);
    const perPage = await col.fetchGscTopKwByPage(start, end, 30);

    const rows = [];
    for (const p of perPage) {
      p.queries.forEach((q, i) => {
        rows.push({
          post_id: p.post_id,
          week_start: weekStart,
          rank_order: i + 1,
          keyword: q.keyword,
          rank: q.rank,
          click: q.click,
          impressions: q.impressions,
        });
      });
      if (updateTopKw && p.queries.length > 0) {
        db.updateArticleTopKw(p.post_id, p.queries[0].keyword);
      }
    }
    const n = rows.length > 0 ? db.bulkInsertKwSnapshot(rows) : 0;
    db.finishJob(jobId, { rows_inserted: n, status: 'success' });
    return { week_start: weekStart, rows_inserted: n };
  } catch (e) {
    db.finishJob(jobId, { status: 'failed', error_message: e.message });
    throw e;
  }
}

function monday(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ============================================================
// WP メタデータ取り込み（タイトル・更新日時）
//   articles に post_id だけあるがタイトルが空のレコードを埋める
// ============================================================
async function backfillWpMeta() {
  const jobId = db.startJob('wp_meta');
  try {
    const all = db.listAllArticles();
    const needs = all.filter(a => !a.title || !a.wp_modified).map(a => a.post_id);
    if (needs.length === 0) {
      db.finishJob(jobId, { rows_inserted: 0, status: 'success' });
      return { filled: 0 };
    }
    const metas = await col.fetchWpMeta(needs);
    let n = 0;
    for (const m of metas) {
      db.upsertArticle({
        post_id: m.post_id,
        url: m.url,
        title: m.title,
        wp_modified: m.modified,
      });
      n++;
    }
    db.finishJob(jobId, { rows_inserted: n, status: 'success' });
    return { filled: n };
  } catch (e) {
    db.finishJob(jobId, { status: 'failed', error_message: e.message });
    throw e;
  }
}

module.exports = {
  collectRange,
  runDailyJob,
  startBackfill,
  runWeeklyKwSnapshot,
  runKwSnapshotForWeek,
  backfillWpMeta,
};
