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
const { searchSerp } = require('../../shared/serpapi-adapter');

const FACT_SET_PENDING = JSON.stringify({ _pending: true });

async function collectCompetitorCorpus(query_fanout_id, { topN = 3 } = {}) {
  const conn = db.open();
  const parent = conn
    .prepare('SELECT id, sub_query FROM master_query_fanout WHERE id=?')
    .get(query_fanout_id);
  if (!parent) {
    throw new Error(`master_query_fanout id=${query_fanout_id} not found`);
  }

  const serp = await searchSerp(parent.sub_query);
  const organic = serp.organic.slice(0, topN);
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
    serp_features: JSON.parse(serp_features),
    inserted,
  };
}

module.exports = { collectCompetitorCorpus };
