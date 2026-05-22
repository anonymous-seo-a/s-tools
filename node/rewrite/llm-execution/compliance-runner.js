'use strict';
/**
 * 案C C-D: 工程6'-C Compliance Checker ランナー。
 *
 * 入力: session_id (master_rewrite_diff 群が INSERT 済、status='awaiting_diff_judgment')
 * 出力: master_rewrite_diff.rationale (violations 累積) / risk_flag (null→regulation_citation) 更新
 *
 * V-A-3-5 仕様:
 *   - diff.content_after を master_rules (cardloan verified、禁止表現、condition='常に') で照合
 *   - 違反検出時:
 *       rationale.compliance.violations 累積
 *       risk_flag が null → 'regulation_citation' セット (既存はそのまま)
 *   - session.status の遷移は C-E (E2E) で判定 (C-D 単独では遷移なし)
 *
 * 警戒バイアス対チェック:
 *   [10] JSON Schema 過剰汎用化: 厳密スキーマ検証なし、純粋関数に分離
 *   [11] Adapter 過剰抽象化: db 直接利用、純粋ロジックは compliance-checker.js
 *   [12] スケルトン隠れたコスト: rule cache なし (21 件、1 セッション内 1 回 SELECT)
 *   [14] 細分化暴走: 1 diff 1 UPDATE、無違反 diff は touch しない
 *   [16] YMYL 上流フィルタ怠惰: ここで最終フィルタ、上流 LLM 漏れを補完
 */

const db = require('../db');
const { checkDiffCompliance } = require('./compliance-checker');

function loadCardloanRules(conn) {
  return conn.prepare(
    `SELECT id, rule_type, ng_text, correct_text, condition, legal_basis
     FROM master_rules
     WHERE category='cardloan' AND status='verified'`
  ).all();
}

function loadSessionDiffs(conn, session_id) {
  return conn.prepare(
    `SELECT id, diff_order, target_section, change_type, change_category,
            content_before, content_after, rationale, risk_flag
     FROM master_rewrite_diff
     WHERE session_id=? ORDER BY diff_order`
  ).all(session_id);
}

/**
 * @param {object} args
 * @param {number} args.session_id
 * @returns {Promise<{
 *   session_id, rules_loaded, diffs_scanned, diffs_with_violations,
 *   total_violations, risk_flag_set_count, per_diff
 * }>}
 */
async function runComplianceCheck({ session_id }) {
  if (!Number.isInteger(session_id)) throw new Error('runComplianceCheck: session_id required');
  const conn = db.open();

  const session = conn.prepare(`SELECT id, status FROM master_rewrite_session WHERE id=?`).get(session_id);
  if (!session) throw new Error(`session ${session_id} not found`);

  const rules = loadCardloanRules(conn);
  const diffs = loadSessionDiffs(conn, session_id);
  if (diffs.length === 0) {
    throw new Error(`no diffs found for session ${session_id} (run runDiffGeneration first)`);
  }

  const updateStmt = conn.prepare(
    `UPDATE master_rewrite_diff
     SET rationale=?, risk_flag=?
     WHERE id=?`
  );

  let totalViolations = 0;
  let diffsWithViolations = 0;
  let riskFlagSetCount = 0;
  const perDiff = [];

  const tx = conn.transaction(() => {
    for (const d of diffs) {
      const res = checkDiffCompliance(
        {
          content_after: d.content_after,
          risk_flag: d.risk_flag,
          rationale: d.rationale,
        },
        rules
      );
      if (res.violations.length > 0 || res.risk_flag_changed) {
        updateStmt.run(
          JSON.stringify(res.updated_rationale),
          res.updated_risk_flag,
          d.id
        );
      }
      if (res.violations.length > 0) {
        diffsWithViolations++;
        totalViolations += res.violations.length;
      }
      if (res.risk_flag_changed) riskFlagSetCount++;
      perDiff.push({
        diff_id: d.id,
        diff_order: d.diff_order,
        target_section: d.target_section,
        violations: res.violations,
        risk_flag_before: d.risk_flag,
        risk_flag_after: res.updated_risk_flag,
      });
    }
  });
  tx();

  return {
    session_id,
    rules_loaded: rules.length,
    diffs_scanned: diffs.length,
    diffs_with_violations: diffsWithViolations,
    total_violations: totalViolations,
    risk_flag_set_count: riskFlagSetCount,
    per_diff: perDiff,
  };
}

module.exports = {
  runComplianceCheck,
  loadCardloanRules,
};
