'use strict';
/**
 * 段階B B-5: 案C 入力 bundle API (V-A-2-4 規則実装)
 *
 * 工程6'-A (Opus 4.7 分析) に渡す 3 系統データを 1 関数で集約取得。
 *
 * V-A-2-4 入力 bundle 3 系統:
 *   A. 必須追加 fact (fact-set 由来、self に存在しない competitor union fact)
 *      source: master_information_gain_score.notes.gap_fact_samples
 *
 *   B. 深度不足 Q[i] (embedding 由来)
 *      source: master_passage_gap WHERE target_kind='query'
 *                                   AND judge_type='embedding'
 *                                   AND gap_flag=1
 *                                   AND session_id=?
 *
 *   C. 深度不足 fact (embedding 由来、ただし fact-set で no-gap = self に含まれてる)
 *      source: master_passage_gap の embedding ∩ factset 自己結合
 *      条件: embedding.gap_flag=1 AND factset.gap_flag=0
 *
 * 設計判断 (B-5、Daiki 承認):
 *   - 読み取り専用 (DB 副作用なし)
 *   - 案C プロンプトで bundle を 1 つの形で受け取る前提のため、複雑性を本モジュールに局所化
 *   - 重み付けは段階B 範囲外、別フィールド分離のみ
 *
 * 警戒バイアス対チェック:
 *   [4]  機能を盛りたくなる: 関数 1 つのみ、ヘルパは private
 *   [11] Adapter 過剰抽象化: 単一エントリ buildCaseCInputBundle
 *   [22] 環境変数値構造仮定: env 参照なし
 *   [23] fact 概念意味論曖昧: 3 系統 A/B/C を明確に分離、return 構造で systems を切り分け
 */

const db = require('../db');

// 揮発性(時間で陳腐化する/銘柄個別の市況)事実を除外する判定。
// evergreen 記事に株価・前日比・銘柄コード・日付依存の値を入れさせないための durability フィルタ。
// ※ NISA 枠「1,800万円」等の普遍的な閾値を誤除外しないよう、株価/銘柄コード/日付/時点に限定。
const VOLATILE_FACT_RE = /株価|前日比|始値|終値|出来高|時価総額|現在値|終値ベース|[(（]\s*\d{3,4}[0-9a-zA-Z]?\s*[)）]|\d{4}\s*[年/]\s*\d{1,2}\s*[月/]\s*\d{1,2}|\d{1,2}\s*時\s*\d{1,2}\s*分時点|時点で(?:の|は)?\s*\d|本日|当日終値/;

function isVolatileFact(text) {
  return VOLATILE_FACT_RE.test(text || '');
}

function loadFactsetGapSamples(conn, { post_id, target_query }) {
  const ig = conn
    .prepare(
      `SELECT id, target_query, layer1_gap_count, layer2_gap_count, layer3_gain_score, notes
       FROM master_information_gain_score
       WHERE post_id=? AND target_query=?
       ORDER BY calculated_at DESC LIMIT 1`
    )
    .get(post_id, target_query);
  if (!ig) return { rows: [], ig_id: null, total_gap_count: 0 };

  let notes;
  try {
    notes = JSON.parse(ig.notes || '{}');
  } catch {
    notes = {};
  }

  const rows = [];
  let volatile_excluded = 0;
  for (const layer of [1, 2, 3]) {
    const arr = notes?.gap_fact_samples?.[`layer${layer}`];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        // Layer 0: 新形式 {text, source_url} と旧形式 (文字列) の両対応。
        // source_url は「この fact の出自」= 後段の出典付与で唯一の正となる URL。
        const text = typeof item === 'string' ? item : item?.text;
        const source_url = typeof item === 'string' ? null : (item?.source_url || null);
        if (typeof text === 'string' && text.trim()) {
          if (isVolatileFact(text)) { volatile_excluded++; continue; } // durability: 揮発性事実は注入しない
          rows.push({ layer, text: text.trim(), source_url });
        }
      }
    }
  }

  return {
    rows,
    ig_id: ig.id,
    total_gap_count: (ig.layer1_gap_count || 0) + (ig.layer2_gap_count || 0),
    layer3_gain_score: ig.layer3_gain_score || 0,
    volatile_excluded,
  };
}

function loadShallowQueries(conn, { session_id, query_fanout_id }) {
  return conn
    .prepare(
      `SELECT target_text AS query_text,
              self_max_cosine AS self_max,
              competitor_max_cosine AS comp_max,
              delta,
              (competitor_max_cosine + delta) AS threshold
       FROM master_passage_gap
       WHERE session_id=?
         AND target_kind='query'
         AND judge_type='embedding'
         AND gap_flag=1
         ${query_fanout_id != null ? 'AND query_fanout_id=?' : ''}
       ORDER BY (competitor_max_cosine - self_max_cosine) DESC`
    )
    .all(...(query_fanout_id != null ? [session_id, query_fanout_id] : [session_id]));
}

function loadShallowFacts(conn, { session_id }) {
  return conn
    .prepare(
      `SELECT
         emb.target_text AS fact_text,
         emb.fact_layer  AS layer,
         emb.self_max_cosine AS self_max,
         emb.competitor_max_cosine AS comp_max,
         emb.delta,
         (emb.competitor_max_cosine + emb.delta) AS threshold
       FROM master_passage_gap emb
       JOIN master_passage_gap fs
         ON  emb.session_id   = fs.session_id
         AND emb.target_text  = fs.target_text
         AND (emb.fact_layer IS fs.fact_layer)
         AND emb.target_kind  = 'fact'
         AND fs.target_kind   = 'fact'
         AND emb.judge_type   = 'embedding'
         AND fs.judge_type    = 'factset'
       WHERE emb.session_id   = ?
         AND emb.gap_flag     = 1
         AND fs.gap_flag      = 0
       ORDER BY (emb.competitor_max_cosine - emb.self_max_cosine) DESC`
    )
    .all(session_id);
}

/**
 * @param {object} args
 * @param {number} args.session_id      master_rewrite_session.id
 * @param {number} args.post_id         self 記事 post_id
 * @param {number} args.query_fanout_id 対象 Q[i] (NULL なら全 Q[i] 統合)
 * @returns {object} V-A-2-4 仕様の 3 系統 bundle
 */
function buildCaseCInputBundle({ session_id, post_id, query_fanout_id }) {
  if (!Number.isInteger(session_id)) throw new Error('buildCaseCInputBundle: session_id required');
  if (!Number.isInteger(post_id)) throw new Error('buildCaseCInputBundle: post_id required');

  const conn = db.open();

  // Q[i] target_query 解決
  let target_query = null;
  if (query_fanout_id != null) {
    const fanout = conn.prepare('SELECT sub_query FROM master_query_fanout WHERE id=?').get(query_fanout_id);
    if (!fanout) throw new Error(`master_query_fanout id=${query_fanout_id} not found`);
    target_query = fanout.sub_query;
  }

  // A 系統: fact-set 必須追加
  const factset = target_query
    ? loadFactsetGapSamples(conn, { post_id, target_query })
    : { rows: [], ig_id: null, total_gap_count: 0, layer3_gain_score: 0 };

  // B 系統: embedding 深度不足 Q[i]
  const shallow_queries = loadShallowQueries(conn, { session_id, query_fanout_id });

  // C 系統: embedding 深度不足 fact (factset で no-gap)
  const shallow_facts = loadShallowFacts(conn, { session_id });

  return {
    session_id,
    post_id,
    query_fanout_id: query_fanout_id ?? null,
    target_query,

    required_additions: factset.rows,            // A
    shallow_queries,                              // B
    shallow_facts,                                // C

    meta: {
      ig_score_id: factset.ig_id,
      fact_set_total_gap_count: factset.total_gap_count,
      layer3_gain_score: factset.layer3_gain_score,
      embedding_query_gap_count: shallow_queries.length,
      embedding_fact_gap_count_divergent: shallow_facts.length,
      delta_calibration: 'query_length_bucket',
    },
  };
}

module.exports = { buildCaseCInputBundle };
