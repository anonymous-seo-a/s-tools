# 2026-05-21 Phase 4 段階A embedding 型ギャップ判定 PoC

## セッション要旨

target spec (web Claude 指示) の「クエリファンアウト × embedding 閉合判定」を、
既存 fact-set 系パイプラインと並列に組み込めるかを 1 記事スコープで PoC 検証。
5 archetype での網羅検証と δ 較正改善を経て、**fact-set と embedding は同じ「網羅性軸」を
扱うように見えて別の問いに答えている** という構造的事実が判明。
それを受けて **二系統並列運用設計** に書き直す確定（案 Z）。

最終更新: 2026-05-21

---

## I. PoC 実装概要

### 追加物 (additive-only、既存ファイル非破壊)

| パス | 役割 |
|---|---|
| node/shared/voyage-adapter.js | Voyage REST 薄ラッパ (voyage-3-large 1024 次元、バッチ自動分割) |
| node/rewrite/embedding-poc/migration.js | 3 テーブル IF NOT EXISTS 作成 + dropAll() |
| node/rewrite/embedding-poc/coverage.js | cosineDense / maxCosineOverPassages / float32 BLOB 直列化 |
| node/rewrite/embedding-poc/report.js | renderMainTable / renderFactDivergence / renderDivergentOnly |
| node/rewrite/scripts/smoke-embedding-poc.js | PoC オーケストレータ (Mode A: ig_id 由来 / Mode B: post+query 直接) |

### 新規テーブル (3)

| テーブル | 役割 |
|---|---|
| master_passage_embedding | passage 単位 embedding 格納 (self / competitor 同居、poc_run_id で run 識別) |
| master_query_coverage_baseline | Q[i] × competitor_max_cosine + δ 保存 |
| master_passage_gap | Q[i] / fact 単位 gap 判定 (judge_type で fact-set / embedding 2 系統並走) |

### 既存ファイル変更 (additive)

- node/shared/wp-structured.js: `splitToPassages()` 関数追加（既存 extractSelfArticle / extractCompetitorContent 完全非改変）

---

## II. 検証スコープ

| 項目 | 確定値 |
|---|---|
| 対象記事 | post_id 5 件: 7170 / 11077 / 7196 / 7235 / 11063 |
| 対象 Q[i] | query_fanout_id=11 (`即日融資 カードローン 金利 比較`) |
| 競合 | rank 1〜3 (kakaku.com / eloan.co.jp / jkeiei.co.jp) |
| Voyage モデル | voyage-3-large 1024 次元 |
| 初期 δ | 0.05 固定 → 較正版 (短語=-0.05 / 短句=0.0 / 長文=+0.05) |

---

## III. PoC 結果（5 archetype 横断、較正後）

| post | archetype | ★ embedding 救出 | ▲ embedding 偽陽性 (較正前→後) |
|---|---|---|---|
| 7170 | 概念解説型 (アルバイト) | 0 / 15※ | (Mode A スコープ) |
| 11077 | 比較型 (10社比較) | 1→4 | 5→0 |
| 7196 | 法令解説型 (総量規制) | 2 | 0 |
| 7235 | ハウツー型 (借り換え) | 1→2 | 2→4 |
| 11063 | 属性別 (年金受給者) | 1 | 3→0 |

※ 7170 のみ Mode A (notes 由来 15 件、他は Mode B competitor union 88 件)

---

## IV. 構造的発見 — fact-set と embedding は別の問いに答えている

### 発見の経緯

post 11077 の ▲ 5 件 (「アコム」「プロミス」等のブランド名) は、較正 δ=-0.05 で全件 no-gap に flip。
一方 post 7235 (借り換え記事) では、同じ較正で逆に ▲ が 2→4 に増加。

「同じ系統の記事で結果が逆になる」現象を構造的に分析した結果:

| 系統 | 答える問い | 動作 |
|---|---|---|
| **fact-set** | 「self に存在するか？」 | LLM 抽出 fact の trim+lowercase 一致 = **包含テスト (binary)** |
| **embedding (calibrated)** | 「self の網羅深度が competitor 以上か？」 | cosine 比較 = **深度評価 (relative)** |

post 11077 (比較型): ブランド名を**深く**カバー → 両系統一致 no-gap
post 7235 (ハウツー型): ブランド名を**リスト的に**カバー → fact-set no-gap (含む) / embedding gap (浅い)

→ **両系統は互換ではなく、補完関係にある**

### target spec との対応

target spec の目的関数:
```
minimize passage_count
subject to: coverage(自記事) ≥ max(coverage(競合上位3〜5)) + δ
```

これは明確に **「深度評価」を要求している** (`coverage ≥ competitor max + δ`)。
embedding (calibrated) こそが target spec の問いに直接答える系統。

一方、fact-set は **「存在/不在の binary 判定」** であり、target spec とは別の問いに答える。
これも独立に有用 (明らかに欠落している必須 fact の検出)。

---

## V. 二系統並列運用設計（確定）

### V-1. テーブル責務分離

```
網羅性軸 (Information Gain)
├── master_information_gain_score (fact-set 系、既存)
│   役割: 包含テスト
│   問い: 「この fact が self に存在するか」(binary)
│   入力: master_fact_set + master_competitor_corpus.fact_set_snapshot
│   出力: gap_count, gap_fact_samples (列挙型)
│
└── master_passage_gap (embedding 系、新規)
    役割: 深度評価
    問い: 「self の網羅深度が competitor を超えるか」(relative)
    入力: master_passage_embedding (self + competitor passages)
    出力: self_max_cosine, competitor_max_cosine, gap_flag (per Q[i] or per fact)
```

### V-2. 案C LLM 実行レイヤーへの入力 bundle

工程6'-A (Opus 4.7 分析) に渡す情報を 3 系統に整理:

```
[案C 入力 bundle]

A. 必須追加 fact (fact-set 由来)
   - master_information_gain_score.notes.gap_fact_samples
   - 意味: 「self に**全く存在しない**」competitor union fact
   - LLM アクション: 「追加で書くべき」候補として提示

B. 深度不足 Q[i] (embedding 由来)
   - master_passage_gap WHERE target_kind='query' AND gap_flag=1 AND judge_type='embedding'
   - 意味: 「Q[i] の網羅深度が competitor を下回る」サブクエリ
   - LLM アクション: 「該当 Q[i] 領域を厚く書く」方針

C. 深度不足 fact (embedding 由来、限定)
   - master_passage_gap WHERE target_kind='fact' AND gap_flag=1 AND judge_type='embedding'
     かつ factset 側で gap_flag=0 (= self に含まれている)
   - 意味: 「self に含むが、competitor より浅い」fact
   - LLM アクション: 「該当 fact 周辺を厚く書く」方針 (新規追加ではない)
```

### V-3. δ 較正規則

```js
function deltaForQuery(text) {
  const len = text.length;
  if (len <= 5)  return -0.05;   // 短語 (ブランド名等)
  if (len <= 15) return  0.00;   // 短句
  return                  0.05;   // 完全クレーム文
}
```

#### 較正論理

- **短語** (ブランド名等、cosine baseline 0.4〜0.7 域に集中):
  → 負 δ で「明確に下回る」場合のみ flag、ノイズ吸収
- **短句** (3〜4 語の検索クエリ):
  → 中立、cosine 絶対差そのまま
- **長文クレーム** (利率や法令文章):
  → 標準 +δ、target spec 仕様通り

#### 適用範囲

- query 単位判定: deltaForQuery(sub_query.text)
- fact 単位判定: deltaForQuery(fact.text)
- baseline 計算は競合最大値のみ (δ は判定時に適用)

---

## VI. 警戒バイアス [23] 追加 (新規)

### [23] fact 概念の意味論曖昧バイアス

**症状**: 「fact」という単語が両系統 (包含テスト / 深度評価) を表すように見え、
        命名統一・テーブル統合の誘惑が働く。実際は別の問いに答えており、
        統合すると問いの違いが消失して PoC のような構造的判定差が見えなくなる。

**事例**: 段階A PoC で「fact-set が拾い embedding が落とす gap」検証中、
        ▲ 逆方向 divergent の解釈で「embedding 偽陽性」と判断しかけたが、
        実際は「fact-set の binary inclusion test では拾えない深度不足」を
        embedding が正しく検出していた。両系統の問いの違いを明示しないと
        どちらかを「正しい / 誤り」と誤断する。

**対策**:
- master_information_gain_score (fact-set) と master_passage_gap (embedding) を統合しない
- 案C プロンプトでは 3 系統 (A: 必須追加 / B: Q[i] 深度 / C: fact 深度) を明示
- 「gap」「fact」の用語を文脈なしで使わない、必ず系統を明記

---

## VII. ロールバック可能性

### 現時点で commit 未

PoC 全体は git 未 commit。完全ロールバック手順:

```bash
# 1. テーブル削除 (SQL 3 文)
sqlite3 node/data/rewrite.db <<'EOF'
DROP TABLE IF EXISTS master_passage_gap;
DROP TABLE IF EXISTS master_query_coverage_baseline;
DROP TABLE IF EXISTS master_passage_embedding;
EOF

# 2. ファイル削除
rm node/shared/voyage-adapter.js
rm -rf node/rewrite/embedding-poc/
rm node/rewrite/scripts/smoke-embedding-poc.js

# 3. wp-structured.js 復元 (splitToPassages 関数 + exports 1 行を git で戻す)
git checkout node/shared/wp-structured.js
```

VOYAGE_API_KEY は .env に残るが副作用なし。

---

## VIII. 段階B (本実装) への申し送り

### 必須組込項目

1. **二系統並列維持** (V-1, V-2)
2. **δ 較正規則** (V-3、クエリ長別バケット)
3. **警戒バイアス [23]** の遵守 (fact 用語の系統明記)

### B-1 設計確定 (本セッション末、2026-05-21、5 論点すべて Claude 推奨採用)

| 論点 | 確定 |
|---|---|
| 1. δ 較正方式 | **クエリ長別バケット** (-0.05 / 0.0 / +0.05)。ratio 正規化は段階C 改善余地として保留 |
| 2. embedding 永続化 | **post_id 単位永続 + 本文ハッシュで invalidate** |
| 3. competitor passage 取得 | **rank 1〜3 維持** (最小性優先) |
| 4. 案C プロンプト 3 系統重み付け | **段階B では別フィールド bundle のみ確定**、重み付けは案C 着手時に判定 |
| 5. poc_run_id カラム | **session_id 置換** (master_rewrite_session.id FK 化) |

### 段階B 作業分解 (B-2〜B-7)

| ステップ | 内容 | 工数 |
|---|---|---|
| B-2 | テーブル本実装 (poc_run_id → session_id, content_hash 追加) + migration | 0.5 日 |
| B-3 | embedding 永続化 (post_id × content_hash UNIQUE) | 1 日 |
| B-4 | δ 較正モジュール切出し | 1 日 |
| B-5 | 案C 入力 bundle API (3 系統返却) | 0.5 日 |
| B-6 | smoke 置換 | 1 日 |
| B-7 | smoke pass 確認 | 0.5 日 |

合計 4.5 日。詳細は knowledge/05 V-A-2-6 参照。

---

## IX. 関連事実 (段階A で観察された副次的事実)

### IX-1. 「総量規制」「貸金業者の登録数」は複数記事で再現する ★ 検出

| ★ で検出された fact | 検出された archetype |
|---|---|
| 「総量規制により年収の3分の1を超える借入は原則禁止」 | 11077 比較 / 7196 法令 / 7235 ハウツー |
| 「貸金業者の登録数は1,538社ある（金融庁データ参照）」 | 7196 法令 / 11063 属性別 |

→ **抽象法令概念・統計数値**は fact-set exact-match の構造的盲点。
   embedding が補完する典型パターン。

### IX-2. 概念解説型 (post 7170) は判定差ゼロ

固有値カバー率が極端に低い記事では fact-set / embedding ともに「全部足りない」判定で一致。
divergent シグナルが出る土壌がないため、検証目的には**比較型・ハウツー型・属性別**が適する。

### IX-3. 競合 winner は rank2 (eloan.co.jp、passages 155 と最多)

passage 分割粒度が baseline 計算に強く効くことが判明。段階B 本実装では passage 分割の
最大文字数 (現 400) の調整余地あり。

---

## X. コミット予定（Daiki 確認後）

```
node/shared/voyage-adapter.js                       (新規)
node/shared/wp-structured.js                        (splitToPassages 追加、additive)
node/rewrite/embedding-poc/migration.js             (新規)
node/rewrite/embedding-poc/coverage.js              (新規)
node/rewrite/embedding-poc/report.js                (新規)
node/rewrite/scripts/smoke-embedding-poc.js         (新規)
design/sessions/2026-05-21_phase4_embedding_poc.md  (新規、本セッション記録)
design/knowledge/05_rewrite_system_design.md        (V-A-2 章追加、XIV [23] 追加)
```
