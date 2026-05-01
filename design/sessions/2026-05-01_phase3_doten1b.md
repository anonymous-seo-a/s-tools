# Phase 3 詳細設計 論点1-B: 差分判定画面のコア仕様

日付: 2026-05-01
ステータス: 確定（Daiki が各サブ論点でレイアウト選択、Claude が真=美フレームワークで詳細詰め）
反映先: knowledge/05_rewrite_system_design.md（V-D章新設）

---

## 0. 経緯

論点1-A（ナビゲーション統合方針）確定後、論点1-B（差分判定画面のコア仕様）を 5 サブ論点に分解:
- 1-B-1. 差分判定の基本操作
- 1-B-2. Before/After 比較表示の構造
- 1-B-3. 案K 高リスク変更の方針承認フロー
- 1-B-4. データ構造（API JSON）
- 1-B-5. サブパネル統合（HCU / 関連記事 / Compliance）

各サブ論点で Daiki がレイアウト方向性を選択、Claude が詳細仕様を確定。

---

## 1. 確定事項サマリ

| サブ論点 | 確定 | Daiki 選択 |
|---|---|---|
| 1-B-1+1-B-2 レイアウト | (γ) inline diff（変更点のみハイライト、前後展開可） | (γ) |
| 1-B-1 操作キー | y/e/n/Enter/←/→/Space/Esc/1-5、ボタン文字に埋め込み | OK + 「見ればわかる」UI |
| 1-B-1 棄却カテゴリ | 5択（knowledge/05 既確定） + メモ | OK |
| 1-B-1 編集 UI | (e) inline diff editor（After 行クリックで編集モード切替） | (e) |
| 1-B-3 方針承認画面 | (α) 縦並びカード | (α) |
| 1-B-5 サブパネル | (β) ヘッダサマリ + モーダル展開 | (β) |
| 1-B-4 API 設計 | 8エンドポイント、Claude 確定 | 構造的決定（Daiki 判断不要） |

---

## 2. 1-B-1+1-B-2: 差分判定画面（コア）

### レイアウト 3案の評価

```
            必然性 | 閉合性 | 最小性 | Daiki特性 | 総合
(α) 横並び  ◎    | ◎     | △     | ◎ (PRI並列)   | 優
(β) 縦並び  ◎    | ◎     | ✗     | △             | 不可
(γ) inline ◎    | ◎     | ◎     | ◎ (即把握)    | 優
```

→ **(γ) 確定**: 変更点のみハイライトで余剰排除（最小性○）、Daiki の視覚空間処理で即把握。
   前後文脈は Space で展開可能。

### 操作フロー

```
差分1件 inline diff 表示
  ↓
Daiki 判定（3択）
  ├ 採用 (y / Enter)        → 自動で次の差分へ
  ├ 編集承認 (e)             → After 行クリック → 編集モード → 保存 → 次へ
  └ 棄却 (n)                 → 棄却カテゴリ選択モーダル → 次へ
```

### キーボードショートカット（「見ればわかる」UI）

```
y / Enter  採用 (approve)
e          編集承認 (edit_approved)
n          棄却 (rejected)
←          前の差分
→          次の差分
Space      前後展開トグル
1〜5       棄却カテゴリ選択（モーダル内）
Esc        モーダル閉じる
```

ボタン文字に `(y)` `(e)` `(n)` を埋め込み、Daiki が覚えなくても画面で確認可能。

### 棄却カテゴリ 5択（knowledge/05 V-A 既確定）

```
1. truth_beauty_violation  真=美違反（構造的必然性なし）
2. factual_error           事実誤認
3. regulation_violation    規制違反
4. evidence_inadequate     Evidence 不足
5. other                   その他
```

メモ欄（任意、自由入力）。`master_rewrite_diff.daiki_reject_reason` + `daiki_reject_note` に保存。

---

## 3. 編集 UI: (e) inline diff editor

### 5案の評価

```
            必然性 | 閉合性 | 最小性 | YMYL適合 | Daiki特性 | 総合
(a) textarea ◎    | △     | ◎     | ○        | △ (HTML負荷) | 良
(b) rich text ✗   | ✗     | ✗     | ✗ (規制) | ◎          | 不可
(c) Markdown ✗    | ✗     | △     | △       | ○          | 不可
(d) split    ✗    | ◎     | ✗     | ◎       | △ (情報多) | 過剰
(e) inline   ◎    | ◎     | ◎     | ◎       | ◎          | 最良
```

### Claude の判断ミスと訂正

初期推奨: (a) plain textarea（最小性偏重）
Daiki 指摘: 「設計方針と変わった理由と選択肢の特徴を説明してくれ。じゃないと判断できない」

**判断ミスの内容:**
- 「最小性」だけを見て (a) を選んだが、「閉合性」（差分判定画面との一体感）を見落とした
- 選択肢を提示せず Claude が独断で決めようとした → Daiki の判断機会を奪う構造的誤り
- 警戒バイアス「自分の初期推奨に固着するバイアス」（案D で判明）の発動

**訂正:**
- 5案を提示、各特徴を視覚的に説明
- 真=美 3軸で再評価 → (e) が最良
- Daiki が (e) を選択

### (e) inline diff editor の特徴

```
┌─────────────────────────────────────────┐
│ 段落1（変更なし、グレー）                │
│ ─ 段落2（元の文、赤背景）                 │
│ + 段落2（編集中、緑背景、ここがクリック編集可）│
│ 段落3（変更なし、グレー）                │
└─────────────────────────────────────────┘
```

- inline diff レイアウトと同じ画面、別モードに切替するだけ
- After 行（緑背景）をクリック → contentEditable / textarea で編集
- HTMLタグは生で見える（YMYL 規制表記の精密編集が可能）
- 編集対象が「変更された差分のみ」に明示される

---

## 4. 1-B-3: 方針承認画面（案K 高リスク発動時）

### レイアウト 3案の評価

```
              必然性 | 閉合性 | 最小性 | Daiki特性 | 総合
(α) 縦並びカード ◎    | ◎     | ◎     | ◎ (順次)  | 最良
(β) タブ形式    ○    | ○     | △     | △ (WMI)   | 中
(γ) 一画面統合表 ○    | △     | ◎     | △ (密度)  | 中
```

→ **(α) 確定**: カテゴリ別カード縦並び、折りたたみ可（デフォルト全展開）。

### 操作フロー

```
'awaiting_policy_judgment' 表示
  ↓
Daiki が各カテゴリ確認
  ↓
3択判定:
  - 承認 (y)        → status='generating' (Sonnet 4.6 差分生成へ)
  - 編集承認 (e)    → policy_summary 編集 UI → 保存 → status='generating'
  - 棄却 (n)        → 棄却カテゴリ選択モーダル → status='aborted'
```

棄却カテゴリは差分判定と同一の5カテゴリ（master_rewrite_session.policy_reject_reason）。

---

## 5. 1-B-5: サブパネル統合

### 配置 3案の評価

```
              必然性 | 閉合性 | 最小性 | Daiki特性 | 総合
(α) 右サイドバー ○    | ○     | △     | ○         | 良
(β) ヘッダサマリ ◎    | ◎     | ◎     | ◎         | 最良
(γ) フッタ展開   ○    | △     | △     | △ (WMI)   | 中
```

→ **(β) 確定**: ヘッダ直下サマリバー + クリックでモーダル展開。

### 表示対象

| 情報 | サマリ表示 | 詳細表示 |
|---|---|---|
| HCU 22項目 | `[HCU 18/22 ▼]` | モーダル: 22項目 Yes/No + コメント |
| 関連記事 | `[関連記事 5件 ▼]` | モーダル: Top-K + similarity |
| Compliance | サブパネル不要 | 各差分の rationale JSON に組込済 |

理由:
- 差分判定画面の幅最大化（主タスクへの集中）
- 詳細はオンデマンド = 遅延評価
- 方針承認画面でも同じ位置（閉合性◎）

---

## 6. 1-B-4: API エンドポイント設計（Claude 確定）

```
GET  /api/rewrite/sessions?status=awaiting_*&limit=&offset=
GET  /api/rewrite/sessions/:session_id              方針承認画面用
GET  /api/rewrite/sessions/:session_id/diffs        差分判定画面用
PUT  /api/rewrite/diffs/:diff_id/judgment
PUT  /api/rewrite/sessions/:session_id/policy-judgment
GET  /api/rewrite/sessions/:session_id/hcu
GET  /api/rewrite/sessions/:session_id/related
GET  /api/rewrite/sessions/:session_id/preview      論点1-C 領域、MVP最小
```

データソース:
- rewrite.db + monitor.db を ATTACH DATABASE で結合
- post_title / post_url は monitor.db.articles から JOIN
- target_query は master_post_target_query から JOIN
- selected_axis は master_rewrite_queue から JOIN

認証: 既存の X-User ヘッダ運用（Phase E master-db.js と整合）

主要 JSON 構造は knowledge/05 V-D章に確定。

---

## 7. 警戒バイアス対チェック

| バイアス | 対チェック結果 |
|---|---|
| UI仕様の過剰精緻化（handoff 既出） | MVP 最小実装方針を維持。preview / 著者管理 UI は論点1-C 領域として最小実装、Phase 4 後の運用で精緻化 |
| 自分の初期推奨に固着 | 編集 UI で発動（(a)→(e) に訂正）。Daiki の指摘で気付き、選択肢提示し直して訂正 |
| 認知判断委任の濫用 | 編集 UI 段階で発動。Daiki の判断機会を奪う独断判断 → Daiki 指摘で訂正 |
| 機能を盛りたくなる | サブパネル独立タブを却下、(β) ヘッダサマリ + モーダルで最小性維持 |

---

## 8. 反証プロトコル

### 反証1: 「(γ) inline は記事本文の文脈が消えるのでは？」
target_section（h2#申込手順 等）でセクション境界指定済、セクション単位で表示すれば文脈保持。
前後 N 行（デフォルト 3行）を Space で展開可能。

### 反証2: 「キーボード y/e/n は誤操作リスク？」
モーダル等の他コンテキストでは Enter が確認ボタンになり、判定画面では採用に紐づくのが自然。
編集 UI 内の改行は textarea デフォルト挙動で無効化。

### 反証3: 「サブパネル詳細を見るのにモーダル開くなら無意味では？」
pass_rate (例: 18/22) で全体感を即把握、低スコア時のみ詳細展開で十分。
全項目を常時表示すると認知過剰。最小性で (β) が真=美。

### 反証4: 「全差分プレビュー (preview) は MVP に必要では？」
handoff 警戒バイアス「UI 仕様の過剰精緻化」に従い、MVP では最小実装。
差分単位判定で十分機能する。Phase 4 後の運用で必要性確認後に詳細化。

---

## 9. Phase 4 実装時の作業

```
1. node/client/src/rewrite/RewriteJudgeView.jsx 新設
   - session.status で画面切替
   - inline diff レンダラ（差分単位の Before/After ハイライト）
   - キーボードイベントバインド (y/e/n/←/→/Space/Esc/1-5)
   - 棄却カテゴリモーダル + 編集モード切替
2. node/client/src/rewrite/PolicyJudgeView.jsx 新設
   - 縦並びカードレンダラ
   - policy_summary 編集 UI
3. node/server.js or node/rewrite/api/ に API ルーター新設
   - 8 エンドポイントの実装
4. ATTACH DATABASE 'rewrite.db' AS rewrite ヘルパ確立
   - 既存 monitor-db.js と統合する形で
```

---

## 10. 進行記録

```
2026-05-01 セッション継続（論点1-A 確定後）
  → 1-B-1+1-B-2 レイアウト: 3案提示 → Daiki (γ) 選択
  → 操作キー: Daiki 「見ればわかる UI」要求 → ボタン文字埋め込み
  → 棄却カテゴリ: knowledge/05 既確定 5択 + メモ → Daiki OK
  → 編集 UI: Claude 初期推奨 (a) plain textarea
            → Daiki「設計方針と選択肢を説明してくれ、判断できない」
            → Claude 判断ミス認識、5案再提示
            → (e) inline diff editor で訂正、Daiki (e) 選択
  → 1-B-3 方針承認画面: 3案提示 → Daiki (α) 選択
  → 1-B-5 サブパネル: 3案提示 → Daiki (β) 選択
  → 1-B-4 API 設計: 構造的決定、Claude 確定
  → knowledge/05 V-D章 反映、handoff 1-B 確定状態を反映
  → セッション記録（本ファイル）作成
  → main 直接コミット予定
```

---

## 11. 次論点への接続

論点1 完了 → 論点2（エラーハンドリング設計）に進む:

```
論点2: エラーハンドリング設計
- LLM API 失敗時のリトライ戦略（Adapter 層レベル）
- SerpApi 失敗時のフォールバック
- WordPress 反映失敗時のロールバック
- 月次バッチ未実行時の検知
- queue_session_link 「最低1件のリンク」アプリケーションレベル保証
```

または論点3（Compliance Layer 詳細仕様）へ。論点0 で「論点3 のスコープは縮小」（実体は既存
master_rules + master_annotations）と確定済のため、軽量タスク化している。

次セッション開始時、Daiki に「論点2 / 論点3 / 論点4 / 論点5」のどれから進めるか選択を仰ぐ。
