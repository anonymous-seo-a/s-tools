'use strict';
/**
 * 段階B B-2 確定 schema (2026-05-21、Daiki 5 論点承認):
 *
 *   master_passage_embedding         : post_id 単位永続キャッシュ
 *                                       UNIQUE(source_key, content_hash, passage_idx)
 *                                       session 独立 (V-A-2-6 論点 2)
 *
 *   master_query_coverage_baseline   : session 単位スナップショット
 *                                       session_id NOT NULL FK CASCADE (V-A-2-6 論点 5)
 *
 *   master_passage_gap               : session 単位スナップショット
 *                                       session_id NOT NULL FK CASCADE
 *                                       judge_type で fact-set / embedding 並走
 *
 * 既存マイグレーション (master-db.js / rewrite/schema.sql) には一切手を入れない。
 * 完全 additive。
 *
 * 段階A PoC schema との差分 (破壊的):
 *   - poc_run_id TEXT  → 撤去
 *   - source_key  TEXT NOT NULL 追加 (embedding、NULL 混在 UNIQUE 問題回避)
 *   - content_hash TEXT NOT NULL 追加 (embedding、本文変更検知)
 *   - session_id INTEGER NOT NULL FK 追加 (baseline / gap)
 */

function applyMigration(conn) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS master_passage_embedding (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key    TEXT NOT NULL,
      source_type   TEXT NOT NULL,
      post_id       INTEGER,
      competitor_url TEXT,
      content_hash  TEXT NOT NULL,
      passage_idx   INTEGER NOT NULL,
      text          TEXT NOT NULL,
      char_count    INTEGER NOT NULL,
      embedding     BLOB NOT NULL,
      dim           INTEGER NOT NULL,
      model         TEXT NOT NULL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_key, content_hash, passage_idx),
      CHECK (source_type IN ('self', 'competitor'))
    );
    CREATE INDEX IF NOT EXISTS idx_pemb_source_key  ON master_passage_embedding(source_key);
    CREATE INDEX IF NOT EXISTS idx_pemb_post        ON master_passage_embedding(post_id);
    CREATE INDEX IF NOT EXISTS idx_pemb_url         ON master_passage_embedding(competitor_url);
    CREATE INDEX IF NOT EXISTS idx_pemb_hash        ON master_passage_embedding(content_hash);
    CREATE INDEX IF NOT EXISTS idx_pemb_source_type ON master_passage_embedding(source_type);

    CREATE TABLE IF NOT EXISTS master_query_coverage_baseline (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id            INTEGER NOT NULL,
      query_fanout_id       INTEGER NOT NULL,
      competitor_max_cosine REAL NOT NULL,
      competitor_url_winner TEXT,
      competitor_passage_idx INTEGER,
      delta                 REAL NOT NULL,
      model                 TEXT NOT NULL,
      created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes                 TEXT,
      FOREIGN KEY (session_id)       REFERENCES master_rewrite_session(id) ON DELETE CASCADE,
      FOREIGN KEY (query_fanout_id)  REFERENCES master_query_fanout(id)    ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_cov_baseline_session ON master_query_coverage_baseline(session_id);
    CREATE INDEX IF NOT EXISTS idx_cov_baseline_query   ON master_query_coverage_baseline(query_fanout_id);

    CREATE TABLE IF NOT EXISTS master_passage_gap (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id        INTEGER NOT NULL,
      post_id           INTEGER NOT NULL,
      query_fanout_id   INTEGER,
      target_text       TEXT NOT NULL,
      target_kind       TEXT NOT NULL,
      fact_layer        INTEGER,
      self_max_cosine   REAL,
      competitor_max_cosine REAL,
      delta             REAL,
      gap_flag          INTEGER NOT NULL,
      judge_type        TEXT NOT NULL,
      model             TEXT,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes             TEXT,
      CHECK (target_kind IN ('query', 'fact')),
      CHECK (judge_type IN ('embedding', 'factset')),
      CHECK (gap_flag IN (0, 1)),
      FOREIGN KEY (session_id)      REFERENCES master_rewrite_session(id) ON DELETE CASCADE,
      FOREIGN KEY (query_fanout_id) REFERENCES master_query_fanout(id)    ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_pgap_session ON master_passage_gap(session_id);
    CREATE INDEX IF NOT EXISTS idx_pgap_post    ON master_passage_gap(post_id);
    CREATE INDEX IF NOT EXISTS idx_pgap_query   ON master_passage_gap(query_fanout_id);
    CREATE INDEX IF NOT EXISTS idx_pgap_judge   ON master_passage_gap(judge_type);
  `);
}

/** PoC 段階 → B-2 schema 移行用: 旧テーブル DROP + 新テーブル CREATE */
function dropAndRecreate(conn) {
  conn.exec(`
    DROP TABLE IF EXISTS master_passage_gap;
    DROP TABLE IF EXISTS master_query_coverage_baseline;
    DROP TABLE IF EXISTS master_passage_embedding;
  `);
  applyMigration(conn);
}

/** ロールバック用 (B-2 schema → 完全削除) */
function dropAll(conn) {
  conn.exec(`
    DROP TABLE IF EXISTS master_passage_gap;
    DROP TABLE IF EXISTS master_query_coverage_baseline;
    DROP TABLE IF EXISTS master_passage_embedding;
  `);
}

/** content_hash 計算 (MD5 of plain_text、cache invalidation 用途) */
function contentHash(text) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(String(text || ''), 'utf8').digest('hex');
}

/** source_key 生成 */
function sourceKey({ post_id, competitor_url, source_type }) {
  if (source_type === 'self') {
    if (post_id == null) throw new Error('sourceKey: self requires post_id');
    return `post:${post_id}`;
  }
  if (source_type === 'competitor') {
    if (!competitor_url) throw new Error('sourceKey: competitor requires competitor_url');
    return `url:${competitor_url}`;
  }
  throw new Error(`sourceKey: unknown source_type=${source_type}`);
}

module.exports = { applyMigration, dropAndRecreate, dropAll, contentHash, sourceKey };
