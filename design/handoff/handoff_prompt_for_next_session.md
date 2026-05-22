# 次セッション用ハンドオフプロンプト (Phase 3 学習ループ着手前準備)

このファイルは、Claude Code 環境で新規セッションを開始するときに、Claudeに最初に渡すプロンプトとして使用する。

最終更新: 2026年5月22日 (Phase 2 完成 + 段階C C-B 完了 / Layer 2 規制レイヤー確立、次セッションは段階C A コスト圧縮 or B 残データ整備)
前提環境: Claude Code（s-tools/design/ 配下に全資産統合済み、s-tools/node/rewrite/ に Phase 2 7/7 完了 + 案C LLM 実行レイヤー (analysis-runner / diff-runner / compliance-runner / smoke-e2e) 完了）

---

## 使い方（Claude Code 環境）

Claude Code 起動時、ルート直下の `CLAUDE.md` が自動読込される。
新規チャットを開始したら、以下のテキストブロックを最初のメッセージとしてコピペで送る。

---

## ハンドオフプロンプト本文（以下をコピペ）

```
このセッションは、Daikiの「自走リライトシステム」の Phase 3 学習ループ稼働を見据えた
段階C 着手前準備のためのもの。Claude Code 環境で動作している前提。

# 現在地

## Phase 4 MVP Phase 2 完成 (7/7、2026-05-22)

Phase 2 主要実装タスク 7 件すべて完了。リライト 1 サイクル (対象選定 → 分析 → 差分生成 →
コンプライアンス) が post 11077 / qf 11 で動作する状態を確立。

完了済 (7/7):
  1. master_post_target_query                (Part 4 案A 統合)
  2. master_competitor_corpus                (Part 4 + Part 5)
  3. master_fact_set                         (Part 5 LLM Layer 1〜3)
  4. master_information_gain_score           (Part 5 包含テスト)
  5. master_query_fanout                     (Part 3 Layer1/2)
  6. master_hcu_checklist                    (案B #5)
  7. master_article_similarity α             (案B #9)

案C LLM 実行レイヤー全 6 ステップ完了:
  C-A 設計確定 (V-A-3 章、knowledge/05)
  C-B 工程6'-A Opus 4.7 分析     (analysis-runner.js)
  C-C 工程6'-B Sonnet 4.6 差分生成 (diff-runner.js)
  C-D 工程6'-C Compliance Checker (compliance-checker / runner.js)
  C-E E2E smoke 2 pass 公認版      (smoke-e2e.js)
  C-F 既存 smoke 非破壊確認 + 段階C 申し送り

段階B (embedding 二系統並列、本実装化) も完了 (B-1〜B-7、2026-05-21)。

## E2E 実測 (post 11077 / qf 11、2026-05-22)

                        Pass A (inject=false)   Pass B (inject=true)
  Opus  elapsed         43.2s                   48.1s
  Sonnet elapsed        116.2s                  180.5s
  diffs_inserted        5                       15
  diffs_rejected        2                       0
  violations (real)     0                       1 (inject)
  cost (USD)            $0.4418                 $0.5458   total $0.9876

リアル違反検出ゼロ = LLM 上流の YMYL 制約注入が機能、6'-C は安全網として動作。

# 段階C 着手前準備 (Phase 3 学習ループ稼働の前提)

knowledge/05 V-A-3-9 章を参照。優先度 A〜D の 4 カテゴリで整備:

## A. コスト圧縮 (最優先)
- Sonnet diff output 揺れ抑制 + prompt 簡素化 ($0.5/pass → $0.2/pass 目標)
- Layer 2 prompt size 圧縮 ($0.10/session → $0.05/session 目標)
- diffs_rejected 削減 (cheerio パース失敗パターン分析)
- Opus 高リスク categories 揺れ抑制

## B. データ整備 (多 post smoke + 学習ループの前提) — Layer 2 規制系完了
- ~~master_rules verified 昇格~~ → 完了 (2026-05-22 C-B-2)
- ~~Daiki 指摘 2 件 + Compliance Layer 2~~ → 完了 (2026-05-22 C-B-1〜5)
- master_post_target_query 全 cardloan 434 件拡張 (現状 2 件)
- master_query_fanout seed_query 多様化 (現状 1 seed "即日融資 比較" のみ)

## C. 検証経路の精緻化
- C-D 照合の `.text()` 抽出ベース格上げ (HTML 属性混入リスク回避)
- C-D 必須表現 / 正式表記 への対応拡張
- content_before/after の独自 JSON 化 (cheerio 失敗多発時)
- bundle 構造の重み付け

## D. 上流統合
- protected_regions の CSS class set 動的取得 (config 化)
- WordPress raw context 取得権限整備
- C-E 多 post smoke 実施 (B 完了後)

# 次セッション開始時の判定論点

1. 段階C 着手か Phase 3 直行か
   - 段階C (B データ整備) を先行する: 多 post 実測 + 学習ループ用のデータ厚みが必要
   - Phase 3 (UI 構築) を先行する: 1 セッションでも Daiki 判定 UI ができれば学習ループ開始可能
   - 並行進行する: A コスト圧縮を Claude 側で漸進、Daiki は UI 着手
2. 段階C 着手なら A (コスト) vs B (データ) のどちらから
3. Phase 3 直行なら案L (Daiki 判定 UI) の MVP スコープ確定

# プロジェクト構造 (2026-05-22 完成形)

s-tools/
├── design/
│   ├── CLAUDE.md
│   ├── knowledge/05_rewrite_system_design.md  ← 必読、V-A-2 + V-A-3 (案C 確定 13 節)
│   ├── sessions/                              ← 議論経緯
│   │   ├── 2026-05-21_phase4_embedding_poc.md (段階A PoC + B-1)
│   │   ├── 2026-05-21_stage_b_completion.md   (段階B 完了)
│   │   ├── 2026-05-21_case_c_design.md        (案C C-A 設計確定)
│   │   ├── 2026-05-22_case_c_c_implementation.md (案C C-C)
│   │   ├── 2026-05-22_case_c_d_implementation.md (案C C-D)
│   │   ├── 2026-05-22_case_c_e_implementation.md (案C C-E)
│   │   └── 2026-05-22_case_c_f_phase2_completion.md (案C C-F + Phase 2 完成宣言、最新)
│   └── handoff/handoff_prompt_for_next_session.md  ← このファイル
│
└── node/
    ├── shared/                                 ← (γ) lazy 構築 5 件
    │   ├── llm-adapters/anthropic-adapter.js
    │   ├── schemas/intent_dimension.schema.json
    │   ├── serpapi-adapter.js
    │   ├── wp-structured.js
    │   └── voyage-adapter.js
    └── rewrite/
        ├── target-selection/                   (Phase 1)
        ├── query-fanout/                       (Part 3)
        ├── post-target-query/                  (Part 4)
        ├── competitor-corpus/                  (Part 4)
        ├── fact-set/                           (Part 5)
        ├── hcu-checklist/
        ├── article-similarity/
        ├── embedding-poc/                      (段階A/B 本実装)
        │   ├── migration.js / passage-store.js / delta-calibration.js
        │   ├── case-c-bundle.js / coverage.js / report.js
        ├── llm-execution/                      ← ★ 案C 案件本丸
        │   ├── case-c-prompt.js                (工程6'-A プロンプト)
        │   ├── analysis-runner.js              (工程6'-A 実行、C-B)
        │   ├── case-c-diff-prompt.js           (工程6'-B プロンプト)
        │   ├── diff-runner.js                  (工程6'-B 実行、C-C)
        │   ├── compliance-checker.js           (純粋関数、C-D)
        │   └── compliance-runner.js            (DB ラッパ、C-D)
        ├── api/queue.js
        ├── batch/daily-target-selection.js
        ├── db.js
        ├── schema.sql
        └── scripts/                            ← smoke 17 件 (うち 5 件本セッション再 verify)
            ├── smoke-e2e.js                    ← E2E 公認版、C-E
            ├── smoke-analysis-runner.js / smoke-diff-runner.js / smoke-compliance-runner.js
            └── ... (他 13 件)

# 全 20 テーブル (rewrite.db、Phase 2 完成時点)

Phase 1: master_post_target_query / competitor_corpus / fact_set / information_gain_score
         / query_fanout / rewrite_queue / target_selection_log
Phase 2: master_rewrite_session / rewrite_diff / hcu_checklist / article_similarity
         / passage_embedding / query_coverage_baseline / passage_gap
        + (案B 由来) evidence / partner_status_history / ab_test 系
        + (Phase E 統合) rules / annotations / completeness_checklist / ymyl_requirement
        + (案D) regulation_event / audit_log / site_audit_score

# 警戒バイアス [1]〜[23] (knowledge/05 XIV 章)

A. 設計判断: [1] 既存資産過剰適応 [2] 初期推奨固着 [3] 強推奨追従 [4] 機能を盛りたくなる
            [5] テーブル単位 vs システム全体最小性
B. 実装過剰: [6] UI 過剰精緻化 [9] LLM プロンプト過剰精緻化 [10] JSON Schema 過剰汎用化
            [11] Adapter 過剰抽象化 [12] スケルトン隠れたコスト [14] 細分化暴走
            [20] fact 抽出網羅性追求
C. プロンプト/LLM 整合: [13] Google fan-out 正解探求 [15] intent_dimension 自動生成期待
            [16] YMYL 上流フィルタ怠惰 [21] LLM 出力構造化保証
D. 指示解釈・委任境界: [7] Daiki 指示 literal vs intent [8] schema 変更の判断委任境界
E. 外部 API/運用整合: [17] SerpApi コスト浪費 [18] 取得対象範囲拡大 [19] 認証情報 Git 混入
            [22] 環境変数値構造仮定
F. 概念・意味論: [23] fact 概念意味論曖昧

# 進行スタイル

- 設計判断ごとにステップを分解して、Daiki に判断を仰ぐ
- 真=美の最小性テストに反する設計は提示しない
- 反証プロトコル: 主張に対する逆方向検証を必ず付記
- 細かいコミットで履歴を残す
- Claude 推奨で進める判断委任パターンを尊重 ("推奨でOK", "進めて" など)

# 文体

- 結論先行、構造的、端的
- 根拠のない励まし、美辞麗句、冗長な前置きは余剰として削る
- 構造を示すときは図 / 箇条書き / コードブロックを優先

# 環境

- Claude Code 環境
- npm install 済み
- rewrite.db 稼働中 (cardloan 434 件メタ + Step A-1/A-2 + 段階B 本実装テーブル + 案C 完成)
- monitor.db cardloan 434 件メタ取得済
- .env 全 9 件 (SERPAPI / GOOGLE / GA4 / GSC / WP_API × 3 / ANTHROPIC / VOYAGE)

# 最初のタスク

1. CLAUDE.md と knowledge/05_rewrite_system_design.md V-A-3 章 (案C 確定 13 節) を読み、現状把握
2. 直近のセッション記録を読む:
   - sessions/2026-05-22_stage_c_b_layer2_implementation.md (段階C C-B 完了、最新)
   - sessions/2026-05-22_case_c_f_phase2_completion.md (Phase 2 完成宣言)
   - sessions/2026-05-22_case_c_e_implementation.md (案C C-E E2E)
3. Daiki に進路判定を提示:
   - 段階C A (コスト圧縮) vs B 残 (target_query / qf データ拡張) vs Phase 3 (UI MVP)
   - C-B 完了で Layer 2 規制レイヤーは確立済 → 残るのは多 post スケーリングとコスト
4. 進路確定後、最小 1 ステップ単位で分解して着手

それでは判定論点提示から進めてください。
```

---

## 補足: ハンドオフプロンプトの更新タイミング

- Phase 3 着手時に「学習ループ稼働フェーズ用」に再リライト (本ファイル更新は本セッションで実施済)
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
Phase 2: 自走システム本格稼働     完了 (7/7、2026-05-22)
Phase 3: 学習ループ稼働           未着手 (段階C 準備完了後に着手)
```
