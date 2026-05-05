-- rewrite.db schema (Phase 4 足場)
-- ソース: design/knowledge/05_rewrite_system_design.md V-A
-- 全26テーブル: Phase E 4 + Phase 1 2 + Phase 2 12 + Phase 3 8
-- 論点0 (2026-05-01): Phase E 4テーブルを rewrite.db に物理移管
-- 論点5-5 (2026-05-01): master_rewrite_diff に ab_test_id 列を統合済み

-- ============================================================
-- Phase 1: 案E 関連
-- ============================================================

CREATE TABLE master_rewrite_target_score (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  axis TEXT NOT NULL,
  score_value REAL,                         -- NULL 許容: axis1_information_gain は Phase 2 まで未計算
  score_components TEXT,
  calculated_at DATETIME NOT NULL,
  period_days INTEGER,
  notes TEXT
);
CREATE INDEX idx_rewrite_target_post ON master_rewrite_target_score(post_id);
CREATE INDEX idx_rewrite_target_axis ON master_rewrite_target_score(axis);
CREATE INDEX idx_rewrite_target_calc ON master_rewrite_target_score(calculated_at);

CREATE TABLE master_rewrite_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  selected_axis TEXT,
  selected_score REAL,
  selected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  selected_by TEXT,
  status TEXT DEFAULT 'queued',
  rewrite_target_score_id INTEGER,
  notes TEXT,
  FOREIGN KEY (rewrite_target_score_id) REFERENCES master_rewrite_target_score(id)
);
CREATE INDEX idx_queue_status ON master_rewrite_queue(status);
CREATE INDEX idx_queue_post ON master_rewrite_queue(post_id);

-- ============================================================
-- Phase 2: Step A-1 関連
-- ============================================================

CREATE TABLE master_fact_set (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  layer INTEGER NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  extraction_method TEXT NOT NULL,
  extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  verified_status TEXT DEFAULT 'unverified',
  verified_by TEXT,
  verified_at DATETIME,
  notes TEXT,
  evidence_id INTEGER,
  FOREIGN KEY (evidence_id) REFERENCES master_evidence(id)
);
CREATE INDEX idx_fact_set_post ON master_fact_set(post_id);
CREATE INDEX idx_fact_set_layer ON master_fact_set(layer);
CREATE INDEX idx_fact_set_status ON master_fact_set(verified_status);

CREATE TABLE master_competitor_corpus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_fanout_id INTEGER,
  target_query TEXT NOT NULL,
  competitor_url TEXT NOT NULL,
  rank_position INTEGER NOT NULL,
  fact_set_snapshot TEXT NOT NULL,
  crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  competitor_url_count INTEGER NOT NULL,
  serp_features TEXT,
  source_type TEXT DEFAULT 'organic',
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
  post_id INTEGER NOT NULL,
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

-- ============================================================
-- Phase 2: Step A-2 関連 (案B intent_dimension)
-- ============================================================

CREATE TABLE master_query_fanout (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_query TEXT NOT NULL,
  sub_query TEXT NOT NULL,
  layer INTEGER NOT NULL,
  parent_sub_query_id INTEGER,
  generation_method TEXT NOT NULL,
  source_evidence TEXT,
  priority INTEGER DEFAULT 0,
  intent_dimension TEXT,
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT,
  reviewed_at DATETIME,
  notes TEXT,
  FOREIGN KEY (parent_sub_query_id) REFERENCES master_query_fanout(id)
);
CREATE INDEX idx_fanout_seed ON master_query_fanout(seed_query);
CREATE INDEX idx_fanout_layer ON master_query_fanout(layer);
CREATE INDEX idx_fanout_priority ON master_query_fanout(priority);

-- ============================================================
-- Phase 2: Step A-3 関連 (案D archive 拡張)
-- ============================================================

CREATE TABLE master_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  content_text TEXT,
  format_type TEXT NOT NULL,
  file_path TEXT,
  generation_method TEXT NOT NULL,
  source_url TEXT,
  archived_url TEXT,
  archive_service TEXT,
  archived_urls_extra TEXT,
  acquired_at DATETIME NOT NULL,
  acquired_by TEXT NOT NULL,
  use_case_tags TEXT NOT NULL,
  volatility TEXT NOT NULL,
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
  post_id INTEGER NOT NULL,
  citation_position TEXT,
  citation_purpose TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  added_by TEXT,
  UNIQUE(evidence_id, post_id, citation_position),
  FOREIGN KEY (evidence_id) REFERENCES master_evidence(id)
);
CREATE INDEX idx_evidence_link_evidence ON master_evidence_article_link(evidence_id);
CREATE INDEX idx_evidence_link_post ON master_evidence_article_link(post_id);

-- ============================================================
-- Phase 2: 案D 由来テーブル
-- ============================================================

CREATE TABLE master_post_target_query (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  target_query TEXT NOT NULL,
  query_role TEXT NOT NULL,
  source TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  set_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  set_by TEXT,
  notes TEXT,
  UNIQUE(post_id, target_query, query_role)
);
CREATE INDEX idx_ptq_post ON master_post_target_query(post_id);
CREATE INDEX idx_ptq_query ON master_post_target_query(target_query);
CREATE INDEX idx_ptq_active ON master_post_target_query(is_active);

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

-- ============================================================
-- Phase 2: 案C 由来テーブル (案D 最終形 + 論点2 status / 論点5-5 ab_test_id 統合済)
-- ============================================================

CREATE TABLE master_rewrite_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  model_analysis TEXT NOT NULL,
  model_generation TEXT NOT NULL,
  input_tokens_analysis INTEGER,
  output_tokens_analysis INTEGER,
  input_tokens_generation INTEGER,
  output_tokens_generation INTEGER,
  cost_total_usd REAL,
  status TEXT NOT NULL DEFAULT 'planned',
  analysis_output TEXT,
  high_risk_categories TEXT,
  policy_summary TEXT,
  policy_judgment TEXT,
  policy_judgment_at DATETIME,
  policy_reject_reason TEXT,
  policy_reject_note TEXT,
  reference_analysis_id INTEGER,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  analysis_completed_at DATETIME,
  generation_completed_at DATETIME,
  completed_at DATETIME,
  wp_snapshot_before_apply TEXT,
  wp_apply_started_at DATETIME,
  wp_apply_completed_at DATETIME,
  triggered_by TEXT NOT NULL,
  notes TEXT
);
CREATE INDEX idx_session_post ON master_rewrite_session(post_id);
CREATE INDEX idx_session_status ON master_rewrite_session(status);
CREATE INDEX idx_session_started ON master_rewrite_session(started_at);

CREATE TABLE master_rewrite_diff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  diff_order INTEGER NOT NULL,
  target_section TEXT NOT NULL,
  change_type TEXT NOT NULL,
  change_category TEXT NOT NULL,
  content_before TEXT,
  content_after TEXT,
  rationale TEXT NOT NULL,
  estimated_impact TEXT,
  llm_confidence TEXT NOT NULL,
  risk_flag TEXT,
  evidence_id INTEGER,
  daiki_judgment TEXT DEFAULT 'pending',
  daiki_edit_content TEXT,
  daiki_reject_reason TEXT,
  daiki_reject_note TEXT,
  judged_at DATETIME,
  applied_to_wp INTEGER DEFAULT 0,
  applied_at DATETIME,
  ab_test_id INTEGER,
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
CREATE INDEX idx_diff_ab_test ON master_rewrite_diff(ab_test_id);

-- ============================================================
-- Phase 2: 案B 由来 新規テーブル
-- ============================================================

CREATE TABLE master_hcu_checklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  checklist_version TEXT NOT NULL,
  evaluation_method TEXT NOT NULL,
  pass_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  pass_rate REAL NOT NULL,
  item_results TEXT NOT NULL,
  evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  evaluated_by TEXT,
  notes TEXT
);
CREATE INDEX idx_hcu_post ON master_hcu_checklist(post_id);
CREATE INDEX idx_hcu_evaluated ON master_hcu_checklist(evaluated_at);
CREATE INDEX idx_hcu_pass_rate ON master_hcu_checklist(pass_rate);
CREATE INDEX idx_hcu_version ON master_hcu_checklist(checklist_version);

CREATE TABLE master_article_similarity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_post_id INTEGER NOT NULL,
  target_post_id INTEGER NOT NULL,
  text_similarity REAL,
  query_overlap REAL,
  entity_overlap REAL,
  rank_in_source INTEGER NOT NULL,
  calculation_method TEXT NOT NULL,
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE(source_post_id, target_post_id, calculated_at)
);
CREATE INDEX idx_similarity_source ON master_article_similarity(source_post_id);
CREATE INDEX idx_similarity_target ON master_article_similarity(target_post_id);
CREATE INDEX idx_similarity_text ON master_article_similarity(text_similarity);
CREATE INDEX idx_similarity_query ON master_article_similarity(query_overlap);

-- ============================================================
-- Phase 3: 案E + Step A-4 関連
-- ============================================================

CREATE TABLE master_regulation_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regulation_name TEXT NOT NULL,
  event_date DATETIME NOT NULL,
  event_type TEXT NOT NULL,
  affected_categories TEXT,
  description TEXT,
  source_url TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  added_by TEXT
);

CREATE TABLE master_partner_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_slug TEXT NOT NULL,
  status TEXT NOT NULL,
  changed_at DATETIME NOT NULL,
  description TEXT,
  notes TEXT
);

CREATE TABLE master_ab_test (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_name TEXT NOT NULL,
  test_type TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  change_category TEXT NOT NULL,
  change_description TEXT NOT NULL,
  target_urls TEXT NOT NULL,
  control_urls TEXT,
  applied_at DATETIME NOT NULL,
  observation_start DATETIME NOT NULL,
  observation_end DATETIME NOT NULL,
  status TEXT DEFAULT 'planned',
  statistical_method TEXT DEFAULT 'bayesian_final',
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
  period TEXT NOT NULL,
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
  clarity_signal_id INTEGER,
  FOREIGN KEY (test_id) REFERENCES master_ab_test(id),
  FOREIGN KEY (clarity_signal_id) REFERENCES master_clarity_signal(id)
);
CREATE INDEX idx_ab_result_test ON master_ab_test_result(test_id);
CREATE INDEX idx_ab_result_period ON master_ab_test_result(period);

CREATE TABLE master_ab_test_pattern (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  pattern_type TEXT NOT NULL,
  change_category TEXT NOT NULL,
  pattern_description TEXT NOT NULL,
  effect_size_percent REAL,
  confidence_level TEXT NOT NULL,
  applicable_conditions TEXT,
  active_status TEXT DEFAULT 'active',
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
  ab_test_period TEXT,
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

-- ============================================================
-- Phase 3: 論点3 由来 新規テーブル
-- ============================================================

CREATE TABLE master_ymyl_requirement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  requirement_name TEXT NOT NULL,
  detection_pattern TEXT NOT NULL,
  legal_basis TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('draft', 'verified', 'deprecated'))
);
CREATE INDEX idx_ymyl_category ON master_ymyl_requirement(category);
CREATE INDEX idx_ymyl_status ON master_ymyl_requirement(status);

-- ============================================================
-- Phase 3: 論点4 由来 新規テーブル
-- ============================================================

CREATE TABLE master_site_audit_score (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_type TEXT NOT NULL,
  target_post_ids TEXT NOT NULL,
  score REAL NOT NULL,
  threshold REAL,
  status TEXT NOT NULL DEFAULT 'detected',
  detection_method TEXT,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT,
  reviewed_at DATETIME,
  resolved_at DATETIME,
  notes TEXT
);
CREATE INDEX idx_site_audit_type ON master_site_audit_score(audit_type);
CREATE INDEX idx_site_audit_status ON master_site_audit_score(status);
CREATE INDEX idx_site_audit_detected ON master_site_audit_score(detected_at);

-- ============================================================
-- Phase E 既実装テーブル (論点0: monitor.db からの移管先)
-- 実装ソース: node/master-db.js (initSchema)
-- スキーマは既存実装と完全一致 (破壊的変更なし)
-- 物理移管 + monitor.db 側 DROP は別タスク (Daiki 承認後)
-- ============================================================

CREATE TABLE master_annotations (
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
CREATE INDEX idx_ann_product  ON master_annotations(product_id);
CREATE INDEX idx_ann_category ON master_annotations(category);
CREATE INDEX idx_ann_status   ON master_annotations(status);

CREATE TABLE master_rules (
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
CREATE INDEX idx_rules_status   ON master_rules(status);

CREATE TABLE master_completeness_checklist (
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
CREATE INDEX idx_check_status  ON master_completeness_checklist(status);

CREATE TABLE master_audit_log (
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
CREATE INDEX idx_audit_table      ON master_audit_log(table_name, record_id);
CREATE INDEX idx_audit_changed_at ON master_audit_log(changed_at);
