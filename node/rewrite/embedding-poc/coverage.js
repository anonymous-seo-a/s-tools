'use strict';
/**
 * 段階A PoC: 競合相対カバレッジ測定 + 自記事ギャップ検出。
 *
 * 既存 cosine (TF-IDF Map 用) は流用不可のため、本モジュール内で dense 用 cosine を実装。
 * 純粋計算 (副作用なし) + DB 書込みは別関数。
 */

function cosineDense(a, b) {
  if (a.length !== b.length) throw new Error(`cosineDense: length mismatch ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * passages × queries の最大 cosine を返す。
 * @param {number[][]} passageEmbeds
 * @param {number[]} queryEmbed
 * @returns {{ max: number, argmaxIdx: number, scores: number[] }}
 */
function maxCosineOverPassages(passageEmbeds, queryEmbed) {
  let max = -Infinity;
  let argmax = -1;
  const scores = new Array(passageEmbeds.length);
  for (let i = 0; i < passageEmbeds.length; i++) {
    const s = cosineDense(passageEmbeds[i], queryEmbed);
    scores[i] = s;
    if (s > max) {
      max = s;
      argmax = i;
    }
  }
  return { max: max === -Infinity ? 0 : max, argmaxIdx: argmax, scores };
}

/**
 * Float32Array を Buffer に直列化 (better-sqlite3 BLOB 用)。
 */
function float32ToBlob(arr) {
  const f32 = arr instanceof Float32Array ? arr : Float32Array.from(arr);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

function blobToFloat32(blob) {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

module.exports = {
  cosineDense,
  maxCosineOverPassages,
  float32ToBlob,
  blobToFloat32,
};
