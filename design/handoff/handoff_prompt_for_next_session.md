# 次セッション用ハンドオフプロンプト（Phase 4 MVP Phase 2 + 段階B 着手）

このファイルは、Claude Code 環境で新規セッションを開始するときに、Claudeに最初に渡すプロンプトとして使用する。

最終更新: 2026年5月21日（段階A embedding PoC 完了 + 段階B B-1 設計確定、Phase 2 進捗 6/7）
前提環境: Claude Code（s-tools/design/ 配下に全資産統合済み、s-tools/node/rewrite/ に Phase 1 完了 + Phase 2 6/7 + 段階A PoC 完了、shared/ (γ) lazy 構築 5 件済 = anthropic-adapter / intent_dimension.schema.json / serpapi-adapter / wp-structured (拡張済) / voyage-adapter）

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

完了済 (6/7):
  1. master_post_target_query             (Part 4 案A 統合)
  2. master_competitor_corpus             (Part 4 SerpApi + Part 5 fact_set_snapshot)
  3. master_fact_set                      (Part 5 LLM Layer 1〜3 同時抽出)
  4. master_information_gain_score        (Part 5 包含テスト = fact-set 系)
  5. Step A-2 master_query_fanout         (Part 3 Layer1/2 LLM 分解)
  6. master_hcu_checklist                 (2026-05-21 朝 HCU 38 項目 LLM 評価)
  7. master_article_similarity α          (2026-05-21 午後 TF-IDF bigram + cosine)

残 1: 案C LLM 実行レイヤー (Phase 2 後半山場、5〜8 日)
  ※ 案C 着手前に段階B (embedding PoC 本実装化) を完遂する方針確定

## 段階A embedding 型ギャップ判定 PoC 完了 (2026-05-21)

target spec (web Claude 指示) 「クエリファンアウト × embedding 閉合判定」を
1 記事スコープで検証。5 archetype 横断 + δ 較正改善を経て、
構造的事実「fact-set と embedding は別の問いに答えている」を発見。
二系統並列運用設計に書き直し。詳細は:
  - sessions/2026-05-21_phase4_embedding_poc.md
  - knowledge/05 V-A-2 (新節)
  - 警戒バイアス [23] (新規、カテゴリ F 概念・意味論)

## 段階B B-1 設計確定 (2026-05-21 末)

5 論点すべて Claude 推奨採用で確定:

  1. δ 較正方式            → クエリ長別バケット (-0.05 / 0.0 / +0.05)
  2. embedding 永続化       → post_id 単位永続 + 本文ハッシュ invalidate
  3. competitor passage 取得 → rank 1〜3 維持
  4. 案C プロンプト 3 系統重み付け → 段階B では別フィールド bundle のみ
  5. poc_run_id カラム      → session_id 置換 (master_rewrite_session.id FK 化)

# 段階B 作業分解 (B-2〜B-7、合計 4.5 日)

| ステップ | 内容 | 工数 |
|---|---|---|
| B-2 | テーブル本実装 (poc_run_id → session_id, content_hash 列追加) + migration | 0.5 日 |
| B-3 | embedding 永続化 (post_id × content_hash UNIQUE、変更検知 invalidate) | 1 日 |
| B-4 | δ 較正モジュール切出し (deltaForQuery を専用 module 化) | 1 日 |
| B-5 | 案C 入力 bundle API (3 系統 A/B/C 別フィールド返却) | 0.5 日 |
| B-6 | smoke 置換 (smoke-embedding-poc.js を本実装ベース再実装) | 1 日 |
| B-7 | smoke pass 確認 + 既存 smoke 非破壊検証 | 0.5 日 |

## 段階B 完了後の連鎖

  段階B 完了 → 案C LLM 実行レイヤー着手 (Phase 2 主要 7/7 達成)
       ↓
  案C プロンプト設計 (3 系統 A/B/C の重み付け含む)
       ↓
  工程6'-A (Opus 4.7 分析) + 工程6'-B (Sonnet 4.6 差分生成)
       ↓
  master_rewrite_diff (実リライト案) 生成

# プロジェクト構造 (2026-05-21 末)

s-tools/
├── design/
│   ├── CLAUDE.md
│   ├── knowledge/05_rewrite_system_design.md  ← 必読、V-A-2 二系統並列 + 警戒バイアス [23]
│   ├── sessions/                              ← 議論経緯
│   │   ├── 2026-05-05_part1〜5                (Phase 2 4.5/7 達成)
│   │   └── 2026-05-21_phase4_embedding_poc.md (段階A PoC + B-1 確定、最新)
│   └── handoff/handoff_prompt_for_next_session.md  ← このファイル
│
└── node/
    ├── shared/                                 ← (γ) lazy 構築 5 件
    │   ├── llm-adapters/anthropic-adapter.js
    │   ├── schemas/intent_dimension.schema.json
    │   ├── serpapi-adapter.js
    │   ├── wp-structured.js                    (splitToPassages 追加済)
    │   └── voyage-adapter.js                   ← 段階A で新設
    └── rewrite/
        ├── target-selection/                   (Phase 1)
        ├── query-fanout/                       (Part 3)
        ├── post-target-query/                  (Part 4)
        ├── competitor-corpus/                  (Part 4)
        ├── fact-set/                           (Part 5)
        ├── hcu-checklist/                      (2026-05-21 朝)
        ├── article-similarity/                 (2026-05-21 午後)
        ├── embedding-poc/                      ← 段階A 試験運用、段階B で本実装化
        │   ├── migration.js
        │   ├── coverage.js
        │   └── report.js
        ├── api/queue.js
        ├── batch/daily-target-selection.js
        ├── db.js
        ├── schema.sql
        └── scripts/                            (CLI runners + smoke tests)

# 新規テーブル (段階A で導入、段階B で本実装化対象)

  master_passage_embedding        ← post_id 単位永続化 (B-3)
  master_query_coverage_baseline  ← session_id 置換 (B-2)
  master_passage_gap              ← session_id 置換 (B-2)

# 警戒バイアス [1]〜[23] (knowledge/05 XIV 章で通し番号統合済)

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

## F. 概念・意味論バイアス (新カテゴリ、2026-05-21 新設)
[23] fact 概念の意味論曖昧 (網羅性軸の二系統並列)

# 進行スタイル

- 設計判断ごとにステップを分解して、Daiki に判断を仰ぐ
- 真=美の最小性テストに反する設計は提示しない
- 反証プロトコル: 主張に対する逆方向検証を必ず付記
- 戻し条件 / 警戒バイアスを明示
- 細かいコミットで履歴を残す

# 文体

- 結論先行、構造的、端的
- 根拠のない励まし、美辞麗句、冗長な前置きは余剰として削る
- 構造を示すときは図 / 箇条書き / コードブロックを優先

# 環境

- Claude Code 環境
- npm install 済み
- rewrite.db 稼働中 (cardloan 434 件 + Step A-1/A-2 smoke データ + 段階A PoC データ)
- monitor.db cardloan 434 件メタ取得済
- .env 全 9 件 (SERPAPI / GOOGLE / GA4 / GSC / WP_API × 3 / ANTHROPIC / VOYAGE)

# 最初のタスク (Daiki 確定優先順位)

1. CLAUDE.md と knowledge/05_rewrite_system_design.md V-A-2 章を読み、現状を把握
2. 直近のセッション記録を読む:
   - sessions/2026-05-21_phase4_embedding_poc.md (段階A PoC + B-1 確定、最新)
3. 段階B B-2 着手:
   - poc_run_id → session_id 置換 + content_hash 列追加の migration 設計
   - master_rewrite_session テーブルとの FK 整合性確認
   - Daiki に migration 案を提示 → 承認後実装
4. B-3 以降は B-2 完了後に順次着手

それでは B-2 から進めてください。
```

---

## 次セッション開始時の即着手用メッセージテンプレート

```text
新規セッション開始。Phase 4 段階B B-2 (テーブル本実装) 着手。

# 累積進捗 (前回 = 2026-05-21)
午前:   master_hcu_checklist 投入完了 (Phase 2 5/7)
午後:   master_article_similarity α 完了 (Phase 2 6/7)
夕方:   段階A embedding PoC 完了 (5 archetype 検証 + δ 較正)
深夜:   設計反映 + B-1 設計確定 (5 論点)

累計コミット (本日): 4
  4fc2e59 feat: master_article_similarity α 実装
  ff13e1d feat: embedding 型ギャップ判定 PoC 実装 (段階A)
  a9f70f9 docs: 段階A PoC 結果反映 (V-A-2 二系統並列 / [23])
  (本日締めコミット: B-1 確定反映)

# 本セッションの着手
段階B B-2: テーブル本実装 (poc_run_id → session_id 置換 + content_hash 追加)
工数 0.5 日。完了後 B-3 (embedding 永続化) へ進む。

# 警戒バイアス [1]〜[23] 通し番号統合済 (knowledge/05 XIV 章)
カテゴリ: A 設計判断 / B 実装過剰 / C プロンプトLLM / D 指示解釈
       E 外部API運用 / F 概念意味論 (新カテゴリ、[23] のみ)

# 最初に読み込んでほしいファイル (順番厳守)
1. ./CLAUDE.md (自動読込)
2. ./handoff/handoff_prompt_for_next_session.md
3. ./sessions/2026-05-21_phase4_embedding_poc.md (前セッション記録、最新)
4. ./knowledge/05_rewrite_system_design.md V-A-2 / XIV / XIV-A 章

# 読み込み後の最初のタスク

## タスク1: 直近 git log + 現状サマリ (3 行以内)
git log --oneline -10。3 行以内で:
  - Phase 2 進捗 6/7、段階A PoC 完了、B-1 確定
  - 本セッションのターゲット = 段階B B-2 (テーブル本実装)
  - 段階B 完了後の連鎖 = 案C LLM 実行レイヤー

## タスク2〜4: handoff の「最初のタスク」セクションに従う

判断疲労シグナル監視:
  前日 4 コミット + 大きな構造的発見 + 設計確定で認知リソース消費大。
  判断疲労シグナル検出時は強制的にセッション締めを提案。

それでは、タスク1 から開始してください。
```

---

## 補足: ハンドオフプロンプトの更新タイミング

- 段階B B-7 完了 (Phase 2 完成 7/7) で書き直し
- 案C 着手時に「学習ループ稼働フェーズ用」に書き直す
- 各セッション終了時に Claude が新しいハンドオフを生成

---

## 補足: ナレッジファイルとセッション記録の役割

| ファイル | 役割 | 更新頻度 |
|---|---|---|
| knowledge/05_rewrite_system_design.md | 設計確定事項の構造化保存 | Phase / 案 確定ごと |
| sessions/YYYY-MM-DD_*.md | 議論経緯 / 実装経緯の構造化保存 | セッションごと |
| handoff/handoff_prompt_for_next_session.md | 新規セッション継続用の起動プロンプト | Phase / MVP Phase 進行で変わるごと |
| CLAUDE.md | Claude Code 起動時の自動読込ファイル | Phase 進行で変わるごと |
| README.md | 設計ディレクトリの概要 | あまり変わらない |
| research/phase_1_research_report.md | 設計の起点リサーチ | 変わらない |

---

## 補足: Phase 4 MVP 3 Phase 戦略

```
Phase 1: 対象選定の自動化         完了 (2026-05-05 Part 1)
  実装: rewrite.db / 4軸スコア / API / UI / cron
  実工数: 9〜14日 → 実績 1 セッション

Phase 2: 自走システム本格稼働     進行中 (6/7、2026-05-21 末)
  実装: shared/ / Step A-1 / Step A-2 / HCU / 関連度α / 案C LLM 実行
  残: 案C LLM 実行レイヤー (前準備として段階B 4.5 日)
  実工数見積: 16〜25日

Phase 3: 学習ループ稼働、自走システム完成形  未着手
  実装: A/Bテスト / 関連度β/γ / Compliance / 監査レイヤー / 学習ループ
  実工数見積: 8.5〜13日

合計: 33.5〜52日 (カレンダー時間 3〜5ヶ月想定)
```
