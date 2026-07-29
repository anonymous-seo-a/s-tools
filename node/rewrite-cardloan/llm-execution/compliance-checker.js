'use strict';
/**
 * 案C C-D: 工程6'-C Compliance Checker (純粋関数)。
 *
 * V-A-3-5 仕様:
 *   入力: diff.content_after + master_rules (cardloan verified、condition='常に')
 *   出力: violations[] / rationale.compliance 更新 / risk_flag セット指示
 *
 * 設計判断 (C-D、Claude 推奨採用):
 *   - 単純文字列 includes 照合 (case-sensitive、生文字列)
 *   - rule_type='禁止表現' のみ対象 (必須表現 / 正式表記 は段階C)
 *   - condition='常に' のみ対象 (商材言及条件は LLM 委譲、C-D 外)
 *   - 走査対象は content_after のみ (content_before は改変対象外)
 *   - risk_flag は既存が null の時のみ 'regulation_citation' に上書き
 *
 * 警戒バイアス対チェック:
 *   [10] JSON Schema 過剰汎用化: violations は { rule_id, ng_text, matched_at } の 3 フィールド
 *   [11] Adapter 過剰抽象化: 純粋関数、DB / WP 依存なし
 *   [14] 細分化暴走: 1 diff に複数 ng_text マッチしても violations 1 件/ng_text/diff
 *   [16] YMYL 上流フィルタ怠惰: ここで受け止め、C-B/C-C プロンプトでも事前注入済
 */

/**
 * 1 diff を照合し違反一覧を返す (純粋関数)。
 *
 * @param {{content_after: string|null, risk_flag: string|null, rationale: object|string}} diff
 * @param {Array<{id, ng_text, rule_type, condition, legal_basis}>} rules
 * @returns {{
 *   violations: Array<{rule_id, ng_text, legal_basis, position}>,
 *   updated_rationale: object,
 *   updated_risk_flag: string|null,
 *   risk_flag_changed: boolean,
 * }}
 */
function checkDiffCompliance(diff, rules) {
  const target = diff.content_after;
  let rationale;
  if (typeof diff.rationale === 'string') {
    try { rationale = JSON.parse(diff.rationale); } catch { rationale = {}; }
  } else if (diff.rationale && typeof diff.rationale === 'object') {
    rationale = diff.rationale;
  } else {
    rationale = {};
  }

  const violations = [];
  if (typeof target === 'string' && target.length > 0) {
    for (const r of rules) {
      if (r.rule_type !== '禁止表現') continue;
      if (r.condition && r.condition !== '常に') continue;
      if (!r.ng_text) continue;
      const pos = target.indexOf(r.ng_text);
      if (pos >= 0) {
        violations.push({
          rule_id: r.id,
          ng_text: r.ng_text,
          legal_basis: r.legal_basis || null,
          position: pos,
          detection_layer: 1, // 段階C C-B-4: Layer 1 (indexOf) マーカー
        });
      }
    }
  }

  const compliance = (rationale.compliance && typeof rationale.compliance === 'object')
    ? rationale.compliance
    : { sonnet_annotations: [], detected_violations: [], ymyl_requirements_met: [], annotations_added: [] };
  // detected_violations は累積 (既存 + 新規)、rule_id で uniq
  const prev = Array.isArray(compliance.detected_violations) ? compliance.detected_violations : [];
  const seen = new Set(prev.map((v) => v.rule_id));
  for (const v of violations) {
    if (!seen.has(v.rule_id)) {
      prev.push(v);
      seen.add(v.rule_id);
    }
  }
  compliance.detected_violations = prev;
  if (!Array.isArray(compliance.sonnet_annotations)) compliance.sonnet_annotations = [];
  if (!Array.isArray(compliance.ymyl_requirements_met)) compliance.ymyl_requirements_met = [];
  if (!Array.isArray(compliance.annotations_added)) compliance.annotations_added = [];
  const updatedRationale = { ...rationale, compliance };

  let updatedRiskFlag = diff.risk_flag ?? null;
  let riskFlagChanged = false;
  if (violations.length > 0 && updatedRiskFlag == null) {
    updatedRiskFlag = 'regulation_citation';
    riskFlagChanged = true;
  }

  return {
    violations,
    updated_rationale: updatedRationale,
    updated_risk_flag: updatedRiskFlag,
    risk_flag_changed: riskFlagChanged,
  };
}

module.exports = {
  checkDiffCompliance,
};
