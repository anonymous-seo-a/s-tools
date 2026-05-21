# 2026-05-21 案C LLM 実行レイヤー C-A 設計確定

## セッション要旨

段階B 完了直後、案C (Phase 2 残 1 タスク、5 日工数) に着手。
C-A (設計確定) で C-1〜C-5 + JSON 構造 + 保護領域指示の方針を確定。
実装着手は次セッション C-B から。

最終更新: 2026-05-21
コミット: (本コミット、docs)

---

## I. C-A で確定した事項 (8 項目)

### I-1. C-1〜C-5 設計判断 (全 Claude 推奨採用)

| 論点 | 確定 |
|---|---|
| C-1 工程6'-A プロンプト 3 系統重み付け | Opus 4.7 に委譲、薄い枠組み |
| C-2 工程6'-B 差分生成フォーマット | 独自 JSON: `{target_section, change_type, content_before, content_after}` |
| C-3 ★ embedding 救出 fact フィルタリング | smoke 後判定 |
| C-4 Compliance Checker | seed 21 件 + 正規表現、master_ymyl_requirement は別工程 |
| C-5 smoke 最小スコープ | post 11077 / qf 11 |

### I-2. analysis_output JSON 構造

工程6'-A (Opus 4.7) が出力、master_rewrite_session.analysis_output に格納。
詳細: knowledge/05 V-A-3-2

### I-3. master_rewrite_diff レコード構造

工程6'-B (Sonnet 4.6) が出力。
- change_type 9 種、change_category 8 種、risk_flag 4 種 から LLM 選択
- content_before/after は HTML 文字列 (cheerio パース検証必須)

### I-4. rationale JSON 構造 (学習ループ接続点)

primary_source / bundle_refs / compliance / evidence_refs の 4 フィールド構成。
詳細: knowledge/05 V-A-3-4

### I-5. 情報伝搬フロー

```
buildCaseCInputBundle → bundle snapshot → 工程6'-A → 案K 判定 → 6'-B → 6'-C
```

詳細: knowledge/05 V-A-3-5

### I-6. 保護領域指示 (上流変更なし)

実測 (10 記事) で entity 消失ゼロ確認済。
上流 wp-structured.js は変更せず、6'-A / 6'-B プロンプトに保護領域 CSS class set を注入。
詳細: knowledge/05 V-A-3-6

### I-7. bundle snapshot 保存 (C-A-6 追加項目)

session 開始時に bundle 全体を session.notes に JSON 保存。
工程6'-A 以降は復元利用、index 参照の堅牢性を担保。
詳細: knowledge/05 V-A-3-7

### I-8. 「パターンブロック ref 残留」懸念の解消

Daiki から提起された「Gutenberg パターンブロックの { ref--- } 残留で entity 消失」懸念を実測検証:

| 記事 | total_len | wp:block ref | "ref":N | empty div |
|---|---|---|---|---|
| 7170  | 200,747 | 0 | 0 | 0 |
| 11077 | 260,300 | 0 | 0 | 0 |
| 7196  | 126,154 | 0 | 0 | 0 |
| 7235  | 148,058 | 0 | 0 | 0 |
| 11063 | 149,702 | 0 | 0 | 0 |
| 11078 | 194,720 | 0 | 0 | 0 |
| 11082 | 180,755 | 0 | 0 | 0 |
| 11092 | 216,015 | 0 | 0 | 0 |
| 12818 | 181,509 | 0 | 0 | 0 |
| 12821 | 0       | 0 | 0 | 0 (空、別問題) |

結論:
- REST API `content.rendered` モードでは Gutenberg ブロックは完全に HTML 展開済
- raw mode (block JSON プレースホルダ) は Application Password 権限不足で取得不可
- → 上流 entity 消失は発生せず、CTA ブロック保護は下流プロンプトのみで十分

raw mode 取得可能になる将来は別途検討事項 (V-A-3-9 段階C 再評価)。

---

## II. 案C 作業分解 (5 日相当)

| ステップ | 内容 | 工数 | 状態 |
|---|---|---|---|
| **C-A** | **設計確定 (本セッション)** | **0.5 日** | **✓ 完了** |
| C-B | 工程6'-A Opus 4.7 実装 | 1.5 日 | 次セッション |
| C-C | 工程6'-B Sonnet 4.6 実装 | 1.5 日 | |
| C-D | 工程6'-C Compliance Checker 実装 | 1 日 | |
| C-E | E2E smoke (6'-A → 6'-B → 6'-C 通し) | 1 日 | |
| C-F | 既存 smoke 非破壊確認 + 段階C 申し送り | 0.5 日 | |

---

## III. C-B 着手前の準備 (本セッションでは判定しない論点)

- Opus 4.7 のプロンプト具体表現 (例: bundle を JSON のままか整形か)
- bundle 要素を「絶対追加」「優先案」「補助」に Opus が分類する責務をどこまで委譲するか
- analysis_output JSON Schema 検証 (ajv で structure 確認するか)
- 高リスク判定の自動化アルゴリズム (キーワード検出 / LLM 自己申告)

---

## IV. 警戒バイアス [1]〜[23] C-A 適用結果

| バイアス | 適用例 |
|---|---|
| [4] 機能を盛りたくなる | rationale JSON は最小 4 フィールド、evidence_refs は暫定空配列 |
| [10] JSON Schema 過剰汎用化 | 厳密 schema は段階C で判定、C-B では「動く」レベル |
| [16] YMYL 上流フィルタ怠惰 | C-D Compliance Checker で受け止め |
| [21] LLM 出力構造化保証 | content_before/after は cheerio パース検証必須と明記 |
| [23] fact 概念意味論曖昧 | bundle 3 系統 (A/B/C) を rationale.bundle_refs で別フィールド維持 |

新規バイアス確立なし。

---

## V. 次セッション C-B 着手項目

1. Opus 4.7 プロンプト設計 (システム + ユーザー)
2. bundle 整形ロジック (JSON → 自然言語 or JSON 直接渡し)
3. analysis_output JSON のパース + バリデーション
4. session.notes に bundle snapshot 保存
5. analysis_output → session 更新
6. high_risk_categories 判定 → status 更新ロジック
7. C-B smoke (post 11077 で実 LLM 呼出 + analysis_output 確認)

---

## VI. 累計コミット (本日、2026-05-21、本コミット含めて)

```
4fc2e59 feat: master_article_similarity α 実装 (Phase 2 6/7)
ff13e1d feat: embedding 型ギャップ判定 PoC 実装 (段階A)
a9f70f9 docs: 段階A PoC 結果反映
baef663 docs: 段階B B-1 設計確定
988a07a feat: 段階B B-2 完了 - テーブル本実装化
07b4e4b feat: 段階B B-3 完了 - passage-store 永続化
5cd891f feat: 段階B B-4 完了 - δ 較正モジュール
ba6d709 feat: 段階B B-5 完了 - 案C 入力 bundle API
e4a0f6e feat: 段階B B-6 完了 - smoke 置換
f0f4da8 feat: 段階B B-7 完了 - 全 archetype smoke pass
(本コミット) docs: 案C C-A 設計確定
```

累計 11 コミット (本日)、本日 12 コミット目で C-A 締め。
