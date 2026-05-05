# 次セッション用ハンドオフプロンプト（Phase 4 MVP Phase 2 実装）

このファイルは、Claude Code 環境で新規セッションを開始するときに、Claudeに最初に渡すプロンプトとして使用する。

最終更新: 2026年5月5日 Part 5（Step A-1 完成、Phase 2 主要タスク 4.5/7 達成、警戒バイアス [1]〜[22] 通し番号統合済）
前提環境: Claude Code（s-tools/design/ 配下に全資産統合済み、s-tools/node/rewrite/ に Phase 1 完了 + Step A-2 + Step A-1 完成、shared/ (γ) lazy 構築 4 件済 = anthropic-adapter / intent_dimension.schema.json / serpapi-adapter / wp-structured (中間案)）

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

## Phase 4 MVP Phase 2 進捗 4.5/7 = Step A-1 完成 (2026-05-05 Part 5)

Phase 2 主要実装タスク 7 件中 4.5/7 完了。
Step A-1 (Information Gain) 完成 = 本日最大の山場を踏破。

Part 5 で完了した実装 (3 コミット + 1 締め):
  9a30a04 feat(rewrite): shared/wp-structured.js 実装 (cheerio 構造化抽出 中間案)
  6f2bad1 feat(rewrite): master_fact_set Layer 1〜3 投入 + competitor_corpus.fact_set_snapshot 更新
  b102f2a feat(rewrite): master_information_gain_score 計算実装 (Step A-1 完成)

Part 5 で達成された DB 状態:
  master_fact_set: 25 件 (post_id=7170、layer1=10 / layer2=15 / layer3=0)
  master_competitor_corpus.fact_set_snapshot: 3 件 UPDATE 完了 (JSON 972〜1504 bytes)
  master_information_gain_score: 1 件
    Layer 1: self=10 union=29 gap=23
    Layer 2: self=15 union=45 gap=45 (= 表現揺れ問題顕在化)
    Layer 3: self=0  union=14 gap=14 (= cardloan 監修者付き解説型の構造的特性)

Part 5 で確立されたパターン:
  - shared/ lazy 構築 4 件目 (wp-structured.js 中間案、案C 着手時に拡張予定)
  - LLM 1 コール同時抽出 (Layer 1〜3 統合プロンプト、Sonnet 4.6)
  - 完全一致差集合 + raw deltas notes JSON 保存 (axis4 と同型保険パターン)

Part 5 で確立された警戒バイアス:
  [22] 環境変数値構造仮定 (新規) - WP_API_BASE_URL の値構造を fixed assumption で
       実装、プローブで先確認すべき教訓
  全 22 件 [1]〜[22] の通し番号統合完了 (knowledge/05 XIV 章)

## 本日 5 セッション全体の累計 (2026-05-05)

```
Part 1 (朝):   Phase 4 MVP Phase 1 完了 (8 実装 + 1 締め)
Part 2 (午後): Phase 1 残課題消化 + Phase 2 着手準備 (2 実装 + 1 締め)
Part 3 (夕):   Step A-2 Query Fan-out 完了 (4 実装 + 1 締め)
Part 4 (夜):   Step A-1 着手分 + 案A 統合 (2 実装 + 1 締め)
Part 5 (深夜): Step A-1 完成 (3 実装 + 1 締め)

累計 25 コミット (実装 19 + ドキュメント 5)、main push 済
Phase 2 進捗 0/7 → 4.5/7 を 1 日で達成
```

# プロジェクト構造 (s-tools/ 配下)

s-tools/
├── design/                                ← 設計確定事項
│   ├── CLAUDE.md                          ← Claude Code 起動時自動読込
│   ├── knowledge/05_rewrite_system_design.md  ← 必読、全26テーブルSQL + 警戒バイアス [1]〜[22]
│   ├── sessions/                          ← 議論経緯記録
│   │   ├── 2026-05-05_phase4_mvp_phase1_completion.md  (Part 1)
│   │   ├── 2026-05-05_part2_phase4_phase2_preparation.md (Part 2)
│   │   ├── 2026-05-05_part3_step_a2.md   (Part 3、Step A-2 完了)
│   │   ├── 2026-05-05_part4_step_a1.md   (Part 4、Step A-1 着手分)
│   │   └── 2026-05-05_part5_step_a1_complete.md (Part 5、Step A-1 完成、最新)
│   └── handoff/handoff_prompt_for_next_session.md  ← このファイル
│
└── node/                                  ← 実装本体
    ├── shared/                            ← (γ) lazy 構築 4 件済
    │   ├── llm-adapters/anthropic-adapter.js  (Part 3)
    │   ├── schemas/intent_dimension.schema.json (Part 3)
    │   ├── serpapi-adapter.js             (Part 4)
    │   └── wp-structured.js               (Part 5 中間案)
    └── rewrite/
        ├── target-selection/              (Phase 1 完了、4 軸統合)
        ├── query-fanout/                  (Part 3 Step A-2)
        ├── post-target-query/             (Part 4 案A GSC)
        ├── competitor-corpus/             (Part 4 SerpApi)
        ├── fact-set/                      (Part 5 Step A-1 後半)
        │   ├── extract.js
        │   └── ig-score.js
        ├── api/queue.js
        ├── batch/daily-target-selection.js
        └── scripts/                       (CLI runners + smoke tests)

# Phase 2 残 2.5 タスクの推奨優先順位 (Part 5 末で確定)

| # | タスク | 依存 | 状態 | 工数 | 推奨 |
|---|---|---|---|---|---|
| 1 | master_post_target_query (案D 2.A) | 案A | ✓ 完了 (Part 4) | - | - |
| 2 | master_competitor_corpus (Step A-1) | SerpApi | ✓ 完了 (Part 4 + Part 5) | - | - |
| 3 | master_fact_set (Step A-1) | wp-structured | ✓ 完了 (Part 5) | - | - |
| 4 | master_information_gain_score (Step A-1) | 2+3 | ✓ 完了 (Part 5) | - | - |
| 5 | Step A-2 Query Fan-out | LLM Adapter | ✓ 完了 (Part 3) | - | - |
| 6 | master_hcu_checklist (案B # 5) | LLM Adapter | 未着手 | 1〜2 日 | **★優先1** |
| 7 | master_article_similarity α (案B # 9) | なし | 未着手 | 1 日 | ★優先2 |
| - | 一括投入バッチ実装 | 1+2 | 未着手 | 2〜3 日 | 優先3 |
| - | 表現揺れ吸収拡張 (Layer 2 gap=45) | 3 | 未着手 | 1〜2 日 | 優先4 |
| - | 案C LLM 実行レイヤー (工程6'-A/B) | 全 7/7 | 未着手 | 5〜8 日 | 優先5 |

## 次セッション着手候補 (Daiki に提示する 4 案)

(A) master_hcu_checklist (案B # 5、軽量・独立) [★ Claude 推奨]
    - HCU 22 項目を Google 公式 (Helpful Content Update Q&A) から再取得
    - LLM (Sonnet 4.6) で per-post 評価 → master_hcu_checklist に投入
    - 依存なし、本日確立 shared/llm-adapters/ パターンの応用
    - 工数 1〜2 日、Phase 2 主要 5/7 達成
    - 警戒バイアス [9][10][11][12][14][20][21] (LLM 関連) を継続適用

(B) master_article_similarity α (案B # 9、軽量・独立)
    - text_similarity (TF-IDF or embedding) per (source_post, target_post)
    - Top-K (20〜50) ペアを格納
    - Phase 2 段階では α のみ、β/γ は Phase 3
    - 工数 1 日、Phase 2 主要 6/7 達成

(C) 一括投入バッチ実装 (本格運用基盤)
    - 全 cardloan 434 記事 → master_post_target_query (GSC API レート制限 3 req/sec)
    - 全 Layer1 sub_query (10 件) → master_competitor_corpus (SerpApi クォータ管理)
    - dry-run / --force / 24h 冪等性 (Phase 1 daily-target-selection.js 同パターン)
    - 工数 2〜3 日、Phase 2 主要進捗には反映されないが本格運用基盤
    - 警戒バイアス [17][18][19] (外部 API/運用) を継続適用

(D) 表現揺れ吸収拡張 (Layer 2 gap=45 問題)
    - 完全一致では gap_count が過大計上 (Layer 2 gap=45 = union 全数)
    - 「アコム実質年率 3.0〜18.0%」と「アコム 実質年率: 3.0%-18.0%」が別 fact
    - 意味的一致 (LLM 判定) または embedding 類似度に拡張
    - 工数 1〜2 日、Step A-1 完成度向上
    - 既存 master_fact_set データから raw deltas notes JSON 経由で再計算

## 推奨理由 (Part 5 末で記録)

- (A) master_hcu_checklist が最も独立性高く、本日確立パターンの応用で完走しやすい
- Phase 2 主要 7/7 達成のため (A) → (B) の順で攻めるのが最効率
- (C) 一括投入バッチは Phase 2 主要数値に反映されないが本格運用前に必要
- (D) 表現揺れ吸収は Step A-1 完成度を上げるが、smoke スコープでは支障なし
- 案C LLM 実行レイヤー (Phase 2 後半山場) は (A)+(B) 完了後に着手

## shared/ ディレクトリ方針 (Part 2 で (γ) 確定、Part 3〜5 で検証成功)

(γ) lazy 構築方針: 必要時のみ追加。Part 5 末時点で 4 件構築済。

Part 6 着手時に追加が想定される shared/ 構成:
  shared/article-context.js                 ← 案C LLM 実行レイヤー時
  shared/llm-adapters/openai-adapter.js     ← 任意、必要時
  shared/llm-adapters/gemini-adapter.js     ← 任意、必要時
  shared/archive-adapters/*                 ← Phase 3 で追加

# 警戒バイアス [1]〜[22] (knowledge/05 XIV 章で通し番号統合済)

## A. 設計判断バイアス
[1] 既存資産への過剰適応 (案E)
[2] 自分の初期推奨に固着 (案D)
[3] 強推奨ラベルへの追従 (案B)
[4] 機能を盛りたくなる (案B)
[5] テーブル単位 vs システム全体最小性 (案B)

## B. 実装過剰バイアス
[6]  UI 仕様の過剰精緻化 (Phase 3)
[9]  LLM プロンプト過剰精緻化 (Part 3、Part 5 再警戒)
[10] JSON Schema 過剰汎用化 (Part 3)
[11] Adapter 層の過剰抽象化 (Part 3)
[12] スケルトン作成隠れたコスト (Part 3)
[14] 細分化暴走 (Part 3)
[20] fact 抽出網羅性追求 (Part 5)

## C. プロンプト/LLM 整合バイアス
[13] Google fan-out 正解探求 (Part 3)
[15] intent_dimension 自動生成期待 (Part 3)
[16] YMYL 上流フィルタ怠惰 (Part 3、新規確立)
[21] LLM 出力構造化保証 (Part 5)

## D. 指示解釈・判断委任境界バイアス
[7] Daiki 指示の literal vs intent (Phase 4 Part 1)
[8] schema 変更の判断委任境界 (Phase 4 Part 1)

## E. 外部 API/運用整合バイアス
[17] SerpApi コスト浪費 (Part 4)
[18] 取得対象範囲拡大 (Part 4)
[19] 認証情報 Git 混入リスク (Part 4)
[22] 環境変数値構造仮定 (Part 5、新規確立)

# Phase 2 で発見した構造的事実 (knowledge/05 XIV-A 章)

1. cardloan アフィリ記事の Layer 3 (First-hand experience) 限定性
   → 案C 工程6'-A 分析で「実体験コンテンツ追加」を方針候補に組み込む根拠データ

2. Layer 2 表現揺れ問題
   → 完全一致では gap_count 過大計上、意味的一致拡張の必要性確定 (優先4)

3. 環境変数値構造仮定問題 (構造化原則)
   → shared/ 系の env 参照は「含有判定で吸収する設計」を推奨

# 進行スタイル (Phase 1〜5 で確立、継続推奨)

- 設計判断ごとにステップを分解して、Daiki に判断を仰ぐ
- インプット / アウトプットを明確に定めてパーツごとに動くように設計
- 真=美の最小性テストに反する設計は提示しない
- 反証プロトコル: 主張に対する逆方向検証を必ず付記
- 戻し条件 / 警戒バイアスを Daiki 指示で明示してもらい、Claude が判断委任で進行
- 細かいコミットで履歴を残す (本日 5 セッション 25 コミット、各コミットメッセージに
  設計判断 / 検証結果 / 警戒バイアス対チェック / 戻し情報を含めた)

# 文体

- 結論先行、構造的、端的
- 根拠のない励まし、美辞麗句、冗長な前置きは余剰として削る
- 構造を示すときは図 / 箇条書き / コードブロックを優先
- 反証プロトコル: 主張に対する逆方向検証を必ず付記

# 環境について

このセッションは Claude Code 環境で動作。
- ファイル直接読み込み可能 (s-tools/ 全配下)
- shell 実行可能、node スクリプト直接起動可能
- npm install 済み (node/ + node/client/、Phase 1 で実施)
- rewrite.db は dev 環境で稼働中 (cardloan 434 件 + Step A-1 smoke データ)
- monitor.db: cardloan 434 件メタ取得済 (案C)、本番 metrics は案A で並行
- 案A 認証情報整備済 (.env: SERPAPI_API_KEY / GOOGLE_APPLICATION_CREDENTIALS /
  GA4_PROPERTY_ID / GSC_PROPERTY_URL / WP_API_BASE_URL / WP_API_USERNAME /
  WP_API_APP_PASSWORD / ANTHROPIC_API_KEY 全 8 件)

# 最初のタスク (Daiki 確定優先順位に従う、Part 5 末で encode)

1. CLAUDE.md と knowledge/05_rewrite_system_design.md を読み込み、現状を把握
2. 直近のセッション記録を読み、進行スタイルと判断構造を吸収:
   - sessions/2026-05-05_part5_step_a1_complete.md (Part 5、最新、Step A-1 完成)
3. Part 5 末状態 + Daiki 確定優先順位を Daiki に確認
4. ★ Step 1: 次の作業 4 案を Daiki に提示 + 推奨提示
   (A) master_hcu_checklist (案B # 5、軽量・独立、★ Claude 推奨)
   (B) master_article_similarity α (案B # 9、軽量・独立)
   (C) 一括投入バッチ実装 (本格運用基盤)
   (D) 表現揺れ吸収拡張 (Layer 2 gap=45 問題)

   推奨理由 (Part 5 末で記録):
   - (A) は Phase 2 残タスクで最も独立性高く、本日確立 shared/ + LLM Adapter パターン応用
   - (A) は Phase 2 主要 5/7 達成 = (B) と組み合わせて 6/7 達成可
   - (C) は本格運用基盤、Phase 2 主要数値には反映されない
   - (D) は Step A-1 完成度向上、smoke スコープでは支障なし

5. Daiki 判断 → 即着手

それでは Step 1 から進めてください。
```

---

## 次セッション開始時の即着手用メッセージテンプレート

新規セッション開始時、Daiki が即着手できる形で以下をコピペ:

```text
新規セッション開始。Phase 4 Part 6 (Phase 2 残 2.5 タスク着手)。

# 累積進捗 (前日 = 2026-05-05)
Part 1 (朝):   Phase 4 MVP Phase 1 完了 (9 コミット)
Part 2 (午後): Phase 1 残課題消化 + Phase 2 着手準備 (3 コミット)
Part 3 (夕):   Step A-2 Query Fan-out 完了 (5 コミット)
Part 4 (夜):   Step A-1 着手分 + 案A 統合 (3 コミット)
Part 5 (深夜): Step A-1 完成 (4 コミット)

累計 25 コミット (実装 19 + ドキュメント 6)、main push 済
Phase 2 進捗 4.5/7

# 本セッションの推奨着手
優先1: master_hcu_checklist (軽量・独立、Phase 2 主要 5/7 達成)
       LLM のみで完結、本日確立 shared/llm-adapters/ パターン応用
       工数 1〜2 日

# 警戒バイアス [1]〜[22] 通し番号統合済 (knowledge/05 XIV 章)
カテゴリ: A 設計判断 / B 実装過剰 / C プロンプトLLM / D 指示解釈 / E 外部API運用

# 最初に読み込んでほしいファイル (順番厳守)
1. ./CLAUDE.md (自動読込)
2. ./handoff/handoff_prompt_for_next_session.md
3. ./sessions/2026-05-05_part5_step_a1_complete.md (前セッション記録、最新)
4. ./knowledge/05_rewrite_system_design.md V-A / XIV / XIV-A / XV 章

# 軽く参照
- ./node/shared/llm-adapters/anthropic-adapter.js (本日確立パターン)
- ./node/rewrite/fact-set/extract.js (LLM 1 コール同時抽出パターン)
- ./node/rewrite/fact-set/ig-score.js (完全一致差集合 + raw deltas パターン)

# 読み込み後の最初のタスク

## タスク1: 直近 git log + 現状サマリ (3 行以内)
git log --oneline -10 で前 5 セッションのコミットを確認。
3 行以内で:
  - Phase 1 完了 + Step A-2 完了 + Step A-1 完成 = Phase 2 進捗 4.5/7
  - 本日確立の 3 パターン (shared/ lazy / LLM 1 コール同時抽出 / raw deltas notes JSON)
  - 本セッションのターゲット = master_hcu_checklist (案B # 5、軽量・独立)

## タスク2〜4: handoff の「最初のタスク」セクションに従う

判断疲労シグナル監視:
  本日 5 セッション目で累計 25 コミット既達成。
  判断疲労シグナル検出時は強制的にセッション締めを提案:
    - 一語短答化
    - 「とりあえず」「適当に」等の判断放棄ワード
    - 反応時間の遅延

それでは、タスク1 から開始してください。
```

---

## 補足: ハンドオフプロンプトの更新タイミング

このプロンプトは Phase / MVP Phase を進めるごとに陳腐化する。以下のタイミングで Daiki が更新する:

- MVP Phase 2 が完了したら、「現在地」「進行順序」を更新
- MVP Phase 3 着手時に、本ハンドオフを「学習ループ稼働フェーズ用」に書き直す
- 各セッション終了時に Claude が新しいハンドオフプロンプトを生成し、それで上書きする運用

---

## 補足: ナレッジファイルとセッション記録の役割の違い

| ファイル | 役割 | 更新頻度 |
|---|---|---|
| knowledge/05_rewrite_system_design.md | 設計確定事項の構造化保存 | Phase / 案 確定ごと |
| sessions/YYYY-MM-DD_*.md | 議論経緯 / 実装経緯の構造化保存 | セッションごと |
| handoff/handoff_prompt_for_next_session.md | 新規セッション継続用の起動プロンプト | Phase / MVP Phase 進行で変わるごと |
| CLAUDE.md | Claude Code 起動時の自動読込ファイル | Phase 進行で変わるごと |
| README.md | 設計ディレクトリの概要 | あまり変わらない |
| research/phase_1_research_report.md | 設計の起点リサーチ | 変わらない (Phase 1 完了済み) |

---

## 補足: Phase 4 MVP 3 Phase 戦略 (knowledge/05 第XI章)

```
Phase 1: 対象選定の自動化         完了 (2026-05-05 Part 1)
  実装: rewrite.db / 4軸スコア / API / UI / cron
  実工数: 9〜14日 → 実績 1セッション (集中作業)

Phase 2: 自走システム本格稼働     進行中 (4.5/7、2026-05-05 Part 5 末)
  実装: shared/ / Step A-1 完成 / Step A-2 完成 / HCU / 案C LLM 実行 / 関連度α
  実工数見積: 16〜25日

Phase 3: 学習ループ稼働、自走システム完成形  未着手
  実装: A/Bテスト / 関連度β/γ / Compliance / 監査レイヤー / 学習ループ
  実工数見積: 8.5〜13日

合計: 33.5〜52日 (カレンダー時間 3〜5ヶ月想定)
```
