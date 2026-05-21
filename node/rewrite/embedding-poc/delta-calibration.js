'use strict';
/**
 * 段階B B-4: δ 較正モジュール (V-A-2-5 規則実装)
 *
 * 段階A PoC (post 7170/11077/7196/7235/11063) で確認:
 *   - 短語クエリ (ブランド名等) は cosine baseline 高、δ=0.05 一律で偽陽性多発
 *   - クエリ長別バケット (-0.05 / 0.0 / +0.05) で post 11077/11063 の ▲ 偽陽性 8 件 → 0 件
 *
 * 設計判断 (B-4、Daiki 承認):
 *   - DELTA_BUCKETS を const で公開、運用後チューニング容易
 *   - judgeGapFlag は judge 動作を 1 関数に集約 (smoke / 本番で共通利用)
 *   - 段階C で ratio 正規化等への置換余地: judgeGapFlag をエントリポイントに統一
 *
 * 警戒バイアス対チェック:
 *   [4]  機能を盛りたくなる: bucketForQuery (ラベル返却) は debug/report 用、本番ロジック非依存
 *   [11] Adapter 過剰抽象化: モジュール内関数 3 つのみ
 *   [12] スケルトン隠れたコスト: ajv なし、入力検証は最小限
 *   [23] fact 概念意味論曖昧: judgeGapFlag.gap_flag は embedding 系の判定のみ表現
 *        (fact-set 系の包含テストは別系統、本モジュールでは扱わない)
 */

/**
 * クエリ長別 δ バケット (V-A-2-5)。
 * 段階C で運用データ蓄積後にチューニング想定。
 */
const DELTA_BUCKETS = Object.freeze([
  { max_length: 5,        delta: -0.05, label: 'short_word'   },
  { max_length: 15,       delta:  0.00, label: 'short_phrase' },
  { max_length: Infinity, delta:  0.05, label: 'full_claim'   },
]);

/**
 * バケット定義から該当バケットを返す。
 * @param {string} text
 * @returns {{ max_length: number, delta: number, label: string }}
 */
function bucketForQuery(text) {
  const len = (text || '').length;
  for (const b of DELTA_BUCKETS) {
    if (len <= b.max_length) return b;
  }
  // 到達不可 (最終バケットの max_length=Infinity)
  return DELTA_BUCKETS[DELTA_BUCKETS.length - 1];
}

/**
 * クエリ文字列から δ を算出。
 * @param {string} text
 * @returns {number} delta
 */
function deltaForQuery(text) {
  return bucketForQuery(text).delta;
}

/**
 * embedding 系 gap 判定の正準エントリポイント。
 * 段階C で ratio 正規化等への切替時はこの関数のみ書き換える。
 *
 * @param {object} args
 * @param {number} args.self_max
 * @param {number} args.comp_max
 * @param {string} args.query_text
 * @returns {{ gap_flag: 0|1, delta: number, threshold: number, bucket_label: string }}
 */
function judgeGapFlag({ self_max, comp_max, query_text }) {
  const bucket = bucketForQuery(query_text);
  const threshold = comp_max + bucket.delta;
  const gap_flag = self_max < threshold ? 1 : 0;
  return {
    gap_flag,
    delta: bucket.delta,
    threshold,
    bucket_label: bucket.label,
  };
}

module.exports = {
  DELTA_BUCKETS,
  bucketForQuery,
  deltaForQuery,
  judgeGapFlag,
};
