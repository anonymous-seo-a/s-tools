# soico SEO リライトシステム — Claude Code 引き継ぎ文書

最終更新: 2026-04-28
発注元: Daiki

---

## 0. このドキュメントの位置づけ

soico /no1/（金融YMYLアフィリエイトメディア）のSEO記事を、
真=美フレームワークに基づきAIと人間の役割分担で自動リライトするシステム。

本ドキュメントは Claude Code が以下を実行するための完全引き継ぎ書である:
- リポジトリ構造の初期化
- ドキュメント群の作成
- マスター管理機能（DB + API + UI）の実装

---

## 1. リポジトリ

- URL: https://github.com/anonymous-seo-a/s-tools
- 既存運用: VPS `/var/www/rewrite/`、pm2 `rewrite-app`、URL https://rewrite.anonymous-seo.jp/
- 既存スタック: Node.js + Express + better-sqlite3 + React/Vite
- 統合方針: 新規プロジェクト化せず、既存s-toolsに「SEOリライトタブ」追加

ブランチ: `feature/rewrite-master-ui` を新規切り出し

---

## 2. 設計原理（最重要・必読）

### 真=美フレームワーク

「美しさは審美的好みではなく、構造的必然性である」を全判断の基盤に置く。

3つの判定テスト:
- **必然性テスト**: この要素を除いたら構造は崩壊するか
- **閉合性テスト**: 外部への依存を最小にできているか
- **最小性テスト**: より少ない要素で同じ機能を実現できないか

### システム設計の重心
誤った設計: LLMにリライトさせる
正しい設計: マスターデータを主役にし、LLMは検出+組立+生成を担当

理由:
- LLMの強み = 生成（テキスト量産）
- LLMの弱み = 判定（何が必然で何が余剰か）
- Daikiの強み = 判定（真=美の検出）

LLMに「いい感じにリライトして」と任せた瞬間、
出力は一般的AI記事に収束し、CVR 5〜10% は再現されない。

### 役割分担

| 役割 | 担当 |
|------|------|
| 真=美の判定 | Daiki（委譲不可） |
| マスターデータ構築 | ゆかちゃん（Daiki検証必須） |
| 検出 + 組立 + 生成 | LLM (Claude API) |
| 実装 | Claude Code |
| 最終承認 | Daiki |

---

## 3. システム全体像

### 検索意図3層構造（YMYL記事の品質基準）

- **顕在ニーズ**: 検索者が言語化している表層のニーズ
- **潜在ニーズ**: 顕在の背後にある動機（バレたくない、無職、等）
- **安心ニーズ**: YMYL信頼性（違法業者でないか、法的に問題ないか）

→ 3層全てが閉じている記事のみがGoogleに1位として評価される

### 4つの技術課題と統一的解決

注釈・画像・アフィリエイトリンク・出典リンクは全て
「真=美の必然要素」として統一的に扱える。
記事 = テキスト + 注釈 + 画像 + アフィリンク + 出典リンク
全要素が真=美テストを通過した状態 = 完成
各要素はマスターテーブルとして外部化し、
LLMは「検出 → マスター参照 → 配置」のパイプラインで処理する

---

## 4. マスターテーブル4種

### スキーマDDL

```sql
-- ----------------------------------------------------------------
-- 1. master_annotations: 商材別注釈マスター
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_annotations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        TEXT NOT NULL,
  product_name      TEXT NOT NULL,
  category          TEXT NOT NULL,
  trigger_pattern   TEXT NOT NULL,
  trigger_type      TEXT NOT NULL DEFAULT 'keyword',
  trigger_priority  INTEGER NOT NULL DEFAULT 0,
  annotation_type   TEXT NOT NULL,
  annotation_text   TEXT NOT NULL,
  symbol            TEXT,
  scope             TEXT NOT NULL DEFAULT '商材言及時',
  source_url        TEXT,
  verified_at       DATE,
  verified_by       TEXT,
  status            TEXT NOT NULL DEFAULT 'draft',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('draft', 'verified', 'deprecated')),
  CHECK (trigger_type IN ('keyword', 'regex', 'and_condition'))
);

CREATE INDEX idx_ann_product ON master_annotations(product_id);
CREATE INDEX idx_ann_category ON master_annotations(category);
CREATE INDEX idx_ann_status ON master_annotations(status);

-- ----------------------------------------------------------------
-- 2. master_rules: 表現ルールマスター
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_rules (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  category          TEXT NOT NULL,
  product_ids       TEXT NOT NULL,
  rule_type         TEXT NOT NULL,
  ng_text           TEXT NOT NULL,
  correct_text      TEXT,
  condition         TEXT NOT NULL DEFAULT '常に',
  legal_basis       TEXT,
  source_url        TEXT,
  verified_at       DATE,
  verified_by       TEXT,
  status            TEXT NOT NULL DEFAULT 'draft',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('draft', 'verified', 'deprecated')),
  CHECK (rule_type IN ('禁止表現', '必須表現', '正式表記'))
);

CREATE INDEX idx_rules_category ON master_rules(category);
CREATE INDEX idx_rules_status ON master_rules(status);

-- ----------------------------------------------------------------
-- 3. master_completeness_checklist: 完成度管理
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_completeness_checklist (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  category          TEXT NOT NULL,
  product_id        TEXT NOT NULL,
  check_item        TEXT NOT NULL,
  check_order       INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending',
  assignee          TEXT,
  completed_at      DATE,
  notes             TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('pending', 'in_progress', 'done'))
);

CREATE INDEX idx_check_product ON master_completeness_checklist(product_id);
CREATE INDEX idx_check_status ON master_completeness_checklist(status);

-- ----------------------------------------------------------------
-- 4. master_audit_log: 編集履歴
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_audit_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name        TEXT NOT NULL,
  record_id         INTEGER NOT NULL,
  action            TEXT NOT NULL,
  changed_by        TEXT NOT NULL,
  before_value      TEXT,
  after_value       TEXT,
  changed_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (action IN ('create', 'update', 'delete'))
);

CREATE INDEX idx_audit_table ON master_audit_log(table_name, record_id);
CREATE INDEX idx_audit_changed_at ON master_audit_log(changed_at);
```

### 設計意図

| カラム | 設計意図 |
|--------|---------|
| `trigger_type` | keyword/regex/and_condition で揺れ吸収を構造化 |
| `verified_by` | Daiki/ゆかちゃん/Arai-san の責任所在明示 |
| `status` 3値 | draft（未検証）→ verified（真=美検証済）→ deprecated（廃止） |
| `product_ids` カンマ区切り | 既存GAS実装との互換性維持（`'ALL'`含む） |
| audit_log の before/after | JSON文字列で全カラム記録（変更追跡完全性） |

---

## 5. 初期データ（既存GAS実装から移植）

すべて status='draft' で投入。Phase D で Daiki が verified に昇格させる。

### master_annotations 初期データ（15件）

```sql
INSERT INTO master_annotations
  (product_id, product_name, category, trigger_pattern, trigger_type,
   annotation_type, annotation_text, symbol, scope, status)
VALUES
  -- アイフル
  ('aiful', 'アイフル', 'cardloan', '最短18分', 'keyword',
   '審査・融資', 'お申込み時間や審査状況によりご希望にそえない場合があります。', '※ai', '商材言及時', 'draft'),
  ('aiful', 'アイフル', 'cardloan', '800万円', 'keyword',
   '限度額', 'ご利用限度額50万円超、または他社を含めた借り入れ金額が100万円超の場合は源泉徴収票など収入を証明するものが必要です。', '※ai', '商材言及時', 'draft'),
  ('aiful', 'アイフル', 'cardloan', '郵送物なし', 'keyword',
   '郵送物', '「スマホでかんたん本人確認」又は「銀行口座で本人確認」をし、カード郵送希望無の場合郵送物は届きません。', '※ai', '商材言及時', 'draft'),
  ('aiful', 'アイフル', 'cardloan', 'WEB完結', 'keyword',
   'WEB完結', '申込等内容に不備があれば電話確認あり。', '※ai', '商材言及時', 'draft'),

  -- アコム
  ('acom', 'アコム', 'cardloan', '最短20分', 'keyword',
   '審査・融資', 'お申込時間や審査によりご希望に添えない場合がございます。', '※a', '商材言及時', 'draft'),
  ('acom', 'アコム', 'cardloan', '即日融資', 'keyword',
   '即日融資', 'アコムの当日契約の期限は21時までです。', '※a', '商材言及時', 'draft'),
  ('acom', 'アコム', 'cardloan', '無利息', 'keyword',
   '無利息期間', 'アコムでのご契約がはじめてのお客さま', '※a', '商材言及時', 'draft'),

  -- プロミス
  ('promise', 'プロミス', 'cardloan', '最短3分', 'keyword',
   '審査・融資', 'お申込時間や審査によりご希望に添えない場合がございます。', '※p', '商材言及時', 'draft'),
  ('promise', 'プロミス', 'cardloan', '無利息', 'keyword',
   '無利息期間', 'メールアドレス登録とWeb明細利用の登録が必要です。', '※p', '商材言及時', 'draft'),
  ('promise', 'プロミス', 'cardloan', '800万円', 'keyword',
   '限度額', '借入限度額は審査によって決定いたします。', '※p', '商材言及時', 'draft'),
  ('promise', 'プロミス', 'cardloan', '18歳', 'keyword',
   '申込対象', '主婦・学生でもアルバイト・パートなど安定した収入のある場合はお申込いただけます。ただし、高校生（定時制高校生および高等専門学校生も含む）はお申込いただけません。また、収入が年金のみの方はお申込いただけません。', '※p', '商材言及時', 'draft'),
  ('promise', 'プロミス', 'cardloan', '事前審査,15秒', 'and_condition',
   '事前審査①', '事前審査結果ご確認後、本審査が必要となります。', '※p', '商材言及時', 'draft'),
  ('promise', 'プロミス', 'cardloan', '事前審査,15秒', 'and_condition',
   '事前審査②', '新規契約時のご融資上限は、本審査により決定となります。', '※p', '商材言及時', 'draft'),

  -- SMBCモビット
  ('mobit', 'SMBCモビット', 'cardloan', '最短15分', 'keyword',
   '審査・融資', '申込の曜日、時間帯によっては翌日以降の取扱となる場合があります。', '※m', '商材言及時', 'draft'),
  ('mobit', 'SMBCモビット', 'cardloan', '800万円', 'keyword',
   '限度額', '借入限度額は審査によって決定いたします', '※m', '商材言及時', 'draft');
```

### master_rules 初期データ（21件）

```sql
INSERT INTO master_rules
  (category, product_ids, rule_type, ng_text, correct_text, condition, status)
VALUES
  -- 禁止表現（全社共通）
  ('cardloan', 'ALL', '禁止表現', '審査が甘い', '', '常に', 'draft'),
  ('cardloan', 'ALL', '禁止表現', '審査簡単', '', '常に', 'draft'),
  ('cardloan', 'ALL', '禁止表現', '審査が柔軟', '', '常に', 'draft'),
  ('cardloan', 'ALL', '禁止表現', '無審査', '', '常に', 'draft'),
  ('cardloan', 'ALL', '禁止表現', '確実融資', '', '常に', 'draft'),
  ('cardloan', 'ALL', '禁止表現', '絶対借入できる', '', '常に', 'draft'),
  ('cardloan', 'ALL', '禁止表現', 'ブラックでも借りられる', '', '常に', 'draft'),
  ('cardloan', 'ALL', '禁止表現', '業界最速', '', '常に', 'draft'),
  ('cardloan', 'ALL', '禁止表現', '最強', '', '常に', 'draft'),
  ('cardloan', 'ALL', '禁止表現', 'リスクなし', '', '常に', 'draft'),

  -- 必須表現（全社共通）
  ('cardloan', 'ALL', '必須表現', '電話なし', '原則電話による在籍確認なし', '商材言及時', 'draft'),
  ('cardloan', 'ALL', '必須表現', '電話連絡なし', '原則電話による在籍確認なし', '商材言及時', 'draft'),
  ('cardloan', 'ALL', '必須表現', 'バレない', '知られない', '商材言及時', 'draft'),
  ('cardloan', 'ALL', '必須表現', 'バレずに', '知られずに', '商材言及時', 'draft'),
  ('cardloan', 'ALL', '必須表現', '内緒で', '周囲に知られにくい', '商材言及時', 'draft'),

  -- 正式表記（商材別）
  ('cardloan', 'acom', '正式表記', '30日間無利息', '初めての方は契約翌日から最大30日間無利息', '商材言及時', 'draft'),
  ('cardloan', 'promise,aiful,mobit', '正式表記', '30日間無利息', '初回最大30日間無利息', '商材言及時', 'draft'),
  ('cardloan', 'acom', '必須表現', '在籍確認なし', '原則電話によるお勤め先への在籍確認なし', '商材言及時', 'draft'),
  ('cardloan', 'mobit', '必須表現', 'セブン銀行ATM', 'セブン銀行の提携ATM', '商材言及時', 'draft'),
  ('cardloan', 'mobit', '必須表現', 'ローソン銀行ATM', 'ローソン銀行の提携ATM', '商材言及時', 'draft'),

  -- モビット固有
  ('cardloan', 'mobit', '必須表現', '誰にもバレない', 'WEB完結申込なら誰にもバレない', '商材言及時', 'draft');
```

### master_completeness_checklist 初期データ（56件）

カードローン4社（acom/aiful/promise/mobit）× 14項目 = 56チェック。

各product_idに対して以下14項目をINSERTする。
SQL生成スクリプトで一括生成すること（手書きしない）。

```javascript
// 生成ロジック例
const products = ['acom', 'aiful', 'promise', 'mobit'];
const checkItems = [
  { order: 1,  item: '特商法表記の全注釈をカバー',                       assignee: 'ゆかちゃん' },
  { order: 2,  item: '公式FAQの注意事項を全件登録',                      assignee: 'ゆかちゃん' },
  { order: 3,  item: '商品概要説明書の注釈事項を全件登録',                assignee: 'ゆかちゃん' },
  { order: 4,  item: '各種金利の正式表記登録（実質年率/上限金利）',       assignee: 'ゆかちゃん' },
  { order: 5,  item: '限度額の正式表記登録',                              assignee: 'ゆかちゃん' },
  { order: 6,  item: '審査時間の正式表記登録(最短/通常)',                 assignee: 'ゆかちゃん' },
  { order: 7,  item: '即日融資条件の正式表記登録',                        assignee: 'ゆかちゃん' },
  { order: 8,  item: '無利息期間の正式表記登録',                          assignee: 'ゆかちゃん' },
  { order: 9,  item: '在籍確認関連の正式表記登録',                        assignee: 'ゆかちゃん' },
  { order: 10, item: '申込対象（年齢/職業/収入）の正式表記登録',           assignee: 'ゆかちゃん' },
  { order: 11, item: '訴求KW揺れパターン(敬語/口語/略語/表記ゆれ)',       assignee: 'ゆかちゃん' },
  { order: 12, item: '業界共通の禁止表現が反映',                          assignee: 'Daiki' },
  { order: 13, item: '競合差別化訴求の正式表記登録',                      assignee: 'ゆかちゃん' },
  { order: 14, item: 'レギュレーション最終更新日の確認(鮮度)',            assignee: 'Daiki' },
];

// products × checkItems で56件INSERTを生成
```

---

## 6. 実装スコープ

### 6.1 Backend API（Express）
GET    /api/masters/annotations           一覧（フィルタ: category, product_id, status）
GET    /api/masters/annotations/:id       詳細
POST   /api/masters/annotations           新規追加
PUT    /api/masters/annotations/:id       更新
DELETE /api/masters/annotations/:id       論理削除（status='deprecated'）
GET    /api/masters/rules                 一覧
GET    /api/masters/rules/:id             詳細
POST   /api/masters/rules                 新規追加
PUT    /api/masters/rules/:id             更新
DELETE /api/masters/rules/:id             論理削除
GET    /api/masters/checklist             一覧（フィルタ: category, product_id, status）
PUT    /api/masters/checklist/:id         状態更新
GET    /api/masters/audit-log             一覧（フィルタ: table_name, record_id, 期間）
POST   /api/masters/import                CSVインポート（テーブル指定）
GET    /api/masters/export                CSVエクスポート（テーブル指定）
GET    /api/masters/completeness-summary  完成度ダッシュボード用集計

要件:
- 全 POST/PUT/DELETE は audit_log に自動記録（before/after を JSON文字列）
- 変更ユーザーは固定値 'Daiki'（s-tools にアプリ層認証なし、SSH/root ベース運用のため）
- バリデーションエラーは構造化されたJSONで返却
- ページネーション対応（一覧系API）

### 6.2 Frontend（React/Vite）

#### 画面構成
/masters/                       ダッシュボード（完成度可視化）
/masters/annotations            注釈マスター一覧
/masters/annotations/new        新規追加
/masters/annotations/:id        編集
/masters/rules                  ルールマスター一覧
/masters/rules/new
/masters/rules/:id
/masters/checklist              完成度チェック一覧
/masters/audit-log              編集履歴

#### 必須UI機能

- **一覧**: テーブル表示、ソート、検索、フィルタ（category/product_id/status複合）
- **編集**: 詳細フォーム、バリデーション、保存時 confirm
- **削除**: 論理削除（status='deprecated'）、確認モーダル
- **一括操作**: 複数選択 → 一括 status 変更
- **インポート**: CSV ドラッグ&ドロップ → プレビュー（エラー行は画面上で修正） → 確定
- **エクスポート**: フィルタ条件で絞った結果を CSV ダウンロード
- **ダッシュボード**: 商材別完成度プログレスバー（チェックリスト進捗 + 注釈検証進捗 を別バー）

#### バリデーション

- annotation_text: 必須、改行可、HTML可
- trigger_pattern: 必須、trigger_type='regex'時は正規表現構文チェック
- source_url: URL形式チェック（任意項目）
- verified_at: 日付形式
- status: enum値チェック

#### スマホ対応

最低限のレスポンシブ対応。
管理画面なのでデスクトップ優先で良いが、外出先からの確認用途で
読み取り操作はスマホで完結すること。

### 6.3 認証

s-tools にはアプリ層認証なし。VPS への SSH/root 接続前提で運用。
audit_log の changed_by は固定値 `'Daiki'` を記録する（拡張余地として将来 X-User ヘッダ受領も考慮）。

ゆかちゃん用 ReadOnly ロールは不要（Phase E スコープから除外）。

---

## 7. ディレクトリ構造（提案）

```
s-tools/
├── docs/
│   └── rewrite-system/
│       ├── README.md                    システム全体像（このドキュメント要約）
│       ├── 00-philosophy.md             真=美フレームワーク
│       ├── 03-roadmap.md                全体ロードマップ + 進捗
│       ├── 04-phase-a-design.md         Phase A 設計（このドキュメントの完全版）
│       └── decisions/                   意思決定ログ
├── legacy/
│   └── gas/
│       ├── README.md
│       ├── clasp/                       既存 GAS コード（参照用）
│       └── prompts/
└── node/
    ├── master-db.js                     ← 新規: マスターテーブル init + クエリ
    ├── masters-routes.js                ← 新規: /api/masters/* ルーティング
    ├── server.js                        既存（masters-routes を mount）
    └── client/
        └── src/
            └── masters/                 ← 新規UI
                ├── Dashboard.jsx
                ├── AnnotationList.jsx
                ├── AnnotationEdit.jsx
                ├── RuleList.jsx
                ├── RuleEdit.jsx
                ├── ChecklistView.jsx
                └── AuditLog.jsx
```

ドキュメント群もこの実装と同じPRに含めること。
**ドキュメント無しに次フェーズに進まない**を運用ルールとする。

実装ディレクトリ配置は既存 s-tools のフラット構造（routes/ や pages/ サブディレクトリなし）に合わせて、
`master-db.js` / `masters-routes.js` をモジュール化して `server.js` から `require` + `app.use()` する形を採用。

---

## 8. 動作確認項目

- [ ] 4テーブル新規作成、既存テーブルへの影響なし
- [ ] 初期データ56件＋15件＋21件が投入される
- [ ] 各CRUDが動作
- [ ] audit_log が全操作で記録される（before/after JSONが正しい）
- [ ] CSV インポート/エクスポートが文字化けなく動作（UTF-8 BOM対応）
- [ ] ダッシュボードに完成度が表示される（4社×14項目=56の進捗バー + 注釈検証バー）
- [ ] 論理削除（status='deprecated'）が機能し、一覧から非表示になる
- [ ] スマホからも基本操作可能（最低限のレスポンシブ）

---

## 9. 既存コードとの統合

- pm2 `rewrite-app` 配下に統合
- 既存 `monitor-collectors.js` / `gap-fill.js` には変更を加えない
- 既存 SQLite ファイルパスをそのまま使用
- 既存スキーマには触れない（新テーブル追加のみ）

---

## 10. 全体ロードマップ（5週間計画）

| Week | フェーズ | 担当 | 成果物 |
|------|---------|-----|--------|
| 1 | A: 設計確定 | Daiki | 設計仕様書 + 発注書（**完了**） |
| 1-2 | E: 実装 | Claude Code | マスター管理画面 ← **今ここ** |
| 2-3 | B/C: 収集・抽出 | ゆかちゃん | マスターデータ初期投入 |
| 4 | D: 真=美検証 | Daiki | verified データ |
| 5 | F: 統合テスト | Daiki + Claude Code | カードローン完璧化完了 |

Phase E（このタスク）の想定工数: 3-5営業日

---

## 11. 後続フェーズで必要となる機能（参考・実装不要）

このタスクのスコープ外だが、後続で実装される機能を理解しておくこと:

- リライト対象選定モジュール（s-tools SQLite から daily_metrics 等を読む）
- SERP分析モジュール（Ahrefs CSV アップロード）
- 検索意図3層分解モジュール（LLM）
- 真=美判定モジュール（必然性/閉合性/最小性を1呼び出しで3観点評価）
- E-E-A-T充足度モジュール
- AI Overview適性モジュール
- リライト指示書生成モジュール（マスター参照を含む）
- AIリライト実行モジュール（claude-opus-4-7 が指示書ベースで本文書き換え）
- レビューUI（Before/After diff）
- WordPress書き込み（既存 gap-fill.js の updateWpPost() 流用）

これらは **rewrite_instructions / rewrite_drafts テーブル** を中心に
既存s-tools内に追加実装される予定。
master_* テーブルとは外部キー関係を持たないが、同DB内に共存する。

---

## 12. 既存資産（参考実装）

注釈処理ロジックの既存実装はGAS版にあり、`legacy/gas/` 配下に配置済み。
特に注釈の3形式出し分け（記号/番号/インライン）の決定論的アルゴリズムは
既に実装済みでテスト完了している。

該当ロジック（`legacy/gas/clasp/annotation_master.js`）:
- `extractAnnotationsToPlaceholders()` — 既存注釈のプレースホルダー退避
- `restoreAnnotationsFromPlaceholders()` — 復元
- `postProcessAnnotations()` — マスター参照による注釈挿入

これらはNode.jsへの移植が後続フェーズで必要になるが、
**Phase E のスコープではない**。

ただし、マスター管理画面のスキーマ設計が既存ロジックと整合する必要があるため、
不明点があれば該当GASコードを確認すること。

---

## 13. 不明点があれば

GitHub Issue を切ること。
仕様判断が必要なものは Daiki が判定する。
実装上の細部はClaude Code側の判断で進めて良い。

---

## 14. このタスクの完了定義

- [ ] feature/rewrite-master-ui ブランチがmainにマージされる
- [ ] https://rewrite.anonymous-seo.jp/masters/ で管理画面が動作
- [ ] 初期データ92件（注釈15+ルール21+チェック56）が投入済み
- [ ] docs/rewrite-system/ にドキュメント群が配置される
- [ ] Daikiレビューで「Week 1 Phase E完了」と判定される
