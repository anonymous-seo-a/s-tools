/**
 * SEO リライトシステム: マスターテーブル DB 層
 *
 * Phase E スコープ:
 *   - master_annotations          商材別注釈マスター
 *   - master_rules                表現ルールマスター（禁止/必須/正式表記）
 *   - master_completeness_checklist 完成度管理
 *   - master_audit_log            編集履歴
 *
 * 物理配置: data/rewrite.db (Phase 4 論点0 で全マスターデータを rewrite.db に統合)
 * Phase 4 schema.sql に同一 DDL が含まれており、本モジュールの initSchema は
 * IF NOT EXISTS で冪等動作する。
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.MASTER_DB_PATH || path.join(__dirname, 'data', 'rewrite.db');

let db = null;

function getDB() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  seedIfEmpty(db);
  return db;
}

function initSchema(d) {
  d.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_ann_product  ON master_annotations(product_id);
    CREATE INDEX IF NOT EXISTS idx_ann_category ON master_annotations(category);
    CREATE INDEX IF NOT EXISTS idx_ann_status   ON master_annotations(status);

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
    CREATE INDEX IF NOT EXISTS idx_rules_category ON master_rules(category);
    CREATE INDEX IF NOT EXISTS idx_rules_status   ON master_rules(status);

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
    CREATE INDEX IF NOT EXISTS idx_check_product ON master_completeness_checklist(product_id);
    CREATE INDEX IF NOT EXISTS idx_check_status  ON master_completeness_checklist(status);

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
    CREATE INDEX IF NOT EXISTS idx_audit_table      ON master_audit_log(table_name, record_id);
    CREATE INDEX IF NOT EXISTS idx_audit_changed_at ON master_audit_log(changed_at);
  `);
}

// ============================================================
// 初期データ（GAS 実装からの移植）
// ============================================================
const ANNOTATION_SEED = [
  // アイフル
  ['aiful', 'アイフル', 'cardloan', '最短18分', 'keyword', '審査・融資', 'お申込み時間や審査状況によりご希望にそえない場合があります。', '※ai'],
  ['aiful', 'アイフル', 'cardloan', '800万円', 'keyword', '限度額', 'ご利用限度額50万円超、または他社を含めた借り入れ金額が100万円超の場合は源泉徴収票など収入を証明するものが必要です。', '※ai'],
  ['aiful', 'アイフル', 'cardloan', '郵送物なし', 'keyword', '郵送物', '「スマホでかんたん本人確認」又は「銀行口座で本人確認」をし、カード郵送希望無の場合郵送物は届きません。', '※ai'],
  ['aiful', 'アイフル', 'cardloan', 'WEB完結', 'keyword', 'WEB完結', '申込等内容に不備があれば電話確認あり。', '※ai'],
  // アコム
  ['acom', 'アコム', 'cardloan', '最短20分', 'keyword', '審査・融資', 'お申込時間や審査によりご希望に添えない場合がございます。', '※a'],
  ['acom', 'アコム', 'cardloan', '即日融資', 'keyword', '即日融資', 'アコムの当日契約の期限は21時までです。', '※a'],
  ['acom', 'アコム', 'cardloan', '無利息', 'keyword', '無利息期間', 'アコムでのご契約がはじめてのお客さま', '※a'],
  // プロミス
  ['promise', 'プロミス', 'cardloan', '最短3分', 'keyword', '審査・融資', 'お申込時間や審査によりご希望に添えない場合がございます。', '※p'],
  ['promise', 'プロミス', 'cardloan', '無利息', 'keyword', '無利息期間', 'メールアドレス登録とWeb明細利用の登録が必要です。', '※p'],
  ['promise', 'プロミス', 'cardloan', '800万円', 'keyword', '限度額', '借入限度額は審査によって決定いたします。', '※p'],
  ['promise', 'プロミス', 'cardloan', '18歳', 'keyword', '申込対象', '主婦・学生でもアルバイト・パートなど安定した収入のある場合はお申込いただけます。ただし、高校生（定時制高校生および高等専門学校生も含む）はお申込いただけません。また、収入が年金のみの方はお申込いただけません。', '※p'],
  ['promise', 'プロミス', 'cardloan', '事前審査,15秒', 'and_condition', '事前審査①', '事前審査結果ご確認後、本審査が必要となります。', '※p'],
  ['promise', 'プロミス', 'cardloan', '事前審査,15秒', 'and_condition', '事前審査②', '新規契約時のご融資上限は、本審査により決定となります。', '※p'],
  // SMBCモビット
  ['mobit', 'SMBCモビット', 'cardloan', '最短15分', 'keyword', '審査・融資', '申込の曜日、時間帯によっては翌日以降の取扱となる場合があります。', '※m'],
  ['mobit', 'SMBCモビット', 'cardloan', '800万円', 'keyword', '限度額', '借入限度額は審査によって決定いたします', '※m'],
];

const RULE_SEED = [
  // 禁止表現（全社共通）
  ['cardloan', 'ALL', '禁止表現', '審査が甘い', '', '常に'],
  ['cardloan', 'ALL', '禁止表現', '審査簡単', '', '常に'],
  ['cardloan', 'ALL', '禁止表現', '審査が柔軟', '', '常に'],
  ['cardloan', 'ALL', '禁止表現', '無審査', '', '常に'],
  ['cardloan', 'ALL', '禁止表現', '確実融資', '', '常に'],
  ['cardloan', 'ALL', '禁止表現', '絶対借入できる', '', '常に'],
  ['cardloan', 'ALL', '禁止表現', 'ブラックでも借りられる', '', '常に'],
  ['cardloan', 'ALL', '禁止表現', '業界最速', '', '常に'],
  ['cardloan', 'ALL', '禁止表現', '最強', '', '常に'],
  ['cardloan', 'ALL', '禁止表現', 'リスクなし', '', '常に'],
  // 必須表現（全社共通）
  ['cardloan', 'ALL', '必須表現', '電話なし', '原則電話による在籍確認なし', '商材言及時'],
  ['cardloan', 'ALL', '必須表現', '電話連絡なし', '原則電話による在籍確認なし', '商材言及時'],
  ['cardloan', 'ALL', '必須表現', 'バレない', '知られない', '商材言及時'],
  ['cardloan', 'ALL', '必須表現', 'バレずに', '知られずに', '商材言及時'],
  ['cardloan', 'ALL', '必須表現', '内緒で', '周囲に知られにくい', '商材言及時'],
  // 正式表記（商材別）
  ['cardloan', 'acom', '正式表記', '30日間無利息', '初めての方は契約翌日から最大30日間無利息', '商材言及時'],
  ['cardloan', 'promise,aiful,mobit', '正式表記', '30日間無利息', '初回最大30日間無利息', '商材言及時'],
  ['cardloan', 'acom', '必須表現', '在籍確認なし', '原則電話によるお勤め先への在籍確認なし', '商材言及時'],
  ['cardloan', 'mobit', '必須表現', 'セブン銀行ATM', 'セブン銀行の提携ATM', '商材言及時'],
  ['cardloan', 'mobit', '必須表現', 'ローソン銀行ATM', 'ローソン銀行の提携ATM', '商材言及時'],
  // モビット固有
  ['cardloan', 'mobit', '必須表現', '誰にもバレない', 'WEB完結申込なら誰にもバレない', '商材言及時'],
];

const CHECKLIST_PRODUCTS = ['acom', 'aiful', 'promise', 'mobit'];
const CHECKLIST_ITEMS = [
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

function seedIfEmpty(d) {
  const annCount = d.prepare('SELECT COUNT(*) AS n FROM master_annotations').get().n;
  if (annCount === 0) {
    const stmt = d.prepare(`
      INSERT INTO master_annotations
        (product_id, product_name, category, trigger_pattern, trigger_type,
         annotation_type, annotation_text, symbol, scope, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '商材言及時', 'draft')
    `);
    const tx = d.transaction((rows) => { for (const r of rows) stmt.run(...r); });
    tx(ANNOTATION_SEED);
  }

  const ruleCount = d.prepare('SELECT COUNT(*) AS n FROM master_rules').get().n;
  if (ruleCount === 0) {
    const stmt = d.prepare(`
      INSERT INTO master_rules
        (category, product_ids, rule_type, ng_text, correct_text, condition, status)
      VALUES (?, ?, ?, ?, ?, ?, 'draft')
    `);
    const tx = d.transaction((rows) => { for (const r of rows) stmt.run(...r); });
    tx(RULE_SEED);
  }

  const checkCount = d.prepare('SELECT COUNT(*) AS n FROM master_completeness_checklist').get().n;
  if (checkCount === 0) {
    const stmt = d.prepare(`
      INSERT INTO master_completeness_checklist
        (category, product_id, check_item, check_order, status, assignee)
      VALUES ('cardloan', ?, ?, ?, 'pending', ?)
    `);
    const rows = [];
    for (const product of CHECKLIST_PRODUCTS) {
      for (const ci of CHECKLIST_ITEMS) {
        rows.push([product, ci.item, ci.order, ci.assignee]);
      }
    }
    const tx = d.transaction((batch) => { for (const r of batch) stmt.run(...r); });
    tx(rows);
  }
}

// ============================================================
// audit_log ヘルパ
// ============================================================
const DEFAULT_USER = 'Daiki';

function recordAudit(tableName, recordId, action, beforeValue, afterValue, changedBy) {
  getDB().prepare(`
    INSERT INTO master_audit_log (table_name, record_id, action, changed_by, before_value, after_value)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    tableName,
    recordId,
    action,
    changedBy || DEFAULT_USER,
    beforeValue ? JSON.stringify(beforeValue) : null,
    afterValue ? JSON.stringify(afterValue) : null
  );
}

// ============================================================
// 共通: テーブル名 → カラム定義
// ============================================================
const TABLE_COLUMNS = {
  master_annotations: [
    'product_id', 'product_name', 'category', 'trigger_pattern', 'trigger_type',
    'trigger_priority', 'annotation_type', 'annotation_text', 'symbol', 'scope',
    'source_url', 'verified_at', 'verified_by', 'status'
  ],
  master_rules: [
    'category', 'product_ids', 'rule_type', 'ng_text', 'correct_text',
    'condition', 'legal_basis', 'source_url', 'verified_at', 'verified_by', 'status'
  ],
  master_completeness_checklist: [
    'category', 'product_id', 'check_item', 'check_order',
    'status', 'assignee', 'completed_at', 'notes'
  ],
};

function pickColumns(table, body) {
  const cols = TABLE_COLUMNS[table];
  if (!cols) throw new Error(`unknown table: ${table}`);
  const out = {};
  for (const c of cols) {
    if (body[c] !== undefined) out[c] = body[c];
  }
  return out;
}

// ============================================================
// annotations CRUD
// ============================================================
function listAnnotations({ category, product_id, status, limit = 200, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (category)   { where.push('category = ?');   params.push(category); }
  if (product_id) { where.push('product_id = ?'); params.push(product_id); }
  if (status)     { where.push('status = ?');     params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = getDB().prepare(`
    SELECT * FROM master_annotations
    ${whereSql}
    ORDER BY product_id, category, id
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const total = getDB().prepare(`SELECT COUNT(*) AS n FROM master_annotations ${whereSql}`).get(...params).n;
  return { rows, total, limit, offset };
}

function getAnnotation(id) {
  return getDB().prepare('SELECT * FROM master_annotations WHERE id = ?').get(id);
}

function createAnnotation(body, changedBy) {
  const data = pickColumns('master_annotations', body);
  const required = ['product_id', 'product_name', 'category', 'trigger_pattern', 'annotation_type', 'annotation_text'];
  for (const k of required) {
    if (!data[k]) throw new Error(`missing required field: ${k}`);
  }
  const cols = Object.keys(data);
  const placeholders = cols.map(() => '?').join(', ');
  const stmt = getDB().prepare(`INSERT INTO master_annotations (${cols.join(', ')}) VALUES (${placeholders})`);
  const result = stmt.run(...cols.map(c => data[c]));
  const created = getAnnotation(result.lastInsertRowid);
  recordAudit('master_annotations', result.lastInsertRowid, 'create', null, created, changedBy);
  return created;
}

function updateAnnotation(id, body, changedBy) {
  const before = getAnnotation(id);
  if (!before) return null;
  const data = pickColumns('master_annotations', body);
  if (Object.keys(data).length === 0) return before;
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  getDB().prepare(`UPDATE master_annotations SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...Object.values(data), id);
  const after = getAnnotation(id);
  recordAudit('master_annotations', id, 'update', before, after, changedBy);
  return after;
}

function deleteAnnotation(id, changedBy) {
  const before = getAnnotation(id);
  if (!before) return null;
  getDB().prepare(`UPDATE master_annotations SET status = 'deprecated', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  const after = getAnnotation(id);
  recordAudit('master_annotations', id, 'delete', before, after, changedBy);
  return after;
}

// ============================================================
// rules CRUD
// ============================================================
function listRules({ category, rule_type, status, limit = 200, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (category)  { where.push('category = ?');   params.push(category); }
  if (rule_type) { where.push('rule_type = ?');  params.push(rule_type); }
  if (status)    { where.push('status = ?');     params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = getDB().prepare(`
    SELECT * FROM master_rules
    ${whereSql}
    ORDER BY rule_type, id
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const total = getDB().prepare(`SELECT COUNT(*) AS n FROM master_rules ${whereSql}`).get(...params).n;
  return { rows, total, limit, offset };
}

function getRule(id) {
  return getDB().prepare('SELECT * FROM master_rules WHERE id = ?').get(id);
}

function createRule(body, changedBy) {
  const data = pickColumns('master_rules', body);
  const required = ['category', 'product_ids', 'rule_type', 'ng_text'];
  for (const k of required) {
    if (data[k] === undefined || data[k] === null || data[k] === '') {
      throw new Error(`missing required field: ${k}`);
    }
  }
  const cols = Object.keys(data);
  const placeholders = cols.map(() => '?').join(', ');
  const stmt = getDB().prepare(`INSERT INTO master_rules (${cols.join(', ')}) VALUES (${placeholders})`);
  const result = stmt.run(...cols.map(c => data[c]));
  const created = getRule(result.lastInsertRowid);
  recordAudit('master_rules', result.lastInsertRowid, 'create', null, created, changedBy);
  return created;
}

function updateRule(id, body, changedBy) {
  const before = getRule(id);
  if (!before) return null;
  const data = pickColumns('master_rules', body);
  if (Object.keys(data).length === 0) return before;
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  getDB().prepare(`UPDATE master_rules SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...Object.values(data), id);
  const after = getRule(id);
  recordAudit('master_rules', id, 'update', before, after, changedBy);
  return after;
}

function deleteRule(id, changedBy) {
  const before = getRule(id);
  if (!before) return null;
  getDB().prepare(`UPDATE master_rules SET status = 'deprecated', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  const after = getRule(id);
  recordAudit('master_rules', id, 'delete', before, after, changedBy);
  return after;
}

// ============================================================
// checklist
// ============================================================
function listChecklist({ category, product_id, status } = {}) {
  const where = [];
  const params = [];
  if (category)   { where.push('category = ?');   params.push(category); }
  if (product_id) { where.push('product_id = ?'); params.push(product_id); }
  if (status)     { where.push('status = ?');     params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDB().prepare(`
    SELECT * FROM master_completeness_checklist
    ${whereSql}
    ORDER BY product_id, check_order
  `).all(...params);
}

function getChecklistItem(id) {
  return getDB().prepare('SELECT * FROM master_completeness_checklist WHERE id = ?').get(id);
}

function updateChecklistItem(id, body, changedBy) {
  const before = getChecklistItem(id);
  if (!before) return null;
  const data = pickColumns('master_completeness_checklist', body);
  if (Object.keys(data).length === 0) return before;
  if (data.status === 'done' && !data.completed_at) {
    data.completed_at = new Date().toISOString().slice(0, 10);
  }
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  getDB().prepare(`UPDATE master_completeness_checklist SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...Object.values(data), id);
  const after = getChecklistItem(id);
  recordAudit('master_completeness_checklist', id, 'update', before, after, changedBy);
  return after;
}

// ============================================================
// audit log 参照
// ============================================================
function listAuditLog({ table_name, record_id, since, until, limit = 200, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (table_name) { where.push('table_name = ?'); params.push(table_name); }
  if (record_id)  { where.push('record_id = ?');  params.push(record_id); }
  if (since)      { where.push('changed_at >= ?'); params.push(since); }
  if (until)      { where.push('changed_at <= ?'); params.push(until); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = getDB().prepare(`
    SELECT * FROM master_audit_log
    ${whereSql}
    ORDER BY changed_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const total = getDB().prepare(`SELECT COUNT(*) AS n FROM master_audit_log ${whereSql}`).get(...params).n;
  return { rows, total, limit, offset };
}

// ============================================================
// 完成度ダッシュボード集計
// ============================================================
function getCompletenessSummary() {
  // チェックリスト進捗（商材別）
  const checklist = getDB().prepare(`
    SELECT product_id,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
           SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress
    FROM master_completeness_checklist
    GROUP BY product_id
  `).all();

  // 注釈検証進捗（商材別、deprecated 除外）
  const annotations = getDB().prepare(`
    SELECT product_id,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified,
           SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft
    FROM master_annotations
    WHERE status != 'deprecated'
    GROUP BY product_id
  `).all();

  const byProduct = {};
  for (const c of checklist) {
    byProduct[c.product_id] = {
      product_id: c.product_id,
      checklist: { total: c.total, done: c.done, in_progress: c.in_progress },
      annotations: { total: 0, verified: 0, draft: 0 },
    };
  }
  for (const a of annotations) {
    if (!byProduct[a.product_id]) {
      byProduct[a.product_id] = {
        product_id: a.product_id,
        checklist: { total: 0, done: 0, in_progress: 0 },
        annotations: { total: a.total, verified: a.verified, draft: a.draft },
      };
    } else {
      byProduct[a.product_id].annotations = { total: a.total, verified: a.verified, draft: a.draft };
    }
  }
  return Object.values(byProduct).sort((x, y) => x.product_id.localeCompare(y.product_id));
}

// ============================================================
// CSV インポート/エクスポート
// ============================================================
function exportRows(table, filter = {}) {
  if (!TABLE_COLUMNS[table]) throw new Error(`unknown table: ${table}`);
  const where = [];
  const params = [];
  for (const [k, v] of Object.entries(filter)) {
    if (v && TABLE_COLUMNS[table].includes(k)) {
      where.push(`${k} = ?`);
      params.push(v);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDB().prepare(`SELECT * FROM ${table} ${whereSql} ORDER BY id`).all(...params);
}

function importRows(table, rows, changedBy) {
  if (!TABLE_COLUMNS[table]) throw new Error(`unknown table: ${table}`);
  const cols = TABLE_COLUMNS[table];
  const stmt = getDB().prepare(`
    INSERT INTO ${table} (${cols.join(', ')})
    VALUES (${cols.map(() => '?').join(', ')})
  `);
  const inserted = [];
  const tx = getDB().transaction((batch) => {
    for (const row of batch) {
      const values = cols.map(c => (row[c] !== undefined && row[c] !== '' ? row[c] : null));
      const result = stmt.run(...values);
      const created = getDB().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid);
      inserted.push(created);
      recordAudit(table, result.lastInsertRowid, 'create', null, created, changedBy);
    }
  });
  tx(rows);
  return inserted;
}

module.exports = {
  getDB,
  // annotations
  listAnnotations, getAnnotation, createAnnotation, updateAnnotation, deleteAnnotation,
  // rules
  listRules, getRule, createRule, updateRule, deleteRule,
  // checklist
  listChecklist, getChecklistItem, updateChecklistItem,
  // audit log
  listAuditLog,
  // dashboard
  getCompletenessSummary,
  // csv
  exportRows, importRows,
  // meta
  TABLE_COLUMNS,
};
