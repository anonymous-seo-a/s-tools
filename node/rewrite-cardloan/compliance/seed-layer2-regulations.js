'use strict';
/**
 * 段階C C-B-2: Daiki 指摘の Layer 2 規制 2 件を master_rules に投入。
 *
 * 投入対象:
 *   1. 比較構造禁止 / 上限金利・下限金利のピック比較
 *   2. パートナー個別 / アコム × 具体的返済額シミュレーション
 *
 * 同時に: 既存 21 件 (status='draft') を verified に一括昇格 (Daiki 承認、2026-05-22)。
 *
 * idempotent: 同一 ng_text の Layer 2 規制が既に存在すれば skip。
 *
 * 警戒バイアス対チェック:
 *   [10] JSON Schema 過剰汎用化: 純粋関数として export、CLI スクリプトは別ファイル
 *   [16] YMYL 上流フィルタ怠惰: ここで domain-specific seed を確実に投入
 *   [19] 認証情報 Git 混入: なし (DB 直接アクセス、API 認証なし)
 */

const LAYER2_REGULATIONS = [
  {
    category: 'cardloan',
    product_ids: 'ALL',
    rule_type: '比較構造禁止',
    ng_text: '上限金利だけ / 下限金利だけを並べた比較表',
    correct_text: '金利範囲全体 (例: 2.5%〜18.0%) を提示、同一条件下で比較',
    condition: '常に',
    legal_basis: '景表法・業界自主規制 (誤認比較)',
    source_url: null,
    target_partner: null,
    detection_layer: 2,
    pattern_hint:
      '複数社の金利を比較する際に、上限金利のみ・または下限金利のみを抽出して並べる表現。' +
      '例: A社「18.0%」B社「17.8%」C社「15.0%」のような上限金利のみの順位表、' +
      'または「金利が低い」と謳いつつ下限金利のみを並べる構造。' +
      '各社の金利範囲全体を提示せず、片側だけを抽出して並べるパターン全般。',
  },
  {
    category: 'cardloan',
    product_ids: 'ALL',
    rule_type: 'パートナー個別',
    ng_text: 'アコムの具体的返済額シミュレーション',
    correct_text: 'アコムについては具体的な返済額計算を提示せず、公式サイト参照に留める',
    condition: 'アコム言及時',
    legal_basis: 'アコムアフィリエイト規約',
    source_url: null,
    target_partner: 'acom',
    detection_layer: 2,
    pattern_hint:
      'アコムに関して、具体的な借入金額と返済期間から月々の返済額を計算して提示する表現 (他社は許容)。' +
      '例: 「アコムで10万円を3年で返済する場合の月額は約○○円」「アコムで30万円借入時の総返済額は△△円」など、' +
      'アコム × 数値計算 × 返済額 の組合せ。シミュレーションテーブル、計算式、具体数値の提示すべて。',
  },
];

function seedLayer2Regulations(conn) {
  const result = { inserted: 0, skipped: 0 };
  const findStmt = conn.prepare(
    `SELECT id FROM master_rules
     WHERE category=? AND rule_type=? AND ng_text=? AND detection_layer=2`
  );
  const insertStmt = conn.prepare(
    `INSERT INTO master_rules
       (category, product_ids, rule_type, ng_text, correct_text, condition,
        legal_basis, source_url, target_partner, detection_layer, pattern_hint,
        status, verified_at, verified_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', date('now'), 'daiki')`
  );
  const tx = conn.transaction(() => {
    for (const r of LAYER2_REGULATIONS) {
      const exists = findStmt.get(r.category, r.rule_type, r.ng_text);
      if (exists) {
        result.skipped++;
        continue;
      }
      insertStmt.run(
        r.category,
        r.product_ids,
        r.rule_type,
        r.ng_text,
        r.correct_text,
        r.condition,
        r.legal_basis,
        r.source_url,
        r.target_partner,
        r.detection_layer,
        r.pattern_hint,
      );
      result.inserted++;
    }
  });
  tx();
  return result;
}

function promoteCardloanDraftToVerified(conn) {
  // 既存 21 件 (Layer 1) の draft を verified に一括昇格
  // detection_layer=1 のみ対象 (Layer 2 は seedLayer2Regulations で既に verified)
  const updateStmt = conn.prepare(
    `UPDATE master_rules
     SET status='verified',
         verified_at=date('now'),
         verified_by='daiki'
     WHERE category='cardloan'
       AND status='draft'
       AND detection_layer=1`
  );
  const res = updateStmt.run();
  return { promoted: res.changes };
}

module.exports = {
  LAYER2_REGULATIONS,
  seedLayer2Regulations,
  promoteCardloanDraftToVerified,
};
