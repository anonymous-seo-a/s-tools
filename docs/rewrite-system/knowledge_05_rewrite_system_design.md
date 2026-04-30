# ナレッジファイル5：リライトAIシステム設計

最終更新: 2026年4月30日
ステータス: 設計フェーズ進行中（Phase 2: Step A 完了、案E〜案B 残）

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
  ----------ここまで4 Step分の確定事項----------
  案E: 既存スコアリング統合         次に進行
  案C: LLM実行レイヤー設計         未着手
  案D: 統合確認                    未着手
  案B: 強推奨手法の確定            未着手
Phase 3: 詳細設計                  未着手
Phase 4: 実装                      未着手
```

---

## II. システム全体像（リライト処理8工程）

```
工程1: リライト対象選定        AI（既存スコアリング統合）
工程2: 競合構造分析（SERP分析） AI（Query Fan-out）
工程3: 検索意図分解            AI（工程2と統合実装）
工程4: ギャップ抽出            AI（Information Gain）
工程5: 差分生成                AI + 人間（Information Gain駆動）
工程6: 人間判定（真=美フィルタ） 人間（Daiki）
工程6': LLM実行レイヤー        AI（未設計、案Cで設計予定）
工程7: 実装（Schema・Technical）AI
工程8: 効果測定・学習ループ    AI + 人間（A/Bテスト）
```

---

## III. 採用した手法（最優先5手法）

レポート（Phase 1の調査結果）から「日本未採用×海外採用×Google一次情報支持」の最優先5手法を全て採用。

### 1. Information Gain 駆動の差分生成（Step A-1）
- 一次情報根拠: Contextual Estimation of Link Information Gain 特許
  + HCU "Does the content provide insightful analysis or interesting information that is beyond the obvious?"
- KPI: Information Gain スコア（特許準拠）を直接KPI化
- 3レイヤー全採用（エンティティ + 事実主張 + 経験）

### 2. Query Fan-out 構造シミュレーション（Step A-2）
- 一次情報根拠: developers.google.com/search/docs/appearance/ai-features
  + 特許 US 12158907B1（Thematic Search）, US 2024/0289407A1（Search with Stateful Chat）
- 二段構造（Layer1主題分解 + Layer2 micro-intent展開）
- Layer1のみ競合URL収集、Layer2はセクション設計の参考情報

### 3. Original research / 独自データ生成（Step A-3 統合）
- 一次情報根拠: HCU "Does the content provide original information, reporting, research, or analysis?"
- Evidence Layer に統合管理

### 4. First-hand experience markers（Step A-3 統合）
- 一次情報根拠: E-E-A-Tの "Experience"（2022年12月追加）
- Evidence Layer に統合管理

### 5. SearchPilot方式 SEO A/B Testing（Step A-4）
- 一次情報根拠: John Mueller "test things" 推奨発言
  + SearchPilot 実証ベンチマーク（業界広範な交差確認）
- 完全SearchPilot方式採用（記事数3,000規模で統計的検出力成立）

---

## IV. 採用したインフラ

| 項目 | 選定 | 月額目安 | 備考 |
|---|---|---|---|
| SERP API | SerpApi（サブスクStarter） | $25 | 月50記事ペースで250クエリ/月想定 |
| CDN/Edge Layer | Cloudflare Workers | 既存 | A/Bテストvariant injection用 |
| ヒートマップ | Microsoft Clarity | 無料 | A/Bテスト判定 + リライト計画補助 |
| LLM | Anthropic Claude API or OpenAI API | 数千円〜1万円 | 工程6'のLLM実行レイヤー |
| 既存スタック | Node.js + Express + better-sqlite3 + React/Vite | - | 維持 |
| GitHub | anonymous-seo-a/s-tools | - | Single Source of Truth |

合計運用コスト目安: 月1〜1.5万円程度。

---

## V. 新規テーブル一覧（SQL確定版）

### Step A-1: Information Gain 関連

```sql
CREATE TABLE master_fact_set (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  layer INTEGER NOT NULL,                -- 1: entity / 2: claim / 3: experience
  content TEXT NOT NULL,
  source_url TEXT,
  extraction_method TEXT NOT NULL,       -- 'kg_api' / 'llm' / 'human'
  extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  verified_status TEXT DEFAULT 'unverified',
  verified_by TEXT,
  verified_at DATETIME,
  notes TEXT,
  evidence_id INTEGER,                   -- Step A-3 で追加
  FOREIGN KEY (article_id) REFERENCES articles(id),
  FOREIGN KEY (evidence_id) REFERENCES master_evidence(id)
);
CREATE INDEX idx_fact_set_article ON master_fact_set(article_id);
CREATE INDEX idx_fact_set_layer ON master_fact_set(layer);
CREATE INDEX idx_fact_set_status ON master_fact_set(verified_status);

CREATE TABLE master_competitor_corpus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_query TEXT NOT NULL,
  competitor_url TEXT NOT NULL,
  rank_position INTEGER NOT NULL,
  fact_set_snapshot TEXT NOT NULL,       -- JSON形式
  crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  competitor_url_count INTEGER NOT NULL, -- 取得時のN値（デフォルト3、可変）
  serp_features TEXT,                    -- JSON: PAA/snippet/AI Overview等
  source_type TEXT DEFAULT 'organic',    -- 'organic' / 'ai_overview_citation' / 'paa' / 'related_search'
  notes TEXT,
  UNIQUE(target_query, competitor_url, crawled_at)
);
CREATE INDEX idx_competitor_query ON master_competitor_corpus(target_query);
CREATE INDEX idx_competitor_url ON master_competitor_corpus(competitor_url);
CREATE INDEX idx_competitor_crawled ON master_competitor_corpus(crawled_at);

CREATE TABLE master_information_gain_score (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  target_query TEXT NOT NULL,
  layer1_gain_score INTEGER NOT NULL,
  layer2_gain_score INTEGER NOT NULL,
  layer3_gain_score INTEGER NOT NULL,
  layer1_gap_count INTEGER NOT NULL,
  layer2_gap_count INTEGER NOT NULL,
  competitor_url_count INTEGER NOT NULL,
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);
CREATE INDEX idx_ig_score_article ON master_information_gain_score(article_id);
CREATE INDEX idx_ig_score_query ON master_information_gain_score(target_query);
CREATE INDEX idx_ig_score_calculated ON master_information_gain_score(calculated_at);
```

### Step A-2: Query Fan-out 関連

```sql
CREATE TABLE master_query_fanout (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_query TEXT NOT NULL,
  sub_query TEXT NOT NULL,
  layer INTEGER NOT NULL,                -- 1: 主題分解 / 2: micro-intent展開
  parent_sub_query_id INTEGER,
  generation_method TEXT NOT NULL,       -- 'llm' / 'paa' / 'related_search' / 'ai_overview_subquery'
  source_evidence TEXT,
  priority INTEGER DEFAULT 0,            -- 0=未判定 / 1=採用 / 2=保留 / 3=不採用
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

### Step A-3: Evidence Layer 関連

```sql
CREATE TABLE master_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  content_text TEXT,
  format_type TEXT NOT NULL,             -- 'number' / 'image' / 'video' / 'audio' / 'text'
  file_path TEXT,
  generation_method TEXT NOT NULL,       -- 'survey' / 'measurement' / 'interview' / 'first_hand' / 'official_source'
  source_url TEXT,
  archived_url TEXT,                     -- Wayback Machine等のスナップショット
  acquired_at DATETIME NOT NULL,
  acquired_by TEXT NOT NULL,
  use_case_tags TEXT NOT NULL,           -- JSON配列: ['information_gain', 'eeat_experience', 'compliance', 'trust_signal']
  volatility TEXT NOT NULL,              -- 'high' / 'medium' / 'low' / 'static'
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
  article_id INTEGER NOT NULL,
  citation_position TEXT,
  citation_purpose TEXT,                 -- 'fact_claim' / 'experience_proof' / 'compliance_reference' / 'trust_signal'
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  added_by TEXT,
  UNIQUE(evidence_id, article_id, citation_position),
  FOREIGN KEY (evidence_id) REFERENCES master_evidence(id),
  FOREIGN KEY (article_id) REFERENCES articles(id)
);
CREATE INDEX idx_evidence_link_evidence ON master_evidence_article_link(evidence_id);
CREATE INDEX idx_evidence_link_article ON master_evidence_article_link(article_id);
```

### Step A-4: A/B Testing 関連

```sql
CREATE TABLE master_ab_test (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_name TEXT NOT NULL,
  test_type TEXT NOT NULL,               -- 'before_after' / 'staged_rollout' / 'searchpilot_full'
  hypothesis TEXT NOT NULL,
  change_category TEXT NOT NULL,         -- 'title' / 'h2_structure' / 'evidence_insertion' / 'schema' / 'internal_link' / 'paragraph_rewrite' / 'compliance_update' / 'other'
  change_description TEXT NOT NULL,
  target_urls TEXT NOT NULL,             -- JSON配列
  control_urls TEXT,                     -- 段階的リリース時のコントロール
  applied_at DATETIME NOT NULL,
  observation_start DATETIME NOT NULL,
  observation_end DATETIME NOT NULL,
  status TEXT DEFAULT 'planned',         -- 'planned' / 'running' / 'completed' / 'aborted'
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
  period TEXT NOT NULL,                  -- 'pre' / 'post'
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
  clarity_signal_id INTEGER,             -- Clarity連携
  FOREIGN KEY (test_id) REFERENCES master_ab_test(id),
  FOREIGN KEY (clarity_signal_id) REFERENCES master_clarity_signal(id)
);
CREATE INDEX idx_ab_result_test ON master_ab_test_result(test_id);
CREATE INDEX idx_ab_result_period ON master_ab_test_result(period);

CREATE TABLE master_ab_test_pattern (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  pattern_type TEXT NOT NULL,            -- 'adopt' / 'avoid' / 'condition'
  change_category TEXT NOT NULL,
  pattern_description TEXT NOT NULL,
  effect_size_percent REAL,
  confidence_level TEXT NOT NULL,        -- 'high' / 'medium' / 'low'
  applicable_conditions TEXT,
  active_status TEXT DEFAULT 'active',   -- 'active' / 'deprecated' / 'review_needed'
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
  ab_test_period TEXT,                   -- 'pre' / 'post' / NULL
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

---

## VI. 各Stepの確定事項（議論結論のサマリ）

### Step A-1: Information Gain

| 項目 | 確定 |
|---|---|
| レイヤー方式 | 3レイヤー全採用（エンティティ + 事実主張 + 経験） |
| KPI | Information Gain スコア（特許準拠）を直接KPI化 |
| 競合上位URL数 | デフォルト N=3、可変設定 |
| 既存スコアリング統合 | リライト対象選定は既存統合、IG は改善方向決定指標 |
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

### Step A-3: Evidence Layer

| 項目 | 確定 |
|---|---|
| Original research と First-hand experience の統合 | 統合（Evidence Layerとして一元管理） |
| 4軸タグ分類 | 形式 × 生成方法 × 用途 × 変動性 |
| Evidence と記事の関係 | 多対多（共有プール） |
| 劣化管理 | volatility + valid_until 併用 |
| URL検証 | Wayback Machine自動アーカイブ + 月次健全性チェック |

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
- 抽象化レイヤー（API差し替え可能）
- 3層学習ループ（記録 → 抽出 → 反映）
- 主指標 × Clarity gating の二段判定
- ポジトーク回避（Google一次情報ベース）

---

## IX. 既存スコアリング統合の前提（案E用）

参照先: https://github.com/anonymous-seo-a/s-tools

案E では以下を確認する必要がある：
1. 既存記事スコアリングのインプット
2. 既存記事スコアリングのアウトプット
3. 既存記事スコアリングの計算ロジック
4. 既存スコアリングの現在の運用方法
5. Information Gain Score / Microsoft Clarity との統合方法

---

## X. 残課題リスト

### 設計フェーズで未確定
- 案E: 既存記事スコアリングとの統合仕様
- 案C: 工程6'（LLM実行レイヤー）の設計
- 案D: Step A-1〜A-4 の統合確認
- 案B: 強推奨手法の確定（最優先5以外）

### 確認待ち事項
- Daikiの真=美判定UI（差分パッチ承認画面）の仕様
- 著者・監修者管理システムとの接続方法
- ステマ規制・貸金業法 Compliance Layer の自動チェック仕様

### 環境継続監視
- Google Search Quality Rater Guidelines の年次改訂
- Google Core Updates の発生
- Site Reputation Abuse のアルゴリズム化（現時点は手動措置のみ）
- 景品表示法・貸金業法の改正（直近: 2025年4月2日 日本貸金業協会細則改訂）

---

## XI. 進行ステータス（次の一歩）

```
次の作業: 案E（既存スコアリング統合仕様の確定）
  - GitHubリポジトリ anonymous-seo-a/s-tools の確認
  - 既存スコアリングの仕様抽出
  - Information Gain Score / Clarity との統合方法決定
  
その後の進行:
  案C → 案D → 案B → Phase 3 詳細設計 → Phase 4 実装
```
