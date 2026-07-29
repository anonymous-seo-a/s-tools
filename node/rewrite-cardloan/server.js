'use strict';

// rewrite-cardloan 専用サーバー (完全フォーク、本家 rewrite-app とは別プロセス)
//   port: 3002 (env REWRITE_CARDLOAN_PORT)
//   DB  : data/rewrite-cardloan.db (db.js 参照)
//   本家 node/server.js には一切触れない (push 自動デプロイで本家を壊さないため)。
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const path = require('path');

// masters UI (rewrite-client「マスター」タブ) をフォークDBに向ける。
// master-db.js は MASTER_DB_PATH を require 時に解決するため、require より前に設定する。
process.env.MASTER_DB_PATH = process.env.MASTER_DB_PATH
  || path.join(__dirname, '..', 'data', 'rewrite-cardloan.db');

const { initSchema, DB_PATH } = require('./db');
const mastersRoutes = require('../masters-routes');
const judgmentApi = require('./api/judgment');
const queueApi = require('./api/queue');
const measurementApi = require('./api/measurement');
const affClicksApi = require('./api/aff-clicks');
const keeperBridge = require('./keeper-bridge');

const PORT = process.env.REWRITE_CARDLOAN_PORT || 3002;

const app = express();
app.use(express.json({ limit: '8mb' }));

// UI: 当面は本家 rewrite-client のビルドを流用 (API base を :3002 に向けて利用)。
const clientDist = path.join(__dirname, '..', 'rewrite-client', 'dist');
app.use('/rewrite', express.static(clientDist));

app.use('/api/masters', mastersRoutes);
app.use('/api/rewrite/judgment', judgmentApi.buildRouter());
app.use('/api/rewrite/measurement', measurementApi.buildRouter());
app.use('/api/rewrite/aff-clicks', affClicksApi.buildRouter());
app.use('/api/rewrite', queueApi.buildRouter());

// ヘルスチェック: DB / keeper-bridge の結線状態を返す
app.get('/api/health', (req, res) => {
  let keeper = { ok: false };
  try {
    const products = keeperBridge.loadProducts();
    keeper = { ok: true, products: products.length, keeper_dir: keeperBridge.KEEPER_DIR };
  } catch (e) {
    keeper = { ok: false, error: e.message };
  }
  res.json({ app: 'rewrite-cardloan', db: DB_PATH, keeper });
});

const schema = initSchema();
console.log(`[rewrite-cardloan] schema: tables=${schema.total_tables} (added ${schema.added_tables})`);
app.listen(PORT, () => {
  console.log(`[rewrite-cardloan] listening on :${PORT} db=${DB_PATH}`);
});
