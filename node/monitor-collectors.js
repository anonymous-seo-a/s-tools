/**
 * 順位モニタリング: GSC / GA4 / WP からのデータ収集層
 */
const { google } = require('googleapis');
const path = require('path');
const config = require('./config');

const KEY_FILE = path.join(__dirname, 'service-account-key.json');
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || '516785717';
const GSC_SITE_URL = process.env.GSC_PROPERTY_URL || 'https://www.soico.jp/no1/';

// ============================================================
// Google 認証
// ============================================================
function authClient() {
  return new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/webmasters.readonly',
    ],
  });
}

// ============================================================
// URL → post_id / category 抽出
//   /no1/news/{category}/{post_id}  or  /no1/news/{category}/{post_id}/
// ============================================================
const URL_PATH_REGEX = /\/no1\/news\/([a-z]+)\/(\d+)(?:\/|$)/i;

// 本体サイト (soico.jp 本体) のカテゴリは /no1/ 配下でも affiliate 対象外
// ユーザー指定リストの typo 吸収で 'entrepreneur' / 'grants' も含めている
const EXCLUDED_CATEGORIES = new Set([
  'accounting', 'development', 'enterpreneur', 'entrepreneur',
  'funding', 'grantsh', 'grants',
  'hiring', 'incorporation', 'office', 'startup',
]);

function parseUrl(url) {
  // pageLocation には FQDN を含む場合と含まない場合がある。両方対応
  if (!url) return null;
  const clean = url.split('?')[0].split('#')[0];
  const m = clean.match(URL_PATH_REGEX);
  if (!m) return null;
  const category = m[1].toLowerCase();
  if (EXCLUDED_CATEGORIES.has(category)) return null;
  return {
    category,
    post_id: parseInt(m[2], 10),
    normalizedPath: `/no1/news/${m[1]}/${m[2]}/`,
    normalizedUrl: `https://www.soico.jp/no1/news/${m[1]}/${m[2]}/`,
  };
}

// ============================================================
// GSC: URL × 日付 単位のメトリクス（rank / clicks / impressions / ctr）
// ============================================================
async function fetchGscDaily(startDate, endDate) {
  const auth = authClient();
  const sc = google.searchconsole({ version: 'v1', auth });
  const rows = [];
  let startRow = 0;
  const batchSize = 25000;

  while (true) {
    const res = await sc.searchanalytics.query({
      siteUrl: GSC_SITE_URL,
      requestBody: {
        startDate, endDate,
        dimensions: ['page', 'date'],
        rowLimit: batchSize,
        startRow,
      },
    });
    const got = res.data.rows || [];
    rows.push(...got);
    if (got.length < batchSize) break;
    startRow += batchSize;
  }

  const out = [];
  for (const r of rows) {
    const [url, date] = r.keys;
    const parsed = parseUrl(url);
    if (!parsed) continue;
    out.push({
      post_id: parsed.post_id,
      category: parsed.category,
      url: parsed.normalizedUrl,
      date,
      rank: r.position,
      gsc_click: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
    });
  }
  return out;
}

// ============================================================
// GSC: URL × KW の Top N（指定期間の合計で集計）
//   articles.top_kw の定期更新 + weekly_kw_snapshot 用途
// ============================================================
async function fetchGscTopKwByPage(startDate, endDate, topN = 30) {
  const auth = authClient();
  const sc = google.searchconsole({ version: 'v1', auth });
  const rows = [];
  let startRow = 0;
  const batchSize = 25000;

  while (true) {
    const res = await sc.searchanalytics.query({
      siteUrl: GSC_SITE_URL,
      requestBody: {
        startDate, endDate,
        dimensions: ['page', 'query'],
        rowLimit: batchSize,
        startRow,
      },
    });
    const got = res.data.rows || [];
    rows.push(...got);
    if (got.length < batchSize) break;
    startRow += batchSize;
  }

  // page ごとに query をクリック降順（=0 なら表示回数降順）で Top N
  const grouped = new Map();
  for (const r of rows) {
    const [url, query] = r.keys;
    const parsed = parseUrl(url);
    if (!parsed) continue;
    const key = parsed.post_id;
    if (!grouped.has(key)) {
      grouped.set(key, { post_id: parsed.post_id, url: parsed.normalizedUrl, queries: [] });
    }
    grouped.get(key).queries.push({
      keyword: query,
      rank: r.position,
      click: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
    });
  }
  for (const g of grouped.values()) {
    g.queries.sort((a, b) => (b.click - a.click) || (b.impressions - a.impressions));
    g.queries = g.queries.slice(0, topN);
  }
  return [...grouped.values()];
}

// ============================================================
// GA4: URL × 日付 単位の PV
// ============================================================
async function fetchGa4PageViews(startDate, endDate) {
  const auth = authClient();
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

  // limit が 100k なので分割しながら取得
  const all = [];
  let offset = 0;
  const limit = 100000;
  while (true) {
    const res = await analyticsData.properties.runReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pageLocation' }, { name: 'date' }],
        metrics: [{ name: 'screenPageViews' }],
        limit, offset,
      },
    });
    const rows = res.data.rows || [];
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }

  const out = [];
  for (const r of all) {
    const url = r.dimensionValues[0].value;
    const d = r.dimensionValues[1].value; // YYYYMMDD
    const parsed = parseUrl(url);
    if (!parsed) continue;
    out.push({
      post_id: parsed.post_id,
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      pv: parseInt(r.metricValues[0].value, 10) || 0,
    });
  }
  // 同一 (post_id, date) が parseUrl 正規化の結果で重複することがあるので合算
  const agg = new Map();
  for (const r of out) {
    const k = `${r.post_id}|${r.date}`;
    agg.set(k, (agg.get(k) || 0) + r.pv);
  }
  return [...agg.entries()].map(([k, pv]) => {
    const [post_id, date] = k.split('|');
    return { post_id: parseInt(post_id, 10), date, pv };
  });
}

// ============================================================
// GA4: URL × 日付 単位の affiliate_click 合計
// ============================================================
async function fetchGa4AffiliateClicks(startDate, endDate) {
  const auth = authClient();
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

  const all = [];
  let offset = 0;
  const limit = 100000;
  while (true) {
    const res = await analyticsData.properties.runReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pageLocation' }, { name: 'date' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: { matchType: 'EXACT', value: 'affiliate_click' },
          },
        },
        limit, offset,
      },
    });
    const rows = res.data.rows || [];
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }

  const out = [];
  for (const r of all) {
    const url = r.dimensionValues[0].value;
    const d = r.dimensionValues[1].value;
    const parsed = parseUrl(url);
    if (!parsed) continue;
    out.push({
      post_id: parsed.post_id,
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      aff_click: parseInt(r.metricValues[0].value, 10) || 0,
    });
  }
  const agg = new Map();
  for (const r of out) {
    const k = `${r.post_id}|${r.date}`;
    agg.set(k, (agg.get(k) || 0) + r.aff_click);
  }
  return [...agg.entries()].map(([k, aff_click]) => {
    const [post_id, date] = k.split('|');
    return { post_id: parseInt(post_id, 10), date, aff_click };
  });
}

// ============================================================
// GA4: URL × 日付 × 商材 単位の affiliate_click
//   link_url パラメータから /recommends/{slug}/ を抽出して商材名に正規化
// ============================================================
async function fetchGa4AffiliateClicksByPartner(startDate, endDate) {
  const auth = authClient();
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

  const all = [];
  let offset = 0;
  const limit = 100000;
  while (true) {
    const res = await analyticsData.properties.runReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: 'pageLocation' },
          { name: 'date' },
          { name: 'customEvent:link_url' },
        ],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: { matchType: 'EXACT', value: 'affiliate_click' },
          },
        },
        limit, offset,
      },
    });
    const rows = res.data.rows || [];
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }

  const out = [];
  for (const r of all) {
    const pageUrl = r.dimensionValues[0].value;
    const d = r.dimensionValues[1].value;
    const linkUrl = r.dimensionValues[2].value;
    const parsed = parseUrl(pageUrl);
    if (!parsed) continue;
    const partner = extractPartnerFromLinkUrl(linkUrl);
    if (!partner) continue;
    out.push({
      post_id: parsed.post_id,
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      partner,
      clicks: parseInt(r.metricValues[0].value, 10) || 0,
    });
  }
  // (post_id, date, partner) で合算
  const agg = new Map();
  for (const r of out) {
    const k = `${r.post_id}|${r.date}|${r.partner}`;
    agg.set(k, (agg.get(k) || 0) + r.clicks);
  }
  return [...agg.entries()].map(([k, clicks]) => {
    const [post_id, date, partner] = k.split('|');
    return { post_id: parseInt(post_id, 10), date, partner, clicks };
  });
}

/**
 * link_url から商材スラッグを抽出して config.partnerSlugMap で正規化。
 *   例: https://www.soico.jp/no1/recommends/rakuten/?ref=xxx → 'rakuten'
 */
function extractPartnerFromLinkUrl(linkUrl) {
  if (!linkUrl || linkUrl === '(not set)') return null;
  const m = linkUrl.match(/\/recommends\/([a-zA-Z0-9_-]+)\/?/);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  return (config.partnerSlugMap && config.partnerSlugMap[raw]) || raw;
}

// ============================================================
// WP REST API: 記事メタデータ（title, category, modified）
// ============================================================
async function fetchWpMeta(postIds) {
  if (!postIds || postIds.length === 0) return [];
  const out = [];
  const auth = Buffer.from(`${config.wp.username}:${config.wp.appPassword}`).toString('base64');

  // include に最大 100 個まで。チャンクして呼び出す
  const chunks = [];
  for (let i = 0; i < postIds.length; i += 100) chunks.push(postIds.slice(i, i + 100));

  for (const chunk of chunks) {
    const url = `${config.wp.restBase}/posts?per_page=100&include=${chunk.join(',')}&_fields=id,title,link,modified,categories`;
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) continue;
    const json = await res.json();
    for (const p of json) {
      out.push({
        post_id: p.id,
        title: p.title?.rendered || '',
        url: p.link,
        modified: p.modified,
        categories: p.categories,
      });
    }
  }
  return out;
}

/**
 * 1 記事の本文 (HTML) を WP REST から取得。要因分析用。
 * Returns: { post_id, title, content_html, content_text } | null
 */
async function fetchWpContent(post_id) {
  const auth = Buffer.from(`${config.wp.username}:${config.wp.appPassword}`).toString('base64');
  const url = `${config.wp.restBase}/posts/${post_id}?_fields=id,title,content,link,modified`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) return null;
  const p = await res.json();
  const html = p.content?.rendered || '';
  const text = html.replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    post_id: p.id,
    title: p.title?.rendered || '',
    content_html: html,
    content_text: text,
    url: p.link,
    modified: p.modified,
  };
}

module.exports = {
  parseUrl,
  extractPartnerFromLinkUrl,
  fetchGscDaily,
  fetchGscTopKwByPage,
  fetchGa4PageViews,
  fetchGa4AffiliateClicks,
  fetchGa4AffiliateClicksByPartner,
  fetchWpMeta,
  fetchWpContent,
};
