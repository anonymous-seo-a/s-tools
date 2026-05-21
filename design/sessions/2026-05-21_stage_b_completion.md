# 2026-05-21 段階B 完了セッション

## セッション要旨

段階A PoC の試験実装を「本番運用に耐える二系統並列構造」に書き直し完了。
B-1 設計確定 (5 論点) から B-7 全 archetype smoke pass まで一気通し。

最終更新: 2026-05-21
所要セッション: 同日後半 (前半: 段階A PoC + B-1)
コミット数: B-2〜B-7 = 6 (累計 13 / 1 日)

---

## I. 段階B 完了サマリ

| ステップ | 完了 | コミット |
|---|---|---|
| B-1 設計確定 (5 論点) | ✓ | baef663 |
| B-2 テーブル本実装 | ✓ | 988a07a |
| B-3 embedding 永続化 | ✓ | 07b4e4b |
| B-4 δ 較正モジュール | ✓ | 5cd891f |
| B-5 案C 入力 bundle API | ✓ | ba6d709 |
| B-6 smoke 置換 | ✓ | e4a0f6e |
| B-7 smoke pass 確認 | ✓ | (本コミット) |

合計工数見積 4.5 日 → **実績 約 4 時間 (1 セッション集中作業)**

---

## II. 確立した本実装構造

### II-1. テーブル (V-A-2-2 確定 schema)

```
master_passage_embedding          ← post_id 単位永続キャッシュ
  source_key TEXT NOT NULL        ('post:7170' or 'url:https://...')
  content_hash TEXT NOT NULL      (MD5 of plain_text、本文変更検知)
  UNIQUE(source_key, content_hash, passage_idx)

master_query_coverage_baseline    ← session 単位スナップショット
  session_id NOT NULL FK CASCADE
  query_fanout_id NOT NULL FK RESTRICT

master_passage_gap                ← session 単位スナップショット
  session_id NOT NULL FK CASCADE
  judge_type で fact-set / embedding 並走
```

### II-2. モジュール (4 件)

```
node/rewrite/embedding-poc/
  migration.js          (B-2) applyMigration / dropAndRecreate / contentHash / sourceKey
  passage-store.js      (B-3) getOrComputeEmbeddings / invalidateBySource
  delta-calibration.js  (B-4) deltaForQuery / bucketForQuery / judgeGapFlag / DELTA_BUCKETS
  case-c-bundle.js      (B-5) buildCaseCInputBundle (A/B/C 3 系統返却)
  coverage.js           (段階A 継承) cosineDense / maxCosineOverPassages / float32 BLOB I/O
  report.js             (段階A 継承) renderMainTable / renderFactDivergence / renderDivergentOnly
```

### II-3. smoke (5 件)

```
node/rewrite/scripts/
  embedding-poc-reset.js        (B-2) PoC → 本実装 schema 移行
  smoke-passage-store.js        (B-3) cache miss/hit 検証 (冪等化済)
  smoke-delta-calibration.js    (B-4) 21 assertions unit-test 相当
  smoke-case-c-bundle.js        (B-5) mock session + bundle 抽出検証 (16 assertions)
  smoke-embedding-poc.js        (B-6) E2E 本実装 smoke、CASCADE auto-cleanup
```

---

## III. B-7 検証結果 (全 archetype + 既存非破壊)

### III-1. 5 archetype 通し smoke (post 7170 / 11077 / 7196 / 7235 / 11063、Q[i]=11)

全 5 件 smoke OK 完走、CASCADE cleanup 動作確認。

| post | archetype | self_max | Q[i] judge | ★ embedding 救出 | ▲ embedding 検出 |
|---|---|---|---|---|---|
| 7170 | 概念解説 | (取得済) | gap | 0 | 0 |
| 11077 | 比較型 | 0.660 | gap | **4** (SMBCモビット カードローン / 総量規制 / 総量規制claim / 楽天銀行) | 0 |
| 7196 | 法令解説 | (取得済) | gap | (取得済) | (取得済) |
| 7235 | ハウツー | (取得済) | gap | (取得済) | (取得済) |
| 11063 | 属性別 | 0.522 | gap | **1** (貸金業者の登録数 1,538社) | **1** (レイク) |

★ パターンは段階A PoC 較正版 (sessions/2026-05-21_phase4_embedding_poc.md III) と **完全再現**。
本実装 B-2〜B-5 統合後も「総量規制」「貸金業者数」等の抽象法令概念で
embedding 救出が安定して発生 = fact-set exact-match の構造的盲点を補完できることを確認。

### III-2. cache 効果 (B-3)

post 7170 (self) 2 回目以降の smoke で:
- passages=51 cache=HIT  tokens=0  elapsed=0.01s
- 競合 rank 2 / rank 3 も HIT (155+147 件で tokens=0)

= 1 回 cold start 後の追加実行ではほぼ Voyage コスト発生せず。

### III-3. 既存 smoke 非破壊確認

| smoke | 結果 |
|---|---|
| smoke-article-similarity.js | ✓ smoke OK (cardloan 5 件、tfidf_bigram 動作) |
| smoke-passage-store.js | ✓ smoke OK (冪等化修正後) |
| smoke-case-c-bundle.js | ✓ smoke OK (16 assertions、CASCADE 確認) |
| smoke-delta-calibration.js | ✓ smoke OK (21 assertions) |

冪等化修正 (smoke-passage-store.js):
  B-3 永続化により previous run のデータが残存するため、smoke 開始時に
  invalidateBySource(`post:${postId}`) で pre-clean を追加。
  これは smoke の自己冪等性確保であり、本実装の仕様変更ではない。

---

## IV. B-1 で確定した 5 論点 (全 Claude 推奨採用) と B-2〜B-7 での反映確認

| 論点 | 確定 | 反映場所 |
|---|---|---|
| 1. δ 較正方式 | クエリ長別バケット (-0.05 / 0.0 / +0.05) | delta-calibration.js DELTA_BUCKETS |
| 2. embedding 永続化 | post_id × content_hash UNIQUE、変更検知 invalidate | passage-store.js / master_passage_embedding |
| 3. competitor passage 取得 | rank 1〜3 維持 | smoke-embedding-poc.js (master_competitor_corpus 流用) |
| 4. 案C 3 系統重み付け | 別フィールド bundle のみ、重み付けは案C で | case-c-bundle.js (A/B/C 別フィールド) |
| 5. poc_run_id カラム | session_id FK 置換 | migration.js + master_passage_gap / master_query_coverage_baseline |

---

## V. 段階C (将来) で再評価する論点

V-A-2-6 から継承:

- δ 較正を「クエリ長別バケット」から「ratio 正規化」(self_max / comp_max) への切替
- competitor passage 取得 rank 1〜3 → 1〜5 拡張の必要性
- 案C プロンプト内 3 系統 (A/B/C) の重み付け確定
- master_passage_embedding 多モデル対応 (voyage 以外を試す)

新規追加:
- ★ embedding 救出ケースを A 系統 (required_additions) からフィルタする責務分離
  (現状 A 系統は fact-set notes を生で返す、★ 内容を含む可能性。
   案C 着手時に「embedding 整合で除外」する処理を bundle 側 / プロンプト側どちらに置くか判定)

---

## VI. 案C LLM 実行レイヤー着手準備完了

段階B 完了により案C (Phase 2 残 1 タスク、5〜8 日) の前提が揃った:

### 案C で使う本実装 API

```js
// 1. session 開始
const sessionId = INSERT INTO master_rewrite_session ...

// 2. 入力 bundle 取得 (3 系統)
const bundle = buildCaseCInputBundle({ session_id, post_id, query_fanout_id });
//   bundle.required_additions  ← A 系統 (fact-set 必須追加)
//   bundle.shallow_queries     ← B 系統 (embedding Q[i] 深度不足)
//   bundle.shallow_facts       ← C 系統 (embedding fact 深度不足、divergent)

// 3. embedding は cache 透過
const selfEmbed = await getOrComputeEmbeddings({ source: ..., plain_text, passages });

// 4. gap 判定は judgeGapFlag に統一
const judge = judgeGapFlag({ self_max, comp_max, query_text });

// 5. 案C 完了時 session.status='completed'、必要時 DELETE で CASCADE cleanup
```

### 案C 設計判断 (着手時に判定する論点)

- 工程6'-A (Opus 4.7) プロンプト: 3 系統 (A/B/C) をどう重み付け?
- 工程6'-B (Sonnet 4.6) 差分生成プロンプト: bundle をどう注入?
- master_rules + master_ymyl_requirement の Compliance 制約をどう統合?
- ★ embedding 救出 fact (A 系統内に潜在) のフィルタリング責務

---

## VII. 警戒バイアス [1]〜[23] 段階B 適用結果

段階B 全 6 ステップで以下バイアスを継続警戒:

| バイアス | 適用例 |
|---|---|
| [4] 機能を盛りたくなる | B-3 read-only helper 未追加 / B-4 関数 3 つのみ |
| [11] Adapter 過剰抽象化 | B-3 関数 2 つ / B-5 単一エントリ |
| [12] スケルトン隠れたコスト | 全ステップ ajv なし、unit smoke のみ |
| [22] 環境変数値構造仮定 | env 参照は WP / Voyage のみ、構造仮定なし |
| [23] fact 概念意味論曖昧 | bundle 3 系統別フィールド、テーブル統合禁止 |

新規バイアス確立なし (段階B 範囲内では既存 23 件で十分カバー)。

---

## VIII. 累計コミット (本日、2026-05-21)

```
4fc2e59 feat: master_article_similarity α 実装 (Phase 2 6/7)
c9eabb4 feat: master_hcu_checklist 投入実装 (Phase 2 5/7、前回セッション)
ff13e1d feat: embedding 型ギャップ判定 PoC 実装 (段階A)
a9f70f9 docs: 段階A PoC 結果反映 (V-A-2 二系統並列 / [23])
baef663 docs: 段階B B-1 設計確定 (5 論点 Claude 推奨採用)
988a07a feat: 段階B B-2 完了 - embedding-poc テーブル本実装化
07b4e4b feat: 段階B B-3 完了 - passage-store 永続化レイヤ
5cd891f feat: 段階B B-4 完了 - δ 較正モジュール切出し
ba6d709 feat: 段階B B-5 完了 - 案C 入力 bundle API
e4a0f6e feat: 段階B B-6 完了 - smoke 本実装ベース置換
(本コミット) feat: 段階B B-7 完了 - 全 archetype smoke pass + 既存非破壊確認
```

累計 11 コミット (1 日)。

---

## IX. 次セッション着手

### 候補 1 (★推奨): 案C LLM 実行レイヤー着手 (Phase 2 残 1 タスク、5〜8 日)

段階B で 3 系統入力 bundle API 整備済、案C 着手の前提揃った。
本丸 = 実リライト案生成。

### 候補 2: 一括投入バッチ実装 (cardloan 434 全件、2〜3 日)

本格運用前提を整備。Phase 2 主要数値に反映されないが運用基盤として必要。

### 候補 3: 表現揺れ吸収拡張 (Layer 2 gap 問題、1〜2 日)

fact-set 精度向上、ただし embedding 系で部分的に補完できているため優先度低。

### Claude 推奨: 候補 1 (案C 着手)

理由:
- Phase 2 完成 (7/7) まで最短経路
- 段階B 所産を直ちに案C で活用、構造記憶が新鮮なうちに統合
- 候補 2/3 は案C smoke 動作後でも遅くない
