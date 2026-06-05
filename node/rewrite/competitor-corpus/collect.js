'use strict';
/**
 * Step A-1 範囲: master_competitor_corpus 投入ロジック
 *
 * Layer1 sub_query (query_fanout_id) を入力として、SerpApi で実 SERP を取得し、
 * organic top N=3 を master_competitor_corpus に投入。
 * fact_set_snapshot は別タスク (master_fact_set 範囲)、本ロジックではプレースホルダ
 * '{"_pending":true}' を投入。
 *
 * 警戒バイアス対チェック:
 *   [b] JSON Schema 過剰汎用化 → serp_features は必要 boolean / count のみ
 *   [c] Adapter 過剰抽象化     → SerpApi Adapter 単一、本ロジックは薄い結合
 *   [f] 細分化暴走             → top N=3 固定、knowledge/05 確定
 *   [i] SerpApi コスト浪費     → 1 query_fanout_id あたり 1 SerpApi コール
 *   [j] 取得対象範囲拡大       → organic のみ投入、PAA / related_searches /
 *                                ai_overview_citations は serp_features 集計のみ
 *                                (案B # 4 master_query_fanout 投入は別タスク)
 */
const db = require('../db');
// serpapi-adapter は require 時に SERPAPI_API_KEY を要求するため遅延 require。
// (classifyDomain 等の純関数だけを他モジュールが import する時に key 不要にする)

const FACT_SET_PENDING = JSON.stringify({ _pending: true });

// 競合として扱わないドメイン (企業公式・政府・自サイト)。メディア/比較サイトのみを競合にする。
// suffix 一致 (host === s または host が .s で終わる)。Daiki が随時追記する想定。
const EXCLUDE_DOMAIN_SUFFIXES = [
  'soico.jp',                                   // 自サイト
  'go.jp', 'fsa.go.jp', 'nta.go.jp',            // 政府 (一次情報源=出典であり競合ではない)
  // 証券 企業公式 (メディアではない)
  'rakuten-sec.co.jp', 'sbisec.co.jp', 'sbineotrade.jp', 'daiwa.jp', 'monex.co.jp',
  'matsui.co.jp', 'nomura.co.jp', 'smbcnikko.co.jp', 'tokaitokyo.co.jp',
  'okasan-online.co.jp', 'gmo-click.com', 'click-sec.com', 'auone-kabu.jp',
  'rakuten.co.jp', 'sbigroup.co.jp',
  // カードローン 企業公式
  'acom.co.jp', 'promise.co.jp', 'aiful.co.jp', 'mobit.ne.jp', 'smbc-cf.com',
];

function matchesSuffix(host, suffixes) {
  return suffixes.some((s) => host === s || host.endsWith('.' + s));
}

function isExcludedDomain(url, extra = []) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return true; }
  return matchesSuffix(host, [...EXCLUDE_DOMAIN_SUFFIXES, ...extra]);
}

// ドメイン種別: gov(政府=一次情報/出典) / official(企業公式) / media(比較・メディア)。
// 「除外」ではなく「役割」(media=網羅基準, official/gov=出典源) の判定に使う。
function classifyDomain(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return 'media'; }
  if (matchesSuffix(host, ['go.jp', 'go.kr']) || host.endsWith('.gov')) return 'gov';
  // 企業公式 = EXCLUDE_DOMAIN_SUFFIXES のうち go.jp/自サイト以外
  const official = EXCLUDE_DOMAIN_SUFFIXES.filter((s) => !s.endsWith('go.jp') && s !== 'soico.jp');
  if (matchesSuffix(host, official)) return 'official';
  return 'media';
}

// 既定 mediaOnly=false: SERP 上位全部を IG 源にする (= 順位の ground truth)。
// mediaOnly=true は「メディアが上位に居るか」のターゲット選定信号用途。
async function collectCompetitorCorpus(query_fanout_id, { topN = 3, excludeDomains = [], mediaOnly = false } = {}) {
  const conn = db.open();
  const parent = conn
    .prepare('SELECT id, sub_query FROM master_query_fanout WHERE id=?')
    .get(query_fanout_id);
  if (!parent) {
    throw new Error(`master_query_fanout id=${query_fanout_id} not found`);
  }

  const { searchSerp } = require('../../shared/serpapi-adapter');
  const serp = await searchSerp(parent.sub_query);
  // mediaOnly: 企業公式/政府を除外してメディア/比較サイトのみを上位 topN 競合に。
  const pool = (serp.organic || []).filter((r) => r.link && typeof r.position === 'number');
  const filtered = mediaOnly ? pool.filter((r) => !isExcludedDomain(r.link, excludeDomains)) : pool;
  const excluded = pool.filter((r) => mediaOnly && isExcludedDomain(r.link, excludeDomains)).map((r) => r.link);
  const organic = filtered.slice(0, topN);
  const competitor_url_count = organic.length;

  const serp_features = JSON.stringify({
    has_paa: serp.paa.length > 0,
    has_ai_overview: serp.ai_overview_citations.length > 0,
    has_related_searches: serp.related_searches.length > 0,
    paa_count: serp.paa.length,
    related_searches_count: serp.related_searches.length,
    ai_overview_citations_count: serp.ai_overview_citations.length,
  });

  const insert = conn.prepare(
    `INSERT OR IGNORE INTO master_competitor_corpus
       (query_fanout_id, target_query, competitor_url, rank_position,
        fact_set_snapshot, competitor_url_count, serp_features, source_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'organic')`
  );

  const inserted = [];
  const tx = conn.transaction((rows) => {
    for (const r of rows) {
      if (!r.link || typeof r.position !== 'number') continue;
      const info = insert.run(
        query_fanout_id,
        parent.sub_query,
        r.link,
        r.position,
        FACT_SET_PENDING,
        competitor_url_count,
        serp_features
      );
      if (info.changes > 0) {
        inserted.push({ id: info.lastInsertRowid, url: r.link, position: r.position });
      }
    }
  });
  tx(organic);

  return {
    query_fanout_id,
    target_query: parent.sub_query,
    organic_count: organic.length,
    inserted_count: inserted.length,
    excluded_official: excluded,
    serp_features: JSON.parse(serp_features),
    inserted,
  };
}

module.exports = { collectCompetitorCorpus, isExcludedDomain, classifyDomain, EXCLUDE_DOMAIN_SUFFIXES };
