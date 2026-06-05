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

const { renderGenreConstraints } = require('./genre-config');

const PROTECTED_CLASS_PATTERNS = ['soico-cta-*', 'box-###', 'ez-toc-*'];

const CHANGE_TYPES = [
  'rewrite_run',        // 本文 run の書き換え (target_section + run_index で指定)
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

const SYSTEM_PROMPT = `あなたは SEO リライト差分生成者 (YMYL 領域)。対象ジャンルと YMYL 制約は user プロンプトの「対象ジャンル / YMYL 制約」に従う。
工程6'-A の analysis_output と元記事を入力に、master_rewrite_diff JSON 配列を出力する。
出力は JSON のみ、説明文・コードフェンス一切不要。

# あなたの責務
1. 各 rewrite_policy を具体的な diff 1〜${MAX_DIFFS_PER_POLICY} 件に展開
2. 全体で最大 ${MAX_DIFFS_TOTAL} 件まで (priority 上位を優先、過剰分割禁止)
3. target_section / change_type / change_category / risk_flag を選択
4. 既存本文の書き換えは必ず change_type='rewrite_run' とし、対象を
   target_section (見出し) + run_index で指定する。content_after に新本文 HTML を生成。
   content_before は server が run_index から自動補填するため出力不要 (null)。
   - 「元記事の編集可能構造」に示された [run N] が書き換え単位。表/CTA/画像など
     【保護ブロック】は編集不可・位置固定なので絶対に書き換え対象にしない。
   - 本文を追加する場合は insert_before / insert_after (+ target_section)。
   - meta:title / meta:description は update_title / update_meta_description。
5. rationale JSON で根拠を記述 (uses_bundle_refs 由来を反映)
6. 保護ブロック (【…】) の中身を書き換える diff は生成禁止

# diff 出力スキーマ (V-A-3-3 準拠)
{
  "diffs": [
    {
      "diff_order": 1,
      "target_section": "string (見出し: 'h2#申込手順' / 'h3#1位：楽天証券' / meta: 'meta:title')",
      "run_index": "integer (rewrite_run のとき必須。元記事構造の [run N] の N)",
      "change_type": "${CHANGE_TYPES.join(' | ')}",
      "change_category": "${CHANGE_CATEGORIES.join(' | ')}",
      "content_before": "null (server が run_index から補填)",
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

# target_section 命名規約 (元記事構造の見出しと完全一致させる)
- 見出し: 'h2#<見出しテキスト>' / 'h3#<見出しテキスト>' / 'h4#<見出しテキスト>'
- meta 系: 'meta:title' / 'meta:description'
- rewrite_run は上記見出し + run_index で run を一意特定する

# YMYL 制約
対象ジャンル固有の禁止表現は user プロンプトの「対象ジャンル / YMYL 制約」に列挙する。
そこに挙がる表現を content_after に絶対に含めない (違反 diff は生成禁止)。

# 事実の durability (時間で陳腐化する情報は追加しない)
- 株価・前日比・当日の市況・時価総額・配当利回りの具体数値・特定銘柄の現在値など、
  日々変動する/すぐ古くなる値は content_after に追加しない。
- 「2026年X月時点で◯本」「現在◯社」等、時点依存で変動する集計値・件数も追加しない
  (制度上の固定値は可)。
- 特定銘柄を「おすすめ」として断定的に列挙しない (YMYL: 断定的判断の提供の禁止)。
- 追加するのは普遍的・構造的な事実のみ: 選び方の観点・判断基準、制度・ルール、手順、
  分類、用語の定義、長期的に有効な数値 (制度上の上限額等)。
- required_additions の layer1 (単語エンティティ) は概念ヒントに留める。競合固有の
  ブランド名・商品名・アプリ名・サービス名・媒体名 (例: 各社サービス名) は自記事に
  追加しない。事実・基準・制度・手順のみを取り込む。

# 文体 (既存記事を踏襲)
- content_before (元の本文) の文体・語り口・粒度・である/ですます調を踏襲する。
- 生成AIにありがちな冗長・説明調の定型表現を避ける。例: 「〜という点が重要です」
  「〜につながります」「〜を意識しましょう」「初心者がまず意識すべき理由：」のような
  説明ラベルや、当たり前の一般論の水増しを書かない。元記事の簡潔さに合わせる。

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

// run 構造ビューを LLM 提示用テキストに整形。
function renderArticleView(view, maxChars = 12000) {
  const lines = [];
  for (const s of view || []) {
    lines.push(`## ${s.target_section}`);
    for (const it of s.items) {
      if (it.kind === 'run') lines.push(`[run ${it.run_index}]\n${(it.text || '').slice(0, 1200)}`);
      else lines.push(`【保護ブロック: ${it.label}】`);
    }
    lines.push('');
  }
  return lines.join('\n').slice(0, maxChars);
}

function buildDiffUserPrompt({
  post_id,
  title,
  target_query,
  analysis_output,
  article_view,
  bundle,
  master_rules,
  genre,
  citation_sources,
}) {
  const protectedRegions = PROTECTED_CLASS_PATTERNS.map((p) => `  - ${p}`).join('\n');
  const sections = [];

  sections.push(`# 対象記事
post_id: ${post_id}
title: ${title}
target_query (Q[i]): ${target_query}`);

  if (genre) sections.push(renderGenreConstraints(genre));

  sections.push(`# analysis_output (工程6'-A Opus 4.7 出力)
${JSON.stringify(analysis_output, null, 2)}`);

  sections.push(`# 元記事の編集可能構造
[run N] = 書き換え可能な本文塊 (rewrite_run の対象、run_index=N)。
【保護ブロック】 = 再利用ブロック/CTA/画像など、編集不可・位置固定 (絶対に書き換えない)。
rewrite_run は「見出し(target_section) + run_index」で run を特定すること。

${renderArticleView(article_view)}`);

  if (Array.isArray(citation_sources) && citation_sources.length > 0) {
    const list = citation_sources.map((s) => `- [${s.type}] ${s.url}`).join('\n');
    sections.push(`# 出典源プール (引用先 URL。gov/official 優先)
追加・修正した事実を出典付きで補強する場合、下記形式で**必ず実リンク**を付ける:
<!-- wp:quote -->
<blockquote class="wp-block-quote"><!-- wp:paragraph -->
<p><a href="(下記プールのURL)" target="_blank" rel="noopener">出典: サイト名</a></p>
<!-- /wp:paragraph --></blockquote>
<!-- /wp:quote -->

【出典の絶対ルール】
- 出典・情報源に言及するなら、必ず上記形式の <a href> 実リンクにすること。
- **リンクを伴わない出典言及は禁止**。「みんかぶ等を参考に」「〜のデータによると」「〜時点」
  「出典時点：」等の、URL リンクの無いプレーンテキストの出典表記を出力してはならない。
- URL は必ず下記プールから選ぶ (創作禁止)。該当 URL が無い情報には出典に一切言及せず、
  通常の本文として書くこと (gov/official を優先的に引用)。
${list}`);
  }

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
- 既存本文の書き換え = rewrite_run + target_section + run_index (content_before は null、server 補填)
- 本文追加 = insert_before / insert_after + target_section
- 【保護ブロック】は書き換え対象にしない (run のみ対象)
- content_after は妥当な HTML 構造 (cheerio パース可能)
- analysis_output.high_risk_categories 該当の policy は対応する diff で risk_flag をセット
- 上記スキーマに従い JSON のみで応答`);

  return sections.join('\n\n');
}

module.exports = {
  SYSTEM_PROMPT,
  buildDiffUserPrompt,
  renderArticleView,
  PROTECTED_CLASS_PATTERNS,
  CHANGE_TYPES,
  CHANGE_CATEGORIES,
  RISK_FLAGS,
  MAX_DIFFS_TOTAL,
  MAX_DIFFS_PER_POLICY,
};
