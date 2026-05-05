'use strict';
/**
 * Step A-1 範囲: 案A 統合 - master_post_target_query 投入
 *
 * GSC API で per-post クエリを取得し、master_post_target_query に投入。
 *   max impressions クエリ → query_role='primary'
 *   max clicks クエリ → query_role='secondary' (primary と一致時は skip)
 *
 * 既存 monitor-collectors.js の GSC 認証パターンを踏襲、
 * ただし GoogleAuth は引数なしで GOOGLE_APPLICATION_CREDENTIALS env var 自動使用
 * (shared/ 層と同じ依存方向: 呼び出し側で dotenv 初期化)
 *
 * 警戒バイアス対チェック:
 *   [c] Adapter 過剰抽象化 → GSC 接続は本ファイル内 inline (shared/google-adapter は YAGNI)
 *   [d] スケルトン隠れたコスト → 必要関数のみ
 *   [j] 取得対象範囲拡大 → primary + secondary の 2 役割のみ、tertiary 等の追加は YAGNI
 */
const { google } = require('googleapis');
const db = require('../db');

const GSC_SITE_URL = process.env.GSC_PROPERTY_URL || 'https://www.soico.jp/no1/';

function authClient() {
  return new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
}

async function fetchGscQueriesForPost(post_url, { days = 90 } = {}) {
  const auth = authClient();
  const sc = google.searchconsole({ version: 'v1', auth });

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const res = await sc.searchanalytics.query({
    siteUrl: GSC_SITE_URL,
    requestBody: {
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      dimensions: ['query'],
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: 'page',
              operator: 'contains',
              expression: post_url,
            },
          ],
        },
      ],
      rowLimit: 1000,
    },
  });
  const rows = res.data.rows || [];
  return rows.map((r) => ({
    query: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    rank: r.position,
    ctr: r.ctr,
  }));
}

function pickPrimaryAndSecondary(queries) {
  if (queries.length === 0) return { primary: null, secondary: null };

  const byImp = [...queries].sort((a, b) => b.impressions - a.impressions);
  const primary = byImp[0];

  const byClk = [...queries].sort((a, b) => b.clicks - a.clicks);
  const secondaryCand = byClk[0];
  const secondary = secondaryCand.query === primary.query ? null : secondaryCand;

  return { primary, secondary };
}

async function buildPostTargetQuery(post_id, { days = 90 } = {}) {
  const conn = db.open();
  db.attachMonitorReadOnly(conn);
  let article;
  try {
    article = conn
      .prepare('SELECT post_id, url FROM monitor.articles WHERE post_id = ?')
      .get(post_id);
  } finally {
    db.detachMonitor(conn);
  }
  if (!article) {
    throw new Error(`monitor.articles post_id=${post_id} not found`);
  }

  const queries = await fetchGscQueriesForPost(article.url, { days });
  const { primary, secondary } = pickPrimaryAndSecondary(queries);

  const insert = conn.prepare(
    `INSERT OR IGNORE INTO master_post_target_query
       (post_id, target_query, query_role, source, set_by)
     VALUES (?, ?, ?, 'gsc', 'auto')`
  );

  const inserted = [];
  if (primary) {
    const info = insert.run(post_id, primary.query, 'primary');
    if (info.changes > 0) {
      inserted.push({ id: info.lastInsertRowid, ...primary, query_role: 'primary' });
    }
  }
  if (secondary) {
    const info = insert.run(post_id, secondary.query, 'secondary');
    if (info.changes > 0) {
      inserted.push({ id: info.lastInsertRowid, ...secondary, query_role: 'secondary' });
    }
  }

  return {
    post_id,
    url: article.url,
    days_window: days,
    gsc_query_count: queries.length,
    primary,
    secondary,
    inserted,
  };
}

module.exports = {
  buildPostTargetQuery,
  fetchGscQueriesForPost,
  pickPrimaryAndSecondary,
};
