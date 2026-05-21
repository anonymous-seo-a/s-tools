'use strict';
/**
 * 案B (#9) α: master_article_similarity 投入
 *
 * 設計:
 *   computeSimilarities が返す Top-K pairs を 1 トランザクションで一括 INSERT。
 *   β query_overlap / γ entity_overlap は Phase 3 のため NULL。
 *   notes: source_token_count + corpus_size + tied_at (UNIQUE 制約 calculated_at と一致)。
 *
 * UNIQUE 制約:
 *   (source_post_id, target_post_id, calculated_at)。同一秒内の重複防止のため
 *   INSERT 全 row で同一 calculated_at を共有 (履歴ポイント単位の整合性を担保)。
 *
 * 警戒バイアス対チェック:
 *   [4]  機能を盛りたくなる: UPDATE / 削除を作らない、履歴蓄積のみ
 *   [11] Adapter 過剰抽象化: db.js conn 直接、ラッパなし
 *   [12] スケルトン隠れたコスト: ajv なし
 */
const db = require('../db');
const { CALCULATION_METHOD } = require('./compute');

function insertSimilarities({ results, corpusSize, extraNotes = {} }) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('insertSimilarities: results required');
  }
  const conn = db.open();
  const calculatedAt = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  const stmt = conn.prepare(
    `INSERT INTO master_article_similarity
       (source_post_id, target_post_id, text_similarity, query_overlap, entity_overlap,
        rank_in_source, calculation_method, calculated_at, notes)
     VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?)`
  );

  const tx = conn.transaction(() => {
    let inserted = 0;
    for (const r of results) {
      const notes = JSON.stringify({
        source_token_count: r.token_count,
        corpus_size: corpusSize,
        ...extraNotes,
      });
      for (const p of r.pairs) {
        stmt.run(
          r.source_post_id,
          p.target_post_id,
          p.text_similarity,
          p.rank_in_source,
          CALCULATION_METHOD,
          calculatedAt,
          notes
        );
        inserted++;
      }
    }
    return inserted;
  });

  const inserted = tx();
  return { inserted, calculated_at: calculatedAt, corpus_size: corpusSize };
}

module.exports = { insertSimilarities };
