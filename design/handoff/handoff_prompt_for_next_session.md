# 次セッション用ハンドオフプロンプト（案C LLM 実行レイヤー着手）

このファイルは、Claude Code 環境で新規セッションを開始するときに、Claudeに最初に渡すプロンプトとして使用する。

最終更新: 2026年5月21日 (段階B 全 7 ステップ完了、案C 着手準備完了)
前提環境: Claude Code（s-tools/design/ 配下に全資産統合済み、s-tools/node/rewrite/ に Phase 2 6/7 完了 + embedding 二系統並列 本実装完了、shared/ (γ) lazy 構築 5 件済 = anthropic-adapter / intent_dimension.schema.json / serpapi-adapter / wp-structured (拡張済) / voyage-adapter）

---

## 使い方（Claude Code 環境）

Claude Code 起動時、ルート直下の `CLAUDE.md` が自動読込される。
新規チャットを開始したら、以下のテキストブロックを最初のメッセージとしてコピペで送る。

---

## ハンドオフプロンプト本文（以下をコピペ）

```
このセッションは、Daikiの「自走リライトシステム」の Phase 4 実装を継続するためのもの。
Claude Code 環境で動作している前提。

# 現在地

## Phase 4 MVP Phase 2 進捗 6/7 (2026-05-21 末時点)

Phase 2 主要実装タスク 7 件中 6/7 完了。
残 1 = 案C LLM 実行レイヤー (工程6'-A/B、本丸、実リライト案生成)。
段階B (embedding 系本実装化) が完了し、案C 着手準備が整った。

完了済 (6/7):
  1. master_post_target_query                (Part 4 案A 統合)
  2. master_competitor_corpus                (Part 4 + Part 5)
  3. master_fact_set                         (Part 5 LLM Layer 1〜3)
  4. master_information_gain_score           (Part 5 包含テスト = fact-set 系)
  5. Step A-2 master_query_fanout            (Part 3 Layer1/2)
  6. master_hcu_checklist                    (2026-05-21 朝)
  7. master_article_similarity α             (2026-05-21 午後)

残 1: 案C LLM 実行レイヤー (5〜8 日)
  前提 = 段階B (embedding 二系統並列、本実装化) 完了済

## 段階B 完了 (2026-05-21、B-1〜B-7 一気通し)

段階A PoC を「本番運用に耐える二系統並列構造」に書き直し:
  B-1 設計確定 (5 論点 Claude 推奨採用、baef663)
  B-2 テーブル本実装 (poc_run_id → session_id 置換 + content_hash、988a07a)
  B-3 passage-store 永続化レイヤ (post_id × content_hash cache、07b4e4b)
  B-4 δ 較正モジュール (DELTA_BUCKETS / judgeGapFlag、5cd891f)
  B-5 案C 入力 bundle API (3 系統 A/B/C 別フィールド、ba6d709)
  B-6 smoke 本実装ベース置換 (e4a0f6e)
  B-7 全 archetype smoke pass (本コミット)

詳細: sessions/2026-05-21_stage_b_completion.md

## 案C で使う本実装 API (段階B 所産)

```js
// 1. session 開始
const sessionId = INSERT INTO master_rewrite_session ...

// 2. 入力 bundle 取得 (3 系統)
const bundle = buildCaseCInputBundle({ session_id, post_id, query_fanout_id });
//   bundle.required_additions  ← A 系統 (fact-set 必須追加)
//   bundle.shallow_queries     ← B 系統 (embedding Q[i] 深度不足)
//   bundle.shallow_facts       ← C 系統 (embedding fact 深度不足、divergent)

// 3. embedding は cache 透過
const selfEmbed = await getOrComputeEmbeddings({ source: ..., plain_text, passages });

// 4. gap 判定は judgeGapFlag に統一
const judge = judgeGapFlag({ self_max, comp_max, query_text });
```

# 案C LLM 実行レイヤー 着手項目 (Phase 2 残 1 タスク)

## 案C 範囲 (knowledge/05 V-A-2-4 + 工程6'-A/B/C)

工程6'-A: Opus 4.7 (分析)
  入力: bundle (A/B/C 3 系統) + master_hcu_checklist + master_article_similarity α
        + master_rules (Compliance)
  出力: master_rewrite_session.analysis_output (リライト方針 JSON)
        / high_risk_categories / policy_summary

工程6'-B: Sonnet 4.6 (差分生成)
  入力: analysis_output + 元記事
  出力: master_rewrite_diff (差分パッチ JSON)

工程6'-C: Compliance 事後検証
  入力: 差分適用後 content + master_rules + master_ymyl_requirement
  出力: master_rewrite_diff.rationale.compliance に違反履歴

## 案C 設計上の論点 (着手時に判定)

| 論点 | 検討項目 |
|---|---|
| C-1 | 工程6'-A プロンプト設計 (3 系統 A/B/C の重み付け) |
| C-2 | 工程6'-B 差分生成フォーマット (JSON Patch / unified diff / 独自) |
| C-3 | ★ embedding 救出 fact のフィルタリング責務 (bundle 側 / プロンプト側) |
| C-4 | Compliance Checker 実装 (master_rules 正規表現エンジン、V-E 仕様) |
| C-5 | スコープ最小化 (smoke 1 記事 + 1 Q[i] でまず E2E 動作確認) |

# プロジェクト構造 (2026-05-21 末)

s-tools/
├── design/
│   ├── CLAUDE.md
│   ├── knowledge/05_rewrite_system_design.md  ← 必読、V-A-2 + 警戒バイアス [1]〜[23]
│   ├── sessions/                              ← 議論経緯
│   │   ├── 2026-05-05_part1〜5
│   │   ├── 2026-05-21_phase4_embedding_poc.md (段階A PoC + B-1)
│   │   └── 2026-05-21_stage_b_completion.md   (段階B 完了、最新)
│   └── handoff/handoff_prompt_for_next_session.md  ← このファイル
│
└── node/
    ├── shared/                                 ← (γ) lazy 構築 5 件
    │   ├── llm-adapters/anthropic-adapter.js
    │   ├── schemas/intent_dimension.schema.json
    │   ├── serpapi-adapter.js
    │   ├── wp-structured.js                    (splitToPassages 拡張済)
    │   └── voyage-adapter.js
    └── rewrite/
        ├── target-selection/                   (Phase 1)
        ├── query-fanout/                       (Part 3)
        ├── post-target-query/                  (Part 4)
        ├── competitor-corpus/                  (Part 4)
        ├── fact-set/                           (Part 5)
        ├── hcu-checklist/                      (2026-05-21 朝)
        ├── article-similarity/                 (2026-05-21 午後)
        ├── embedding-poc/                      ← 段階B 本実装化済
        │   ├── migration.js                    (B-2)
        │   ├── passage-store.js                (B-3)
        │   ├── delta-calibration.js            (B-4)
        │   ├── case-c-bundle.js                (B-5)
        │   ├── coverage.js
        │   └── report.js
        ├── api/queue.js
        ├── batch/daily-target-selection.js
        ├── db.js
        ├── schema.sql
        └── scripts/                            (CLI runners + smoke tests)

# 新規テーブル (段階B 本実装化済)

  master_passage_embedding         post_id × content_hash UNIQUE、永続キャッシュ
  master_query_coverage_baseline   session_id NOT NULL FK CASCADE
  master_passage_gap               session_id NOT NULL FK CASCADE、judge_type 2 系統並走

# 警戒バイアス [1]〜[23] (knowledge/05 XIV 章)

## A. 設計判断バイアス
[1] 既存資産への過剰適応  [2] 自分の初期推奨に固着  [3] 強推奨ラベルへの追従
[4] 機能を盛りたくなる    [5] テーブル単位 vs システム全体最小性

## B. 実装過剰バイアス
[6] UI 過剰精緻化  [9] LLM プロンプト過剰精緻化  [10] JSON Schema 過剰汎用化
[11] Adapter 過剰抽象化  [12] スケルトン隠れたコスト  [14] 細分化暴走
[20] fact 抽出網羅性追求

## C. プロンプト/LLM 整合バイアス
[13] Google fan-out 正解探求  [15] intent_dimension 自動生成期待
[16] YMYL 上流フィルタ怠惰  [21] LLM 出力構造化保証

## D. 指示解釈・判断委任境界バイアス
[7] Daiki 指示 literal vs intent  [8] schema 変更の判断委任境界

## E. 外部 API/運用整合バイアス
[17] SerpApi コスト浪費  [18] 取得対象範囲拡大  [19] 認証情報 Git 混入
[22] 環境変数値構造仮定

## F. 概念・意味論バイアス
[23] fact 概念の意味論曖昧 (網羅性軸の二系統並列)

# 進行スタイル

- 設計判断ごとにステップを分解して、Daiki に判断を仰ぐ
- 真=美の最小性テストに反する設計は提示しない
- 反証プロトコル: 主張に対する逆方向検証を必ず付記
- 細かいコミットで履歴を残す
- Claude 推奨で進める判断委任パターンを尊重 ("推奨でOK", "水晶でOK" など)

# 文体

- 結論先行、構造的、端的
- 根拠のない励まし、美辞麗句、冗長な前置きは余剰として削る
- 構造を示すときは図 / 箇条書き / コードブロックを優先

# 環境

- Claude Code 環境
- npm install 済み
- rewrite.db 稼働中 (cardloan 434 件 + Step A-1/A-2 + 段階B 本実装テーブル)
- monitor.db cardloan 434 件メタ取得済
- .env 全 9 件 (SERPAPI / GOOGLE / GA4 / GSC / WP_API × 3 / ANTHROPIC / VOYAGE)

# 最初のタスク

1. CLAUDE.md と knowledge/05_rewrite_system_design.md V-A-2 章を読み、現状を把握
2. 直近のセッション記録を読む:
   - sessions/2026-05-21_stage_b_completion.md (段階B 完了、最新)
   - sessions/2026-05-21_phase4_embedding_poc.md (段階A PoC + B-1 設計)
3. 案C LLM 実行レイヤー着手:
   - 案C C-1〜C-5 論点を Daiki に提示
   - C-5 (smoke 最小スコープ) から着手するのが推奨
   - 工程6'-A プロンプト設計 + 工程6'-B 差分生成フォーマット確定
4. 段階B 本実装 API (buildCaseCInputBundle / judgeGapFlag / getOrComputeEmbeddings) を流用

それでは案C 着手から進めてください。
```

---

## 補足: ハンドオフプロンプトの更新タイミング

- 案C smoke 動作後 (Phase 2 完成 7/7) で書き直し
- Phase 3 着手時に「学習ループ稼働フェーズ用」に書き直す
- 各セッション終了時に Claude が新しいハンドオフを生成

---

## 補足: ナレッジファイルとセッション記録の役割

| ファイル | 役割 | 更新頻度 |
|---|---|---|
| knowledge/05_rewrite_system_design.md | 設計確定事項の構造化保存 | Phase / 案 確定ごと |
| sessions/YYYY-MM-DD_*.md | 議論経緯 / 実装経緯の構造化保存 | セッションごと |
| handoff/handoff_prompt_for_next_session.md | 新規セッション継続用の起動プロンプト | Phase / MVP Phase 進行で変わるごと |
| CLAUDE.md | Claude Code 起動時の自動読込ファイル | Phase 進行で変わるごと |

---

## 補足: Phase 4 MVP 3 Phase 戦略

```
Phase 1: 対象選定の自動化         完了 (2026-05-05 Part 1)
Phase 2: 自走システム本格稼働     進行中 (6/7、2026-05-21 末、残 1 = 案C)
Phase 3: 学習ループ稼働           未着手
```
