'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.REWRITE_DB_PATH || path.join(__dirname, '..', 'data', 'rewrite.db');
const MONITOR_DB_PATH = process.env.MONITOR_DB_PATH || path.join(__dirname, '..', 'data', 'monitor.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;

function open() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function initSchema() {
  const conn = open();
  const before = conn.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'master_%'").get();
  // schema.sql は全 CREATE TABLE / CREATE INDEX を IF NOT EXISTS で書いてあるため毎回 exec で idempotent。
  // Phase E のみ初期化された旧スナップショットでも、不足分のみ追加される。
  const ddl = fs.readFileSync(SCHEMA_PATH, 'utf8');
  conn.exec(ddl);
  // 列追加マイグレーション (CREATE IF NOT EXISTS は既存テーブルに列を足さないため、
  // 旧 DB を新コードで開いた時の不足列を idempotent に補う)。
  ensureColumn(conn, 'master_rewrite_session', 'genre', "TEXT NOT NULL DEFAULT 'cardloan'");
  const after = conn.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'master_%'").get();
  return { initialized: true, existing_tables: before.n, total_tables: after.n, added_tables: after.n - before.n };
}

function ensureColumn(conn, table, column, decl) {
  const cols = conn.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    console.warn(`[rewrite-db] migrated: added ${table}.${column}`);
  }
}

function attachMonitorReadOnly(conn) {
  conn = conn || open();
  if (!fs.existsSync(MONITOR_DB_PATH)) {
    return { attached: false, reason: 'monitor.db not found', path: MONITOR_DB_PATH };
  }
  conn.exec(`ATTACH DATABASE '${MONITOR_DB_PATH.replace(/'/g, "''")}' AS monitor`);
  return { attached: true, path: MONITOR_DB_PATH };
}

function detachMonitor(conn) {
  conn = conn || open();
  try { conn.exec('DETACH DATABASE monitor'); } catch (_) {}
}

function close() {
  if (db) { db.close(); db = null; }
}

module.exports = {
  DB_PATH,
  MONITOR_DB_PATH,
  open,
  initSchema,
  attachMonitorReadOnly,
  detachMonitor,
  close,
};
