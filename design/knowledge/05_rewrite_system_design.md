# ナレッジファイル5：リライトAIシステム設計

最終更新: 2026年5月5日（Phase 4 MVP Phase 1 完了 — 対象選定の自動化が一通り稼働可能状態）
ステータス: Phase 4 実装フェーズ進行中（MVP Phase 1 = 対象選定の自動化 完了、MVP Phase 2 = 自走システム本格稼働 未着手）

このファイルは、Daikiの「自走リライトシステム」の設計確定事項を記録する。
新規チャットセッションでの設計継続のために必要な情報を構造化保存する。

---

## I. 設計プロセスの全体像

```
Phase 0: リサーチお題設計          完了
Phase 1: Researchモードでの調査     完了
Phase 2: 採用判定（Step A〜B）
  Step A-1: Information Gain        完了
  Step A-2: Query Fan-out           完了
  Step A-3: Evidence Layer          完了
  Step A-4: SEO A/B Testing         完了
  案E: リライト対象選定の新規設計   完了
  案C: LLM実行レイヤー設計         完了
  案D: 統合確認                    完了
  案B: 強推奨手法の確定            完了
  ──────設計フェーズ全完了──────
Phase 3: 詳細設計                  完了 (論点0〜5 全確定、2026-05-01)
Phase 4: 実装
  MVP Phase 1: 対象選定の自動化    完了 (2026-05-05)
  MVP Phase 2: 自走システム本格稼働 未着手  ← 次の作業
  MVP Phase 3: 学習ループ稼働      未着手
```

---

## II. システム全体像（リライト処理8工程）

```
工程1: リライト対象選定        AI（案E: 4軸独立キュー）
工程2: 競合構造分析（SERP分析） AI（Query Fan-out 二段構造）
工程3: 検索意図分解            AI（工程2と統合実装、JTBD 5次元拡張）
工程4: ギャップ抽出            AI（Information Gain）
工程5: 差分生成                AI + 人間（IG Score 駆動）
工程6: 人間判定（真=美フィルタ） 人間（Daiki）
工程6': LLM実行レイヤー        AI（案C: Opus 4.7 分析 + Sonnet 4.6 生成、差分パッチ）
工程7: 実装（WordPress 反映）  AI
工程8: 効果測定・学習ループ    AI + 人間（A/Bテスト 3層学習）
```

---

## III. 採用した手法（最優先5手法 + 案B 採用8件）

レポート（Phase 1の調査結果）から「日本未採用×海外採用×Google一次情報支持」の最優先5手法を全て採用。
さらに案B で強推奨手法の精査を行い、追加8件採用、3件不採用、1件既確定として確定。

### 最優先5手法（Step A 採用）

#### 1. Information Gain 駆動の差分生成（Step A-1）
- 一次情報根拠: Contextual Estimation of Link Information Gain 特許
  + HCU "Does the content provide insightful analysis or interesting information that is beyond the obvious?"
- KPI: Information Gain スコア（特許準拠）を直接KPI化
- 3レイヤー全採用（エンティティ + 事実主張 + 経験）

#### 2. Query Fan-out 構造シミュレーション（Step A-2）
- 一次情報根拠: developers.google.com/search/docs/appearance/ai-features
  + 特許 US 12158907B1（Thematic Search）, US 2024/0289407A1（Search with Stateful Chat）
- 二段構造（Layer1主題分解 + Layer2 micro-intent展開）
- Layer1のみ競合URL収集、Layer2はセクション設計の参考情報

#### 3. Original research / 独自データ生成（Step A-3 統合）
- 一次情報根拠: HCU "Does the content provide original information, reporting, research, or analysis?"
- Evidence Layer に統合管理

#### 4. First-hand experience markers（Step A-3 統合）
- 一次情報根拠: E-E-A-Tの "Experience"（2022年12月追加）
- Evidence Layer に統合管理

#### 5. SearchPilot方式 SEO A/B Testing（Step A-4）
- 一次情報根拠: John Mueller "test things" 推奨発言
  + SearchPilot 実証ベンチマーク（業界広範な交差確認）
- 完全SearchPilot方式採用（記事数3,000規模で統計的検出力成立）

### 案B 採用8件（強推奨手法の追加採用）

| # | 手法 | 配置 |
|---|---|---|
| 1 | Content decay 検出 + pruning | 案E 軸4 独立キュー |
| 2 | Cannibalization 検出（SERP重複ベース） | 関連度テーブル共有（Phase 3） |
| 3 | Micro-intent × JTBD 分解 | Step A-2 統合（intent_dimension JSON） |
| 4 | Question gap (PAA + サジェスト + 関連検索) | Step A-2 既存スキーマで完結 |
| 5 | HCU 22項目チェックリスト | 独立テーブル master_hcu_checklist |
| 9 | Hub-and-spoke internal linking | 関連度テーブル共有（Phase 2 α） |
| 11 | SC API 多変量 decay 検出 | Phase 2 案C 入力情報（クエリレベル） |
| 12 | 28日窓×90日窓 traffic 差分 | 案E 軸4 統合 |

### 案B 不採用3件（採用却下）

| # | 手法 | 却下理由 |
|---|---|---|
| 6 | Author expertise schema | CMS 側で構造化、監修判断は人間 |
| 7 | 階層的 schema（Article + Product + Review + Person + Organization） | CMS 側で対応、リライトシステム責務外 |
| 10 | Core Web Vitals (INP) 監視 | リライト主流路外 + Clarity engagement_score と機能重複 |

### 案B 既確定1件

| # | 手法 | 確定箇所 |
|---|---|---|
| 8 | FAQ/HowTo schema 不実装 | 既確定（VII章） |

---

## IV. 採用したインフラ

| 項目 | 選定 | 月額目安 | 備考 |
|---|---|---|---|
| SERP API | SerpApi（サブスクStarter） | $25 | 月50記事ペースで250クエリ/月想定 |
| CDN/Edge Layer | Cloudflare Workers | 既存 | A/Bテストvariant injection用 |
| ヒートマップ | Microsoft Clarity | 無料 | A/Bテスト判定 + リライト計画補助 |
| LLM | Anthropic Claude API（OpenAI / Gemini Adapter 対応） | 数千円〜1万円 | 工程6': Opus 4.7 + Sonnet 4.6 |
| 既存スタック | Node.js + Express + better-sqlite3 + React/Vite | - | 維持 |
| GitHub | anonymous-seo-a/s-tools | - | Single Source of Truth |
| Archive | Wayback + archive.today (Adapter化) | 無料 | URL アーカイブ・健全性チェック |

合計運用コスト目安: 月1〜1.5万円程度。

### 既存システム（s-tools/monitor）の再利用方針

| 既存資産 | 再利用方針 |
|---|---|
| monitor-collectors.js（GA4/GSC/WP取得層） | 流用、当面は monitor.db 経由で間接利用 |
| monitor.db（articles, daily_metrics 等） | Read-Only 参照（リライトシステムから） |
| EXCLUDED_CATEGORIES（カテゴリ除外定数） | 共通定数として継承 |
| monitor-analysis.js（buildPrompt） | 案C LLM実行レイヤーの起点として活用、再発明禁止 |
| A系（runScoring）スコア | リライト対象選定では使わない（CTA優先度が本来の目的） |
| B系（alertScore）スコア | リライト対象選定では使わない（順位観測が本来の目的） |
| analysis_comments | 案V: 直近1件を案C プロンプトに参考情報として渡す（NULL 許容） |
| master-db.js / masters-routes.js（Phase E 既実装） | 流用、ただし DB_PATH を rewrite.db に切替（論点0 確定） |
| Phase E 既存4テーブル（master_annotations / master_rules / master_completeness_checklist / master_audit_log） | rewrite.db に物理移管、新設計と統合（論点0 確定、Phase 4 着手時に DROP+移行） |

### 物理ディレクトリ構成（s-tools 配下、案C + 案D 確定）

```
s-tools/
├── node/
│   ├── shared/                           ← 案C 5-c で確立
│   │   ├── article-context.js            （共通コンテキスト集約）
│   │   ├── wp-structured.js              （fetchWpStructured: 82%削減実測）
│   │   ├── llm-adapters/                 （Anthropic + OpenAI + Gemini）
│   │   │   ├── anthropic-adapter.js
│   │   │   ├── openai-adapter.js
│   │   │   ├── gemini-adapter.js
│   │   │   └── adapter-interface.js
│   │   └── archive-adapters/             ← 案D 3.H で追加
│   │       ├── wayback-adapter.js        （Phase 1 稼働）
│   │       ├── archive-today-adapter.js  （Phase 2-3 拡張）
│   │       └── adapter-interface.js
│   ├── monitor/                          （既存）
│   └── rewrite/                          ← 案C 5-c-2 で確立
│       ├── target-selection/             （工程1 案E）
│       ├── query-fanout/                 （工程2-3 Step A-2）
│       ├── ig-score/                     （工程4-5 Step A-1）
│       ├── llm-execution/                （工程6' 案C）
│       ├── ab-testing/                   （工程8 Step A-4）
│       └── api/                          （Express ルーティング）
└── data/
    ├── monitor.db                        （既存、Read-Only 参照対象）
    └── rewrite.db                        ← 案E で確立（新規）
```

---

## V. 全26テーブル一覧（論点4 確定後: master_site_audit_score 追加）

### Phase 別配置

```
[Phase E 既実装、Phase 4 で rewrite.db に移管: 4 テーブル]   ★ 論点0 (2026-05-01)
  E1. master_annotations              （訴求KW別注釈マスター、15行 seed）
  E2. master_rules                    （表現ルール: 禁止/必須/正式表記、21行 seed）
  E3. master_completeness_checklist   （マスター整備進捗、56行 seed、HCU記事評価とは別）
  E4. master_audit_log                （汎用監査ログ、マスター類の編集履歴）

[Phase 1 で実装: 2 テーブル]
  1. master_rewrite_target_score
  2. master_rewrite_queue

[Phase 2 で実装: 12 テーブル]   ← 案B で +2
  3. master_post_target_query              ★ 案D 2.A
  4. master_query_fanout
  5. master_competitor_corpus
  6. master_fact_set
  7. master_evidence
  8. master_evidence_article_link
  9. master_information_gain_score
  10. master_rewrite_session
  11. master_rewrite_diff
  12. master_rewrite_queue_session_link    ★ 案D 4.M'
  13. master_hcu_checklist                 ★ 案B (#5)
  14. master_article_similarity            ★ 案B (#9, #2) - α指標のみPhase 2

[Phase 3 で実装: 8 テーブル]   ← 論点3 +1, 論点4 +1
  15. master_regulation_event
  16. master_partner_status_history
  17. master_ab_test
  18. master_ab_test_result
  19. master_ab_test_pattern
  20. master_clarity_signal
  21. master_ymyl_requirement              ★ 論点3 (2026-05-01)
  22. master_site_audit_score              ★ 論点4 (2026-05-01)
```

合計: 26テーブル（Phase E 4 + 案D完了時点 18 + 案B 追加 2 + 論点3 追加 1 + 論点4 追加 1）

### 命名衝突の整理（論点0 確定後）

| 既存（Phase E） | 新設計 | 関係 |
|---|---|---|
| `master_rules` | `master_regulation_event` | 粒度違いの親子関係。法令イベント（イベント単位、数件）→ 由来する運用ルール（N件）。当面は legal_basis (TEXT) で間接接続、Phase 3 後半で regulation_event_id 導線を検討 |
| `master_completeness_checklist` | `master_hcu_checklist` | 用途違い。前者=マスター整備進捗（ゆかちゃん運用）/ 後者=記事ごとの HCU 22項目評価（LLM 自動評価）。命名類似は許容（用途明示で分離可能、改名は破壊的なので避ける） |
| `master_audit_log` | （対応物なし） | 汎用監査ログとして昇格、リライト関連マスター全体の編集履歴に流用 |
| `master_annotations` | （対応物なし） | Compliance Layer の訴求KW注釈実体として継続、論点3 で参照ロジック設計 |

---

## V-A. 全テーブル SQL 定義（案D + 案B 反映 最終版）

### Phase 1: 案E 関連

```sql
-- リライト対象選定スコアの永続化（軸1/2/3/4 統合管理）
-- 案B (#1, #12) で axis 値に 'axis4_decay' を追加
CREATE TABLE master_rewrite_target_score (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,                 -- monitor.db.articles.post_id 論理参照
  axis TEXT NOT NULL,
  -- 'axis1_information_gain' / 'axis2_potential' / 'axis3_freshness' / 'axis4_decay'
  -- ※ axis4_decay は案B 4-1 で追加（Content decay 実測シグナル）
  score_value REAL NOT NULL,
  score_components TEXT,                    -- JSON: 軸別の構成要素
  calculated_at DATETIME NOT NULL,
  period_days INTEGER,                      -- 軸2/軸4用（デフォルト28日）
  notes TEXT
);
CREATE INDEX idx_rewrite_target_post ON master_rewrite_target_score(post_id);
CREATE INDEX idx_rewrite_target_axis ON master_rewrite_target_score(axis);
CREATE INDEX idx_rewrite_target_calc ON master_rewrite_target_score(calculated_at);

-- 対象選定キューの記録
-- 案D 2.W で selected_axis / selected_score を NULL 許容化
CREATE TABLE master_rewrite_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,                 -- monitor.db.articles.post_id 論理参照
  selected_axis TEXT,                       -- NULL 許容（selected_by='daiki_manual' 時）
  selected_score REAL,                      -- NULL 許容（selected_by='daiki_manual' 時）
  selected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  selected_by TEXT,                         -- 'daiki_manual' / 'auto_top_n'
  status TEXT DEFAULT 'queued',             -- 'queued' / 'in_progress' / 'completed' / 'cancelled'
  rewrite_target_score_id INTEGER,          -- どのスコア計算で選定されたか
  notes TEXT,
  FOREIGN KEY (rewrite_target_score_id) REFERENCES master_rewrite_target_score(id)
);
CREATE INDEX idx_queue_status ON master_rewrite_queue(status);
CREATE INDEX idx_queue_post ON master_rewrite_queue(post_id);
```

### Phase 2: Step A-1 関連（案D で post_id 統一・FK削除）

```sql
CREATE TABLE master_fact_set (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,                 -- monitor.db.articles.post_id 論理参照
  layer INTEGER NOT NULL,                   -- 1: entity / 2: claim / 3: experience
  content TEXT NOT NULL,
  source_url TEXT,
  extraction_method TEXT NOT NULL,          -- 'kg_api' / 'llm' / 'human'
  extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  verified_status TEXT DEFAULT 'unverified',
  verified_by TEXT,
  verified_at DATETIME,
  notes TEXT,
  evidence_id INTEGER,                      -- このファクトの「発生源」となった Evidence
                                            -- 記事中の「引用位置」は master_evidence_article_link 経由
  FOREIGN KEY (evidence_id) REFERENCES master_evidence(id)
);
CREATE INDEX idx_fact_set_post ON master_fact_set(post_id);
CREATE INDEX idx_fact_set_layer ON master_fact_set(layer);
CREATE INDEX idx_fact_set_status ON master_fact_set(verified_status);

-- 案D 2.B で query_fanout_id カラム + FK 追加
CREATE TABLE master_competitor_corpus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_fanout_id INTEGER,                  -- 通常は master_query_fanout.id 経由（NULL 許容）
  target_query TEXT NOT NULL,               -- query_fanout_id NULL 時のフォールバック
  competitor_url TEXT NOT NULL,
  rank_position INTEGER NOT NULL,
  fact_set_snapshot TEXT NOT NULL,          -- JSON形式
  crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  competitor_url_count INTEGER NOT NULL,    -- 取得時のN値（デフォルト3、可変）
  serp_features TEXT,                       -- JSON: PAA/snippet/AI Overview等
  source_type TEXT DEFAULT 'organic',       -- 'organic' / 'ai_overview_citation' / 'paa' / 'related_search'
  notes TEXT,
  UNIQUE(target_query, competitor_url, crawled_at),
  FOREIGN KEY (query_fanout_id) REFERENCES master_query_fanout(id)
);
CREATE INDEX idx_competitor_fanout ON master_competitor_corpus(query_fanout_id);
CREATE INDEX idx_competitor_query ON master_competitor_corpus(target_query);
CREATE INDEX idx_competitor_url ON master_competitor_corpus(competitor_url);
CREATE INDEX idx_competitor_crawled ON master_competitor_corpus(crawled_at);

CREATE TABLE master_information_gain_score (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,                 -- monitor.db.articles.post_id 論理参照
  target_query TEXT NOT NULL,
  layer1_gain_score INTEGER NOT NULL,
  layer2_gain_score INTEGER NOT NULL,
  layer3_gain_score INTEGER NOT NULL,
  layer1_gap_count INTEGER NOT NULL,
  layer2_gap_count INTEGER NOT NULL,
  competitor_url_count INTEGER NOT NULL,
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);
CREATE INDEX idx_ig_score_post ON master_information_gain_score(post_id);
CREATE INDEX idx_ig_score_query ON master_information_gain_score(target_query);
CREATE INDEX idx_ig_score_calculated ON master_information_gain_score(calculated_at);
```

### Phase 2: Step A-2 関連（案B で intent_dimension 追加）

```sql
-- 案B (#3) で intent_dimension JSON カラム追加
CREATE TABLE master_query_fanout (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_query TEXT NOT NULL,
  sub_query TEXT NOT NULL,
  layer INTEGER NOT NULL,                   -- 1: 主題分解 / 2: micro-intent展開
  parent_sub_query_id INTEGER,
  generation_method TEXT NOT NULL,          -- 'llm' / 'paa' / 'related_search' / 'ai_overview_subquery'
  source_evidence TEXT,
  priority INTEGER DEFAULT 0,               -- 0=未判定 / 1=採用 / 2=保留 / 3=不採用
  intent_dimension TEXT,                    -- 案B (#3): JTBD 5次元 JSON
                                            -- {"purpose":"医療費","barrier":"審査落ち","constraint":"今日中",
                                            --  "comparison_axis":"金利","expected_format":"比較表"}
                                            -- スキーマ: shared/schemas/intent_dimension.schema.json
                                            -- 将来の独立カラム/別テーブル化を想定
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT,
  reviewed_at DATETIME,
  notes TEXT,
  FOREIGN KEY (parent_sub_query_id) REFERENCES master_query_fanout(id)
);
CREATE INDEX idx_fanout_seed ON master_query_fanout(seed_query);
CREATE INDEX idx_fanout_layer ON master_query_fanout(layer);
CREATE INDEX idx_fanout_priority ON master_query_fanout(priority);
```

### Phase 2: Step A-3 関連（案D で archive_service / archived_urls_extra 追加、post_id 統一）

```sql
CREATE TABLE master_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  content_text TEXT,
  format_type TEXT NOT NULL,                -- 'number' / 'image' / 'video' / 'audio' / 'text'
  file_path TEXT,
  generation_method TEXT NOT NULL,          -- 'survey' / 'measurement' / 'interview' / 'first_hand' / 'official_source'
  source_url TEXT,
  archived_url TEXT,                        -- 正規アーカイブの単一 URL（後方互換）
  archive_service TEXT,                     -- 案D 3.H: 'wayback' / 'archive_today' / 'other'
  archived_urls_extra TEXT,                 -- 案D 3.H: JSON配列、複数アーカイブ保持
  acquired_at DATETIME NOT NULL,
  acquired_by TEXT NOT NULL,
  use_case_tags TEXT NOT NULL,              -- JSON配列: ['information_gain','eeat_experience','compliance','trust_signal']
  volatility TEXT NOT NULL,                 -- 'high' / 'medium' / 'low' / 'static'
  valid_until DATETIME,
  last_url_check_at DATETIME,
  url_health_status TEXT DEFAULT 'unknown',
  verified_status TEXT DEFAULT 'unverified',
  verified_by TEXT,
  verified_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_evidence_volatility ON master_evidence(volatility);
CREATE INDEX idx_evidence_valid_until ON master_evidence(valid_until);
CREATE INDEX idx_evidence_url_health ON master_evidence(url_health_status);
CREATE INDEX idx_evidence_status ON master_evidence(verified_status);

CREATE TABLE master_evidence_article_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,                 -- monitor.db.articles.post_id 論理参照
  citation_position TEXT,
  citation_purpose TEXT,                    -- 'fact_claim' / 'experience_proof' / 'compliance_reference' / 'trust_signal'
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  added_by TEXT,
  UNIQUE(evidence_id, post_id, citation_position),
  FOREIGN KEY (evidence_id) REFERENCES master_evidence(id)
);
CREATE INDEX idx_evidence_link_evidence ON master_evidence_article_link(evidence_id);
CREATE INDEX idx_evidence_link_post ON master_evidence_article_link(post_id);
```

### Phase 2: 案D 由来テーブル

```sql
-- 案D 2.A: post_id ↔ target_query 中間テーブル
CREATE TABLE master_post_target_query (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,                 -- monitor.db.articles.post_id 論理参照
  target_query TEXT NOT NULL,               -- 主たるリライト対象キーワード
  query_role TEXT NOT NULL,                 -- 'primary' / 'secondary'
  source TEXT NOT NULL,                     -- 'manual' / 'gsc_max_impression' / 'gsc_max_clicks' / 'inferred_from_title'
  is_active INTEGER NOT NULL DEFAULT 1,
  set_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  set_by TEXT,
  notes TEXT,
  UNIQUE(post_id, target_query, query_role)
);
CREATE INDEX idx_ptq_post ON master_post_target_query(post_id);
CREATE INDEX idx_ptq_query ON master_post_target_query(target_query);
CREATE INDEX idx_ptq_active ON master_post_target_query(is_active);

-- 案D 4.M': queue ↔ session 多対多中間テーブル
CREATE TABLE master_rewrite_queue_session_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(queue_id, session_id),
  FOREIGN KEY (queue_id) REFERENCES master_rewrite_queue(id),
  FOREIGN KEY (session_id) REFERENCES master_rewrite_session(id)
);
CREATE INDEX idx_qsl_queue ON master_rewrite_queue_session_link(queue_id);
CREATE INDEX idx_qsl_session ON master_rewrite_queue_session_link(session_id);
```

### Phase 2: 案C 由来テーブル（案D で SQL 最終確定）

```sql
-- 案D 1.C-α/β/γ/δ/ε + 4.M' + 3.J 適用後の最終形
CREATE TABLE master_rewrite_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,                 -- monitor.db.articles.post_id 論理参照
  -- queue_id は master_rewrite_queue_session_link 経由で多対多接続（案D 4.M'）
  -- アプリケーションレベルで「最低1件のリンク」を保証

  -- LLM 実行情報（案C 役割別モデル分離）
  model_analysis TEXT NOT NULL,             -- 例: 'claude-opus-4-7'
  model_generation TEXT NOT NULL,           -- 例: 'claude-sonnet-4-6'

  -- トークン/コスト記録
  input_tokens_analysis INTEGER,
  output_tokens_analysis INTEGER,
  input_tokens_generation INTEGER,
  output_tokens_generation INTEGER,
  cost_total_usd REAL,

  -- ワークフロー状態（論点2 確定後の最終形）
  status TEXT NOT NULL DEFAULT 'planned',
  -- 'planned' / 'analyzing' / 'awaiting_policy_judgment' (案K発動時)
  -- / 'generating' / 'compliance_checking' (★論点2-6) / 'awaiting_diff_judgment'
  -- / 'wp_applying' (★論点2-3) / 'completed'
  -- / 'aborted' (LLM/SerpApi致命的失敗)
  -- / 'wp_apply_rolled_back' (★論点2-3 WP反映失敗)
  -- ※ Compliance 検証エンジン異常時は status 変更せず warning モード (論点2-6)

  -- 工程6'-A 出力
  analysis_output TEXT,                     -- JSON: 構造分析結果
  high_risk_categories TEXT,                -- 案D 1.C-β3: JSON配列、5カテゴリ
                                            -- 'title_change' / 'major_restructure'
                                            -- / 'regulation_citation' / 'rate_update'
                                            -- / 'low_confidence_output'
                                            -- ※ session レベルでは low_confidence_output を維持
                                            --    （案K 発動条件として必要）
  policy_summary TEXT,                      -- Daiki 提示用の方針サマリ

  -- 案K 発動時のみ記録（方針判定）
  policy_judgment TEXT,                     -- 'approved' / 'rejected' / 'edit_approved' / NULL
  policy_judgment_at DATETIME,
  policy_reject_reason TEXT,                -- 5カテゴリ
  policy_reject_note TEXT,

  -- 案V: 過去要因分析の参考情報
  reference_analysis_id INTEGER,            -- monitor.analysis_comments.id 論理参照
                                            -- NULL可（参考情報なし）

  -- タイムスタンプ
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  analysis_completed_at DATETIME,
  generation_completed_at DATETIME,
  completed_at DATETIME,

  -- 論点2-3: WordPress 反映ロールバック対応
  wp_snapshot_before_apply TEXT,            -- 反映前の WP 記事 HTML（ロールバック用）
                                            -- 3ヶ月後に NULL クリア（cron）
  wp_apply_started_at DATETIME,
  wp_apply_completed_at DATETIME,

  -- 起票
  triggered_by TEXT NOT NULL,               -- 'queue_auto' / 'daiki_manual'
  notes TEXT
);
CREATE INDEX idx_session_post ON master_rewrite_session(post_id);
CREATE INDEX idx_session_status ON master_rewrite_session(status);
CREATE INDEX idx_session_started ON master_rewrite_session(started_at);

CREATE TABLE master_rewrite_diff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  diff_order INTEGER NOT NULL,              -- セッション内の差分順序

  -- 差分の特定
  target_section TEXT NOT NULL,             -- 例: 'h2#申込手順', 'p#3-2', 'meta:title'

  -- 案D 1.C-α1: 操作種別（LLM 出力構造、9種）
  change_type TEXT NOT NULL,
  -- 'rewrite_section' / 'rewrite_paragraph'
  -- / 'insert_after' / 'insert_before' / 'insert_evidence'
  -- / 'delete_section'
  -- / 'update_title' / 'update_meta_description'
  -- / 'restructure_outline'

  -- 案D 1.C-α1: A/Bテスト分類軸（学習ループ用、8種）
  change_category TEXT NOT NULL,
  -- 'title' / 'h2_structure' / 'evidence_insertion' / 'schema'
  -- / 'internal_link' / 'paragraph_rewrite' / 'compliance_update' / 'other'

  -- 案H 差分構造
  content_before TEXT,                      -- 既存箇所（insert系では NULL可）
  content_after TEXT,                       -- 提案内容（delete系では NULL可）
  rationale TEXT NOT NULL,                  -- JSON: 根拠（IG gap / Evidence / Compliance 等）
  estimated_impact TEXT,                    -- JSON: 予測効果
  llm_confidence TEXT NOT NULL,             -- 'high' / 'medium' / 'low'

  -- 案D 3.J: diff 単位の高リスクフラグ（4カテゴリ、'low_confidence_output' 除外）
  risk_flag TEXT,                           -- NULL or:
                                            -- 'title_change' / 'major_restructure'
                                            -- / 'regulation_citation' / 'rate_update'
                                            -- ※ low_confidence は llm_confidence で代替

  -- 案D 1.C-δ1: Evidence 接続（必要な差分のみ、NULL 可）
  evidence_id INTEGER,

  -- 案L: 差分判定（Daiki）
  daiki_judgment TEXT DEFAULT 'pending',    -- 'pending' / 'approved' / 'rejected' / 'edit_approved'
  daiki_edit_content TEXT,                  -- edit_approved 時の編集後内容
  daiki_reject_reason TEXT,                 -- 5カテゴリ:
  -- 'truth_beauty_violation' / 'factual_error'
  -- / 'regulation_violation' / 'evidence_inadequate' / 'other'
  daiki_reject_note TEXT,
  judged_at DATETIME,

  -- 工程7 接続
  applied_to_wp INTEGER DEFAULT 0,          -- 0/1
  applied_at DATETIME,

  -- 案D 1.C-ε1: A/B テスト後追い接続
  ab_test_id INTEGER,                       -- NULL 許容、テスト対象選定時に更新

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (session_id) REFERENCES master_rewrite_session(id),
  FOREIGN KEY (evidence_id) REFERENCES master_evidence(id),
  FOREIGN KEY (ab_test_id) REFERENCES master_ab_test(id)
);
CREATE INDEX idx_diff_session ON master_rewrite_diff(session_id);
CREATE INDEX idx_diff_judgment ON master_rewrite_diff(daiki_judgment);
CREATE INDEX idx_diff_category ON master_rewrite_diff(change_category);
CREATE INDEX idx_diff_risk ON master_rewrite_diff(risk_flag);
CREATE INDEX idx_diff_applied ON master_rewrite_diff(applied_to_wp);
```

★ 論点5-5 で master_rewrite_diff に追加列:
```sql
ALTER TABLE master_rewrite_diff ADD COLUMN ab_test_id INTEGER;
-- master_ab_test.id への論理参照 (SQLite では ALTER で FK 追加不可)
CREATE INDEX idx_diff_ab_test ON master_rewrite_diff(ab_test_id);
```

### Phase 2: 案B 由来 新規テーブル

```sql
-- 案B (#5): HCU 22項目チェックリスト
-- ※ 22 は Phase 1 リサーチ時点の数値、Phase 2 実装時に Google 公式から再取得
CREATE TABLE master_hcu_checklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,                 -- monitor.db.articles.post_id 論理参照
  checklist_version TEXT NOT NULL,          -- 'v2025_09' 等、Google 改訂対応
  evaluation_method TEXT NOT NULL,          -- 'llm' / 'human'
  pass_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  pass_rate REAL NOT NULL,                  -- pass_count / total_count
  item_results TEXT NOT NULL,               -- JSON: 各項目の Yes/No + コメント
                                            -- {"item_1":{"pass":true,"comment":"..."}, ...}
  evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  evaluated_by TEXT,
  notes TEXT
);
CREATE INDEX idx_hcu_post ON master_hcu_checklist(post_id);
CREATE INDEX idx_hcu_evaluated ON master_hcu_checklist(evaluated_at);
CREATE INDEX idx_hcu_pass_rate ON master_hcu_checklist(pass_rate);
CREATE INDEX idx_hcu_version ON master_hcu_checklist(checklist_version);

-- 案B (#9, #2): 関連度テーブル基盤
-- Phase 2 で α (text_similarity) のみ実装、Phase 3 で β/γ 追加
-- 用途: # 9 internal linking / # 2 cannibalization / Phase 3 サイト全体監査
CREATE TABLE master_article_similarity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_post_id INTEGER NOT NULL,          -- 起点記事（monitor.db.articles.post_id 論理参照）
  target_post_id INTEGER NOT NULL,          -- 関連先記事（monitor.db.articles.post_id 論理参照）
  text_similarity REAL,                     -- α: テキスト類似度 (0.0-1.0) Phase 2
  query_overlap REAL,                       -- β: クエリ重複度 (0.0-1.0) Phase 3
  entity_overlap REAL,                      -- γ: エンティティ共起度 (0.0-1.0) Phase 3
  rank_in_source INTEGER NOT NULL,          -- source 視点の類似度順位 (Top-K=20〜50)
  calculation_method TEXT NOT NULL,         -- 'tfidf' / 'embedding' / 'hybrid'
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE(source_post_id, target_post_id, calculated_at)
);
CREATE INDEX idx_similarity_source ON master_article_similarity(source_post_id);
CREATE INDEX idx_similarity_target ON master_article_similarity(target_post_id);
CREATE INDEX idx_similarity_text ON master_article_similarity(text_similarity);
CREATE INDEX idx_similarity_query ON master_article_similarity(query_overlap);

-- 月次バッチで全記事再計算 + 手動トリガー API 提供:
-- POST /api/rewrite/similarity/recalculate
--   Body: { target_post_ids: [123, 456] | null, indicators: ['text','query','entity'] | null }
--   Response: { job_id, estimated_duration_seconds }
-- GET /api/rewrite/similarity/jobs/:job_id
--   Response: { status: 'running'|'completed'|'failed', progress: 0-100 }
```

### Phase 3: 案E + Step A-4 関連

```sql
-- 法令変更マスター
CREATE TABLE master_regulation_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regulation_name TEXT NOT NULL,            -- '貸金業法' / '景表法' / 'ステマ規制' 等
  event_date DATETIME NOT NULL,
  event_type TEXT NOT NULL,                 -- 'amendment' / 'enforcement' / 'guideline_update'
  affected_categories TEXT,                 -- JSON配列
  description TEXT,
  source_url TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  added_by TEXT
);

-- 商材ステータス履歴
CREATE TABLE master_partner_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_slug TEXT NOT NULL,               -- monitor.daily_affiliate_clicks.partner と整合
  status TEXT NOT NULL,                     -- 'active' / 'terminated' / 'modified' / 'suspended'
  changed_at DATETIME NOT NULL,
  description TEXT,
  notes TEXT
);

-- A/Bテスト関連（Step A-4）
CREATE TABLE master_ab_test (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_name TEXT NOT NULL,
  test_type TEXT NOT NULL,                  -- 'before_after' / 'staged_rollout' / 'searchpilot_full'
  hypothesis TEXT NOT NULL,
  change_category TEXT NOT NULL,
  -- 'title' / 'h2_structure' / 'evidence_insertion' / 'schema'
  -- / 'internal_link' / 'paragraph_rewrite' / 'compliance_update' / 'other'
  change_description TEXT NOT NULL,
  target_urls TEXT NOT NULL,                -- JSON配列
  control_urls TEXT,                        -- 段階的リリース時のコントロール
  applied_at DATETIME NOT NULL,
  observation_start DATETIME NOT NULL,
  observation_end DATETIME NOT NULL,
  status TEXT DEFAULT 'planned',            -- 'planned' / 'running' / 'completed' / 'aborted'
  statistical_method TEXT DEFAULT 'bayesian_final',  -- ★論点5-3 追加（検定方式の余白）
  -- 'bayesian_final'      終了時 1 回の Bayesian credible interval (MVP)
  -- 'bayesian_sequential' 週次チェック + early stopping (Phase 4 後拡張)
  -- 'frequentist_t_test'  頻度主義 t 検定 (代替)
  -- 'custom'              個別 hypothesis に応じたカスタム
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);
CREATE INDEX idx_ab_test_status ON master_ab_test(status);
CREATE INDEX idx_ab_test_category ON master_ab_test(change_category);
CREATE INDEX idx_ab_test_applied ON master_ab_test(applied_at);

CREATE TABLE master_ab_test_result (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  period TEXT NOT NULL,                     -- 'pre' / 'post'
  url TEXT NOT NULL,
  clicks INTEGER,
  impressions INTEGER,
  ctr REAL,
  avg_position REAL,
  conversions INTEGER,
  conversion_rate REAL,
  ai_overview_citation_count INTEGER,
  data_start DATETIME NOT NULL,
  data_end DATETIME NOT NULL,
  google_update_in_period BOOLEAN DEFAULT 0,
  measured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  clarity_signal_id INTEGER,                -- Clarity連携
  FOREIGN KEY (test_id) REFERENCES master_ab_test(id),
  FOREIGN KEY (clarity_signal_id) REFERENCES master_clarity_signal(id)
);
CREATE INDEX idx_ab_result_test ON master_ab_test_result(test_id);
CREATE INDEX idx_ab_result_period ON master_ab_test_result(period);

CREATE TABLE master_ab_test_pattern (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  pattern_type TEXT NOT NULL,               -- 'adopt' / 'avoid' / 'condition'
  change_category TEXT NOT NULL,
  pattern_description TEXT NOT NULL,
  effect_size_percent REAL,
  confidence_level TEXT NOT NULL,           -- 'high' / 'medium' / 'low'
  applicable_conditions TEXT,
  active_status TEXT DEFAULT 'active',      -- 'active' / 'deprecated' / 'review_needed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (test_id) REFERENCES master_ab_test(id)
);
CREATE INDEX idx_ab_pattern_type ON master_ab_test_pattern(pattern_type);
CREATE INDEX idx_ab_pattern_status ON master_ab_test_pattern(active_status);

CREATE TABLE master_clarity_signal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  ab_test_id INTEGER,
  ab_test_period TEXT,                      -- 'pre' / 'post' / NULL
  scroll_depth_avg REAL,
  scroll_depth_p50 REAL,
  engagement_score REAL,
  dead_click_rate REAL,
  rage_click_rate REAL,
  session_count INTEGER,
  data_start DATETIME NOT NULL,
  data_end DATETIME NOT NULL,
  measured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ab_test_id) REFERENCES master_ab_test(id)
);
CREATE INDEX idx_clarity_url ON master_clarity_signal(url);
CREATE INDEX idx_clarity_test ON master_clarity_signal(ab_test_id);
CREATE INDEX idx_clarity_period ON master_clarity_signal(ab_test_period);
```

### Phase 3: 論点3 由来 新規テーブル

```sql
-- 論点3 (#3-3): YMYL 必須項目マスター（全カテゴリ対応）
-- 語彙ルール (master_rules) と概念粒度が違うため別テーブル化
-- master_rules        : 表現レベル（語句単位の置換/検出）
-- master_annotations  : 訴求KW別注釈
-- master_ymyl_requirement: 構造レベル（記事内に必須要素が存在するか）
CREATE TABLE master_ymyl_requirement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,            -- 'cardloan' / 'cryptocurrency' / 'securities' / 'fx'
  requirement_name TEXT NOT NULL,    -- '実質年率' / '登録番号' / '元本毀損リスク開示' 等
  detection_pattern TEXT NOT NULL,   -- 正規表現
  legal_basis TEXT,                  -- 法令根拠（'貸金業法第15条' 等）
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('draft', 'verified', 'deprecated'))
);
CREATE INDEX idx_ymyl_category ON master_ymyl_requirement(category);
CREATE INDEX idx_ymyl_status ON master_ymyl_requirement(status);
```

### Phase 3: 論点4 由来 新規テーブル

```sql
-- 論点4: サイト全体監査スコア（カニバリ / トピック逸脱 / Site Reputation Abuse）
-- 旧案E 軸4「構造的健全性」の移行先（個別記事レベルから分離、別レイヤー）
CREATE TABLE master_site_audit_score (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_type TEXT NOT NULL,
  -- 'cannibalization' / 'topical_drift' / 'reputation_abuse_risk'
  target_post_ids TEXT NOT NULL,            -- JSON配列、関連記事 IDs
  score REAL NOT NULL,                      -- 検出スコア（α/γ/topical_alignment）
  threshold REAL,                           -- 判定閾値
  status TEXT NOT NULL DEFAULT 'detected',
  -- 'detected' / 'reviewed' / 'resolved' / 'ignored'
  detection_method TEXT,                    -- 'monthly_batch' / 'manual'
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT,
  reviewed_at DATETIME,
  resolved_at DATETIME,
  notes TEXT
);
CREATE INDEX idx_site_audit_type ON master_site_audit_score(audit_type);
CREATE INDEX idx_site_audit_status ON master_site_audit_score(status);
CREATE INDEX idx_site_audit_detected ON master_site_audit_score(detected_at);
```

### Phase E 既実装テーブル（論点0 確定後 rewrite.db に移管）

実装ソース: [../node/master-db.js](../node/master-db.js) (initSchema)。
現状 monitor.db に存在、Phase 4 着手時に rewrite.db に物理移管 + monitor.db からは DROP。
スキーマは既存実装そのまま（破壊的変更を避ける、最小性優先）。

```sql
-- 訴求KW別注釈マスター（CTA挿入時/リライト本文中の訴求語句に脚注付与）
CREATE TABLE master_annotations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        TEXT NOT NULL,
  product_name      TEXT NOT NULL,
  category          TEXT NOT NULL,
  trigger_pattern   TEXT NOT NULL,                    -- 訴求KW（例: "最短20分"）
  trigger_type      TEXT NOT NULL DEFAULT 'keyword',  -- 'keyword' / 'regex' / 'and_condition'
  trigger_priority  INTEGER NOT NULL DEFAULT 0,
  annotation_type   TEXT NOT NULL,                    -- '審査・融資' / '限度額' 等
  annotation_text   TEXT NOT NULL,                    -- 注釈本文
  symbol            TEXT,                             -- 注釈記号（※a / ※ai / ※p / ※m）
  scope             TEXT NOT NULL DEFAULT '商材言及時',
  source_url        TEXT,
  verified_at       DATE,
  verified_by       TEXT,
  status            TEXT NOT NULL DEFAULT 'draft',    -- 'draft' / 'verified' / 'deprecated'
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('draft', 'verified', 'deprecated')),
  CHECK (trigger_type IN ('keyword', 'regex', 'and_condition'))
);
CREATE INDEX idx_ann_product  ON master_annotations(product_id);
CREATE INDEX idx_ann_category ON master_annotations(category);
CREATE INDEX idx_ann_status   ON master_annotations(status);

-- 表現ルール（禁止/必須/正式表記、ASPレギュレーション + 業法運用）
CREATE TABLE master_rules (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  category          TEXT NOT NULL,
  product_ids       TEXT NOT NULL,                    -- 'ALL' or 'acom' or 'promise,aiful,mobit'
  rule_type         TEXT NOT NULL,                    -- '禁止表現' / '必須表現' / '正式表記'
  ng_text           TEXT NOT NULL,                    -- 検出パターン
  correct_text      TEXT,                             -- 正規表記（必須/正式時）
  condition         TEXT NOT NULL DEFAULT '常に',
  legal_basis       TEXT,                             -- 法令根拠テキスト（将来 master_regulation_event.id 連携検討）
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
CREATE INDEX idx_rules_status   ON master_rules(status);

-- マスター整備進捗管理（人間運用、HCU記事評価とは別）
CREATE TABLE master_completeness_checklist (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  category          TEXT NOT NULL,
  product_id        TEXT NOT NULL,
  check_item        TEXT NOT NULL,
  check_order       INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending',  -- 'pending' / 'in_progress' / 'done'
  assignee          TEXT,                             -- 'ゆかちゃん' / 'Daiki'
  completed_at      DATE,
  notes             TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('pending', 'in_progress', 'done'))
);
CREATE INDEX idx_check_product ON master_completeness_checklist(product_id);
CREATE INDEX idx_check_status  ON master_completeness_checklist(status);

-- 汎用監査ログ（リライト関連マスター類の編集履歴を一元管理）
-- 本文編集差分は master_rewrite_diff（別概念、衝突しない）
CREATE TABLE master_audit_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name        TEXT NOT NULL,
  record_id         INTEGER NOT NULL,
  action            TEXT NOT NULL,                    -- 'create' / 'update' / 'delete'
  changed_by        TEXT NOT NULL,
  before_value      TEXT,                             -- JSON 文字列
  after_value       TEXT,                             -- JSON 文字列
  changed_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (action IN ('create', 'update', 'delete'))
);
CREATE INDEX idx_audit_table      ON master_audit_log(table_name, record_id);
CREATE INDEX idx_audit_changed_at ON master_audit_log(changed_at);
```

---

## V-B. Phase E 既存4テーブルとの統合方針（論点0 確定、2026-05-01）

### 確定事項

```
1. 物理配置: rewrite.db に移管（monitor.db からは Phase 4 着手時に DROP）
2. スキーマ: 既存実装そのまま維持（破壊的変更を避ける、最小性優先）
3. 命名: 現状維持（master_completeness_checklist と master_hcu_checklist の
         名前類似は用途明示で許容）
4. master_rules ↔ master_regulation_event: 粒度違いの親子関係として両立
   - 当面は master_rules.legal_basis (TEXT) で間接接続
   - Phase 3 後半で regulation_event_id 列追加を検討（任意）
5. master_audit_log: 汎用監査ログとして昇格、リライト関連マスター全体に適用
6. データ層分離原則の強化: monitor.db = 観測層 / rewrite.db = リライト層 + マスター層
```

### Phase 4 実装時の物理移管手順（参考）

```
1. rewrite.db を新規作成（Phase 1 既設計どおり）
2. master-db.js の DB_PATH を rewrite.db に変更
3. monitor.db の Phase E 4テーブルを SQL DUMP
4. rewrite.db に CREATE + INSERT
5. 動作確認後、monitor.db からは 4テーブルを DROP
6. server.js の require パス（master-db / masters-routes）はそのまま
   （内部 DB_PATH のみ変更で透過的に切替）
※ Phase 4 着手時に Daiki に DROP 実行の最終承認を仰ぐ
```

### 論点3（Compliance Layer）への影響

新設計の論点3 は実体テーブルの大半が **既存 master_rules + master_annotations で既に存在**。
Phase 3 詳細設計の論点3 残作業は次の 4 点に縮小:

```
- LLM 出力の事後検証フロー（master_rules 参照ロジック）
- PR表記の存在検証（ステマ規制）
- 必須項目チェック（実質年率 / 限度額 / 返済方式 / 登録番号）
- master_regulation_event ↔ master_rules の親子接続（任意）
```

---

## V-C. UI ナビゲーション統合方針（論点1-A 確定、2026-05-01）

### 確定事項

```
1. ヘッダタイトル: "CTA Gap Fill Manager" → "s-tools"

2. 既存タブの改名（命名空間整理、新規リライト系との衝突回避）:
   "承認" → "CTA挿入"
   "履歴" → "CTA履歴"
   "監査" → "CTA監査"
   （他は維持: 記事 / 商材 / ツール / 順位モニタリング / マスター）

3. 新規タブ追加（リライト系 3タブ）:
   リライトキュー  — 4軸独立キュー一覧、Daiki が選定承認
   リライト判定    — 差分パッチ承認画面（論点1-B 詳細設計対象）
   リライト履歴    — リライトセッション履歴 + 反映状態 + ロールバック

4. ナビ視覚構造（フラット 11タブ + カテゴリ区切り）:
   [共通]    記事 / 順位モニタリング / マスター
   [CTA系]   CTA挿入 / CTA履歴 / CTA監査 / 商材 / ツール
   [リライト系] リライトキュー / リライト判定 / リライト履歴
   実装: ヘッダ nav 内で border-left or spacing でカテゴリ区切り
```

### 独立タブを設けない補助情報（リライト判定画面のサブパネル等で吸収）

| 情報 | 配置 |
|---|---|
| HCU 22項目評価結果（master_hcu_checklist） | リライト判定画面のサブ表示 |
| 関連記事（master_article_similarity） | リライト判定画面 + 記事タブのサブ表示 |
| Compliance 結果（master_rules 参照） | マスタータブ（参照側）+ リライト判定画面（差分検証時） |
| A/B テスト管理 | Phase 3 後半（Step A-4 実装時）に決定。当面は「リライト履歴」サブ画面 or 「マスター」配下で代用 |

### Phase 4 実装時の作業

```
1. node/client/src/App.jsx ヘッダタイトル変更
2. 既存 page state ('review' / 'history' / 'audit') の改名
   - 'review' → 'cta-insert'
   - 'history' → 'cta-history'
   - 'audit' → 'cta-audit'
   （内部キー、UI ラベルは別途）
3. 新規 page state 追加: 'rewrite-queue' / 'rewrite-judge' / 'rewrite-history'
4. 各リライト系画面のコンポーネント新設:
   - node/client/src/rewrite/RewriteQueueView.jsx
   - node/client/src/rewrite/RewriteJudgeView.jsx
   - node/client/src/rewrite/RewriteHistoryView.jsx
5. ヘッダ nav の CSS にカテゴリ区切り適用
```

---

## V-D. リライト判定画面のコア仕様（論点1-B 確定、2026-05-01）

### 画面構成

```
リライト判定タブ:
  session.status で表示が切り替わる
    'awaiting_policy_judgment' → 方針承認画面 (1-B-3)
    'awaiting_diff_judgment'   → 差分判定画面 (1-B-1+1-B-2)
```

### 1-B-1+1-B-2: 差分判定画面（コア）

**レイアウト: (γ) inline diff** （変更点のみハイライト、前後文脈は Space で展開）

```
┌─────────────────────────────────────────────┐
│ セッション #123 | 「アコムの審査基準」      │
│ 差分 7/15 判定済 (47%)                       │
│ [HCU 18/22 ▼] [関連記事 5件 ▼]               │
│ [採用 (y)] [編集承認 (e)] [棄却 (n)]         │
│ [← 前] [次 →] [前後展開 (Space)]              │
├─────────────────────────────────────────────┤
│ 段落1（変更なし、グレー）                    │
│ ─ 段落2（元の文、赤背景・取消線）             │
│ + 段落2（新しい文、緑背景）                  │
│ 段落3（変更なし、グレー）                    │
└─────────────────────────────────────────────┘
```

**操作フロー:**
- 採用 (y / Enter) → 自動で次の差分へ
- 編集承認 (e) → After 行クリックでインライン編集モード → 保存 → 次へ
- 棄却 (n) → 棄却カテゴリ選択モーダル → 次へ

**キーボードショートカット（ボタン文字に埋め込み、ヘルプ常時可視）:**
```
y / Enter  採用
e          編集承認
n          棄却
←          前の差分
→          次の差分
Space      前後展開トグル
1〜5       棄却カテゴリ選択（モーダル内）
Esc        モーダル閉じる
```

**棄却カテゴリ（5択 + メモ、knowledge/05 V-A 既確定）:**
```
1. truth_beauty_violation  真=美違反
2. factual_error           事実誤認
3. regulation_violation    規制違反
4. evidence_inadequate     Evidence 不足
5. other                   その他
```

**編集 UI: (e) inline diff editor**

After 行をクリックすると、その行のみ contentEditable / textarea 編集モードに切替。
HTMLタグは生で見える（YMYL 規制表記の精密編集が可能）。
画面構造を維持（差分判定画面と別レイアウトに切り替えない、閉合性◎）。

### 1-B-3: 方針承認画面（案K 高リスク発動時）

**レイアウト: (α) 縦並びカード**

```
┌─────────────────────────────────────────────────┐
│ セッション #123 | 「アコムの審査基準」          │
│ 軸1 IG / target_query: アコム 審査              │
│ [HCU 18/22 ▼] [関連記事 5件 ▼]                   │
│ 高リスク検出: 3カテゴリ                         │
├─────────────────────────────────────────────────┤
│ ▼ カテゴリ1: title_change                        │
│   分析: ...                                      │
│   方針: ...                                      │
├─────────────────────────────────────────────────┤
│ ▼ カテゴリ2: rate_update                         │
│   分析: ...                                      │
│   方針: ...                                      │
├─────────────────────────────────────────────────┤
│ [承認 (y)] [編集承認 (e)] [棄却 (n)]             │
└─────────────────────────────────────────────────┘
```

操作フロー:
- 承認 (y) → status='generating' (Sonnet 4.6 差分生成へ)
- 編集承認 (e) → policy_summary 編集 UI → 保存 → status='generating'
- 棄却 (n) → 棄却カテゴリ選択モーダル → status='aborted'

棄却カテゴリは差分判定と同一の5カテゴリ（master_rewrite_session.policy_reject_reason）。

### 1-B-5: サブパネル統合（ヘッダサマリ + モーダル展開）

**配置: (β) ヘッダ直下サマリバー + クリックでモーダル**

| 情報 | サマリ表示 | 詳細表示 |
|---|---|---|
| HCU 22項目（master_hcu_checklist） | `[HCU 18/22 ▼]` | モーダル: 22項目 Yes/No + コメント |
| 関連記事（master_article_similarity） | `[関連記事 5件 ▼]` | モーダル: Top-K リスト + similarity スコア |
| Compliance（master_rules 参照） | サブパネル不要 | 各差分の rationale JSON 内に組込済（既設計） |

理由:
- 差分判定画面の幅最大化（主タスクへの集中）
- 詳細はオンデマンド = 遅延評価
- 差分判定画面 / 方針承認画面で同じ位置に配置（閉合性◎）

### 1-B-4: API エンドポイント設計

```
[一覧]
GET  /api/rewrite/sessions?status=awaiting_*&limit=&offset=

[セッション詳細]
GET  /api/rewrite/sessions/:session_id              方針承認画面用
GET  /api/rewrite/sessions/:session_id/diffs        差分判定画面用

[判定操作]
PUT  /api/rewrite/diffs/:diff_id/judgment
     Body: { judgment, reject_reason?, reject_note?, edit_content? }
PUT  /api/rewrite/sessions/:session_id/policy-judgment
     Body: { judgment, reject_reason?, reject_note?, edited_policy_summary? }

[サブパネル]
GET  /api/rewrite/sessions/:session_id/hcu
GET  /api/rewrite/sessions/:session_id/related

[論点1-C 領域、MVP では最小実装]
GET  /api/rewrite/sessions/:session_id/preview      全差分適用後 HTML
```

データソース:
- rewrite.db + monitor.db (ATTACH DATABASE で結合)
- post_title / post_url は monitor.db.articles から JOIN
- target_query は master_post_target_query から JOIN
- selected_axis は master_rewrite_queue から JOIN

認証: 既存の X-User ヘッダ運用（Phase E master-db.js と整合）

### Phase 4 実装時の作業

```
1. node/client/src/rewrite/RewriteJudgeView.jsx 新設
   - session.status で画面切替
   - inline diff レンダラ（差分単位の Before/After ハイライト）
   - キーボードイベントバインド (y/e/n/←/→/Space/Esc/1-5)
   - 棄却カテゴリモーダル + 編集モード
2. node/client/src/rewrite/PolicyJudgeView.jsx 新設
   - 縦並びカードレンダラ
   - policy_summary 編集 UI
3. node/server.js or node/rewrite/api/ に API ルーター新設
   - 上記 8 エンドポイントの実装
4. ATTACH DATABASE 'rewrite.db' AS rewrite ヘルパ確立
   - 既存 monitor-db.js と統合する形で
```

### 論点1-C 領域（MVP では最小実装、Phase 4 後に精緻化）

```
- 全差分適用後プレビュー機能 → preview エンドポイントは仮実装（後で詳細）
- 著者・監修者管理 UI（master_evidence の人間運用部分） → マスタータブ配下で代用
```

---

## V-E. Compliance Layer 詳細仕様（論点3 確定、2026-05-01）

### Compliance Layer 3層構造

| テーブル | 粒度 | 用途 |
|---|---|---|
| `master_rules` (Phase E) | 表現レベル | 語句単位の禁止/必須/正式表記（"審査が甘い" NG 等） |
| `master_annotations` (Phase E) | 訴求KW単位 | 商材別注釈マスター（"最短20分" → ※a 注釈付与） |
| `master_ymyl_requirement` (論点3 新規) | 構造レベル | 記事内に必須要素が存在するか（実質年率/登録番号 等） |

### 3-1: LLM 出力の事後検証フロー（差分単位、master_rules 参照）

検証タイミング:
```
工程6'-A: Opus 4.7 分析 → 'awaiting_policy_judgment' (案K発動時) or 'generating'
工程6'-B: Sonnet 4.6 差分生成 → 'generating'
★工程6'-C: Compliance 事後検証 ← 3-1 の対象
工程6:  Daiki 真=美フィルタ ('awaiting_diff_judgment')
```

検証エンジン仕様（バックエンド、正規表現ベース）:
```
入力: content_after, post.category, target_partner

処理:
  1. master_rules SELECT WHERE
       category = post.category
       AND (product_ids = 'ALL' OR product_ids LIKE '%target_partner%')
       AND status = 'verified'
  2. rule_type 別に検証:
     ┌──────────────┬───────────┬──────────────────────────────┐
     │ rule_type    │ 検出      │ 違反時の挙動                 │
     ├──────────────┼───────────┼──────────────────────────────┤
     │ 禁止表現     │ ng_text   │ risk_flag='regulation_       │
     │              │ 含む      │ violation' 設定 + Daiki判定  │
     ├──────────────┼───────────┼──────────────────────────────┤
     │ 必須表現     │ ng_text   │ 自動修正                     │
     │              │ あり      │ ng_text → correct_text       │
     ├──────────────┼───────────┼──────────────────────────────┤
     │ 正式表記     │ ng_text   │ 自動修正                     │
     │              │ あり      │ ng_text → correct_text       │
     └──────────────┴───────────┴──────────────────────────────┘
  3. 違反履歴を master_rewrite_diff.rationale.compliance に追加
```

実装位置: `node/rewrite/llm-execution/compliance-checker.js`（新規、Phase 4）

### 3-2: PR表記の存在検証（ステマ規制、記事レベル）

```
規制: 景品表示法 ステマ規制（2023年10月施行）
対象: 全カテゴリ（soico /no1/ は常時 PR 記事）

検証ロジック:
  入力: 全 diff 適用後の preview HTML
  処理:
    記事冒頭（H1/H2 直前/直後）に「PR」「広告」「プロモーション」
    「アフィリエイト」「[PR]」「[広告]」のいずれかが存在するか正規表現検出
  判定: 存在 → ok=true / 不在 → ok=false (警告)

実装位置: GET /api/rewrite/sessions/:session_id/preview (論点1-B-4)

注: WordPress テーマ側で全記事共通の PR 表記が固定実装されているか
    Phase 4 実装時に確認、固定なら検証のみ、なしなら master_rules に
    記事冒頭 PR 表記の必須ルール追加
```

### 3-3: YMYL 必須項目チェック（全カテゴリ拡張、構造レベル）

対象カテゴリ:
```
cardloan        消費者金融       貸金業法第15条/第16条
cryptocurrency  暗号資産         金商法・資金決済法
securities      証券             金商法
fx              FX               金商法
```

カテゴリ別必須項目 seed 案（Phase 4 実装時に Daiki + 法令確認で精査）:
```
cardloan:
  実質年率 / 限度額 / 返済方式 / 登録番号

cryptocurrency:
  暗号資産交換業者登録番号 / 価格変動リスク開示 / 法定通貨ではない注記

securities:
  金融商品取引業者登録番号 / 元本毀損リスク開示 / 手数料表示
  / 投資判断は自己責任注記

fx:
  第一種金融商品取引業者登録番号 / レバレッジ規制（個人25倍）注記
  / 元本毀損リスク開示 / スワップ・スプレッド表示
```

検証ロジック:
```
入力: 全 diff 適用後 preview HTML, post.category
処理:
  1. master_ymyl_requirement WHERE
       category = post.category AND status = 'verified'
  2. 各 requirement の detection_pattern で正規表現検出
  3. 全項目存在: OK / 不足項目あり: 警告 + missing[] にリストアップ

レスポンス例:
{
  "compliance_checks": {
    "ymyl_required_items": {
      "ok": false,
      "category": "securities",
      "missing": ["元本毀損リスク開示"],
      "found": ["金融商品取引業者登録番号", "手数料表示", "投資判断は自己責任注記"]
    }
  }
}
```

実装位置: GET /api/rewrite/sessions/:session_id/preview (論点1-B-4)

不足検出時の自動補正は MVP 対象外。Daiki が差分判定画面で目視確認、
手動で master_evidence から必要な節を追加する形で運用開始。

### 3-4: master_regulation_event ↔ master_rules の親子接続（任意、現状維持）

論点0 で「任意・現状維持」と確定済。
当面は master_rules.legal_basis (TEXT) で間接接続。
Phase 3 後半 or Phase 4 で必要に応じて regulation_event_id 列追加を検討。

### 差分判定画面のヘッダサブパネル拡張

```
[HCU 18/22 ▼] [関連記事 5件 ▼] [PR表記 ✓] [YMYL必須 3/4 ✗] [規約違反 0件 ✓]
                                              ↑          ↑              ↑
                                              3-2        3-3            3-1
```

各サブパネルクリックでモーダル展開、詳細確認可能。

### 警戒バイアス対チェック

```
- 「テーブル単位の最小性 vs システム全体の最小性 取り違え」（案B で判明）:
  master_rules 拡張 (rule_type='YMYL必須項目') は単一テーブル単位では最小だが、
  システム全体では概念粒度（語彙ルール vs 構造要素）が混在 → 閉合性違反。
  → 別テーブル master_ymyl_requirement で責務分離（システム全体最小性 = 真=美）

- 「機能を盛りたくなる」: 不足検出時の自動補正は MVP 対象外、
  Daiki 目視判定で運用開始。差分パッチ追加生成は Phase 4 後に検討
```

### Phase 4 実装時の作業

```
1. node/rewrite/llm-execution/compliance-checker.js 新設
   - master_rules 参照、rule_type 別の検証エンジン
2. node/rewrite/llm-execution/preview-checker.js 新設
   - PR表記検証 (3-2) + YMYL 必須項目検証 (3-3)
3. master_ymyl_requirement の seed データ投入
   - 4カテゴリ × 必須項目分の正規表現パターン + 法令根拠
   - Daiki + 法令確認で正規表現を精査
4. 差分判定画面ヘッダのサブパネル拡張 (PR表記 / YMYL必須 / 規約違反)
5. GET /api/rewrite/sessions/:session_id/preview の compliance_checks レスポンス実装
```

---

## V-F. エラーハンドリング設計（論点2 確定、2026-05-01）

### 設計方針

```
- リトライ可能なエラーは Adapter 層で吸収（指数バックオフ）
- リトライ不能 / 致命的エラーは status='aborted'、Daiki 通知
- システム側の異常（検証エンジン等）は warning モード、処理継続
  Daiki 判定の最終ガードを信頼（案N「人間判定なし」不採用原則と整合）
- WP 反映失敗時はロールバック機構で原状復帰
```

### 2-1: LLM API 失敗時のリトライ戦略

```
失敗パターン × 対応:
  429 Rate Limit       → 指数バックオフ (1s→2s→4s→8s→16s, max 5回)
  5xx Server Error     → 指数バックオフ (max 5回)
  ネットワークエラー    → 指数バックオフ (max 5回)
  タイムアウト         → 短バックオフ + 1回リトライ
  JSON パースエラー    → 1回リトライ（プロンプト「正しい JSON 形式で」強調）

全リトライ失敗時:
  master_rewrite_session.status = 'aborted'
  master_rewrite_session.notes に失敗詳細 (JSON: error_type, attempts, last_error_at)
  Daiki 通知: リライト履歴タブで失敗状態を表示
```

実装位置: `shared/llm-adapters/anthropic-adapter.js` 等に retry ラッパ組込（OpenAI / Gemini も同パターン）。

### 2-2: SerpApi 失敗時のフォールバック

```
失敗パターン × 対応:
  月次クォータ超過    → 即時フォールバック（リトライしない）
  一時的 API 障害      → 指数バックオフ (max 3回)
  特定クエリ異常       → 1回リトライ

フォールバック戦略:
  Step 1: master_competitor_corpus.crawled_at が直近30日以内 → 既存データ使用
  Step 2: キャッシュなし → Degraded mode
          Query Fan-out 工程をスキップ、既存データのみで案C 実行
          notes に 'serpapi_unavailable_degraded' 記録
  Step 3: 全失敗 → status='aborted'、Daiki 通知
```

実装位置: `shared/serpapi-adapter.js`（新規、案D 3.H Archive Adapter と同パターン）。

### 2-3: WordPress 反映失敗時のロールバック

```
失敗パターン × 対応:
  WP REST API 認証エラー        → ハードエラー、Daiki 通知 + 反映中止
  ネットワークエラー（一時的）  → リトライ (3回)
  部分的失敗                    → WP REST API は記事単位 Atomic Update のため
                                   1記事内の複数 diff は一括 PATCH、部分失敗しない

ロールバック機構:
  反映前: WP 記事の現在 HTML をスナップショット保存
          master_rewrite_session.wp_snapshot_before_apply (TEXT)
  反映実行中: status='wp_applying'、各 diff の applied_to_wp=1
              wp_apply_started_at 記録
  致命的失敗時: スナップショットから WP に POST して原状復帰
                全 diff の applied_to_wp=0 に戻す
                status='wp_apply_rolled_back'

スナップショット管理:
  3ヶ月後に NULL クリア（cron で運用）、ストレージ膨張対策
```

スキーマ拡張: master_rewrite_session に 3 列追加（V-A 章 SQL に反映済）。

実装位置: `node/rewrite/wp-applier.js`（新規）+ 既存 `gap-fill.js updateWpPost()` 流用。

### 2-4: 月次バッチ未実行検知

```
検知対象:
  applied_to_wp=1 (リライト反映済)
  AND ab_test_id IS NULL (A/Bテスト未エントリー)
  AND applied_at < NOW() - 14 日

検知ロジック (日次 cron、既存 monitor-jobs.js に追加):
  該当があれば管理画面の「リライト履歴」タブにバナー警告
  Daiki が手動で A/Bテスト割当 or 14日延長

注: master_rewrite_diff の ab_test_id 紐付け実装は論点5 (SearchPilot variant 割当) で確定
    論点2 では検知ロジックの構造のみ確定
```

### 2-5: queue_session_link 「最低1件のリンク」アプリケーションレベル保証

```
session 作成時にトランザクション内で必ずリンクも作成:

BEGIN TRANSACTION;
  INSERT INTO master_rewrite_session (...) RETURNING id;
  INSERT INTO master_rewrite_queue_session_link (queue_id, session_id) VALUES (?, ?);
COMMIT;

リンク作成失敗 → トランザクション全体 ROLLBACK → session 作成も巻き戻し

既存 session への queue 追加 (1対多):
  INSERT INTO master_rewrite_queue_session_link (queue_id, session_id)
  ON CONFLICT(queue_id, session_id) DO NOTHING;
```

実装位置: `node/rewrite/session-creator.js`（新規）に集約。
全 session 作成は必ずこのモジュール経由。

### 2-6: Compliance 検証エンジン異常時のフロー（warning モード）

```
異常パターン:
  master_rules SELECT エラー（DB接続失敗）
  正規表現実行例外（malformed pattern）
  checker 内部例外

対応戦略 (warning モード):
  master_rewrite_session.status は変更しない（処理継続、'awaiting_diff_judgment' へ）
  master_rewrite_session.notes に異常詳細記録 (JSON: compliance_check_error)
  差分判定画面ヘッダに警告サブパネル表示:
    [規約違反 ⚠ 検証エラー]
  Daiki が判定時に把握、手動で master_rules を確認 or 警告認識のうえ判定
```

設計判断:
```
- システム完動性 > 検証完璧性 (Daiki 確定方針 2026-05-01)
  Compliance 検証はシステム側の都合 (DB接続/正規表現例外 等) で異常になる
  リライト本体は機能するため、検証エンジン異常で全体停止は最小性違反
- Daiki 判定の最終ガード
  YMYL 安全性は Daiki 判定（人間最終承認、案N 不採用原則）で担保
  Compliance 検証は補助、Daiki 判定が主
```

### Phase 4 実装時の作業

```
1. shared/llm-adapters/*-adapter.js に retry ラッパ組込
2. shared/serpapi-adapter.js 新設（フォールバック機構付）
3. node/rewrite/wp-applier.js 新設（snapshot + ロールバック）
4. node/rewrite/session-creator.js 新設（トランザクションラッパ）
5. node/rewrite/llm-execution/compliance-checker.js に warning モード組込
6. monitor-jobs.js に月次バッチ未実行検知 cron 追加
7. リライト履歴タブのバナー警告 UI
8. wp_snapshot_before_apply の 3ヶ月クリア cron
```

---

## V-G. サイト全体監査レイヤー設計（論点4 確定、2026-05-01）

### 設計方針

```
- 案E 旧軸4「構造的健全性」の移行先（IX 章既述）
- 個別記事レベル（4軸独立キュー / IG / HCU）と分離、別レイヤーで月次バッチ実行
- Daiki 判定が最終ガード（自動制裁なし、警告レベル）
```

### 4-1: 責任境界

```
個別記事レベル（リライト判定 / リライトキュー）:
  master_rewrite_target_score (4軸独立キュー)
  master_information_gain_score
  master_hcu_checklist
  master_rewrite_diff (差分単位)
  → 単一記事の品質改善

サイト全体レベル（リライト履歴 > サイト全体監査サブタブ）:
  master_article_similarity (α text / β query / γ entity)
  master_site_audit_score (新規)
  → 複数記事間の関係（カニバリ / トピック / Site Reputation Abuse）
```

### 4-2: γ (entity_overlap) 計算ロジック

```
計算方法: Google Knowledge Graph API + Jaccard 係数

理由:
  - Google 公式エンティティ定義との整合（YMYL 信頼性）
  - entity_overlap = エンティティ集合の重なり、Jaccard が真=美の定義
  - α text_similarity と機能分離（embedding は意味類似度、別概念）

実装:
  shared/entity-extractor-adapter.js（新規、Adapter パターン）
  Phase 4 で Google KG API 連携
  無料枠 1000 query/day、月次バッチ + 主要記事のみで API 呼び出し抑制

将来 KG API が終了したら別 Entity 抽出 API に Adapter で差し替え可能。
```

### 4-3: Topical 整合性スコア

主題エンティティ定義: `config.js` 定数で運用（master_site_topic 新規テーブルは却下）

```javascript
// config.js
const SITE_TOPIC_ENTITIES = {
  cardloan: ['消費者金融', 'カードローン', '実質年率', '限度額', '審査', '即日融資', ...],
  cryptocurrency: ['暗号資産', 'ビットコイン', '取引所', ...],
  securities: ['証券会社', '投資信託', 'NISA', ...],
  fx: ['FX', 'レバレッジ', 'スワップ', ...]
};
```

理由:
- 主題エンティティは安定（4 category × 各 10〜20 件 = 40〜80 件規模）
- 変更頻度低い、CRUD UI 不要 → 最小性◎
- partners.json と同様の運用パターン
- 警戒バイアス「機能を盛りたくなる」回避

スコア計算:
```
記事のエンティティ集合 (KG API 抽出) を E_article
サイト主題エンティティ集合 (config.js) を E_site

topical_alignment_score = |E_article ∩ E_site| / |E_article|

スコア意味:
  1.0  完全整合
  0.5  半分整合
  0.0  完全逸脱

閾値: < 0.5 で「トピック逸脱」と判定
```

### 4-4: Site Reputation Abuse 防衛 検出 3パターン

```
1. カニバリゼーション (cannibalization)
   - text_similarity (α) ≥ 0.8 の記事ペア
   - 同一 target_query で記事 ≥ 2
   - 影響: 検索結果での自社内競合、SEO 損失

2. トピック逸脱 (topical_drift)
   - topical_alignment_score < 0.5
   - 影響: Site Reputation Abuse スパム判定リスク

3. 大量同質記事 (reputation_abuse_risk)
   - entity_overlap (γ) ≥ 0.7 の記事ペアが 3 以上
   - 影響: ドメイン権威の希薄化、Google 制裁対象
```

検出フロー:
```
月次バッチ (cron):
  1. master_article_similarity 全レコード再計算（β/γ 含む）
  2. 上記 3 パターンを検出
  3. 該当ケースを master_site_audit_score にレコード作成
  4. リライト履歴タブのサブタブ「サイト全体監査」に表示
  5. Daiki が手動でレビュー → status='resolved'/'ignored'
```

### 4-5: 実装位置

#### テーブル: master_site_audit_score（V-A 章既反映）

audit_type 別レコード化、ステータス管理（detected/reviewed/resolved/ignored）。

#### API エンドポイント

```
GET  /api/audit/site-audit?audit_type=&status=     監査結果一覧
POST /api/audit/site-audit/recalculate              月次バッチ手動トリガー
PUT  /api/audit/site-audit/:id                      ステータス更新
```

#### UI 配置: 「リライト履歴」タブ内サブタブ「サイト全体監査」

```
リライト履歴タブ:
  [セッション履歴] [サイト全体監査] [月次バッチ未実行警告]
                       ↑ 4-5 配置
```

理由:
- ナビ変更なし、論点1-A 確定の最小性維持
- リライト履歴とサイト全体監査は「リライト後の効果検証」で文脈一致

### Phase 4 実装時の作業

```
1. shared/entity-extractor-adapter.js 新設
   - Google Knowledge Graph API 連携
   - Adapter パターンで将来差し替え可能
2. node/rewrite/audit/site-auditor.js 新設
   - 月次バッチ、3パターン検出ロジック
3. config.js に SITE_TOPIC_ENTITIES 定数追加
   - 4 category × 各主題エンティティ群を Daiki と確認しつつ整備
4. リライト履歴タブにサブタブ追加 (RewriteHistoryView.jsx 拡張)
   - サイト全体監査画面の実装
5. monitor-jobs.js に月次バッチ cron 追加
   - master_article_similarity 全再計算 + master_site_audit_score 検出
```

---

## V-H. SearchPilot variant 割当ロジック（論点5 確定、2026-05-01）

### 設計方針

```
- SearchPilot 方式の標準アプローチ採用（Step A-4 既確定）
- Cloudflare Workers での Edge layer variant injection
- 層別ランダム割付（カテゴリ別均等分散）
- 8週間観測 + Bayesian credible interval 検定（MVP）
- 検定方式は将来拡張可能な余白あり (statistical_method 列)
- Google Update 期間中の信頼度補正
```

### 5-1: Cloudflare Workers での variant injection

```
実装方針: Cloudflare KV + Workers

月次バッチ実行時 (新テスト開始時):
  1. master_ab_test に新テスト登録
  2. variant 割当 (control/A/B) を Cloudflare KV に push
     KV key: post_id, value: {variant, test_id, applied_at}

リクエスト時 (Cloudflare Worker):
  1. URL から post_id 抽出
  2. KV から variant 取得 (latency 数ms)
  3. WordPress オリジン HTML をフェッチ
  4. variant に応じて HTML 改変:
     - control: そのまま返す
     - A / B: variant 別 master_rewrite_diff.content_after を適用
  5. クライアントに返す

KV 更新頻度: テスト開始/終了の 2 イベントのみ (リアルタイム性不要)
KV 伝播 (eventual consistency, ~1分): A/B テスト割当は月次更新で許容範囲
```

実装位置: `node/rewrite/ab-testing/cf-kv-pusher.js` (新規) + Cloudflare Workers スクリプト

### 5-2: 1,000記事ずつの control / variant A / variant B 割付

```
方法: 層別ランダム割付（カテゴリ別均等分散）

JavaScript 擬似コード:
  function stratifiedAssign(posts) {
    const result = { control: [], variantA: [], variantB: [] };
    const byCategory = groupBy(posts, 'category');
    for (const [category, list] of Object.entries(byCategory)) {
      shuffle(list);  // Fisher-Yates
      const n = list.length;
      result.control.push(...list.slice(0, n / 3));
      result.variantA.push(...list.slice(n / 3, 2 * n / 3));
      result.variantB.push(...list.slice(2 * n / 3));
    }
    return result;
  }

理由:
- カテゴリ別の交絡排除（cardloan/crypto/securities/fx 各 1/3 ずつ）
- SearchPilot 方式の標準アプローチ
- 統計的検出力: 各群 ~800 で成立、1,000 は余裕
```

実装位置: `node/rewrite/ab-testing/variant-assigner.js` (新規)

### 5-3: A/B テスト 開始日・観測期間・統計検定

```
SearchPilot 標準パラメータ (デフォルト値):
  applied_at:                 variant 適用日 (CF KV push 完了時)
  observation_start:          applied_at + 7日 (indexing 安定化)
  observation_end:            applied_at + 56日 (8週間)
  statistical_method:         'bayesian_final' (終了時 Bayesian 検定 1回)

調整可能性 (Daiki 指摘「余白を残す」反映):
  observation_start/end: 既存 DATETIME 列、個別テストで上書き可
  statistical_method:    新規列、Phase 4 後に変更可能
                          'bayesian_sequential' (early stopping) 等

新テスト開始ペース:
  Phase 4 初期 (運用 1〜3ヶ月): 月次 1 サイクル
  Phase 4 安定期 (3ヶ月以降):   並行 1〜3 テスト
                                 (change_category 8種 で交絡なし)
```

### 5-4: Google Update 期間中の信頼度補正

```
Update 検出フロー:
  monitor-jobs.js に検出 cron 追加
  Google Search Status Dashboard / RSS 監視
  Update 期間を SQLite に記録

master_ab_test_result.google_update_in_period (既設計、BOOLEAN):
  観測期間中に Update があった場合は true に更新

補正方式:
  完全重複 (観測期間 ⊆ Update 期間): 結果破棄、status='aborted' で再テスト
  部分重複 (観測期間 ∩ Update 期間 ≠ 空): Update 期間を除外して再計算
  重複なし: 通常通り
```

実装位置: `shared/google-update-monitor.js` (新規、Adapter パターン)

### 5-5: 月次バッチ未実行検知の ab_test_id 紐付け

論点2-4 派生。`master_rewrite_diff.ab_test_id` 列を追加（V-A 章 SQL 反映済）。

```
紐付けフロー:
  月次バッチ実行時:
    1. applied_to_wp=1 AND ab_test_id IS NULL の diff を取得
    2. variant 割当ロジック (5-2) で 3 群分割
    3. master_ab_test に新テスト登録、test_id 取得
    4. 対象 diff の ab_test_id を更新

論点2-4 検知ロジック (既設計):
  applied_to_wp=1 AND ab_test_id IS NULL AND applied_at < NOW() - 14日
  → 月次バッチが連続未実行なら警告
```

### Phase 4 実装時の作業

```
1. node/rewrite/ab-testing/variant-assigner.js 新設
   - 層別ランダム割付ロジック
2. node/rewrite/ab-testing/cf-kv-pusher.js 新設
   - Cloudflare KV へ variant 割当 push
3. Cloudflare Workers スクリプト (cf-worker/ab-injector.js)
   - リクエスト時 variant injection
4. shared/google-update-monitor.js 新設
   - Status Dashboard / RSS 監視 Adapter
5. node/rewrite/ab-testing/result-collector.js 新設
   - GSC / GA4 / Clarity からのデータ取得 cron
6. node/rewrite/ab-testing/statistical-tester.js 新設
   - Bayesian credible interval 計算
7. monitor-jobs.js に月次バッチ追加
   - 新テスト開始 / variant 割当 / KV push
8. master_ab_test に statistical_method 列追加 (ALTER)
9. master_rewrite_diff に ab_test_id 列追加 (ALTER)
```

---

## VI. 各Step / 案の確定事項（議論結論のサマリ）

### Step A-1: Information Gain

| 項目 | 確定 |
|---|---|
| レイヤー方式 | 3レイヤー全採用（エンティティ + 事実主張 + 経験） |
| KPI | Information Gain スコア（特許準拠）を直接KPI化 |
| 競合上位URL数 | デフォルト N=3、可変設定 |
| 既存スコアリング統合 | 案E にて方針確定。リライト対象選定は新規軸（軸1）、IG は軸1の主構成要素 |
| 著者・監修管理 | 別途人間が管理（システム対象外） |

### Step A-2: Query Fan-out

| 項目 | 確定 |
|---|---|
| Fan-out 生成主体 | LLM + 実SERP ハイブリッド |
| 分解次元 | Layer1主題 + Layer2 micro-intent（二段構造） |
| Layer2への競合URL収集 | 行わない（Layer1のみ） |
| AI Overview citation源 | 統合追跡（source_typeカラムで区別） |
| 工程2-3の統合 | 統合（Query Fan-out が両方を担う） |
| SERP API | SerpApi（サブスクStarter） |
| 抽象化レイヤー | Adapter層を挟む（将来差し替え可能） |
| 案B (#3) JTBD | intent_dimension JSON カラム追加（将来独立化想定） |
| 案B (#4) Question gap | PAA + サジェスト + 関連検索のみ、既存スキーマで完結 |

### Step A-3: Evidence Layer

| 項目 | 確定 |
|---|---|
| Original research と First-hand experience の統合 | 統合（Evidence Layerとして一元管理） |
| 4軸タグ分類 | 形式 × 生成方法 × 用途 × 変動性 |
| Evidence と記事の関係 | 多対多（共有プール） |
| 劣化管理 | volatility + valid_until 併用 |
| URL検証 | Wayback Machine + archive.today（案D 3.H で Adapter 化） |

### Step A-4: A/B Testing

| 項目 | 確定 |
|---|---|
| 方式 | 案1（完全SearchPilot方式）採用 |
| サンプル数 | 3,000記事を control / variant A / variant B に1,000ずつ分割 |
| 学習ループ | 3層（記録 → パターン抽出 → 戦略反映） |
| 効果測定指標 | クリック / インプ / CTR / CV + Clarity（A/Bテスト判定にも統合） |
| 判定方式 | 主指標統計検定 × Clarity gating の二段判定 |
| 結果分類 | positive / positive_with_warning / negative / inconclusive |
| Google Update対応 | 完全除外せず信頼度補正 |
| 実装フェーズ | 案D 4.N: Phase 3 同時実装（蓄積件数前提を満たすライン） |

### 案E: リライト対象選定（新規設計）

| 項目 | 確定 |
|---|---|
| 設計方針 | 既存スコアリングとは別目的のため、新規ロジックを構築 |
| 軸構成 | 4軸（軸1=構造的不足 / 軸2=経済合理性 / 軸3=鮮度・正確性 / 軸4=Content decay 実測） |
| 旧軸4の扱い | 「構造的健全性」は対象選定から分離、サイト全体監査として別レイヤー |
| 統合方式 | 独立キュー（合算スコアは採用しない） |
| 既存システムとの関係 | データ層は monitor.db を Read-Only 参照、スコア層は完全独立 |
| 物理DB配置 | rewrite.db（新規） + monitor.db（既存）の別DB方式、ATTACH DATABASE で同時参照 |
| 既存資産の活用 | monitor-collectors.js / EXCLUDED_CATEGORIES / monitor-analysis.js（buildPrompt） |

### 案C: LLM 実行レイヤー

| 項目 | 確定 |
|---|---|
| 工程6' 構造 | 二段構造（6'-A 分析 + 6'-B 生成） |
| LLM 選定 | 役割別: Opus 4.7（分析）+ Sonnet 4.6（生成） |
| Adapter 層 | Phase 1 から3社対応（Anthropic + OpenAI + Gemini、画像生成将来対応） |
| 出力形式 | 案H（差分パッチ、change_type 9種） |
| 本文取得 | fetchWpStructured（cheerio ベース、82%削減実測） |
| 削減フィルタ | 監修者ブロック除去 + 目次除去 + CTA バナーマーカー化 |
| 人間判定境界 | 案L ベース + 案K（高リスク 5カテゴリ）発動 |
| 棄却カテゴリ | 5（真=美違反 / 事実誤認 / 規制違反 / Evidence不適切 / その他） |
| 既存資産統合 | shared/ ディレクトリ + s-tools/rewrite/ サブディレクトリ |
| 過去要因分析 | 案V: 直近1件を「参考情報」として渡す |
| MAX_CONTENT_CHARS | 既存 monitor 側の改修は別案件として保留 |

### 案D: 統合確認

| 項目 | 確定 |
|---|---|
| 1.A: ATTACH 越し FK | 全削除、論理参照に統一、コメント明示 |
| 1.B: 識別子 | post_id に統一（monitor.db Single Source of Truth） |
| 1.D: fact_set ↔ evidence | 二経路維持（発生源 vs 引用位置の役割分離） |
| 1.C-α: change_type/category | α1 両方保持（操作 vs 学習用分類） |
| 1.C-β: high_risk_categories | β3 session 配列 + diff 単一フラグ両方 |
| 1.C-γ: queue_id NOT NULL | γ2 採用後、4.M' で多対多化（カラム削除） |
| 1.C-δ: evidence_id | δ1 NULL 許容 |
| 1.C-ε: ab_test_id | ε1 後追い設定 |
| 2.A: post_id ↔ seed_query | 新規テーブル master_post_target_query |
| 2.B: fanout ↔ corpus | query_fanout_id FK 追加 |
| 2.W: queue NULL 許容 | selected_axis / selected_score を NULL 可 |
| 2.F: diff → ab_test 集約 | F1 月次バッチ、change_category 単位 |
| 2.G: pattern 注入 | G2 active 限定、上位5件 |
| 3.H: archive Adapter | H1 archive_service カラム + 複数アーカイブ対応 |
| 3.I: IG Score 独立 | I2 維持（target_score と責務分離） |
| 3.J: risk_flag 重複 | J1 'low_confidence_output' 除外（diff レベル、4カテゴリ） |
| 4.K: post_target_query | K2 Phase 2 構築（Phase 1 では利用先なし） |
| 4.L: Phase 1 の用語 | L1 「対象選定の自動化」段階（自走ではない） |
| 4.M: queue ↔ session | M1' 多対多化（master_rewrite_queue_session_link） |
| 4.N: A/Bテスト実装 | N2 Phase 3 同時 |

### 案B: 強推奨手法の確定

| 項目 | 確定 |
|---|---|
| 採用件数 | 8件（# 1, 2, 3, 4, 5, 9, 11, 12） |
| 不採用件数 | 3件（# 6, 7, 10 - CMS / リライト主流路外） |
| 既確定 | 1件（# 8 FAQ/HowTo 不実装） |
| Reddit/Quora 採用 | 見送り（実装困難） |
| Content decay 統合判断 | 軸4 独立キューで採用、実運用後に統合判断 |
| HCU 22項目 | 独立テーブル新設、LLM 自動評価 |
| 関連度テーブル | レベル3（事前計算）+ 共有基盤化（# 2 / # 9 / Phase 3 サイト全体監査） |
| 月次バッチ | 自動 + 手動トリガー API |
| クエリレベル decay (#11) | Phase 2 案C 入力情報（軸ではなく方向性指示） |

### 全体共通の確定事項

| 項目 | 確定 |
|---|---|
| 評価軸（API選定） | 速度 > 精度 > 費用（順序付き）。日本語Google対応は必須 |
| 「精度」の解釈 | AI Overview citation源の取得精度を含む |
| 処理方式 | 遅延評価型（lazy evaluation）。月50記事ペース、スキャン数可変 |
| 「初回フルスキャン」概念 | 削除。実運用しながら拡張する設計 |

---

## VII. 採用却下した選択肢と理由

| 却下案 | 理由 |
|---|---|
| Yahoo!スクレイピングでSERP取得 | Yahoo! JAPAN利用規約で明示禁止、Yahoo検索エンジンはGoogle同等のためメリットなし |
| DataForSEO（標準速度） | 45分待ちの非同期APIで速度要件を満たさない |
| Serper | AI Overview検出率36-48%、PAA回答全文取得不可で精度要件を満たさない |
| Scrape.do | SerpApiサブスクで採用決定 |
| 国別軸（米独英日）でのリサーチ整理 | 工程別軸の方が構造的に正しい |
| 「実務家が使っている」を有効性根拠とする | ポジトーク汚染リスク。Google一次情報ベースに変更 |
| 文字数神話・密度神話・dwell time KPI | Google公式が複数回否定 |
| FAQ schema大量実装 / HowTo schema | 2023年8月以降廃止・限定化 |
| Information Gain初回フルスキャン | 真=美の最小性テスト違反、遅延評価に変更 |
| 案4 Before/After A/Bテスト必須採用 | 3,000記事規模なら完全SearchPilot方式が成立、案4は不要 |
| 既存スコアリング（A系/B系）のリライト対象選定への流用 | 目的が違う（CTA優先度・順位観測 vs リライト対象選定）。流用は構造的混濁を生む |
| 旧軸4（構造的健全性）を対象選定軸として採用 | 個別記事選定とサイト全体監査は別レイヤー、混在は閉合性違反 |
| 合算スコア方式（軸を加重和） | 軸の意味が消え、Daikiの真=美判定が機能しなくなる |
| 同一DB（monitor.db 拡張）方式 | 責任境界が混濁、障害分離不可 |
| 案G（完全書き直し）出力形式 | A/Bテスト粒度不足、既存記事の検索順位資産を破壊 |
| 案I（指示書のみ）出力形式 | 工程7（実装）への接続が弱い |
| 案N（人間判定なし） | YMYL致命的、Daikiの認知が外部に出る経路が消滅 |
| 本文単純キャップ拡張（案A/B/C） | 構造化抽出（案E）で根本解決 |
| 階層化処理（案D） | 構造化抽出で予算問題解決 → 不要 |
| ハイブリッド（案F） | 案E 単独で全記事カバー可能、2系統共存は最小性違反 |
| GPT-5.5 / GPT-5.4 メインLLM | ハルシネーション弱点（GPT-5.5）、日本語品質劣勢、Adapter 層は将来用に対応 |
| analysis_comments テーブルへのリライト統合保存 | 案E の DB分離原則と矛盾 |
| ATTACH 越し FK 宣言維持 | SQLite で機能しない、誤解を招く宣言は閉合性違反 |
| article_id 維持 | post_id に統一（Single Source of Truth） |
| queue_id NOT NULL 維持 | 多対多化（案D 4.M'）で更に強化 |
| M1 素朴採用（軸別独立 session） | 差分衝突、Daiki 判定負荷3倍、実装で破綻 |
| M2（最新1件のみ） | 軸別選定履歴の損失、学習ループ精度低下 |
| 階層的 schema をリライトシステムに組込み（案B # 7） | CMS（WordPress）側で扱う領域。責務分離が構造的に正しい |
| INP 監視をリライトシステムに組込み（案B # 10） | リライト主流路外（記事本文リライトで INP は変化しない）+ Clarity engagement_score との機能重複 |
| Author expertise schema をリライトシステム側で構造保存（案B # 6） | CMS 側で対応 + 監修判断は人間（今回フェーズ対象外） |
| Reddit / Quora API 連携（案B # 4 拡張） | Reddit API 課金化、Quora API なし、Yahoo知恵袋スクレイピング規約違反 |
| Content decay 軸4 を軸2 サブシグナルに統合（案B 4-1） | 実測 traffic decay と機会損失指標は別概念、独立キュー採用 |

---

## VIII. 真=美フレームワーク適用ルール（システム設計向け）

各Step・各設計判断で適用：

```
必然性テスト: この要素を除いたら構造は崩壊するか
閉合性テスト: 内部で全ての関係が完結しているか
最小性テスト: より少ない要素で同じ機能を実現できないか
```

設計上の派生原則：
- 遅延評価（lazy evaluation）型処理
- 抽象化レイヤー（API / LLM / Archive 全て差し替え可能）
- 3層学習ループ（記録 → 抽出 → 反映）
- 主指標 × Clarity gating の二段判定
- ポジトーク回避（Google一次情報ベース）
- 既存資産の最大流用（再発明禁止、ただし目的が一致する範囲のみ）
- 複雑性の局所化（複雑な要件は1箇所に集めて他を守る、案D 4.M' 確立）

---

## IX. 案E確定事項: リライト対象選定の3軸 → 4軸構成（案B で拡張）

### 設計方針の修正

旧案E（既存スコアリング統合）→ 新案E（リライト対象選定の新規設計）→ 案B (#1, #12) で軸4 追加

理由: 既存スコアリング（s-tools 内の A系/B系）は本来 CTA挿入優先度 と 順位観測 を目的としたもので、リライト対象選定とは目的が異なる。流用は構造的混濁を生む。

### 4軸構成

| 軸 | 内容 | スコア要素 | Phase |
|---|---|---|---|
| 軸1 | 構造的不足 | IG Score + 検索意図3層カバレッジ | 2 |
| 軸2 | 経済合理性 | impressions × position_gap_factor | 1 |
| 軸3 | 鮮度・正確性 | 経過月数 / 法令変更アラート / 商材ステータス変更アラート | 1+3 |
| 軸4 | Content decay 実測 | 28日窓×90日窓 traffic 差分（クリック+インプ+順位の3指標統合） | 1 |

[削除] 旧軸4: 構造的健全性
  → サイト全体監査として別レイヤーに分離（案E対象外、別案で扱う）

### 軸2の計算ロジック（Phase 1）

```
position_gap_factor:
  1-3位:    0.1（上昇余地小）
  4-10位:   1.0（上昇しやすい）
  11-20位:  0.7（上昇可能）
  21-50位:  0.3（困難）
  51位以下: 0.05

axis2_score = impressions × position_gap_factor

入力: monitor.daily_metrics 過去N日（デフォルト28日）
出力: post_id, axis2_score, axis2_components(JSON)
永続化: master_rewrite_target_score (axis='axis2_potential')
```

### 軸3の計算ロジック（Phase 1: 経過月数のみ → Phase 3 拡張）

```
[Phase 1]
axis3_freshness_score = (現在日 - articles.wp_modified) の経過月数

[Phase 3 拡張]
regulation_alert: 関連法令変更日 > 記事最終更新日 のフラグ
service_termination_alert: 言及している商品/サービスの終了フラグ
```

### 軸4の計算ロジック（Phase 1、案B 4-1-β）

```
3指標の窓差分を統合（標準版）:
  click_delta_pct  = (recent_28d_clicks - prev_28d_clicks) / prev_28d_clicks
  impr_delta_pct   = (recent_28d_impr - prev_28d_impr) / prev_28d_impr
  position_delta   = recent_28d_avg_position - prev_28d_avg_position

axis4_decay_score = 各指標の悪化度を合算してスコア化（具体重み付けは Phase 1 実装時確定）

入力: monitor.daily_metrics 過去56日（28日 × 2窓）
出力: post_id, axis4_decay_score, axis4_components(JSON)
永続化: master_rewrite_target_score (axis='axis4_decay')

注意:
  - α (クリック数のみ) は採用却下: ノイズ多い
  - γ (URL × クエリ多変量) は Phase 1 では過剰、案B # 11 として Phase 2 案C 入力情報で実装
```

### 既存システムとの役割分離

| 項目 | 既存システム | リライトシステム |
|---|---|---|
| 目的 | CTA挿入優先度 / 順位観測 / 要因分析 | リライト対象選定 / 差分生成 / A/Bテスト |
| DB | monitor.db | rewrite.db（新規） |
| データ層 | 既存テーブルを継続更新 | monitor.db を Read-Only 参照 |
| スコア層 | A系（runScoring）/ B系（alertScore）で完結 | 軸1/2/3/4の独立スコアを構築 |
| 効果測定の役割 | リライト後の指標継続観測 + Claude要因分析 | A/Bテストの統計検定 + パターン抽出 |

### DB物理配置

```sql
-- リライトシステム側で使う
ATTACH DATABASE '/path/to/monitor.db' AS monitor;

-- JOIN例: 軸1のIG高スコア記事を取得
SELECT 
  m.post_id, m.url, m.title,
  r.score_value
FROM monitor.articles m
INNER JOIN main.master_rewrite_target_score r ON m.post_id = r.post_id
WHERE r.axis = 'axis1_information_gain'
ORDER BY r.score_value DESC;
```

監視: monitor.db への接続は SQLite URI `file:/path/to/monitor.db?mode=ro` で Read-Only 強制。
注意: ATTACH 越しの FOREIGN KEY 制約は SQLite で機能しないため、論理参照（コメント明示）で運用（案D 1.A 確定）。

### 統合方式: 独立キュー

4軸を独立キューで提示。合算スコアは採用しない。

```
キュー1: 軸1スコア降順 Top N
キュー2: 軸2スコア降順 Top N
キュー3: 軸3スコア降順 Top N
キュー4: 軸4スコア降順 Top N

Daikiが月次で「今月はどの軸を優先するか」を真=美判定
4キュー全てで上位に来る記事 = 自然に最優先候補
```

---

## X. 案C確定事項: LLM 実行レイヤー（工程6'）

### 二段構造

```
工程6'-A: 分析・構造判断 (Opus 4.7)
  入力: case_d 4.M' 適用後の master_rewrite_session 起票データ
        + IG gap + Evidence Layer + Query Fan-out + 過去 analysis（案V）+ active pattern（案D 2.G）
  処理: 構造分析、リライト方針決定、高リスク判定
  出力: master_rewrite_session.analysis_output, high_risk_categories, policy_summary

  → 高リスク変更（5カテゴリ）検出時:
      master_rewrite_session.status = 'awaiting_policy_judgment'
      Daiki が方針承認/却下 (案K 発動)
      承認 → 工程6'-B へ進行
      却下 → master_rewrite_session.status = 'aborted'

工程6'-B: 差分テキスト生成 (Sonnet 4.6)
  入力: 6'-A の方針 + コンテキスト
  処理: 案H 差分パッチ生成（change_type 9種）
  出力: master_rewrite_diff レコード群

  → master_rewrite_session.status = 'awaiting_diff_judgment'
  Daiki が差分単位で判定（案L、5棄却カテゴリ）
  承認 → master_rewrite_diff.daiki_judgment = 'approved' / 'edit_approved'
       → 工程7 で WordPress 反映
```

### 高リスク変更 5カテゴリ（案K 発動条件）

```
1. title_change                  タイトル変更
2. major_restructure             構成大変更（h2 順序変更、セクション削除）
3. regulation_citation           法令引用の修正
4. rate_update                   金利・限度額・料率の更新
5. low_confidence_output         LLM confidence: low の出力（session レベルのみ）
```

### 棄却理由 5カテゴリ（案L、Daiki 判定時）

```
1. truth_beauty_violation        真=美違反（必然性なし）
2. factual_error                 事実誤認
3. regulation_violation          規制違反
4. evidence_inadequate           Evidence不適切
5. other                         その他（自由記述）

→ 棄却データは Step A-4 の3層学習ループ Layer2 に接続（学習元データ）
```

### LLM コスト（参考）

```
工程6'-A (Opus 4.7):
  入力 80K × $5/M + 出力 2.5K × $25/M = $0.46

工程6'-B (Sonnet 4.6):
  入力 18K × $3/M + 出力 10K × $15/M = $0.21

計 $0.67/記事 × 50記事 = $33.5/月
```

### fetchWpStructured（案C 5-c）

```
従来 fetchWpContent (既存 monitor):
  記事本文を style タグ含めて取得
  実測: max 210K 文字、p50 114K 文字
  既存システムでは MAX_CONTENT_CHARS=12,000 でカットして利用 → 冒頭5-10%しか LLM に見せていない

新 fetchWpStructured (shared/wp-structured.js):
  cheerio ベースで構造化抽出（Markdown 互換）
  実測: max 210K → 38K (82.5%削減、n=3)
  さらに削減フィルタ:
    - 監修者ブロック除去（全記事共通テキスト）
    - 目次（ez-toc）除去（h タグ階層で代替）
    - CTA バナー → [CTA: {partner_slug}] マーカー化（位置情報を保持）
  推定さらに 20% 圧縮（max級記事 38K → 25-30K）

→ Phase 2 で案C と並行実装、既存 monitor-analysis.js (C系) への転用は別案件として保留
```

---

## XI. MVP 3 Phase 戦略（案D完了 + 案B 反映 工数最終版）

```
Phase 1: 対象選定の自動化（実工数 9〜14日）
  - rewrite.db 構築、monitor.db Read-Only接続
  - 軸2スコア計算ロジック（既存 daily_metrics 活用）
  - 軸3経過月数スコア計算ロジック
  - 軸4 Content decay スコア計算ロジック（案B (#1, #12)、+3〜4日）
  - 対象選定APIエンドポイント（GET /api/rewrite/queue?axis=N&limit=20）
  - 簡易UI（軸別キュー表示、4軸独立）
  - 日次バッチ（cron）
  → 完了条件: 単独でMVP運用可能（用語: 「対象選定の自動化」段階）

Phase 2: 自走システム本格稼働（実工数 16〜25日）
  - Step A-1/A-2 のテーブル構築
  - master_post_target_query 構築（案D 2.A）
  - SerpApi Adapter 層
  - IG Score 計算ロジック（3レイヤー、競合 N=3）
  - Query Fan-out 二段構造 + JTBD 拡張（案B (#3)、+1〜2日）
  - Question gap (PAA + サジェスト + 関連検索)（案B (#4)、Step A-2 内包）
  - 軸1スコアを master_rewrite_target_score に統合
  - HCU 22項目チェックリスト + LLM 自動評価（案B (#5)、+2〜3日）
  - master_article_similarity (α: テキスト類似度)（案B (#9, #2)、+3〜5日）
  - 案C: shared/wp-structured.js 実装
  - 案C: shared/llm-adapters/ 実装（3社対応）
  - 案C: shared/article-context.js 実装
  - 案C: master_rewrite_session + master_rewrite_diff 実装
  - 案C: master_rewrite_queue_session_link 実装
  - 案C: 工程6'-A/6'-B オーケストレーション
  - 案C: 差分パッチ承認UI（案L + 案K 発動）
  - クエリレベル decay 検出（案B (#11)、案C 入力情報として実装）
  → 完了条件: 自走システム本格稼働ライン

Phase 3: 学習ループ稼働（実工数 8.5〜13日）
  - master_regulation_event 構築 + 初期データ投入
  - master_partner_status_history 構築
  - 法令変更/商材ステータス変更アラート
  - shared/archive-adapters/ 実装（Wayback + archive.today）
  - master_ab_test* テーブル群構築（4テーブル）
  - SearchPilot variant 割当ロジック（Cloudflare Workers）
  - 統計検定 + Clarity gating
  - 3層学習ループ実装
  - master_article_similarity (β/γ 拡張、Cannibalization 検出)（案B (#9, #2) 後半、+4〜6日）
  - HCU 改訂対応バッチ（案B (#5)、+1日）
  → 完了条件: YMYL最重要対策の自動化完了 + 自走システム完成形

実装工数合計: 33.5〜52日
  (案D完了時点見積もり 24.5〜38日 + 案B 追加 +9〜14日)
  カレンダー時間想定: 3〜5ヶ月
```

---

## XII. データフロー閉合性（案D 確定 + 案B 反映）

```
[工程1] 案E 対象選定
  rewrite.db.master_rewrite_target_score (軸1/2/3/4)
    → rewrite.db.master_rewrite_queue (軸別キュー)
        ↓ post_id

[工程2-3] Step A-2 Query Fan-out
  rewrite.db.master_post_target_query から target_query 取得 ★案D 2.A
    → SerpApi 呼出
    → rewrite.db.master_query_fanout (Layer1主題分解 + JTBD intent_dimension) ★案B (#3)
    → PAA + サジェスト + 関連検索を generation_method で識別 ★案B (#4)
        ↓ query_fanout_id ★案D 2.B

[工程4-5] Step A-1 IG Score
  → rewrite.db.master_competitor_corpus (競合 fact_set)
  → rewrite.db.master_fact_set (自記事 fact)
    → rewrite.db.master_information_gain_score (gap_count)
    → rewrite.db.master_evidence (Step A-3 Evidence Layer)
        ↓ post_id + ig_score + evidence
  
  並行:
    → rewrite.db.master_hcu_checklist (LLM 自動評価) ★案B (#5)
    → rewrite.db.master_article_similarity (関連記事候補) ★案B (#9)

[工程6 + 6'] 案C LLM 実行
  rewrite.db.master_ab_test_pattern から active pattern 注入 ★案D 2.G
  rewrite.db.master_hcu_checklist 結果を案C 入力に追加 ★案B (#5)
  rewrite.db.master_article_similarity から関連記事候補注入 ★案B (#9)
  クエリレベル decay (#11) を案C 入力情報として注入 ★案B (#11)
    → Opus 4.7 (分析・方針)
    → 案K 発動判定 → Daiki 判定 (高リスク時)
    → Sonnet 4.6 (差分生成)
    → rewrite.db.master_rewrite_session (case_d 4.M' 多対多接続)
    → rewrite.db.master_rewrite_queue_session_link
    → rewrite.db.master_rewrite_diff
        ↓ daiki_judgment='approved'

[工程7] 実装
  WordPress REST API
    → master_rewrite_diff.applied_to_wp=1, applied_at=NOW
        ↓

[工程8] Step A-4 A/B Testing
  月次バッチで change_category 集約 ★案D 2.F
    → master_ab_test (planned)
    → SearchPilot variant 割当
    → master_ab_test_result (期間ごと)
    → master_clarity_signal (UX gating)
    → 統計検定 + Clarity gating
    → master_ab_test_pattern (adopt/avoid/condition)
        ↓ feedback to 工程6'-A プロンプト ★案D 2.G
```

---

## XIII. 残課題リスト

### 設計フェーズで未確定（Phase 3 詳細設計で扱う）
- Daikiの真=美判定UI（差分パッチ承認画面）の詳細仕様
- 著者・監修者管理システムとの接続方法
- ステマ規制・貸金業法 Compliance Layer の自動チェック仕様
- サイト全体監査レイヤーの設計（案E 旧軸4 から分離、関連度テーブル γ で接続予定）
- WordPress 反映の冪等性設計（同じ diff を二重適用しない保証）
- SearchPilot variant 割当ロジックの詳細
- HCU 22項目の正確な項目数（Phase 2 実装時に Google 公式から再取得）
- intent_dimension JSON Schema の正規定義（shared/schemas/intent_dimension.schema.json）
- 案B (#9) レベル3 の関連度計算アルゴリズム詳細（埋め込みベクトル選定）

### 環境継続監視
- Google Search Quality Rater Guidelines の年次改訂
- Google Core Updates の発生
- Site Reputation Abuse のアルゴリズム化（現時点は手動措置のみ）
- 景品表示法・貸金業法の改正（直近: 2025年4月2日 日本貸金業協会細則改訂）
- HCU 質問項目の改訂（master_hcu_checklist.checklist_version で対応）

---

## XIV. 警戒すべき AI 側のバイアス（蓄積版）

設計プロセスを通じて、AI（Claude）が陥りやすい以下のバイアスが特定された。次セッション以降のClaudeはこれらに警戒する必要がある。

### 案E で判明: 「既存資産への過剰適応バイアス」
```
資産が高品質 → 流用したい → 流用できる前提で組み立てる
正しくは「目的が一致するか?」を最初に問う必要がある
```

### 案D で判明: 「自分の初期推奨に固着するバイアス」
```
片側照射の傾向あり、初期推奨の構造的破綻を見落とすリスク
Daiki の直感的懸念（「これでちゃんとリライトできるか」等）が
片側照射を暴く重要なシグナルになる
→ 直感的懸念を「実装で確認する」と片付けず、構造的に再検証する
```

### 案B で判明: 「強推奨ラベルへの追従バイアス」
```
リサーチレポートで「強推奨」と評価されているからといって採用すべきとは限らない
Phase 1 リサーチは情報源の質に幅があり、業界専門家支持と Google 一次情報支持を
混同しないことが重要
→ 各手法を Google 一次情報の有無で再フィルタリング
→ 案B では実際に # 9 Hub-and-spoke が Google 一次情報の直接支持なし（業界支持中心）
  であることが浮き彫りになり、Daikiの判断材料となった
```

### 案B で警戒された「機能を盛りたくなるバイアス」
```
設計が複雑になるほど「あれもこれも組み込みたい」という心理が働く
真=美の最小性原則に反する
→ レベル0/レベル1の最小限版を必ず併記、Daikiが選択できる状態を保つ
→ 案B # 9, # 10 の判定で実際に機能した
```

---

## XV. 進行ステータス（次の一歩）

```
次の作業: Phase 3 詳細設計
  対象:
    1. Daikiの真=美判定UI（差分パッチ承認画面）の詳細仕様
    2. エラーハンドリング（LLM API 失敗・SerpApi 失敗・WP 反映失敗）
    3. Compliance Layer 詳細仕様（景品表示法 / 貸金業法 / ASP レギュ）
    4. サイト全体監査レイヤー設計（案E 旧軸4 + 関連度テーブル γ）
    5. SearchPilot variant 割当ロジックの詳細

その後の進行:
  Phase 4: 実装
```

---

## END OF DESIGN SPECIFICATION (案B 完了反映版)
