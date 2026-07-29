'use strict';
/**
 * 案C C-B: 工程6'-A Opus 4.7 用プロンプト構築。
 *
 * V-A-3-2 analysis_output JSON 構造に従って出力するよう指示。
 * V-A-3-6 保護領域 CSS class set を明示注入。
 *
 * 設計判断 (C-B、Daiki 承認):
 *   - bundle は JSON 直接渡し (C-B-1)、Opus の構造化データ処理を信頼
 *   - bundle 要素の分類は Opus 委譲 (C-B-2)、priority + uses_bundle_refs で表現
 *   - 高リスク判定は Opus 自己申告のみ (C-B-4)
 *
 * 警戒バイアス対チェック:
 *   [9]  LLM プロンプト過剰精緻化: 動くレベル、最適化は後段
 *   [16] YMYL 上流フィルタ怠惰: master_rules 違反禁止表現をプロンプトに明示
 *   [21] LLM 出力構造化保証: JSON 出力指示 + フォーマット例示
 */

const { renderGenreConstraints } = require('./genre-config');
const keeperBridge = require('../keeper-bridge');

const PROTECTED_CLASS_PATTERNS = ['soico-cta-*', 'box-###', 'ez-toc-*'];

const SYSTEM_PROMPT = `あなたは SEO リライト分析者 (YMYL 領域)。対象ジャンルと YMYL 制約は user プロンプトの「対象ジャンル / YMYL 制約」に従う。
入力された記事と競合分析データから、リライト方針を JSON で出力する。
出力は JSON のみ、説明文・コードフェンス一切不要。

# あなたの責務
1. 記事の構造的問題を identify (structural_analysis、200〜500 字)
2. bundle (A/B/C 3 系統) を読み取り、優先順位付きの rewrite_policy を生成
3. 高リスク変更カテゴリの該当判定 (該当時のみ、空配列許容)
4. 保護領域 CSS class を認識し、保護領域に触れないことを protected_blocks_acknowledged で宣言

# bundle 3 系統の意味論 (重要)
- required_additions: 自記事に**全く存在しない**事実 (fact-set 包含テスト由来)
                      → 追加する候補
- shallow_queries:    自記事の網羅深度が競合を下回るサブクエリ (embedding 由来)
                      → 該当 Q[i] 領域を厚く書く方針
- shallow_facts:      自記事に含むが浅い事実 (embedding 深度評価由来、divergent)
                      → 該当 fact 周辺を厚く書く (新規追加ではない)

# rewrite_policy の作り方
- policy_text: 具体的なリライト方針 (例: 「総量規制の規定例を追加」)
- priority: 1 (最優先) 〜 5
- uses_bundle_refs: 該当する bundle 要素の index 配列 (整数)
- target_change_types: 想定される変更操作 (下記 9 種から複数選択可)
  rewrite_section / rewrite_paragraph / insert_after / insert_before /
  insert_evidence / delete_section / update_title / update_meta_description /
  restructure_outline
- target_change_categories: 学習用分類 (下記 8 種から複数選択可)
  title / h2_structure / evidence_insertion / schema / internal_link /
  paragraph_rewrite / compliance_update / other

# 高リスク変更カテゴリ (4 種、該当時のみ high_risk_categories に追加)
1. title_change            タイトル変更
2. major_restructure       構成大変更 (h2 順序、セクション削除)
3. regulation_citation     法令引用の修正
4. rate_update             金利・限度額・料率の更新

# YMYL 制約 (必須遵守)
対象ジャンル固有の禁止表現は user プロンプトの「対象ジャンル / YMYL 制約」に列挙する。
そこに挙がる表現は方針として絶対に提案しない。

# durability (方針も普遍的事実に限定)
株価・当日市況・特定銘柄の現在値など時間で陳腐化する情報の追加を方針にしない。
選び方の観点・制度・手順・基準など長期的に有効な網羅性向上を方針とする。
文体は既存記事を踏襲する方針とし、AI 的な冗長表現は避ける。

# confidence 自己評価
- high:   bundle 情報が豊富、明確な改善方針が立つ
- medium: 一部不明確だが大筋の方針あり
- low:    bundle が薄い or 矛盾あり、慎重判断要

# 出力 JSON フォーマット
{
  "structural_analysis": "string (200〜500 字、記事構造の評価)",
  "rewrite_policy": [
    {
      "policy_text": "string",
      "priority": 1,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": []
      },
      "target_change_types": [],
      "target_change_categories": []
    }
  ],
  "high_risk_categories": [],
  "confidence": "high",
  "protected_blocks_acknowledged": true
}`;

function buildUserPrompt({
  post_id,
  title,
  target_query,
  self_plain_text_excerpt,
  bundle,
  hcu_summary,
  similar_articles,
  master_rules,
  genre,
}) {
  const protectedRegions = PROTECTED_CLASS_PATTERNS.map((p) => `  - ${p}`).join('\n');

  const sections = [];
  sections.push(`# 対象記事
post_id: ${post_id}
title: ${title}
target_query (Q[i]): ${target_query}`);

  if (genre) sections.push(renderGenreConstraints(genre));

  // L0 (keeper-bridge): 記事に登場する商材のレギュレーション論点を予防注入。
  {
    const scanText = `${title}\n${self_plain_text_excerpt || ''}`;
    const pids = keeperBridge.detectProducts(scanText).map((p) => p.product_id);
    const regBlock = keeperBridge.renderRegulationBlock(pids, `${title} ${target_query}`);
    if (regBlock) sections.push(regBlock);
  }

  sections.push(`# 自記事 plain_text (冒頭 5000 字)
${(self_plain_text_excerpt || '').slice(0, 5000)}`);

  sections.push(`# bundle (A/B/C 3 系統)
${JSON.stringify(bundle, null, 2)}`);

  if (hcu_summary) {
    sections.push(`# HCU (Helpful Content Update) 評価
pass_rate: ${hcu_summary.pass_rate}
total: ${hcu_summary.pass_count}/${hcu_summary.total_count}
non_compliant_sample: ${JSON.stringify(hcu_summary.non_compliant_sample || [], null, 2)}`);
  }

  if (Array.isArray(similar_articles) && similar_articles.length > 0) {
    sections.push(`# 関連記事 (article_similarity α、Top-K)
${JSON.stringify(similar_articles, null, 2)}`);
  }

  if (Array.isArray(master_rules) && master_rules.length > 0) {
    sections.push(`# master_rules (表現ルール、cardloan verified)
${JSON.stringify(master_rules, null, 2)}`);
  }

  sections.push(`# 保護領域 CSS class set
以下の CSS class を持つ <div> 配下の文面は変更対象外:
${protectedRegions}
ブロック内テキストを content_before として参照する diff は生成しないこと。
ブロック外のテキスト編集に専念する方針を立てよ。`);

  sections.push(`# 指示
上記情報を統合してリライト方針を JSON 出力せよ。
- bundle.required_additions が空でも、shallow_queries / shallow_facts から方針を立てる
- HCU pass_rate が低い場合は compliance_update を含む方針も検討
- 保護領域への変更は提案禁止 (protected_blocks_acknowledged: true で宣言)`);

  return sections.join('\n\n');
}

module.exports = {
  SYSTEM_PROMPT,
  buildUserPrompt,
  PROTECTED_CLASS_PATTERNS,
};
