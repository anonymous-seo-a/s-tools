'use strict';
/**
 * 段階A PoC: embedding 型ギャップ判定検証用 3 テーブルを IF NOT EXISTS で独立作成。
 *
 * 既存マイグレーション (master-db.js / rewrite/schema.sql) には一切手を入れない。
 * 完全 additive。ロールバックは DROP TABLE 3 文で完結。
 *
 * テーブル設計 (target spec 写像):
 *   master_passage_embedding         : passage 単位 embedding 格納 (self / competitor 同居)
 *   master_query_coverage_baseline   : Q[i] × competitor_max_cosine + δ 保存
 *   master_passage_gap               : Q[i] 単位 gap 判定 (judge_type で 2 系統並走可)
 */

function applyMigration(conn) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS master_passage_embedding (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id       INTEGER,                    -- self の場合は articles.post_id、competitor の場合は NULL
      competitor_url TEXT,                      -- self の場合は NULL、competitor の場合は URL
      source_type   TEXT NOT NULL,              -- 'self' / 'competitor'
      passage_idx   INTEGER NOT NULL,           -- source 内 passage 連番 (0 始まり)
      text          TEXT NOT NULL,
      char_count    INTEGER NOT NULL,
      embedding     BLOB NOT NULL,              -- Float32Array バイナリ
      dim           INTEGER NOT NULL,
      model         TEXT NOT NULL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      poc_run_id    TEXT NOT NULL,              -- 同一 PoC 実行を束ねる UUID/timestamp
      CHECK (source_type IN ('self', 'competitor'))
    );
    CREATE INDEX IF NOT EXISTS idx_passage_emb_run     ON master_passage_embedding(poc_run_id);
    CREATE INDEX IF NOT EXISTS idx_passage_emb_post    ON master_passage_embedding(post_id);
    CREATE INDEX IF NOT EXISTS idx_passage_emb_url     ON master_passage_embedding(competitor_url);
    CREATE INDEX IF NOT EXISTS idx_passage_emb_source  ON master_passage_embedding(source_type);

    CREATE TABLE IF NOT EXISTS master_query_coverage_baseline (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      query_fanout_id       INTEGER NOT NULL,
      competitor_max_cosine REAL NOT NULL,
      competitor_url_winner TEXT,                -- max を出した競合 URL
      competitor_passage_idx INTEGER,            -- max を出した passage idx
      delta                 REAL NOT NULL,
      model                 TEXT NOT NULL,
      created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
      poc_run_id            TEXT NOT NULL,
      notes                 TEXT,
      FOREIGN KEY (query_fanout_id) REFERENCES master_query_fanout(id)
    );
    CREATE INDEX IF NOT EXISTS idx_coverage_baseline_run    ON master_query_coverage_baseline(poc_run_id);
    CREATE INDEX IF NOT EXISTS idx_coverage_baseline_query  ON master_query_coverage_baseline(query_fanout_id);

    CREATE TABLE IF NOT EXISTS master_passage_gap (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id           INTEGER NOT NULL,
      query_fanout_id   INTEGER,                  -- Q[i] 判定の場合に NOT NULL、fact 単位判定なら NULL
      target_text       TEXT NOT NULL,            -- 判定対象テキスト (Q[i] 文 or fact 文)
      target_kind       TEXT NOT NULL,            -- 'query' / 'fact'
      fact_layer        INTEGER,                  -- target_kind='fact' のとき layer 番号
      self_max_cosine   REAL,
      competitor_max_cosine REAL,
      delta             REAL,
      gap_flag          INTEGER NOT NULL,         -- 0/1
      judge_type        TEXT NOT NULL,            -- 'embedding' / 'factset'
      model             TEXT,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      poc_run_id        TEXT NOT NULL,
      notes             TEXT,
      CHECK (target_kind IN ('query', 'fact')),
      CHECK (judge_type IN ('embedding', 'factset')),
      CHECK (gap_flag IN (0, 1)),
      FOREIGN KEY (query_fanout_id) REFERENCES master_query_fanout(id)
    );
    CREATE INDEX IF NOT EXISTS idx_passage_gap_run    ON master_passage_gap(poc_run_id);
    CREATE INDEX IF NOT EXISTS idx_passage_gap_post   ON master_passage_gap(post_id);
    CREATE INDEX IF NOT EXISTS idx_passage_gap_query  ON master_passage_gap(query_fanout_id);
    CREATE INDEX IF NOT EXISTS idx_passage_gap_judge  ON master_passage_gap(judge_type);
  `);
}

/** PoC ロールバック (テスト用、本番 cron からは呼ばない) */
function dropAll(conn) {
  conn.exec(`
    DROP TABLE IF EXISTS master_passage_gap;
    DROP TABLE IF EXISTS master_query_coverage_baseline;
    DROP TABLE IF EXISTS master_passage_embedding;
  `);
}

module.exports = { applyMigration, dropAll };
