'use strict';
/**
 * 案C C-D / 段階C C-B-4: 工程6'-C Compliance Checker ランナー (Layer 1 + Layer 2 統合)。
 *
 * 入力: session_id (master_rewrite_diff 群 INSERT 済、status='awaiting_diff_judgment')
 * 出力: master_rewrite_diff.rationale (violations 累積) / risk_flag (null→regulation_citation) 更新
 *
 * V-A-3-5 + 段階C C-B 仕様:
 *   - Layer 1 (sync, indexOf): rule_type='禁止表現' / condition='常に' / detection_layer=1
 *   - Layer 2 (async, LLM):    detection_layer=2、1 diff × 1 rule = 1 Sonnet 4.6 call
 *                               target_partner 設定時は pre-filter で LLM 呼出スキップ
 *   - 違反検出時:
 *       rationale.compliance.detected_violations 累積 (detection_layer={1,2} で区別可能、sonnet_annotations と分離)
 *       risk_flag null → 'regulation_citation' セット (既存は保持)
 *
 * 警戒バイアス対チェック:
 *   [10] JSON Schema 過剰汎用化: violations schema は extensible (detection_layer 追加のみ)
 *   [11] Adapter 過剰抽象化: Layer 1 純粋関数 + Layer 2 純粋関数 + runner 統合
 *   [12] スケルトン隠れたコスト: Layer 2 ルール 0 件なら LLM 呼出ゼロ
 *   [14] 細分化暴走: 1 diff 1 UPDATE、無違反 diff は touch しない
 *   [16] YMYL 上流フィルタ怠惰: Layer 1+2 二重ガードで上流漏れを補完
 */

const db = require('../db');
const { checkDiffCompliance } = require('./compliance-checker');
const { checkDiffRuleLayer2 } = require('../compliance/compliance-checker-layer2');

function loadLayer1Rules(conn) {
  return conn.prepare(
    `SELECT id, rule_type, ng_text, correct_text, condition, legal_basis
     FROM master_rules
     WHERE category='cardloan' AND status='verified' AND detection_layer=1`
  ).all();
}

function loadLayer2Rules(conn) {
  return conn.prepare(
    `SELECT id, rule_type, ng_text, correct_text, condition, legal_basis,
            target_partner, pattern_hint
     FROM master_rules
     WHERE category='cardloan' AND status='verified' AND detection_layer=2`
  ).all();
}

// 後方互換 alias (既存 export を維持、Layer 1 のみ)
function loadCardloanRules(conn) {
  return loadLayer1Rules(conn);
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
 * @param {boolean} [args.enableLayer2=true]   Layer 2 LLM 判定を有効化 (false で Layer 1 のみ)
 * @returns {Promise<{
 *   session_id, rules_loaded, layer1_rules, layer2_rules,
 *   diffs_scanned, diffs_with_violations, total_violations, risk_flag_set_count,
 *   layer2_llm_calls, layer2_llm_calls_skipped, layer2_usage, per_diff
 * }>}
 */
async function runComplianceCheck({ session_id, enableLayer2 = true }) {
  if (!Number.isInteger(session_id)) throw new Error('runComplianceCheck: session_id required');
  const conn = db.open();

  const session = conn.prepare(`SELECT id, status FROM master_rewrite_session WHERE id=?`).get(session_id);
  if (!session) throw new Error(`session ${session_id} not found`);

  const layer1Rules = loadLayer1Rules(conn);
  const layer2Rules = enableLayer2 ? loadLayer2Rules(conn) : [];
  const diffs = loadSessionDiffs(conn, session_id);
  if (diffs.length === 0) {
    throw new Error(`no diffs found for session ${session_id} (run runDiffGeneration first)`);
  }

  // === Phase 1: Layer 1 (sync) ===
  const layer1Results = diffs.map((d) => ({
    diff: d,
    layer1: checkDiffCompliance(
      { content_after: d.content_after, risk_flag: d.risk_flag, rationale: d.rationale },
      layer1Rules
    ),
  }));

  // === Phase 2: Layer 2 (async, 1 diff × 1 rule LLM call) ===
  const layer2HitsByDiff = new Map(); // diff_id -> Array<{rule, result}>
  let layer2LlmCalls = 0;
  let layer2LlmCallsSkipped = 0;
  const layer2Usage = { input_tokens: 0, output_tokens: 0 };

  if (layer2Rules.length > 0) {
    for (const rule of layer2Rules) {
      for (const d of diffs) {
        let r;
        try {
          r = await checkDiffRuleLayer2({ diff: d, rule });
        } catch (e) {
          // 1 件の Layer 2 判定失敗で全体停止させない (best-effort、log only)
          console.warn(`[layer2] diff=${d.id} rule=${rule.id} failed: ${e.message}`);
          continue;
        }
        if (r.llm_called) {
          layer2LlmCalls++;
          if (r.usage) {
            layer2Usage.input_tokens += r.usage.input_tokens || 0;
            layer2Usage.output_tokens += r.usage.output_tokens || 0;
          }
        } else {
          layer2LlmCallsSkipped++;
        }
        if (r.violates) {
          if (!layer2HitsByDiff.has(d.id)) layer2HitsByDiff.set(d.id, []);
          layer2HitsByDiff.get(d.id).push({ rule, result: r });
        }
      }
    }
  }

  // === Phase 3: Merge + DB UPDATE (1 transaction) ===
  const updateStmt = conn.prepare(
    `UPDATE master_rewrite_diff SET rationale=?, risk_flag=? WHERE id=?`
  );

  let totalViolations = 0;
  let diffsWithViolations = 0;
  let riskFlagSetCount = 0;
  const perDiff = [];

  const tx = conn.transaction(() => {
    for (const { diff, layer1 } of layer1Results) {
      let mergedRationale = layer1.updated_rationale;
      let mergedRiskFlag = layer1.updated_risk_flag;
      let riskFlagChanged = layer1.risk_flag_changed;
      const allViolations = [...layer1.violations];

      const l2Hits = layer2HitsByDiff.get(diff.id) || [];
      if (l2Hits.length > 0) {
        const compliance = (mergedRationale.compliance && typeof mergedRationale.compliance === 'object')
          ? mergedRationale.compliance
          : { sonnet_annotations: [], detected_violations: [], ymyl_requirements_met: [], annotations_added: [] };
        const prev = Array.isArray(compliance.detected_violations) ? compliance.detected_violations : [];
        const seen = new Set(prev.map((v) => v.rule_id));
        for (const { rule, result } of l2Hits) {
          if (seen.has(rule.id)) continue;
          const v = {
            rule_id: rule.id,
            ng_text: rule.ng_text,
            legal_basis: rule.legal_basis || null,
            detection_layer: 2,
            evidence_snippet: result.evidence_snippet,
            severity: result.severity,
            reason: result.reason,
          };
          prev.push(v);
          seen.add(rule.id);
          allViolations.push(v);
        }
        compliance.detected_violations = prev;
        if (!Array.isArray(compliance.sonnet_annotations)) compliance.sonnet_annotations = [];
        if (!Array.isArray(compliance.ymyl_requirements_met)) compliance.ymyl_requirements_met = [];
        if (!Array.isArray(compliance.annotations_added)) compliance.annotations_added = [];
        mergedRationale = { ...mergedRationale, compliance };

        // risk_flag: Layer 2 hit でも Layer 1 と同方針 (既存 null 時のみセット)
        if (mergedRiskFlag == null) {
          mergedRiskFlag = 'regulation_citation';
          riskFlagChanged = true;
        }
      }

      const hasChange = allViolations.length > 0 || riskFlagChanged;
      if (hasChange) {
        updateStmt.run(JSON.stringify(mergedRationale), mergedRiskFlag, diff.id);
      }
      if (allViolations.length > 0) {
        diffsWithViolations++;
        totalViolations += allViolations.length;
      }
      if (riskFlagChanged) riskFlagSetCount++;

      perDiff.push({
        diff_id: diff.id,
        diff_order: diff.diff_order,
        target_section: diff.target_section,
        violations: allViolations,
        layer1_count: layer1.violations.length,
        layer2_count: l2Hits.length,
        risk_flag_before: diff.risk_flag,
        risk_flag_after: mergedRiskFlag,
      });
    }
  });
  tx();

  return {
    session_id,
    rules_loaded: layer1Rules.length + layer2Rules.length,
    layer1_rules: layer1Rules.length,
    layer2_rules: layer2Rules.length,
    diffs_scanned: diffs.length,
    diffs_with_violations: diffsWithViolations,
    total_violations: totalViolations,
    risk_flag_set_count: riskFlagSetCount,
    layer2_llm_calls: layer2LlmCalls,
    layer2_llm_calls_skipped: layer2LlmCallsSkipped,
    layer2_usage: layer2Usage,
    per_diff: perDiff,
  };
}

module.exports = {
  runComplianceCheck,
  loadCardloanRules,    // 後方互換 (Layer 1)
  loadLayer1Rules,
  loadLayer2Rules,
};
