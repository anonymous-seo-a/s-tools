# 次セッション用ハンドオフプロンプト（Phase 4 MVP Phase 2 実装）

このファイルは、Claude Code 環境で新規セッションを開始するときに、Claudeに最初に渡すプロンプトとして使用する。

最終更新: 2026年5月5日（Phase 4 MVP Phase 1 完了 / Phase 2 着手前）
前提環境: Claude Code（s-tools/design/ 配下に全資産統合済み、s-tools/node/rewrite/ に Phase 1 実装済み）

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

## Phase 4 MVP Phase 1 完了 (2026-05-05)
対象選定の自動化が一通り稼働可能状態。8 タスク完了。

8 コミット (新しい順):
  0896bfe feat(rewrite): MVP Phase 1 日次バッチ cron 配線 + 冪等性設計
  86e846e feat(rewrite): MVP Phase 1 リライトキュー UI 実装
  f5b3c09 feat(rewrite): MVP Phase 1 対象選定 API エンドポイント実装
  1d6cb62 feat(rewrite): MVP Phase 1 軸1 プレースホルダ実装
  0cac7f5 feat(rewrite): MVP Phase 1 軸4 Content decay スコア実装
  39067cb feat(rewrite): MVP Phase 1 軸3 鮮度スコア実装
  325129c feat(rewrite): MVP Phase 1 軸2 経済合理性スコア実装
  18c9a0d feat(rewrite): Phase 4 足場作成 - rewrite.db スキーマ DDL

## 完了した実装範囲
- rewrite.db 構築完了 (26テーブル DDL 適用済)
- 軸2 経済合理性スコア実装 (impressions × position_gap_factor)
- 軸3 鮮度スコア実装 (wp_modified からの経過月数)
- 軸4 Content decay スコア実装 (recent_28d vs prev_28d 3指標差分)
- 軸1 placeholder 実装 (NULL 投入、Phase 2 で本実装に切替)
- 対象選定 API 5エンドポイント (Smoke 15/15 pass)
- 簡易 UI (4軸タブ + ステータス別表示 + 手動キュー登録、build pass)
- 日次バッチ + cron 配線 (24h 冪等性 + 5/5 動作検証 pass)

## 実装で発見した補正事項 (Phase 2 着手時に踏襲必要)

### 1. パス不整合
軸1 だけ node/rewrite/target-selection/、軸2/3/4 は node/rewrite/scoring/ 配下。
Phase 4 中盤の refactor タスクとして繰越。Phase 2 着手時は新ファイルを
どちらに置くか先に判断する必要あり (推奨: 全 axis を target-selection/ に統一、
Phase 2 で本実装する axis1 と同居させる方が真=美)。

### 2. 軸4 重み付け {click: 1.0, impressions: 1.0, position: 0.1}
Phase 1 で確定した重み。score_components に raw deltas 全保存しているため
運用後の再調整は SQL UPDATE で可能。Phase 2 では再計算不要 (世代管理)。

### 3. 軸4 fixture の窓ずれ
dev-seed-monitor-fixture の prev 窓 (42日) と axis4 仕様 (28日) のずれ。
計算ロジックは仕様通りで動作。fixture を 56日揃えに直すか別途判断 (低優先)。

### 4. 24h 冪等性は MAX(calculated_at) 単一参照
軸ごとの最終実行時刻不整合 (例: axis2 のみ手動実行後の cron 起動) は検知できない。
Phase 1 では運用上問題なし。Phase 2 以降に軸別 last_run が必要なら再設計。

### 5. master_rewrite_target_score.score_value: NOT NULL 解除済み
軸1 placeholder (NULL) 投入のための schema 変更。本番 DB 未存在のため
migration 不要。Phase 2 で軸1 本実装時は UPDATE で値書き込み可能。

### 6. monitor.db 未存在環境では graceful fallback
Phase 2 着手時、本番 monitor.db との接続確認が必須。dev 環境では
node/rewrite/scripts/dev-seed-monitor-fixture.js で再現可能 (5記事 × 70日)。

# プロジェクト構造 (s-tools/ 配下)

s-tools/
├── design/                                ← 設計確定事項 (本セッション用)
│   ├── CLAUDE.md                          ← Claude Code 起動時自動読込
│   ├── knowledge/05_rewrite_system_design.md  ← 必読、全26テーブルSQL含む
│   ├── sessions/                          ← 議論経緯記録
│   │   ├── 2026-05-01_phase3_doten*.md   ← Phase 3 論点0〜5 確定記録
│   │   └── 2026-05-05_phase4_mvp_phase1_completion.md  ← Phase 1 完了総括
│   └── handoff/handoff_prompt_for_next_session.md  ← このファイル
│
└── node/                                  ← 実装本体
    ├── rewrite/                           ← Phase 4 実装 (Phase 1 完了)
    │   ├── db.js                          ← rewrite.db 接続 + ATTACH monitor
    │   ├── schema.sql                     ← 26テーブル DDL (canonical)
    │   ├── scoring/                       ← 軸2/3/4 計算 (パス不整合の片側)
    │   │   ├── axis2.js
    │   │   ├── axis3.js
    │   │   └── axis4.js
    │   ├── target-selection/              ← 軸1 placeholder (パス不整合の片側)
    │   │   └── axis1-information-gain.js
    │   ├── api/queue.js                   ← 対象選定 API router
    │   ├── batch/                         ← 日次バッチ
    │   │   ├── daily-target-selection.js
    │   │   └── README.md                  ← cron 設定 / logrotate 等
    │   └── scripts/                       ← CLI runner + smoke test + dev fixture
    ├── client/                            ← React + Vite UI
    │   ├── src/RewriteQueueView.jsx       ← Phase 1 で追加
    │   ├── src/App.jsx                    ← nav に「リライトキュー」追加
    │   └── src/api.js                     ← 4 API 関数追加
    ├── server.js                          ← /api/rewrite マウント済
    ├── master-db.js                       ← Phase E 既存実装 (monitor.db 同居)
    └── shared/                            ← Phase 2 で初期化予定 (未存在)

# Phase 2 必須前提タスク (本セッション着手時に最初にやる)

## 前提 1: monitor.db への本番接続確認
- 本番 VPS 等から monitor.db を取得 or local 同期
- node/data/monitor.db に配置
- daily-target-selection.js を --force で実行して全軸計算が回ることを確認
- Phase 1 dev-seed-monitor-fixture.js は dev 専用、本番では不要

## 前提 2: shared/ ディレクトリ初期化
案C 5-c で確立した共通ヘルパー層を物理構築する。

  shared/article-context.js       ← 共通コンテキスト集約
  shared/wp-structured.js         ← cheerio ベース、既存 gap-fill.js 等から抽出
                                     (案D で 82% トークン削減実測)
  shared/llm-adapters/
    anthropic-adapter.js          ← Opus 4.7 + Sonnet 4.6
    openai-adapter.js
    gemini-adapter.js
    common.js                     ← retry ラッパ (論点2-1 指数バックオフ max 5)
  shared/archive-adapters/
    wayback-adapter.js
    archive-today-adapter.js      ← 案D 3.H 確定
  shared/serpapi-adapter.js       ← 論点2-2 フォールバック実装
  shared/schemas/
    intent_dimension.schema.json  ← 案B # 3 JTBD 5次元 JSON Schema

## 前提 3: パス不整合の判断
Phase 1 で残った target-selection/ vs scoring/ をどう扱うか。
推奨: Phase 2 着手前に全 axis を target-selection/ に統一する refactor。
理由: Phase 2 で軸1 本実装すると同ディレクトリで「placeholder vs 本実装」の
切替が自然になる。

# Phase 2 主要実装タスク

## 1. master_post_target_query 構築 (案D 2.A)
- monitor.db.articles から GSC max_impression / max_clicks を抽出
- 主たるリライト対象キーワード (primary / secondary) を per-post で確定
- 投入経路: バッチ自動 or Daiki 手動 (UI 既存「リライトキュー」拡張)

## 2. Step A-2 Query Fan-out 二段構造 + JTBD intent_dimension 拡張
- master_query_fanout テーブルへの投入
- LLM (Sonnet 4.6) で seed_query → sub_query (Layer 1) → micro-intent (Layer 2)
- intent_dimension JSON: {purpose, barrier, constraint, comparison_axis, expected_format}
- スキーマ: shared/schemas/intent_dimension.schema.json で検証
- PAA / related_search / AI Overview からの sub_query 取得経路 (SerpApi 連携)

## 3. Step A-1 IG Score 実装 (軸1 placeholder → 本実装への切替)
- master_competitor_corpus 投入 (SerpApi 経由、Top N=3 デフォルト)
- master_fact_set 抽出 (LLM で 3 layer: entity / claim / experience)
- master_information_gain_score 計算 (layer 別 gain / gap / competitor 比較)
- master_evidence Layer 構築 (URL健全性チェック + archive_service 統合)
- 切替: 軸1 placeholder の NULL を SQL UPDATE で本値に上書き

## 4. master_hcu_checklist + LLM 自動評価 (案B # 5)
- HCU 22項目 (Phase 1 リサーチ時点、Phase 2 で Google 公式から再取得)
- LLM (Sonnet 4.6) で per-post 評価 → master_hcu_checklist に投入
- pass_rate を リライト判定の補助情報として表示 (UI サブパネル)

## 5. master_article_similarity α 実装 (案B # 9)
- text_similarity (TF-IDF or embedding) を per (source_post, target_post) で計算
- Top-K (20〜50) ペアを格納
- 月次バッチで全記事再計算 (Phase 2 末で配線)

## 6. 案C LLM 実行レイヤー (本丸)
工程6'-A 分析 (Opus 4.7):
  - master_rewrite_session 起票 (案D 4.M' で queue ↔ session 多対多リンク保証)
  - 高リスク変更 5カテゴリ判定 → 該当時 status='awaiting_policy_judgment'
  - 案K 発動時 Daiki 方針承認 UI (論点1-B 1-B-3、(α) 縦並びカード)

工程6'-B 生成 (Sonnet 4.6):
  - master_rewrite_diff 生成 (差分パッチ)
  - 案L 差分単位判定 UI (論点1-B 1-B-1+1-B-2、(γ) inline diff)
  - キーボード y/e/n/←/→/Space/Esc/1-5

論点2 エラーハンドリング:
  - LLM API リトライ (指数バックオフ max 5回、shared/llm-adapters/common.js)
  - SerpApi 3段階フォールバック (キャッシュ → Degraded → aborted)
  - WP ロールバック (snapshot 保存 + 失敗時原状復帰)
  - Compliance warning モード (検証エンジン異常時も処理継続)

## 7. クエリレベル decay 検出 (案B # 11)
- 案C 入力情報として、URL × クエリ単位の最近の indicator drop を抽出
- weekly_kw_snapshot 等から計算
- 案C 工程6'-A の analysis_output に組込

# Phase 2 工数見積

設計確定値: 16〜25日 (案B 完了時点)
Phase 1 で観察された傾向: spec の解釈で時間消費しがちだが、
Daiki が判断委任 + 戻し条件明示で進行が大幅に効率化された。
Phase 2 でも同パターンを継続することを推奨。

# Phase 2 で警戒すべきバイアス (Phase 1 で観察)

## 既存
1. 既存資産への過剰適応 (案E で判明)
2. 自分の初期推奨に固着 (案D で判明)
3. 強推奨ラベルへの追従 (案B で判明)
4. 機能を盛りたくなる (案B で判明)
5. テーブル単位 vs システム全体の最小性 取り違え (案B で判明)
6. UI 仕様の過剰精緻化 (Phase 3 で警戒指示)

## Phase 4 MVP Phase 1 で発動 / 回避された傾向 (本セッション総括より)
- 「Daiki 指示の literal vs intent」: 軸1 placeholder の path 指定で発動。
  literal 優先で進めた結果、パス不整合が発生。Phase 2 着手時に補正必要
- 「schema 変更の判断委任」: NOT NULL 解除を Daiki 戻し条件にせず Claude
  判断で進めた。意図 (NULL = 未計算) が明確だったため正解だが、戻すべきだった
  境界線として記憶
- 「過剰なバリデーション」: 回避成功。queue API は post_id + axis + status の
  最小列挙チェックのみ
- 「UI 過剰精緻化」: 回避成功。既存 CSS クラス流用のみ、新規 CSS 0 行

## Phase 2 で警戒すべき新バイアス (推測)
- 「LLM コール乱発」: 案C 工程6'-A/B で per-post に Opus + Sonnet の 2 段階
  コールが発生。デバッグ時の総コストが嵩む。dry-run / partial run の仕組みが必須
- 「Adapter 層の過剰汎用化」: 3社対応は確定済だが、画像生成等の将来対応のために
  抽象化を過剰にすると最小性違反、必要十分なインタフェースに留める
- 「SerpApi 月次クォータ感覚」: dev で気軽に叩くと本番運用時に枯渇リスク。
  shared/serpapi-adapter.js に dev/prod 環境変数で動作切替を最初から組込む

# 進行スタイル (Phase 1 で確立、継続推奨)

- 設計判断ごとにステップを分解して、Daiki に判断を仰ぐ
- インプット / アウトプットを明確に定めてパーツごとに動くように設計
- 真=美の最小性テストに反する設計は提示しない
- 反証プロトコル: 主張に対する逆方向検証を必ず付記
- 戻し条件 / 警戒バイアスを Daiki 指示で明示してもらい、Claude が判断委任で進行
- 細かいコミットで履歴を残す (Phase 1 では 8 コミット、各コミットメッセージに
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
- rewrite.db は dev 環境で稼働中 (5記事 fixture)、本番 monitor.db 接続は未

# 最初のタスク

1. CLAUDE.md と knowledge/05_rewrite_system_design.md を読み込み、現状を把握
2. 直近のセッション記録 (sessions/2026-05-05_phase4_mvp_phase1_completion.md) を読み、
   Phase 1 完了経緯と発見補正事項を吸収
3. Phase 1 完了状態のサマリを Daiki に提示 (本ハンドオフ「現在地」を要約)
4. Phase 2 着手の最初の判断を仰ぐ (推奨順):
   a. 必須前提タスク 3 件 (monitor.db 接続 / shared/ 初期化 / パス整合) のうち
      どこから?
   b. monitor.db を本番から取得する手段の確認 (Daiki が提示する必要)
   c. shared/ 初期化は Phase 2 主要タスクのどれより先か?

それでは Phase 2 実装から進めてください。
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
Phase 1: 対象選定の自動化         完了 (2026-05-05、本ハンドオフの起点)
  実装: rewrite.db / 4軸スコア / API / UI / cron
  実工数: 9〜14日 → 実績 1セッション (集中作業)

Phase 2: 自走システム本格稼働     未着手 ← 次の作業
  実装: shared/ / Step A-1/A-2/A-3 / HCU / 案C LLM 実行 / 関連度α
  実工数見積: 16〜25日

Phase 3: 学習ループ稼働、自走システム完成形  未着手
  実装: A/Bテスト / 関連度β/γ / Compliance / 監査レイヤー / 学習ループ
  実工数見積: 8.5〜13日

合計: 33.5〜52日 (カレンダー時間 3〜5ヶ月想定)
```
