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
  const row = conn.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'master_%'").get();
  if (row.n > 0) return { initialized: false, existing_tables: row.n };

  const ddl = fs.readFileSync(SCHEMA_PATH, 'utf8');
  conn.exec(ddl);
  const after = conn.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'master_%'").get();
  return { initialized: true, created_tables: after.n };
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
