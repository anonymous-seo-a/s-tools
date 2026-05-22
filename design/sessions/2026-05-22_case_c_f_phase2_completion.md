# 2026-05-22 案C C-F 完了 + Phase 2 MVP 7/7 完成宣言

## セッション要旨

C-F (既存 smoke 非破壊確認 + 段階C 申し送り) を実施し、案C 6 ステップ完了。
**Phase 2 MVP 7/7 完成**。リライト 1 サイクル (対象選定 → 分析 → 差分生成 → コンプライアンス)
が動作する状態を確立。

最終更新: 2026-05-22
コミット: (本コミット、docs、Phase 2 完成宣言)

---

## I. C-F 実施内容

### 1. 既存 smoke 非破壊確認 (free / cheap 5 件、本セッションで実行)

| smoke | カテゴリ | 結果 |
|---|---|---|
| smoke-delta-calibration | Free (純粋関数) | DELTA_BUCKETS 不変性 + 全 assertions pass |
| smoke-test-queue-api | Free (Express local) | 15/15 endpoint pass |
| smoke-case-c-bundle | Free (DB) | 15 assertions pass + CASCADE 確認 |
| smoke-article-similarity | Free (WP API) | post 7170+11077 cosine=0.812 |
| smoke-anthropic-adapter | Cheap (~$0.001) | Sonnet 1+1=2 |

### 2. 課金 smoke 非実行 (retroactive breakage リスクなし)

12 件の課金 smoke は最後の verified commit SHA で確認:
- LLM 課金 (8 件): C-B〜C-E 期間中 + 過去セッションで verified
- Voyage 課金 (2 件): 段階B B-6/B-7 で verified
- SerpApi 課金 (2 件): Step A-1 で verified

検証根拠:
- schema.sql 最終変更 = 1d6cb62 (2026-05-05) → 案C 期間中スキーマ不変
- master_rewrite_session.triggered_by 拡張のみ (TEXT 列、後方互換)
- shared/ 変更 = ff13e1d (2026-05-21) 以降本セッションで変更なし
- → retroactive breakage リスクなし

詳細表は knowledge/05 V-A-3-13 に統合。

### 3. 段階C 申し送りリスト (A〜D 4 章、優先度順)

V-A-3-9 を以下の構造に再編:

#### A. コスト圧縮 (最優先、Phase 3 稼働の前提)
- Sonnet output 揺れ抑制 + prompt 簡素化 ($0.5/pass → $0.2/pass)
- diffs_rejected 削減 (cheerio パース失敗パターン分析)
- Opus 高リスク categories 揺れ抑制

#### B. データ整備 (多 post smoke + 学習ループの前提)
- master_post_target_query 全 cardloan 434 件拡張 (現状 2 件)
- master_query_fanout seed_query 多様化 (現状 1 seed)
- master_rules 21 件 verified 昇格運用 (現状 draft)

#### C. 検証経路の精緻化
- C-D 照合の `.text()` 抽出ベース格上げ
- C-D 必須表現 / 正式表記 対応拡張
- content_before/after の独自 JSON 化 (cheerio 失敗多発時)
- bundle 構造の重み付け

#### D. 上流統合
- protected_regions の CSS class set 動的取得
- WordPress raw context 取得権限整備
- C-E 多 post smoke 実施 (B 完了後)

## II. Phase 2 完成サマリ (7/7)

| # | 完成タスク | 完成日 | 主要コミット |
|---|---|---|---|
| 1 | master_post_target_query | 2026-05-05 | Step A-1 |
| 2 | master_competitor_corpus | 2026-05-05 | Step A-1 |
| 3 | master_fact_set | 2026-05-05 | Step A-1 |
| 4 | master_information_gain_score | 2026-05-05 | Step A-1 |
| 5 | master_query_fanout (Step A-2) | 2026-05-05 | Step A-2 |
| 6 | master_hcu_checklist | 2026-05-21 朝 | 案B #5 |
| 7 | master_article_similarity α | 2026-05-21 午後 | 案B #9 |

加えて、案C LLM 実行レイヤー 6 ステップ完了:
- C-A 設計確定 (V-A-3 章) - 2026-05-21
- C-B 工程6'-A Opus 4.7 - 2026-05-21
- C-C 工程6'-B Sonnet 4.6 - 2026-05-22
- C-D 工程6'-C Compliance - 2026-05-22
- C-E E2E smoke (2 pass) - 2026-05-22
- C-F 非破壊確認 + 段階C 申し送り - 2026-05-22

段階B (embedding 二系統並列、本実装化、B-1〜B-7) も完了 (2026-05-21)。

## III. Phase 3 移行準備

Phase 3 = 学習ループ稼働フェーズ。主要 3 ループ:
1. **記録ループ**: master_rewrite_diff.daiki_judgment / daiki_reject_reason 蓄積
2. **抽出ループ**: 月次バッチで change_category 単位の効果集計 (案D 2.F)
3. **反映ループ**: SearchPilot 方式 A/B テスト (master_ab_test) で variant 効果測定

着手前提:
- データ整備 (V-A-3-9 B 章) 完了
- コスト圧縮 (V-A-3-9 A 章) で運用持続可能性確保
- UI 整備 (Daiki 判定インターフェース、案L)

handoff フルリライトは次セッション (Phase 3 着手時) に実施。

## IV. 警戒バイアス [1]〜[23] C-F 適用結果

| バイアス | 適用例 |
|---|---|
| [4] 機能を盛りたくなる | 課金 smoke 全実行を回避、retroactive breakage チェックで代替 |
| [17] SerpApi コスト浪費 | serpapi smoke skip、Step A-1 verified を信頼 |
| [22] 環境変数値構造仮定 | schema.sql / shared/ の変更点を git log で確認 |

新規バイアス確立なし。

## V. Phase 2 累計コミット (2026-05-21 段階B 締め以降)

```
f0f4da8 (2026-05-21) 段階B B-7 締め
de40603 (2026-05-21) 案C C-A 設計確定
524aa0c (2026-05-21) 案C C-B 工程6'-A Opus 4.7
d89e38a (2026-05-22) 案C C-C 工程6'-B Sonnet 4.6
ba076a7 (2026-05-22) 案C C-D 工程6'-C Compliance
d280ce3 (2026-05-22) 案C C-E E2E smoke
(本コミット, 2026-05-22) 案C C-F 完了 + Phase 2 7/7 完成宣言
```
