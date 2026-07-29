'use strict';
/**
 * 段階B B-3: passage embedding 永続化レイヤ。
 *
 * V-A-2-6 論点 2 確定:
 *   post_id 単位永続 + content_hash invalidate
 *
 * 主要 API:
 *   getOrComputeEmbeddings({ source, plain_text, passages, opts })
 *     1. content_hash 計算
 *     2. SELECT WHERE source_key, content_hash
 *     3. 全 passage ヒット → DB から読込
 *     4. 部分ヒット or ミス → DELETE 既存 + Voyage embed + INSERT
 *
 *   invalidateBySource(source_key)
 *     manual cleanup (履歴含む全削除)
 *
 * 設計判断 (B-3、Daiki 承認):
 *   - ヒット判定: content_hash 一致 + passage 件数 + 連番 idx 一致
 *   - 部分ヒットは clean re-insert (混在防止、最小性)
 *   - 古い hash 自動削除しない (履歴保持、明示 invalidate のみ)
 *   - Voyage 失敗時はトランザクション ROLLBACK 相当 (better-sqlite3 transaction)
 *
 * 警戒バイアス対チェック:
 *   [4]  機能を盛りたくなる: read-only helper / batch API は作らない (必要時に追加)
 *   [11] Adapter 過剰抽象化: 関数 2 つのみ、Voyage 呼出を直接統合
 *   [22] 環境変数値構造仮定: env 参照なし、voyage-adapter 経由のみ
 */

const db = require('../db');
const { embed } = require('../../shared/voyage-adapter');
const { contentHash, sourceKey } = require('./migration');
const { float32ToBlob, blobToFloat32 } = require('./coverage');

/**
 * @param {object} args
 * @param {object} args.source                            { source_type, post_id?, competitor_url? }
 * @param {string} args.plain_text                        source 全体の plain_text (content_hash 算出元)
 * @param {Array<{idx?: number, text: string, char_count: number}>} args.passages
 * @param {object} [args.opts]                            embed() に転送
 * @returns {Promise<{
 *   source_key: string,
 *   content_hash: string,
 *   embeddings: Float32Array[],
 *   model: string,
 *   cache_hit: boolean,
 *   inserted: number,
 *   reused: number,
 *   voyage_tokens: number,
 * }>}
 */
async function getOrComputeEmbeddings({ source, plain_text, passages, opts = {} }) {
  if (!Array.isArray(passages) || passages.length === 0) {
    throw new Error('getOrComputeEmbeddings: passages required');
  }
  const sk = sourceKey(source);
  const hash = contentHash(plain_text);
  const conn = db.open();

  // 1. Cache lookup
  const cached = conn
    .prepare(
      `SELECT passage_idx, embedding, dim, model
       FROM master_passage_embedding
       WHERE source_key=? AND content_hash=?
       ORDER BY passage_idx`
    )
    .all(sk, hash);

  const fullHit =
    cached.length === passages.length &&
    cached.every((r, i) => r.passage_idx === i);

  if (fullHit) {
    return {
      source_key: sk,
      content_hash: hash,
      embeddings: cached.map((r) => blobToFloat32(r.embedding)),
      model: cached[0].model,
      cache_hit: true,
      inserted: 0,
      reused: cached.length,
      voyage_tokens: 0,
    };
  }

  // 2. 部分ヒット or 完全ミス: 既存削除 → 再計算 → 全 INSERT
  if (cached.length > 0) {
    conn
      .prepare(`DELETE FROM master_passage_embedding WHERE source_key=? AND content_hash=?`)
      .run(sk, hash);
  }

  // 3. Voyage embed
  const texts = passages.map((p) => p.text);
  const voyageRes = await embed(texts, opts);
  if (voyageRes.embeddings.length !== passages.length) {
    throw new Error(
      `voyage returned ${voyageRes.embeddings.length} embeddings for ${passages.length} passages`
    );
  }
  const f32Embeds = voyageRes.embeddings.map((e) => Float32Array.from(e));

  // 4. Insert in transaction (ROLLBACK on failure)
  const insertStmt = conn.prepare(
    `INSERT INTO master_passage_embedding
       (source_key, source_type, post_id, competitor_url, content_hash, passage_idx,
        text, char_count, embedding, dim, model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = conn.transaction(() => {
    for (let i = 0; i < passages.length; i++) {
      const p = passages[i];
      const idx = Number.isInteger(p.idx) ? p.idx : i;
      const f32 = f32Embeds[i];
      insertStmt.run(
        sk,
        source.source_type,
        source.post_id ?? null,
        source.competitor_url ?? null,
        hash,
        idx,
        p.text,
        p.char_count,
        float32ToBlob(f32),
        f32.length,
        voyageRes.model
      );
    }
  });
  tx();

  return {
    source_key: sk,
    content_hash: hash,
    embeddings: f32Embeds,
    model: voyageRes.model,
    cache_hit: false,
    inserted: passages.length,
    reused: 0,
    voyage_tokens: voyageRes.usage.total_tokens || 0,
  };
}

/**
 * 指定 source_key の全 hash を削除 (履歴含む)。
 * 自記事本文を意図的にリセットしたい場合等の manual cleanup 用途。
 * @param {string} source_key
 * @returns {number} deleted row count
 */
function invalidateBySource(source_key) {
  const conn = db.open();
  const info = conn
    .prepare(`DELETE FROM master_passage_embedding WHERE source_key=?`)
    .run(source_key);
  return info.changes;
}

module.exports = {
  getOrComputeEmbeddings,
  invalidateBySource,
};
