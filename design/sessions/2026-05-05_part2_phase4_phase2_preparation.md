# Phase 4 Phase 2 着手準備セッション (Part 2)

日付: 2026-05-05 (Part 2、前セッション Part 1 = phase4_mvp_phase1_completion.md)
ステータス: 完了 (D + refactor + 締め、2 実装コミット + 1 締めコミット)
反映先: handoff_prompt_for_next_session.md (Phase 2 着手判断を encode) /
        knowledge/05_rewrite_system_design.md (Phase E 移管 + 進行ステータス更新)

---

## 0. セッション経緯

Part 1 (Phase 4 MVP Phase 1 完了 + 案C cardloan 434件投入) からの継続。
handoff に encode された残3論点 (D / shared/ / refactor) のうち D + refactor を
本セッションで消化、shared/ は (γ) lazy 構築方針で次セッションに encode。

進行スタイル: Daiki 判断委任 + Claude 真=美 3軸テスト + 反証 + 戻し条件チェック。
Part 1 で確立されたパターンを継続、判断疲労ライン直前で Daiki が (C) セッション
締めを選択。

---

## 1. 完了した作業

| # | 作業 | コミット | 主成果物 |
|---|---|---|---|
| 1 | D 処理: master_* seed 投入 | (本セッション) | master-db.js DB_PATH 切替 + 92件投入 |
| 2 | パス整合 refactor | (本セッション) | scoring/ → target-selection/ 統一 |
| 3 | 締め (記録 + handoff + knowledge/05) | (本セッション) | 本ファイル + handoff 更新 + knowledge/05 進行ステータス |

---

## 2. 判断構造の記録

### 2-1. D 処理 (Phase E master_* seed の rewrite.db 投入)

3案評価:
- (a) DB_PATH 切替で rewrite.db に物理移管 → **採用**
- (b) monitor.db 残存 → 論点0 矛盾、不採用
- (c) 当面空テーブル → 必然性違反 (Compliance Layer 着手まで待つ理由なし)

判定根拠:
- rewrite.db schema.sql に master_* DDL 既存 (Phase 4 設計時点で論点0 反映済)
- monitor.db には master_* テーブル不在 (server.js 未起動のため initSchema 未実行)
- master-db.js は MONITOR_DB_PATH 環境変数で切替可能、内部完結

実装:
- 環境変数 MONITOR_DB_PATH → MASTER_DB_PATH (rewrite/db.js の MONITOR_DB_PATH 衝突回避)
- default を data/monitor.db → data/rewrite.db
- 冒頭コメント訂正

検証結果:
- annotations: 15 / rules: 21 / checklist: 56 / audit: 0 (合計 92)
- listAnnotations / listRules / getCompletenessSummary 動作 pass
- 4商品 (acom/aiful/promise/mobit) すべて checklist 14件 + annotations 1〜6件

### 2-2. shared/ 着手の (α)(β)(γ) 評価

3案評価:
- (α) フル構築 (8〜10 ファイル一括) → 「機能を盛りたくなるバイアス」発動リスク高
- (β) 最小限スケルトン → 真=美最小性に最も整合だが、A-2 着手時に都度肉付け発生
- (γ) lazy 構築 (refactor 先行 + A-2 着手時に必要分のみ) → **Daiki 確定**

Daiki 判断理由:
- 真=美の追加検証で (β) スケルトンも「実装の一形態」と判定 (未使用コード化リスクは (α)(β) 共通)
- (γ) は「実装文脈と shared/ 設計の同時進行」を可能にする戦略
- A-2 着手時に必要な adapter のインタフェースが文脈で確定するため、スケルトン → 後で書き換えのコストが発生しない

handoff 反省1 (scope creep 回避優先で残課題化) と (γ) は構造が異なる点を明示:
- 反省1: 後回しにして残課題化させた失敗
- (γ): 設計と実装の認知ロード一致を狙う戦略

### 2-3. パス整合 refactor 統一方針

3案評価:
- (a) target-selection/ 統一 (3ファイル移動 + 4 import 更新) → **採用**
- (b) scoring/ 統一 → CTA scoring (server.js /api/scoring/*) と名前衝突
- (c) 別名 axis-scoring/ → 既存2ディレクトリ削除 + 新規、過剰

判定根拠:
- handoff 推奨と一致
- Phase 2 軸1 本実装時に「placeholder ↔ 本実装」が同居して自然
- 機能本質 (リライト対象選定) を表現

実装:
- git mv で 3ファイル移動 (リネーム履歴 100% 検出)
- 4 import 更新 (batch/daily-target-selection.js + scripts/calc-axis{2,3,4}.js)
- scoring/ 削除

検証結果:
- daily-target-selection.js --force: axis1=434/axis2=5/axis3=434/axis4=5 errors=0 elapsed=9ms
- Phase 1 と同一動作

---

## 3. 警戒バイアス対チェック (本セッション)

### 3-1. 既存バイアス

| バイアス | 結果 | 備考 |
|---|---|---|
| 既存資産への過剰適応 | 該当なし | 設計確定範囲を逸脱せず |
| 自分の初期推奨に固着 | 回避 | (α)(β)(γ) 全案を等価評価、Daiki 判定で (γ) 確定 |
| 強推奨ラベルへの追従 | 該当なし | 実装フェーズ |
| 機能を盛りたくなる | 警戒成功 | shared/ (α)(β) 評価時に明示警戒、(γ) 採用で回避 |
| テーブル単位 vs システム全体 | 該当なし | refactor は構造のみ |
| UI 仕様の過剰精緻化 | 該当なし | UI 範囲外 |

### 3-2. Part 1 で観察された Phase 4 新バイアス (本セッションでの再発有無)

| バイアス | 結果 | 備考 |
|---|---|---|
| Daiki 指示の literal vs intent | 該当なし | 本セッション指示は範囲明示済 |
| schema 変更の判断委任境界 | 警戒成功 | D 処理で master_* スキーマ変更なし確認、戻し条件非該当を明示判定 |
| 過剰なバリデーション | 該当なし | 実装ボリューム小 |
| UI 過剰精緻化 | 該当なし | UI 範囲外 |
| 設計ナレッジへの過度の信頼 | 警戒成功 | rewrite.db / monitor.db 実機調査で master_* 状態を確認後に D 処理進行 |

### 3-3. 本セッションで明示警戒した追加項目

#### 「refactor 範囲拡大バイアス」(回避成功)
- 4軸関連の呼出のみが範囲、CTA 系 / monitor 系のパス整合まで手を広げず
- import 更新は 4 箇所で完結 (戻し条件 10未満)

#### 「Phase 1 残課題完全消化バイアス」(適切に処理)
- 本セッションは D + refactor の 2 残課題消化のみ
- shared/ は (γ) lazy 構築方針で次セッションに encode、無理に消化せず

---

## 4. Phase 4 で観察された新バイアス (今セッション追加)

### 4-1. 「スケルトン作成の隠れた実装コスト」(本セッションで発見)

shared/ 着手 (β) スケルトン案を評価する過程で発見:
- 真=美最小性で「スケルトン = 実装より小さい」と直感されがちだが、
  実態は「インタフェース確定 + ファイル配置 + import 経路設定 = 実装の一形態」
- 後段で本実装する際、スケルトンの I/F が想定と違うと書き換えコスト発生
- → スケルトン作成も「機能を盛りたくなるバイアス」の変種として警戒対象に追加

教訓: 「最小限の実装」と「lazy 構築 (作らない)」を等価評価し、後者が必然性で
勝るケースが多い (今セッション (γ) 採用がその実例)。

### 4-2. 「環境変数の名前衝突リスク」(本セッションで発見)

D 処理で MONITOR_DB_PATH の名前衝突 (master-db.js と rewrite/db.js が同名で
別 DB を指す可能性) を発見、MASTER_DB_PATH に改名した。

教訓: 複数モジュールが同名の環境変数を使う場合、デフォルト値が異なると
本番でハマる。改名コストは小さいが、検出機会は限定的なので、設計時点で
名前空間を意識する習慣が必要。

---

## 5. 本セッションで処理しなかったタスク (次セッション送り)

### 5-1. shared/ ディレクトリ初期化
- (γ) lazy 構築方針で encode 済
- A-2 / A-1 / 案C LLM 実行レイヤー着手時に必要分のみ作る

### 5-2. 案A (Google API 整備)
- Daiki 環境作業 (認証情報準備) 待ち
- Claude 自走不可、認証情報整備次第 monitor-jobs.js ローカル起動

### 5-3. 案C 補完 (他カテゴリ articles メタ取得)
- cryptocurrency / securities / fx の posts md 未取得
- import-articles-from-wp-dump.js は POSTS_MD_PATH 切替で対応可

---

## 6. 次セッション開始時の最初の判断 (handoff に encode)

3案:
- (A) Step A-2 Query Fan-out 二段構造に着手 (**推奨**)
  - shared/llm-adapters/ + schemas/intent_dimension.schema.json を (γ) lazy 構築
  - 工数感: 数時間〜1セッション
- (B) master_post_target_query 構築 (案A 待ち依存あり)
  - GSC データなしで dev fixture または手動投入で着手は可能
  - 本番投入は案A 完了後
- (C) 案A (Google API 整備) を Daiki が認証情報準備して着手
  - 認証情報準備は Daiki 環境作業

推奨理由:
- (A) は案A 待ちで停滞しない
- shared/ lazy 構築の戦略的検証になる
- Phase 2 で最も重い実装タスクの一つを最初に倒す

---

## END OF SESSION RECORD

Phase 1 残課題 (D + refactor) 完全消化、Phase 2 着手準備完備。
次セッション = Step A-2 Query Fan-out (shared/llm-adapters/ lazy 構築の本格検証)。
