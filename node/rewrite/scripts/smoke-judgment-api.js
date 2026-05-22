'use strict';

// 軽量 smoke test: judgment API をミニ Express に乗せて全エンドポイント検証。
// 本番 server.js の重量初期化を避けるため、judgment router 単体で起動して http で叩く。
//
// 既存 DB を破壊しないよう、PATCH 検証は対象 diff の元値を保存して最後に復元する。

const express = require('express');
const http = require('http');
const { buildRouter } = require('../api/judgment');
const { open } = require('../db');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api/rewrite/judgment', buildRouter());

const server = app.listen(0, async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api/rewrite/judgment`;
  console.log('[smoke-judgment] base URL:', base);

  let pass = 0;
  let fail = 0;
  const log = (label, ok, detail) => {
    const tag = ok ? '✓' : '✗';
    console.log(`  ${tag} ${label}${detail ? '  → ' + detail : ''}`);
    if (ok) pass++; else fail++;
  };

  let snapshotDiff = null;

  try {
    // 0. 前提: rewrite.db に session / diff が存在するか
    const conn = open();
    const counts = conn.prepare(`
      SELECT
        (SELECT COUNT(*) FROM master_rewrite_session) AS sessions,
        (SELECT COUNT(*) FROM master_rewrite_diff) AS diffs,
        (SELECT COUNT(*) FROM master_rewrite_session WHERE status='awaiting_diff_judgment') AS awaiting
    `).get();
    console.log(`  [pre] sessions=${counts.sessions} diffs=${counts.diffs} awaiting_diff_judgment=${counts.awaiting}`);
    if (counts.sessions === 0 || counts.diffs === 0) {
      console.log('  [skip] no sessions/diffs in DB; run smoke-e2e.js first');
      server.close();
      process.exit(0);
    }

    // 1. GET /sessions (default → 全件)
    let r = await call('GET', `${base}/sessions`);
    log('GET /sessions', r.status === 200 && Array.isArray(r.body.items) && r.body.items.length > 0,
      `status=${r.status} count=${r.body?.count}`);

    // 2. GET /sessions?status=awaiting_diff_judgment
    r = await call('GET', `${base}/sessions?status=awaiting_diff_judgment&limit=10`);
    const allAwaiting = r.body.items.every(i => i.status === 'awaiting_diff_judgment');
    log('GET /sessions?status=awaiting_diff_judgment',
      r.status === 200 && allAwaiting,
      `count=${r.body?.count} all_awaiting=${allAwaiting}`);

    // 3. GET /sessions?status=foo (不正)
    r = await call('GET', `${base}/sessions?status=foo`);
    log('GET /sessions?status=foo (invalid)', r.status === 400, `error="${r.body?.error}"`);

    // 4. 最新セッションを取得して詳細を引く
    const latestId = (await call('GET', `${base}/sessions?limit=1`)).body.items[0].id;
    r = await call('GET', `${base}/sessions/${latestId}`);
    log(`GET /sessions/${latestId}`,
      r.status === 200 && r.body.id === latestId && Array.isArray(r.body.diffs),
      `post_id=${r.body?.post_id} diffs=${r.body?.diffs?.length}`);
    const sessionDetail = r.body;

    // 5. GET /sessions/:id (存在しない)
    r = await call('GET', `${base}/sessions/9999999`);
    log('GET /sessions/9999999 (not found)', r.status === 404, `status=${r.status}`);

    // 6. GET /sessions/:id (不正 id)
    r = await call('GET', `${base}/sessions/abc`);
    log('GET /sessions/abc (invalid)', r.status === 400, `status=${r.status}`);

    if (!sessionDetail.diffs || sessionDetail.diffs.length === 0) {
      console.log('  [skip-patch] selected session has no diffs');
    } else {
      // PATCH 検証用: 最初の diff の元値を退避
      const target = sessionDetail.diffs[0];
      snapshotDiff = {
        id: target.id,
        daiki_judgment: target.daiki_judgment,
        daiki_edit_content: target.daiki_edit_content,
        daiki_reject_reason: target.daiki_reject_reason,
        daiki_reject_note: target.daiki_reject_note,
        judged_at: target.judged_at,
      };

      // 7. PATCH diff approved
      r = await call('PATCH', `${base}/diffs/${target.id}`, { judgment: 'approved' });
      log('PATCH /diffs/:id (approved)',
        r.status === 200 && r.body.daiki_judgment === 'approved' && r.body.judged_at,
        `judgment=${r.body?.daiki_judgment} judged_at=${r.body?.judged_at}`);

      // 8. PATCH diff rejected (reason/note 付き)
      r = await call('PATCH', `${base}/diffs/${target.id}`, {
        judgment: 'rejected',
        reject_reason: 'smoke_test_reason',
        reject_note: 'smoke test only',
      });
      log('PATCH /diffs/:id (rejected w/ reason)',
        r.status === 200
          && r.body.daiki_judgment === 'rejected'
          && r.body.daiki_reject_reason === 'smoke_test_reason'
          && r.body.daiki_reject_note === 'smoke test only',
        `reason=${r.body?.daiki_reject_reason}`);

      // 9. PATCH pending に戻す (reject_reason/note が NULL に戻る)
      r = await call('PATCH', `${base}/diffs/${target.id}`, { judgment: 'pending' });
      log('PATCH /diffs/:id (pending → reject_* cleared)',
        r.status === 200
          && r.body.daiki_judgment === 'pending'
          && r.body.daiki_reject_reason === null
          && r.body.daiki_reject_note === null,
        `judgment=${r.body?.daiki_judgment}`);

      // 10. PATCH 不正な judgment
      r = await call('PATCH', `${base}/diffs/${target.id}`, { judgment: 'maybe' });
      log('PATCH /diffs/:id (invalid judgment)', r.status === 400, `error="${r.body?.error}"`);

      // 11. PATCH 存在しない id
      r = await call('PATCH', `${base}/diffs/9999999`, { judgment: 'approved' });
      log('PATCH /diffs/9999999 (not found)', r.status === 404, `status=${r.status}`);
    }
  } catch (e) {
    console.error('  [unexpected]', e);
    fail++;
  } finally {
    // 復元
    if (snapshotDiff) {
      const conn = open();
      conn.prepare(`
        UPDATE master_rewrite_diff
        SET daiki_judgment = ?, daiki_edit_content = ?, daiki_reject_reason = ?, daiki_reject_note = ?, judged_at = ?
        WHERE id = ?
      `).run(
        snapshotDiff.daiki_judgment,
        snapshotDiff.daiki_edit_content,
        snapshotDiff.daiki_reject_reason,
        snapshotDiff.daiki_reject_note,
        snapshotDiff.judged_at,
        snapshotDiff.id,
      );
      console.log(`  [restore] diff id=${snapshotDiff.id} → judgment=${snapshotDiff.daiki_judgment}`);
    }
  }

  console.log(`\n[smoke-judgment] pass=${pass} fail=${fail}`);
  server.close();
  process.exit(fail === 0 ? 0 : 1);
});

function call(method, url, body) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = chunks ? JSON.parse(chunks) : null; } catch (_) { parsed = chunks; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
