'use strict';
/**
 * 段階C C-B-1: master_rules schema 拡張 migration。
 *
 * 目的:
 *   - 新 rule_type ('比較構造禁止' / 'パートナー個別') を許容するため CHECK 緩和
 *   - Layer 2 (LLM パターン検出) を実装するための新列 3 件追加
 *
 * 変更点 (additive 不可なため SQLite 標準テーブル再生成):
 *   - CHECK (rule_type IN (...)) → 撤廃 (TEXT NOT NULL のみ、app-level validation)
 *   - 追加列: target_partner TEXT NULL
 *   - 追加列: detection_layer INTEGER NOT NULL DEFAULT 1
 *   - 追加列: pattern_hint TEXT NULL
 *   - 既存列 / index / 制約 (CHECK status / NOT NULL / FK 等) は完全維持
 *
 * 既存データ (21 件 cardloan) は INSERT SELECT で保全。
 * idempotent: 既に v2 適用済みなら skip。
 *
 * 警戒バイアス対チェック:
 *   [8]  schema 変更の判断委任境界: Daiki 承認済 (C-B-1 設計提示時)
 *   [10] JSON Schema 過剰汎用化: CHECK 緩和は app-level に責務移動、過剰制約撤廃
 *   [12] スケルトン隠れたコスト: 1 回限り migration、idempotent
 */

function v2Applied(conn) {
  // detection_layer 列の存在で判定
  const cols = conn.prepare(`PRAGMA table_info(master_rules)`).all();
  return cols.some((c) => c.name === 'detection_layer');
}

function applyMasterRulesV2(conn) {
  if (v2Applied(conn)) return { applied: false, reason: 'already v2' };

  conn.pragma('foreign_keys = OFF');
  const tx = conn.transaction(() => {
    conn.exec(`ALTER TABLE master_rules RENAME TO master_rules_v1`);
    conn.exec(`
      CREATE TABLE master_rules (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        category          TEXT NOT NULL,
        product_ids       TEXT NOT NULL,
        rule_type         TEXT NOT NULL,
        ng_text           TEXT NOT NULL,
        correct_text      TEXT,
        condition         TEXT NOT NULL DEFAULT '常に',
        legal_basis       TEXT,
        source_url        TEXT,
        verified_at       DATE,
        verified_by       TEXT,
        status            TEXT NOT NULL DEFAULT 'draft',
        target_partner    TEXT,
        detection_layer   INTEGER NOT NULL DEFAULT 1,
        pattern_hint      TEXT,
        created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (status IN ('draft', 'verified', 'deprecated')),
        CHECK (detection_layer IN (1, 2))
      );
    `);
    conn.exec(`
      INSERT INTO master_rules
        (id, category, product_ids, rule_type, ng_text, correct_text, condition,
         legal_basis, source_url, verified_at, verified_by, status,
         created_at, updated_at)
      SELECT
         id, category, product_ids, rule_type, ng_text, correct_text, condition,
         legal_basis, source_url, verified_at, verified_by, status,
         created_at, updated_at
      FROM master_rules_v1
    `);
    conn.exec(`DROP TABLE master_rules_v1`);
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_rules_category ON master_rules(category)`);
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_rules_status   ON master_rules(status)`);
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_rules_layer    ON master_rules(detection_layer)`);
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_rules_partner  ON master_rules(target_partner)`);
  });
  tx();
  conn.pragma('foreign_keys = ON');

  return { applied: true };
}

module.exports = {
  applyMasterRulesV2,
  v2Applied,
};
