'use strict';
/**
 * 案C C-C: 工程6'-B Sonnet 4.6 用 差分生成プロンプト構築。
 *
 * V-A-3-3 master_rewrite_diff レコード生成仕様に従って JSON 配列で出力。
 * V-A-3-6 保護領域 CSS class set を明示注入 (上流変更なし)。
 *
 * 設計判断 (C-C、V-A-3-3 準拠 / Daiki 承認):
 *   - analysis_output は JSON 直接渡し (C-B と同方針、構造化データ処理を Sonnet に信頼)
 *   - rewrite_policy 1 件 → diff 1〜3 件、全体上限 15 件 (粒度暴走防止)
 *   - content_before/after は HTML 文字列、cheerio パース検証は呼出側 (diff-runner)
 *   - change_type 9 種 / change_category 8 種 / risk_flag 4 種 から LLM 選択
 *
 * 警戒バイアス対チェック:
 *   [9]  LLM プロンプト過剰精緻化: 動くレベル、最適化は段階C
 *   [10] JSON Schema 過剰汎用化: enum 値はプロンプト記述のみ、ajv 不使用
 *   [14] 細分化暴走: 1 policy → 1〜3 diff / 全体 15 件上限を明示
 *   [16] YMYL 上流フィルタ怠惰: master_rules 違反禁止表現をプロンプト記述
 *   [21] LLM 出力構造化保証: JSON 出力指示 + フォーマット例示
 */

const PROTECTED_CLASS_PATTERNS = ['soico-cta-*', 'box-###', 'ez-toc-*'];

const CHANGE_TYPES = [
  'rewrite_section',
  'rewrite_paragraph',
  'insert_after',
  'insert_before',
  'insert_evidence',
  'delete_section',
  'update_title',
  'update_meta_description',
  'restructure_outline',
];

const CHANGE_CATEGORIES = [
  'title',
  'h2_structure',
  'evidence_insertion',
  'schema',
  'internal_link',
  'paragraph_rewrite',
  'compliance_update',
  'other',
];

const RISK_FLAGS = [
  'title_change',
  'major_restructure',
  'regulation_citation',
  'rate_update',
];

const MAX_DIFFS_TOTAL = 15;
const MAX_DIFFS_PER_POLICY = 3;

const SYSTEM_PROMPT = `あなたは SEO リライト差分生成者 (YMYL 領域: 消費者金融カードローン)。
工程6'-A の analysis_output と元記事を入力に、master_rewrite_diff JSON 配列を出力する。
出力は JSON のみ、説明文・コードフェンス一切不要。

# あなたの責務
1. 各 rewrite_policy を具体的な diff 1〜${MAX_DIFFS_PER_POLICY} 件に展開
2. 全体で最大 ${MAX_DIFFS_TOTAL} 件まで (priority 上位を優先、過剰分割禁止)
3. target_section / change_type / change_category / risk_flag を選択
4. content_before (既存箇所) と content_after (提案) を HTML 文字列で生成
5. rationale JSON で根拠を記述 (uses_bundle_refs 由来を反映)
6. 保護領域 CSS class set 配下は変更対象から除外

# diff 出力スキーマ (V-A-3-3 準拠)
{
  "diffs": [
    {
      "diff_order": 1,
      "target_section": "string (例: 'h2#申込手順', 'p#3-2', 'meta:title')",
      "change_type": "${CHANGE_TYPES.join(' | ')}",
      "change_category": "${CHANGE_CATEGORIES.join(' | ')}",
      "content_before": "HTML 文字列 (insert系では null 可)",
      "content_after":  "HTML 文字列 (delete系では null 可)",
      "rationale": {
        "primary_source": "fact_set_required_addition | embedding_shallow_query | embedding_shallow_fact | hcu_violation | compliance_rule",
        "bundle_refs": {
          "required_additions": [],
          "shallow_queries": [],
          "shallow_facts": []
        },
        "compliance": {
          "sonnet_annotations": [],
          "ymyl_requirements_met": [],
          "annotations_added": []
        },
        "evidence_refs": [],
        "policy_index": 0
      },
      "estimated_impact": {
        "intent_dimension": "string (任意、不明なら省略可)",
        "expected_delta": "string (任意、改善方向の簡潔記述)"
      },
      "llm_confidence": "high | medium | low",
      "risk_flag": "null | title_change | major_restructure | regulation_citation | rate_update"
    }
  ]
}

# enum 値 (厳守)
change_type   : ${CHANGE_TYPES.join(' / ')}
change_category: ${CHANGE_CATEGORIES.join(' / ')}
risk_flag     : null または ${RISK_FLAGS.join(' / ')}

# target_section 命名規約
- meta 系: 'meta:title' / 'meta:description'
- 見出し: 'h2#<見出しテキスト>' / 'h3#<見出しテキスト>' (テキスト一致を優先)
- 段落:   'p#<セクション順>-<段落順>' (例: 'p#3-2')
- 構成変更: 'outline:<対象>' (例: 'outline:section-3')

# YMYL 制約 (必須遵守、違反 diff は生成禁止)
以下の表現は content_after に絶対に含めない:
- 「無審査」「審査が甘い」「審査なし」「無条件」
- 「ブラック OK」「ブラックでも借りれる」「破産歴 OK」
- 「必ず貸します」「100% 融資」「絶対借りれる」「誰でも借りられる」
- 安易な借入を強調する表現、過度な借入意欲喚起

# risk_flag 自動判定 (LLM 自己申告)
- title_change       : change_type='update_title' または title 文言変更
- major_restructure  : change_type='restructure_outline' / 'delete_section' / h2 順序変更
- regulation_citation: 法令引用 (貸金業法 / 出資法 / 個人情報保護法 等) の追加・修正
- rate_update        : 金利・限度額・料率・無利息期間の数値更新
該当しなければ "risk_flag": null
risk_flag に change_category 値 (compliance_update / paragraph_rewrite / evidence_insertion 等) を流入させない。risk_flag は上記 4 値か null のみ。

# rationale.compliance フィールド使い分け
- sonnet_annotations[] : Sonnet が記述する自由文 (例: "master_rules: 正式表記ルール...")
- detected_violations[] は post-process (工程6'-C) 専用、Sonnet は書かない

# 保護領域 (V-A-3-6)
content_before として保護領域 (PROTECTED_REGIONS で示される CSS class 配下) のテキストを参照する diff を出力してはならない。
保護領域への変更は提案禁止。

# 制約サマリ
- diffs 配列: 全体最大 ${MAX_DIFFS_TOTAL} 件
- 1 policy 由来: 最大 ${MAX_DIFFS_PER_POLICY} 件
- HTML は妥当な構造で出力 (タグ閉じ忘れ禁止、cheerio でパース可能なこと)
- diff_order は配列内連番 1-based
- rationale.policy_index は analysis_output.rewrite_policy の 0-based index`;

function buildDiffUserPrompt({
  post_id,
  title,
  target_query,
  analysis_output,
  self_structure,
  bundle,
  master_rules,
}) {
  const protectedRegions = PROTECTED_CLASS_PATTERNS.map((p) => `  - ${p}`).join('\n');
  const sections = [];

  sections.push(`# 対象記事
post_id: ${post_id}
title: ${title}
target_query (Q[i]): ${target_query}`);

  sections.push(`# analysis_output (工程6'-A Opus 4.7 出力)
${JSON.stringify(analysis_output, null, 2)}`);

  const headings = (self_structure?.headings || []).slice(0, 50);
  sections.push(`# 元記事構造 (見出し階層、抜粋)
${JSON.stringify(headings, null, 2)}`);

  const plainExcerpt = (self_structure?.plain_text || '').slice(0, 6000);
  sections.push(`# 元記事 plain_text (冒頭 6000 字、content_before の文言根拠)
${plainExcerpt}`);

  sections.push(`# bundle snapshot (rationale.bundle_refs の index 参照元)
${JSON.stringify(bundle, null, 2)}`);

  if (Array.isArray(master_rules) && master_rules.length > 0) {
    sections.push(`# master_rules (表現ルール、cardloan verified、compliance 起点判定用)
${JSON.stringify(master_rules, null, 2)}`);
  }

  sections.push(`# 保護領域 CSS class set
以下の CSS class を持つ <div> 配下は変更対象外:
${protectedRegions}
ブロック内テキストを content_before として参照する diff を生成してはならない。`);

  sections.push(`# 指示
analysis_output.rewrite_policy 各要素を、priority 順に最大 ${MAX_DIFFS_TOTAL} 件の diff へ展開せよ。
- 1 policy → 1〜${MAX_DIFFS_PER_POLICY} 件
- content_before は元記事 plain_text と整合させる (存在する文言を抽出)
- content_after は妥当な HTML 構造 (cheerio パース可能)
- analysis_output.high_risk_categories 該当の policy は対応する diff で risk_flag をセット
- 上記スキーマに従い JSON のみで応答`);

  return sections.join('\n\n');
}

module.exports = {
  SYSTEM_PROMPT,
  buildDiffUserPrompt,
  PROTECTED_CLASS_PATTERNS,
  CHANGE_TYPES,
  CHANGE_CATEGORIES,
  RISK_FLAGS,
  MAX_DIFFS_TOTAL,
  MAX_DIFFS_PER_POLICY,
};
