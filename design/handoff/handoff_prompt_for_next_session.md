# 次セッション用ハンドオフプロンプト（Phase 4 MVP Phase 2 実装）

このファイルは、Claude Code 環境で新規セッションを開始するときに、Claudeに最初に渡すプロンプトとして使用する。

最終更新: 2026年5月5日 Part 4（Step A-1 着手分 + 案A 統合完了、Phase 2 主要タスク 2.5/7 達成）
前提環境: Claude Code（s-tools/design/ 配下に全資産統合済み、s-tools/node/rewrite/ に Phase 1 実装 + Part 2 残課題消化済み + Part 3 Step A-2 実装済み + Part 4 Step A-1 着手分実装済み、shared/llm-adapters/ + shared/schemas/ + shared/serpapi-adapter.js (γ) lazy 構築進行中、案A Google API 認証情報整備済）

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

## Phase 4 MVP Phase 2 進捗 2.5/7 + 案A 統合完了 (2026-05-05 Part 4)

Phase 2 主要実装タスク 7 件中 2.5/7 完了。

Part 4 で完了した実装 (2 コミット + 1 締め):
  645048c feat(rewrite): SerpApi Adapter + master_competitor_corpus 投入 (Step A-1 着手1)
  19832c2 feat(rewrite): 案A 統合 - master_post_target_query 投入 (Step A-1 着手2)

Part 4 で達成された DB 状態:
  master_competitor_corpus: 3 件 (query_fanout_id=11、source_type='organic'、
                                  fact_set_snapshot='{"_pending":true}')
  master_post_target_query: 2 件 (post_id=7170、primary + secondary、source='gsc')
  shared/serpapi-adapter.js: SerpApi 公式 npm パッケージラッパ
  rewrite/competitor-corpus/collect.js: organic top N=3 投入
  rewrite/post-target-query/build.js: GSC primary/secondary 投入

並列タスク戦略 (Daiki 配置作業 + Claude Code 実装) = 成功検証。
shared/ (γ) lazy 構築方針が 2 件目の Adapter (serpapi) でも機能。

## Phase 4 MVP Phase 2 着手 + Step A-2 完了 (2026-05-05 Part 3)

Phase 2 主要実装タスク 7 件中 1 件完了 (Step A-2 Query Fan-out 二段構造)。
shared/ (γ) lazy 構築方針の戦略的検証 = 成功。
警戒バイアス [h] YMYL 上流フィルタ怠惰 = 新規確立。

Part 3 で完了した実装 (5 コミット):
  56c4804 feat(rewrite): shared/llm-adapters/ Anthropic Adapter 実装 (Step A-2 着手1)
  0eb83b5 feat(rewrite): Step A-2 Layer1 主題分解実装 (Step A-2 着手2)
  50aba44 fix(rewrite): Step A-2 Layer1 プロンプトに YMYL 禁止表現フィルタ追加
  53db995 feat(rewrite): Step A-2 Layer2 micro-intent 展開実装 (Step A-2 着手3)
  d252743 feat(rewrite): Step A-2 完了 - intent_dimension JTBD 5次元拡張 (Step A-2 着手4)

Part 3 で達成された DB 状態:
  master_query_fanout (seed_query="即日融資 比較"):
    layer=1: 10 件 (主題分解、intent_dimension=NULL)
    layer=2: 62 件 (micro-intent + JTBD 5次元 intent_dimension JSON)
  shared/llm-adapters/anthropic-adapter.js: Sonnet 4.6 + Opus 4.7 ラッパ
  shared/schemas/intent_dimension.schema.json: JSON Schema draft-07
  ajv 導入: package.json に追加

## Phase 4 MVP Phase 1 完了 (2026-05-05 Part 1) + Phase 1 残課題消化完了 (Part 2)

対象選定の自動化が一通り稼働可能状態 + Phase 2 着手準備完備。

Part 2 で消化された残課題 (2 実装コミット + 1 締めコミット):
  - D 処理: master_* seed 92件 → rewrite.db 投入 (Phase E 物理移管完了)
    annotations 15 / rules 21 / checklist 56 / audit 0
  - パス整合 refactor: 4軸を target-selection/ に統一
    (scoring/ → target-selection/、CTA scoring との名前衝突回避)
  - 締め: 記録 + handoff + knowledge/05 更新

Part 1 完了 8 コミット:
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
monitor.db はローカル構築設計 (VPS には存在しない)。dev 環境では
node/rewrite/scripts/dev-seed-monitor-fixture.js で再現可能 (5記事 × 70日)。
Phase 2 着手時は WP dump からの articles メタ抽出 (案C、本セッション内着手) +
本番 metrics 蓄積 (案A、Daiki 認証情報整備次第) の二段構成。

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

## ★ Daiki 確定優先順位 (2026-05-05 Part 4 末で確定)

```
[完了] 案C: WP SQL dump からの articles メタ抽出
       → cardloan 434 件すべて投入済 (post_modified 込み)

[完了] D: Phase E master_* 4 テーブル + 92 件 seed の rewrite.db 投入

[完了] パス整合 refactor: 4軸を target-selection/ に統一

[完了] ★ Step A-2 Query Fan-out 二段構造 (Part 3、5 コミット)
       - shared/llm-adapters/anthropic-adapter.js
       - master_query_fanout: layer=1: 10件 + layer=2: 62件 (JTBD intent_dimension 付き)
       - 警戒バイアス [h] YMYL 上流フィルタ怠惰 を新規確立

[完了] ★ 案A 認証情報整備 (Daiki 環境作業、Part 4 セッション中に並列完了)
       - SERPAPI_API_KEY / GOOGLE_APPLICATION_CREDENTIALS
       - GA4_PROPERTY_ID / GSC_PROPERTY_URL (https://www.soico.jp/no1/)
       - service-account-key.json (node/data/) 配置済
       - WP_API_BASE_URL / WP_API_USERNAME / WP_API_APP_PASSWORD

[完了] ★ Step A-1 着手分 + 案A 統合 (Part 4、2 コミット)
       - shared/serpapi-adapter.js (Adapter)
       - master_competitor_corpus 投入ロジック (organic top N=3)
       - master_post_target_query 投入ロジック (GSC primary/secondary)
       - 戻し対応: service-account-key..json typo / GSC URL www 不整合

[次] ★ Phase 2 残 4.5 タスクから着手判断 (Part 4 末で 4 案推奨)
     優先1: Step A-1 後半 (master_fact_set + master_information_gain_score)
            → Phase 2 最大の山場、本日確立した shared/ + LLM Adapter の本格応用
            → master_competitor_corpus.fact_set_snapshot を実 fact 抽出で UPDATE
            → 自記事 fact_set との差集合で IG Score 算出
            → Step A-1 完成 = 4/7 + 5/7 達成
     優先2: 一括投入バッチ実装
            → 全 Layer1 sub_query (10件) → master_competitor_corpus
            → 全 cardloan 434 記事 → master_post_target_query
            → GSC API レート制限考慮 (3 req/sec)、SerpApi クォータ管理
     優先3: master_hcu_checklist (案B # 5、軽量・独立)
            → LLM で HCU 22 項目自動評価
            → 重実装の合間に挟む候補
     優先4: master_article_similarity α (案B # 9、軽量・独立)
            → text_similarity 計算 (TF-IDF or Embedding)
            → Phase 2 段階では α のみ、β/γ は Phase 3
```

## Phase 2 残 4.5 タスク詳細 (Part 4 末更新)

| # | タスク | 依存 | 状態 | 推奨度 |
|---|---|---|---|---|
| 1 | master_post_target_query 構築 (案D 2.A) | 案A (Google API) | ✓ 完了 (Part 4) | - |
| 2 | master_competitor_corpus 投入 (Step A-1) | SerpApi Adapter | △ 1件 smoke 投入 (Part 4)、本格運用は別タスク | 高 |
| 3 | master_fact_set 投入 (Step A-1) | wp-structured.js | 未着手 | 高 |
| 4 | master_information_gain_score 計算 (Step A-1) | 2 + 3 完了 | 未着手 | 高 |
| 5 | master_hcu_checklist + LLM 自動評価 (案B # 5) | なし | 未着手、軽量 | 中 |
| 6 | master_article_similarity α (案B # 9) | なし | 未着手 | 低 |
| - | 一括投入バッチ実装 (Layer1 全件 / cardloan 全件) | 1 + 2 着手済 | 未着手 | 中 |

## shared/ ディレクトリ方針 (Part 2 で (γ) 確定、Part 3 で検証成功)

(γ) lazy 構築方針: A-2 / A-1 / 案C LLM 実行レイヤー着手時に必要分のみ作る。
Part 3 検証結果: 戦略は機能した。

Part 3 + Part 4 で構築済み (最小化済み):
  shared/llm-adapters/anthropic-adapter.js  ← Sonnet 4.6 + Opus 4.7 ラッパ (Part 3)
  shared/schemas/intent_dimension.schema.json ← JTBD 5次元 JSON Schema (Part 3)
  shared/serpapi-adapter.js                 ← SerpApi 公式 npm ラッパ (Part 4)

Part 3 + Part 4 で削減判定 (元設計から最小性で削減):
  shared/llm-adapters/common.js             ← SDK 内部 retry maxRetries=5 で代替
  shared/llm-adapters/adapter-interface.js  ← anthropic-adapter シグネチャが暗黙 I/F
  shared/google-adapter.js                  ← rewrite/post-target-query/build.js 内 inline で完結

次セッション着手時に追加が想定される shared/ 構成:
  shared/wp-structured.js                   ← cheerio 構造化抽出 (案C LLM 実行レイヤー時 / Step A-1 後半)
  shared/article-context.js                 ← コンテキスト集約 (案C LLM 実行レイヤー時)
  shared/llm-adapters/openai-adapter.js     ← (任意、必要時)
  shared/llm-adapters/gemini-adapter.js     ← (任意、必要時)
  shared/archive-adapters/*                 ← (Phase 3 で追加)

## 前提 1: monitor.db データ投入 (★ 2026-05-05 事実訂正)

### 重要な事実訂正
当初「VPS から本番 monitor.db を取得」前提で進めていたが、調査の結果:
- VPS (xserver-soico) は **WordPress ホスティングのみ**、s-tools は動かない
- VPS にあるのは `~/db-backup-tmp/soico_no1_20260421_183252.sql.gz` (321MB WP dump) のみ
- monitor.db は s-tools/node/ を **ローカル実行** して GA4/GSC API + WP REST API から
  構築する設計 (monitor-db.js のコメント参照)

### Phase 1 末 + 案C 完了後の状態 (2026-05-05)
```
node/data/monitor.db
  articles: 434 件 (cardloan のみ、wp_modified 全件取得済、案C 完了)
  daily_metrics: 350 件 (5 fixture post_id のみ、本番収集は未着手)
  不在: daily_affiliate_clicks / weekly_kw_snapshot / analysis_comments /
        collection_jobs / backfill_progress / daily_scraped_rank / kv_settings
        (本番 monitor-jobs.js 実行で生成、案A 待ち)
```

### 案C 完了で動作する処理
- 軸3 鮮度スコア: 434 件全件で動作 (top 5 stale 〜3.34 ヶ月)
- 軸1 placeholder: 434 件全件で動作
- 軸2 経済合理性 / 軸4 Content decay: 5 件 (fixture daily_metrics のみ)
  本番 metrics 蓄積後に 434 件全件で稼働予定 (案A)

### 投入手段の3択 (Daiki 確定: 案C → 案A は未着手タスク化)
| 案 | 内容 | 必要なもの | 状態 |
|---|---|---|---|
| 案A | 本番収集パイプライン起動 | Google API 認証情報 (GA4/GSC/service-account) + WP REST API | 未着手、Daiki が認証情報準備次第起動 |
| 案B | dev fixture 拡充 | WP dump からメタ抽出 + metrics 合成 | 検討候補だが Phase 2 着手まで保留 |
| 案C | WP dump からメタのみ抽出 | scp + 解凍 + posts 抽出 | ★ 完了 (cardloan 434 件投入済、2026-05-05) |

案C 完了 (2026-05-05): cardloan 434 件すべて投入済。Phase 2 の Step A-2
(Query Fan-out) / Step A-1 IG Score 等は記事 ID + URL + カテゴリ + target_query
が中心のため metrics 値依存箇所が少ない初期実装は進む。本番 metrics 蓄積は
案A で並行 (Daiki 認証情報整備次第)。

### 案C 実装スクリプト (再利用可)
- node/rewrite/scripts/import-articles-from-wp-dump.js
  cardloan_posts.md の ID リストでフィルタしながら mysqldump を streaming パース
  29,255 タプル / 11.8 秒で 434/434 完全マッチ
- 他カテゴリ用の posts md があれば同スクリプトに POSTS_MD_PATH を切替で対応可能
  (現状 design/data/cardloan_posts.md のみ)

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

## 2. Step A-2 Query Fan-out 二段構造 + JTBD intent_dimension 拡張 [完了 (Part 3)]
- ✓ master_query_fanout テーブルへの投入 (layer=1: 10件 + layer=2: 62件)
- ✓ LLM (Sonnet 4.6) で seed_query → sub_query (Layer 1) → micro-intent (Layer 2)
- ✓ intent_dimension JSON: {purpose, barrier, constraint, comparison_axis, expected_format}
- ✓ スキーマ: shared/schemas/intent_dimension.schema.json で ajv validation
- 残: PAA / related_search / AI Overview からの sub_query 取得経路 (SerpApi 連携)
     → タスク2 着手時にセット
- 残: master_post_target_query 経由化 (現在は seed_query 直接渡し)
     → 案A (Google API 認証情報整備) 完了後または手動投入時に切替

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

## Phase 4 Part 3 (Step A-2) で発動 / 回避された傾向

### 発動 (本セッション内発動 → 即時対応)
- 「[h] YMYL 領域の上流フィルタ怠惰」: Layer1 主題分解出力に違反表現混入
  Claude Code 初期判断「Phase 2 後半で対策検討」が「上流で混入させて下流で除去」
  = 閉合性違反。設計コントロール側介入で即時対応に格上げ、commit 50aba44 で回収。
  対処パターン: design ナレッジ Phase 4-3「除外候補」を実装上流のプロンプトに参照

### 回避成功 (事前警戒)
- 「[a] LLM プロンプト過剰精緻化」: 全プロンプトで「動く」レベル、最適化は後段
- 「[b] JSON Schema 過剰汎用化」: ajv 設定最小限、custom formats なし
- 「[c] Adapter 過剰抽象化」: Anthropic 単一実装、I/F 抽象化遅延
- 「[d] スケルトン作成隠れたコスト」: common.js / adapter-interface.js 削減
- 「[e] Google fan-out 正解探求」: 「Google 内部 fan-out 一致不要」明示
- 「[f] 細分化暴走」: 上限 7 件、結果平均 6.2 件
- 「[g] intent_dimension 自動生成期待」: null 許容、barrier 69% null 率で機能確認

## Phase 4 Part 4 (Step A-1 着手分 + 案A 統合) で回避された傾向

事前警戒で全件回避、本セッション内発動なし:
- 「[b] JSON Schema 過剰汎用化」: serp_features = 3 boolean + 3 count のみ
- 「[c] Adapter 過剰抽象化」: SerpApi/GSC 単一実装、I/F 抽象化なし
- 「[d] スケルトン作成隠れたコスト」: 必要関数のみ export
- 「[f] 細分化暴走」: organic top N=3 固定
- 「[h] YMYL 上流フィルタ怠惰」: organic 投入のみ (PAA/related の YMYL 違反は本タスク影響なし)
- 「[i] SerpApi コスト浪費」: smoke 累計 2 クエリ、月次 0.04% 消費
- 「[j] 取得対象範囲拡大」: organic 投入、PAA/related は serp_features 集計のみ
- 「[k] 認証情報 Git 混入」: ルート .gitignore で *-key.json / .env / *.env 完全カバー

戻し体験記録 (Daiki 並行作業中の発見):
- service-account-key..json typo: ファイル名にドット 2 つ → Daiki 手作業 rename で対処
- GSC URL www 不整合: GSC_PROPERTY_URL=https://soico.jp/no1/ (www なし) でエラー
  → Daiki 手作業 .env 修正 (https://www.soico.jp/no1/) + サービスアカウント設定確認

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
- rewrite.db は dev 環境で稼働中 (5記事 fixture)、monitor.db は WP dump 抽出 (案C) 進行中 + 本番 metrics 蓄積は未着手 (案A)

# 最初のタスク (Daiki 確定優先順位に従う、Part 4 末で encode)

1. CLAUDE.md と knowledge/05_rewrite_system_design.md を読み込み、現状を把握
2. 直近のセッション記録を読み、進行スタイルと判断構造を吸収:
   - sessions/2026-05-05_phase4_mvp_phase1_completion.md (Part 1)
   - sessions/2026-05-05_part2_phase4_phase2_preparation.md (Part 2)
   - sessions/2026-05-05_part3_step_a2.md (Part 3、Step A-2 完了総括)
   - sessions/2026-05-05_part4_step_a1.md (Part 4、最新、Step A-1 着手分 + 案A 統合)
3. Part 4 末状態 + Daiki 確定優先順位を Daiki に確認
4. ★ Step 1: 次の作業 4 案を Daiki に提示 + 推奨提示
   (A) Step A-1 後半着手 (master_fact_set + master_information_gain_score、推奨)
       - master_competitor_corpus.fact_set_snapshot を実 fact 抽出で UPDATE
       - 各 organic URL から fact を抽出 (LLM ベース or HTML 構造化解析)
       - 自記事 fact_set との差集合で IG Score 算出
       - shared/wp-structured.js の構築が前提 (案C 5-c で確立済の設計)
       - Step A-1 完成 = Phase 2 4/7 + 5/7 達成
       - 工数感: 1〜2 セッション
   (B) 一括投入バッチ実装着手
       - 全 Layer1 sub_query (10件) → master_competitor_corpus
         (10 SerpApi クエリ、月次クォータ 0.2% 消費)
       - 全 cardloan 434 記事 → master_post_target_query
         (434 GSC リクエスト、レート制限 3 req/sec で約 145 秒、5 req/sec の余裕枠で完走可能)
       - 24h 冪等性、dry-run、--force オプション (Phase 1 daily-target-selection.js 同パターン)
       - 工数感: 0.5〜1 セッション
   (C) master_hcu_checklist (案B # 5、軽量・独立)
       - HCU 22 項目を Google 公式 (Helpful Content Update の Q&A) から再取得
       - LLM (Sonnet 4.6) で per-post 評価 → master_hcu_checklist に投入
       - 独立タスク、依存なし
       - 工数感: 1 セッション
   (D) master_article_similarity α (案B # 9、軽量・独立)
       - text_similarity 計算 (TF-IDF or Embedding)
       - Phase 2 段階では α のみ、β/γ は Phase 3
       - 工数感: 1 セッション

   推奨理由 (Part 4 末で記録):
   - (A) は Phase 2 最大の山場、本日確立した shared/ + LLM Adapter パターンの本格応用
   - (A) は Step A-1 完成 = Phase 2 進捗 5/7 達成の最大効率
   - (B) は本格運用の前提だが (A) より優先度低 (smoke pass 達成済)
   - (C)(D) は (A) と独立、合間タスクとして並行 or 前後着手可能

5. Daiki 判断 → 即着手

# 警戒バイアス番号体系の統合タスク (次セッション末で実施)

本セッションまでで発生した番号管理:
- [a]〜[h] (Part 3 セッション特有、Step A-2)
- [b]〜[k] (Part 4 セッション特有、Step A-1 + 案A、[i][j][k] 新規)
- [1]〜[7] (過去セッション継承、CLAUDE.md + handoff)
- [d] と Phase 4 Part 2 [6] スケルトン作成は実質的に重複
- Part 3 / Part 4 の [b][c][d][f][h] は重複 (継続適用)

→ 次セッション末ハンドオフで [1]〜[XX] の通し番号に統合
→ knowledge/05 第 XIV 章を整理対象とする

それでは Step 1 から進めてください。
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
