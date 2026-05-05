'use strict';
/**
 * Step A-1 完成: master_information_gain_score 計算
 *
 * 設計:
 *   IG Score = gap_count (競合 union が持っていて自記事が持たない fact 数)
 *   knowledge/05 V-A schema 通り、Layer 1/2 のみ gap_count を保存。
 *   Layer 3 は gain_score のみ保存 (schema 上 layer3_gap_count なし)、
 *   raw deltas は notes JSON に保存して将来の拡張余地を確保。
 *
 * 正規化:
 *   trim + lowercase の最小正規化のみ (smoke スコープ)。
 *   表現揺れ吸収 (意味的一致) は次フェーズ。
 *
 * 警戒バイアス対チェック:
 *   [b] JSON Schema 過剰汎用化  → notes JSON は固定キー、ajv 検証なし
 *   [d] スケルトン作成隠れたコスト → log/正規化版 / 意味的一致は実装しない
 */
const db = require('../db');

function normalize(s) {
  return String(s).trim().toLowerCase();
}

function buildLayerSets(items) {
  return new Set(items.map(normalize).filter(Boolean));
}

function diffSet(union, self) {
  const out = [];
  for (const f of union) {
    if (!self.has(f)) out.push(f);
  }
  return out;
}

function pickSamples(arr, n = 5) {
  return arr.slice(0, n);
}

function calcIgScore({ post_id, query_fanout_id }) {
  const conn = db.open();

  const fanout = conn
    .prepare('SELECT id, sub_query FROM master_query_fanout WHERE id=?')
    .get(query_fanout_id);
  if (!fanout) throw new Error(`master_query_fanout id=${query_fanout_id} not found`);
  const target_query = fanout.sub_query;

  const selfRows = conn
    .prepare('SELECT layer, content FROM master_fact_set WHERE post_id=?')
    .all(post_id);
  if (selfRows.length === 0) {
    throw new Error(`master_fact_set has no rows for post_id=${post_id}`);
  }
  const selfByLayer = { 1: [], 2: [], 3: [] };
  for (const r of selfRows) {
    if (selfByLayer[r.layer]) selfByLayer[r.layer].push(r.content);
  }

  const corpus = conn
    .prepare(
      `SELECT id, competitor_url, fact_set_snapshot
       FROM master_competitor_corpus
       WHERE query_fanout_id=?`
    )
    .all(query_fanout_id);
  if (corpus.length === 0) {
    throw new Error(`master_competitor_corpus has no rows for query_fanout_id=${query_fanout_id}`);
  }

  const compUnion = { 1: new Set(), 2: new Set(), 3: new Set() };
  let parsedCount = 0;
  for (const c of corpus) {
    let snap;
    try {
      snap = JSON.parse(c.fact_set_snapshot);
    } catch (e) {
      console.warn(`[warn] corpus_id=${c.id} snapshot JSON parse failed: ${e.message}`);
      continue;
    }
    if (snap._pending) {
      console.warn(`[warn] corpus_id=${c.id} fact_set_snapshot is _pending, skipped`);
      continue;
    }
    parsedCount++;
    for (const layer of [1, 2, 3]) {
      const arr = Array.isArray(snap[`layer${layer}`]) ? snap[`layer${layer}`] : [];
      for (const f of arr) compUnion[layer].add(normalize(f));
    }
  }
  if (parsedCount === 0) {
    throw new Error(`no usable fact_set_snapshot for query_fanout_id=${query_fanout_id}`);
  }

  const result = {};
  for (const layer of [1, 2, 3]) {
    const selfSet = buildLayerSets(selfByLayer[layer]);
    const gap = diffSet(compUnion[layer], selfSet);
    result[layer] = {
      self_count: selfSet.size,
      competitor_union_count: compUnion[layer].size,
      gap_count: gap.length,
      gap_samples: pickSamples(gap),
    };
  }

  const notes = JSON.stringify({
    self_fact_count: {
      layer1: result[1].self_count,
      layer2: result[2].self_count,
      layer3: result[3].self_count,
    },
    competitor_union_count: {
      layer1: result[1].competitor_union_count,
      layer2: result[2].competitor_union_count,
      layer3: result[3].competitor_union_count,
    },
    gap_fact_samples: {
      layer1: result[1].gap_samples,
      layer2: result[2].gap_samples,
      layer3: result[3].gap_samples,
    },
    layer3_gap_count: result[3].gap_count,
    calculation_method: 'exact_match_minimal_normalization',
  });

  const insert = conn.prepare(
    `INSERT INTO master_information_gain_score
       (post_id, target_query,
        layer1_gain_score, layer2_gain_score, layer3_gain_score,
        layer1_gap_count, layer2_gap_count,
        competitor_url_count, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const info = insert.run(
    post_id,
    target_query,
    result[1].gap_count,
    result[2].gap_count,
    result[3].gap_count,
    result[1].gap_count,
    result[2].gap_count,
    parsedCount,
    notes
  );

  return {
    id: info.lastInsertRowid,
    post_id,
    target_query,
    competitor_url_count: parsedCount,
    layers: result,
    notes_json: JSON.parse(notes),
  };
}

module.exports = { calcIgScore };
