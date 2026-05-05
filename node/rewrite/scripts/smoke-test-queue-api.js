'use strict';

// 軽量 smoke test: queue API をミニ Express に乗せて全エンドポイント検証。
// 本番 server.js の重量初期化 (Anthropic / cron 等) を避けるため、
// queue router 単体で起動して http で叩く。

const express = require('express');
const http = require('http');
const { buildRouter } = require('../api/queue');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api/rewrite', buildRouter());

const server = app.listen(0, async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api/rewrite`;
  console.log('[smoke-test] base URL:', base);

  let pass = 0;
  let fail = 0;
  const log = (label, ok, detail) => {
    const tag = ok ? '✓' : '✗';
    console.log(`  ${tag} ${label}${detail ? '  → ' + detail : ''}`);
    if (ok) pass++; else fail++;
  };

  try {
    // 1. GET candidates axis=2 (正常系)
    let r = await call('GET', `${base}/queue?axis=2&limit=3`);
    log('GET /queue?axis=2&limit=3', r.status === 200 && r.body.mode === 'candidates' && r.body.items.length > 0,
      `status=${r.status} mode=${r.body?.mode} count=${r.body?.items?.length}`);

    // 2. GET candidates axis=1 (NULL スコア placeholder)
    r = await call('GET', `${base}/queue?axis=1&limit=10`);
    log('GET /queue?axis=1 (axis1 placeholder)',
      r.status === 200 && r.body.mode === 'candidates' && r.body.items.every(i => i.score_value === null),
      `count=${r.body?.items?.length} all_null=${r.body?.items?.every(i => i.score_value === null)}`);

    // 3. GET candidates axis=axis3_freshness (フルキー指定)
    r = await call('GET', `${base}/queue?axis=axis3_freshness&limit=2`);
    log('GET /queue?axis=axis3_freshness', r.status === 200 && r.body.items.length === 2,
      `count=${r.body?.items?.length}`);

    // 4. GET 不正な axis
    r = await call('GET', `${base}/queue?axis=99`);
    log('GET /queue?axis=99 (invalid)', r.status === 400, `status=${r.status} error="${r.body?.error}"`);

    // 5. POST queue 登録 (正常系)
    const topAxis2 = (await call('GET', `${base}/queue?axis=2&limit=1`)).body.items[0];
    r = await call('POST', `${base}/queue`, {
      post_id: topAxis2.post_id,
      selected_axis: 'axis2_potential',
      selected_score: topAxis2.score_value,
      rewrite_target_score_id: topAxis2.id,
      notes: 'smoke-test entry',
    });
    log('POST /queue', r.status === 201 && r.body.id && r.body.status === 'queued',
      `id=${r.body?.id} status=${r.body?.status}`);
    const createdId = r.body.id;

    // 6. POST 不正 (post_id 欠落)
    r = await call('POST', `${base}/queue`, { selected_axis: 'axis2_potential' });
    log('POST /queue (no post_id)', r.status === 400, `status=${r.status} error="${r.body?.error}"`);

    // 7. POST 不正 (selected_axis が異常値)
    r = await call('POST', `${base}/queue`, { post_id: 99999, selected_axis: 'axis_foo' });
    log('POST /queue (invalid selected_axis)', r.status === 400, `error="${r.body?.error}"`);

    // 8. POST axis 数値指定 (1〜4 の文字列でも受理)
    r = await call('POST', `${base}/queue`, { post_id: 99998, selected_axis: '3' });
    log('POST /queue (selected_axis="3")', r.status === 201 && r.body.selected_axis === 'axis3_freshness',
      `selected_axis=${r.body?.selected_axis}`);

    // 9. GET registered (status 指定)
    r = await call('GET', `${base}/queue?status=queued`);
    log('GET /queue?status=queued', r.status === 200 && r.body.mode === 'registered' && r.body.count >= 2,
      `count=${r.body?.count}`);

    // 10. GET registered (status 不正)
    r = await call('GET', `${base}/queue?status=foo`);
    log('GET /queue?status=foo (invalid)', r.status === 400, `error="${r.body?.error}"`);

    // 11. GET 全件 (params なし)
    r = await call('GET', `${base}/queue`);
    log('GET /queue (no params)', r.status === 200 && r.body.mode === 'registered',
      `count=${r.body?.count}`);

    // 12. PATCH 正常 (status 更新)
    r = await call('PATCH', `${base}/queue/${createdId}`, { status: 'in_progress', notes: 'updated by smoke' });
    log('PATCH /queue/:id', r.status === 200 && r.body.status === 'in_progress' && r.body.notes === 'updated by smoke',
      `status=${r.body?.status}`);

    // 13. PATCH 不正 (存在しない id)
    r = await call('PATCH', `${base}/queue/9999999`, { status: 'completed' });
    log('PATCH /queue/9999999 (not found)', r.status === 404, `status=${r.status}`);

    // 14. PATCH 不正な status
    r = await call('PATCH', `${base}/queue/${createdId}`, { status: 'frozen' });
    log('PATCH /queue/:id (invalid status)', r.status === 400, `error="${r.body?.error}"`);

    // 15. ライフサイクル: queued → completed
    r = await call('PATCH', `${base}/queue/${createdId}`, { status: 'completed' });
    log('PATCH /queue/:id (→ completed)', r.status === 200 && r.body.status === 'completed',
      `status=${r.body?.status}`);

  } catch (e) {
    console.error('  [unexpected]', e);
    fail++;
  }

  console.log(`\n[smoke-test] pass=${pass} fail=${fail}`);
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
