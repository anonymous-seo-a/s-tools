/**
 * Phase 3-B: Yahoo! 検索の順位スクレイピング
 *   対象: Top N 記事 (articles.top_kw を検索ワードに、記事 URL が何位かを取得)
 *   制約: 15 秒間隔 / UA 偽装 / JP ロケール
 */
const cheerio = require('cheerio');
const db = require('./monitor-db');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 5;        // 50件 × 5 = 最大 200 位まで調査
const RESULTS_PER_PAGE = 10;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
async function searchYahooRank({ keyword, targetUrl }) {
  const normTarget = normalizeUrl(targetUrl);
  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * RESULTS_PER_PAGE + 1;
    const searchUrl = `https://search.yahoo.co.jp/search?p=${encodeURIComponent(keyword)}&b=${start}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });
    if (!res.ok) {
      if (res.status === 429 || res.status === 403) {
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
    // 次ページ要否: MAX_PAGES に達するか、ページ結果が少なすぎる場合は打ち切り
    if (links.length < 5) break;
    await sleep(1500); // ページング間はクールダウン短めに
  }
  return { rank: null, note: 'not_found_top' + (MAX_PAGES * RESULTS_PER_PAGE) };
}

/**
 * メインジョブ: Top N 記事について Yahoo 順位をスクレイピング。
 * 各クエリ間 intervalSec 秒待機。
 */
async function runYahooDailyScrape({ limit = 200, intervalSec = 15, onProgress } = {}) {
  if (db.isJobRunning('yahoo_scrape')) return { skipped: true };
  const jobId = db.startJob('yahoo_scrape', { limit, intervalSec });
  const date = new Date().toISOString().slice(0, 10);
  let succeeded = 0, failed = 0, notFound = 0;
  try {
    const targets = db.getTopArticlesByPv(limit, 30);
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        const { rank, note } = await searchYahooRank({ keyword: t.top_kw, targetUrl: t.url });
        db.upsertScrapedRank({ post_id: t.post_id, date, engine: 'yahoo', keyword: t.top_kw, rank, note });
        if (rank != null) succeeded++; else notFound++;
      } catch (e) {
        failed++;
        db.upsertScrapedRank({ post_id: t.post_id, date, engine: 'yahoo', keyword: t.top_kw, rank: null, note: `error:${e.message.slice(0, 80)}` });
        // 連続 3 失敗したら停止
        if (failed >= 3 && succeeded === 0) throw new Error(`連続失敗で中断: ${e.message}`);
      }
      if (onProgress) onProgress({ index: i + 1, total: targets.length, succeeded, notFound, failed });
      if (i < targets.length - 1) await sleep(intervalSec * 1000);
    }
    db.finishJob(jobId, { rows_inserted: succeeded + notFound, status: 'success' });
    return { total: targets.length, succeeded, notFound, failed };
  } catch (e) {
    db.finishJob(jobId, { status: 'failed', error_message: e.message });
    throw e;
  }
}

module.exports = { runYahooDailyScrape, searchYahooRank };
