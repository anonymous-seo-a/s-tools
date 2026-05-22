'use strict';
/**
 * 段階C C-B-4: Compliance Checker Layer 2 (LLM パターン検出)。
 *
 * 1 diff × 1 rule = 1 LLM call (個別判定、Daiki 承認 2026-05-22)。
 * pre-filter (target_partner) で acom 等のキーワード不在時は LLM 呼出ゼロ。
 *
 * 設計判断 (C-B-3 確定):
 *   - LLM = Sonnet 4.6 (Opus は overkill、~$0.001-0.002/call)
 *   - 入力 = 1 rule + 1 diff の content_after
 *   - 出力 = { violates, evidence_snippet, severity } JSON
 *   - severity = LLM 自己評価 (high|medium|low|null)
 *   - pre-filter = target_partner キーワード存在チェック (substring match)
 *
 * 警戒バイアス対チェック:
 *   [9]  LLM プロンプト過剰精緻化: pattern_hint をそのまま渡し、LLM 判定に委譲
 *   [10] JSON Schema 過剰汎用化: 厳密 schema 検証なし、必須フィールド存在のみ
 *   [11] Adapter 過剰抽象化: 純粋関数 + Sonnet 直接、不要層なし
 *   [17] SerpApi コスト浪費 (応用): pre-filter で LLM 呼出ゼロパスを担保
 *   [21] LLM 出力構造化保証: JSON 出力指示 + 必須フィールド検証
 */

const { sonnet } = require('../../shared/llm-adapters/anthropic-adapter');

// パートナー名キーワード辞書 (拡張時はここを追加)
const PARTNER_KEYWORDS = {
  acom:    ['アコム', 'ACOM', 'Acom'],
  promise: ['プロミス', 'Promise', 'PROMISE'],
  aiful:   ['アイフル', 'AIFUL', 'Aiful'],
  mobit:   ['モビット', 'MOBIT', 'Mobit'],
};

const SYSTEM_PROMPT = `あなたは消費者金融カードローン領域の規制判定者 (YMYL)。
入力された 1 件の規則と 1 件のリライト案 (HTML) を照らし、規則違反かどうかを厳密に判定する。
出力は JSON のみ、説明文・コードフェンス一切不要。

# 判定原則
- pattern_hint に明確に該当する場合のみ violates=true
- 文言の曖昧な類似 / 部分一致だけでは violates=false (false-positive 抑制)
- 法令・契約の解釈で判断が割れる場合は violates=false、人間レビューに委ねる

# 出力スキーマ
{
  "violates": true | false,
  "evidence_snippet": "string (違反箇所を 50-100 字で抜粋、false の時は null)",
  "severity": "high" | "medium" | "low" | null,
  "reason": "string (判定の簡潔な理由、50 字以内)"
}

# severity ガイド
- high  : 具体数値・法令明示・パートナー契約違反が明確
- medium: 構造的違反、表現の意図が違反方向
- low   : 軽微な逸脱、修正で容易に回避可
- null  : violates=false の時`;

function prefilterTargetPartner(contentAfter, targetPartner) {
  if (!targetPartner) return true; // pre-filter 不要、LLM 判定へ進む
  const kws = PARTNER_KEYWORDS[targetPartner];
  if (!kws) return true; // 未知パートナー、保守的に LLM 呼出
  if (typeof contentAfter !== 'string' || contentAfter.length === 0) return false;
  return kws.some((k) => contentAfter.includes(k));
}

function buildUserPrompt({ rule, diff }) {
  return [
    `# 規則`,
    `rule_id: ${rule.id}`,
    `rule_type: ${rule.rule_type}`,
    `ng_text: ${rule.ng_text}`,
    `target_partner: ${rule.target_partner || 'null'}`,
    `condition: ${rule.condition}`,
    `legal_basis: ${rule.legal_basis || 'null'}`,
    `pattern_hint:`,
    rule.pattern_hint || '(なし)',
    ``,
    `# リライト案`,
    `diff_id: ${diff.id}`,
    `target_section: ${diff.target_section}`,
    `change_type: ${diff.change_type}`,
    `change_category: ${diff.change_category}`,
    `content_after:`,
    diff.content_after || '(null)',
    ``,
    `# 判定`,
    `上記 content_after が 上記規則の pattern_hint に該当するかを判定し、JSON 出力せよ。`,
  ].join('\n');
}

function parseLayer2Response(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let json;
  try {
    json = JSON.parse(stripped);
  } catch (e) {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`layer2 parse failed: ${e.message}`);
    try { json = JSON.parse(m[0]); } catch { throw new Error(`layer2 parse failed: ${e.message}`); }
  }
  if (typeof json.violates !== 'boolean') throw new Error('layer2: violates must be boolean');
  if (!json.violates) {
    return { violates: false, evidence_snippet: null, severity: null, reason: json.reason || '' };
  }
  return {
    violates: true,
    evidence_snippet: typeof json.evidence_snippet === 'string' ? json.evidence_snippet.slice(0, 200) : null,
    severity: ['high', 'medium', 'low'].includes(json.severity) ? json.severity : null,
    reason: json.reason || '',
  };
}

/**
 * 1 diff × 1 rule の Layer 2 判定。pre-filter スキップ時は LLM 呼出ゼロ。
 *
 * @param {object} args
 * @param {object} args.diff   { id, target_section, change_type, change_category, content_after }
 * @param {object} args.rule   { id, rule_type, ng_text, target_partner, condition, legal_basis, pattern_hint }
 * @returns {Promise<{violates, evidence_snippet, severity, reason, llm_called, usage}>}
 */
async function checkDiffRuleLayer2({ diff, rule }) {
  // pre-filter
  if (!prefilterTargetPartner(diff.content_after, rule.target_partner)) {
    return {
      violates: false,
      evidence_snippet: null,
      severity: null,
      reason: `pre-filter skip (target_partner=${rule.target_partner} 不在)`,
      llm_called: false,
      usage: null,
    };
  }

  if (typeof diff.content_after !== 'string' || diff.content_after.length === 0) {
    return {
      violates: false,
      evidence_snippet: null,
      severity: null,
      reason: 'content_after 空',
      llm_called: false,
      usage: null,
    };
  }

  const userPrompt = buildUserPrompt({ rule, diff });
  const res = await sonnet({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 512, // 出力は短い (JSON 1 件)
  });

  const parsed = parseLayer2Response(res.text);
  return { ...parsed, llm_called: true, usage: res.usage };
}

module.exports = {
  checkDiffRuleLayer2,
  prefilterTargetPartner,
  parseLayer2Response,
  buildUserPrompt,
  PARTNER_KEYWORDS,
  SYSTEM_PROMPT,
};
