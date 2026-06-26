/**
 * Phase 3-B: Yahoo! 検索の順位スクレイピング
 *   対象: Top N 記事 (articles.top_kw を検索ワードに、記事 URL が何位かを取得)
 *   制約: 15 秒間隔 / UA 偽装 / JP ロケール
 */
const cheerio = require('cheerio');
const db = require('./monitor-db');

// UA はローテーション (パターン検知回避)。429/403 対策の一環。
const UA_POOL = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
];
const pickUA = () => UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
const UA = UA_POOL[0]; // 後方互換 (直接参照箇所用)
const MAX_PAGES = 5;        // 50件 × 5 = 最大 200 位まで調査
const RESULTS_PER_PAGE = 10;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const jitter = (ms) => ms + Math.floor(Math.random() * Math.min(ms, 8000));

// Yahoo throttle (429/403) 対策の統一 fetch。バックオフ+jitter+UAローテ+Retry-After尊重で再試行。
// 全リトライ後も throttle なら最後の res を返す (呼び出し側で判定)。
const YAHOO_BACKOFF_MS = [30_000, 90_000, 180_000];
async function yahooFetch(searchUrl, { retries = 3 } = {}) {
  let attempt = 0;
  while (true) {
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': pickUA(),
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });
    if ((res.status === 429 || res.status === 403) && attempt < retries) {
      const ra = parseInt(res.headers.get('retry-after') || '', 10);
      const base = YAHOO_BACKOFF_MS[Math.min(attempt, YAHOO_BACKOFF_MS.length - 1)];
      const wait = jitter(ra > 0 ? ra * 1000 : base);
      attempt++;
      console.warn(`[yahooFetch] HTTP ${res.status} — backoff ${Math.round(wait / 1000)}s (${attempt}/${retries})`);
      await sleep(wait);
      continue;
    }
    return res;
  }
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/, 'https://www.');
  } catch { return u; }
}

/**
 * Yahoo! 検索 1 KW → 最大 MAX_PAGES*RESULTS_PER_PAGE 件の結果 URL を収集。
 * 記事 URL が含まれていれば順位 (1-based) を返す。なければ null。
 */
async function searchYahooRank({ keyword, targetUrl }, { maxPages = 3 } = {}) {
  const normTarget = normalizeUrl(targetUrl);
  for (let page = 0; page < maxPages; page++) {
    const start = page * RESULTS_PER_PAGE + 1;
    const searchUrl = `https://search.yahoo.co.jp/search?p=${encodeURIComponent(keyword)}&b=${start}`;
    const res = await yahooFetch(searchUrl);
    if (!res.ok) {
      if (res.status === 429 || res.status === 403) {
        // バックオフ全リトライ後も throttle。throw して呼び出し側の連続失敗ガードに委ねる。
        throw new Error(`Yahoo throttled: HTTP ${res.status}`);
      }
      return { rank: null, note: `http_${res.status}` };
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const links = [];
    $('.sw-Card__titleInner a, .sw-Card__title a, h3 a').each((_, el) => {
      const href = $(el).attr('href');
      if (href) links.push(href);
    });
    // fallback: すべての a[href] でヒット検索
    if (links.length === 0) {
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http')) links.push(href);
      });
    }
    for (let i = 0; i < links.length; i++) {
      const u = normalizeUrl(links[i]);
      if (u === normTarget || u.startsWith(normTarget + '/') || normTarget.startsWith(u + '/')) {
        return { rank: start + i, note: null };
      }
    }
    // 次ページ要否: maxPages に達するか、ページ結果が少なすぎる場合は打ち切り
    if (links.length < 5) break;
    await sleep(jitter(2500)); // ページング間クールダウン (jitter付き)
  }
  return { rank: null, note: 'not_found_top' + (maxPages * RESULTS_PER_PAGE) };
}

// リライト適用済み記事 (直近 lookbackDays 日) の post_id を rewrite.db から取得。
// rewrite.db 未作成・テーブル未作成の環境では空配列。
function getRewriteAppliedPostIds(lookbackDays = 90) {
  try {
    const rdb = require('./rewrite/db').open();
    return rdb.prepare(`
      SELECT DISTINCT post_id FROM master_rewrite_session
      WHERE wp_apply_completed_at IS NOT NULL
        AND wp_apply_completed_at >= datetime('now', ?)
    `).all(`-${lookbackDays} days`).map(r => r.post_id);
  } catch {
    return [];
  }
}

/**
 * スクレイプ対象 = リライト適用済み記事 (優先・先頭) + PV Top N。
 * 適用済み記事は PV 圏外でも必ず含める (効果測定の当日順位検知に必須)。
 */
function getScrapeTargets(limit = 200) {
  const base = db.getTopArticlesByPv(limit, 30);
  const seen = new Set(base.map(t => t.post_id));
  const priority = [];
  for (const pid of getRewriteAppliedPostIds()) {
    if (seen.has(pid)) {
      // 既に PV 圏内 → 先頭に移動 (ジョブ中断時も適用済み分は取得済みにする)
      const idx = base.findIndex(t => t.post_id === pid);
      priority.push(base.splice(idx, 1)[0]);
      continue;
    }
    const art = db.getArticle(pid);
    if (art && art.url && art.top_kw) {
      priority.push({ post_id: art.post_id, url: art.url, top_kw: art.top_kw });
      seen.add(pid);
    }
  }
  return [...priority, ...base];
}

/**
 * メインジョブ: リライト適用済み + Top N 記事について Yahoo 順位をスクレイピング。
 * 各クエリ間 intervalSec 秒待機。
 */
async function runYahooDailyScrape({ limit = 200, intervalSec = 15, onProgress } = {}) {
  if (db.isJobRunning('yahoo_scrape')) return { skipped: true };
  const jobId = db.startJob('yahoo_scrape', { limit, intervalSec });
  const date = new Date().toISOString().slice(0, 10);
  let succeeded = 0, failed = 0, notFound = 0;
  let consecFail = 0;          // 連続失敗 (throttle カスケード検知)
  let curIntervalMs = intervalSec * 1000;
  try {
    const targets = getScrapeTargets(limit);
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      let throttled = false;
      try {
        const { rank, note } = await searchYahooRank({ keyword: t.top_kw, targetUrl: t.url });
        db.upsertScrapedRank({ post_id: t.post_id, date, engine: 'yahoo', keyword: t.top_kw, rank, note });
        if (rank != null) succeeded++; else notFound++;
        consecFail = 0;
        curIntervalMs = intervalSec * 1000; // 成功で間隔を基準に戻す
      } catch (e) {
        failed++;
        consecFail++;
        throttled = /throttled/i.test(e.message);
        db.upsertScrapedRank({ post_id: t.post_id, date, engine: 'yahoo', keyword: t.top_kw, rank: null, note: `error:${e.message.slice(0, 80)}` });
        // throttle 連鎖時は間隔を指数的に拡大 (IP冷却)。最大 5 分。
        if (throttled) curIntervalMs = Math.min(curIntervalMs * 2, 300_000);
        // 連続失敗が多い = IP がハード throttle。無駄打ちを避け早期中断。
        if (consecFail >= 8) throw new Error(`連続失敗${consecFail}で中断 (IP throttle 疑い): ${e.message}`);
      }
      if (onProgress) onProgress({ index: i + 1, total: targets.length, succeeded, notFound, failed });
      if (i < targets.length - 1) await sleep(jitter(curIntervalMs));
    }
    db.finishJob(jobId, { rows_inserted: succeeded + notFound, status: 'success' });
    return { total: targets.length, succeeded, notFound, failed };
  } catch (e) {
    db.finishJob(jobId, { status: 'failed', error_message: e.message });
    throw e;
  }
}

/**
 * Yahoo! 検索のクエリ上位 organic 結果 URL を返す (競合コーパス取得用、SerpApi 代替)。
 * yahoo 内部 (知恵袋等) は除外、hash/query を落として origin+path で dedupe。
 * throttle (429/403) はバックオフ付きで自動リトライ (90s → 240s)。
 * @returns Array<{ link, position }>
 */
async function searchYahooResults(keyword, { topN = 10, maxPages = 2 } = {}) {
  const seen = new Set();
  const out = [];
  for (let page = 0; page < maxPages && out.length < topN; page++) {
    const start = page * RESULTS_PER_PAGE + 1;
    const searchUrl = `https://search.yahoo.co.jp/search?p=${encodeURIComponent(keyword)}&b=${start}`;
    const res = await yahooFetch(searchUrl); // backoff+jitter+UAローテは共通ヘルパに集約
    if (!res.ok) {
      if (res.status === 429 || res.status === 403) {
        throw new Error(`Yahoo throttled: HTTP ${res.status}`);
      }
      break;
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const hrefs = [];
    $('.sw-Card__titleInner a, .sw-Card__title a, h3 a').each((_, el) => {
      const h = $(el).attr('href');
      if (h && /^https?:\/\//.test(h)) hrefs.push(h);
    });
    for (const h of hrefs) {
      let u;
      try { u = new URL(h); } catch { continue; }
      const host = u.hostname.toLowerCase();
      if (/(^|\.)yahoo\.co\.jp$/.test(host) || /(^|\.)yahoo\.com$/.test(host)) continue; // yahoo 内部/知恵袋 除外
      const clean = `${u.origin}${u.pathname}`.replace(/\/+$/, '');
      const key = clean.replace(/^https?:\/\/(www\.)?/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ link: clean, position: out.length + 1 });
      if (out.length >= topN) break;
    }
    if (hrefs.length < 5) break;
    await sleep(jitter(3000));
  }
  return out;
}

module.exports = { runYahooDailyScrape, searchYahooRank, searchYahooResults, getScrapeTargets };
