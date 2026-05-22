#!/usr/bin/env node
'use strict';
/**
 * wp-class-injector smoke: 既存 session の content_after に WP raw class を補完。
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-wp-class-injector.js --session-id 26 [--diff-order 2]
 *
 * 検証:
 *   - WP raw fetch 成功
 *   - buildClassMap で 1 件以上の canonical class 抽出
 *   - injectClasses で 1 件以上 class 注入
 *   - 出力 HTML が cheerio パース可能
 *   - 出力 HTML に元 content にない class 属性が含まれる
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

const cheerio = require('cheerio');
const { buildClassMap, injectClasses } = require('../apply/wp-class-injector');
const db = require('../db');

function getArg(name) {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}

async function fetchWpContent(postId) {
  const raw = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  const apiRoot = /\/wp-json\/wp\/v\d+/.test(raw) ? raw : `${raw}/wp-json/wp/v2`;
  const auth = Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
  const url = `${apiRoot}/posts/${postId}?_fields=id,title,content,link`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WP REST ${res.status} for post ${postId}`);
  const p = await res.json();
  return p.content?.rendered || '';
}

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}

(async () => {
  const sessionId = parseInt(getArg('session-id'), 10);
  const diffOrder = parseInt(getArg('diff-order') || '2', 10);
  if (!Number.isFinite(sessionId)) {
    console.error('Usage: smoke-wp-class-injector.js --session-id <id> [--diff-order N]');
    process.exit(1);
  }

  const conn = db.open();
  const session = conn.prepare(`SELECT post_id FROM master_rewrite_session WHERE id=?`).get(sessionId);
  if (!session) throw new Error(`session ${sessionId} not found`);
  const diff = conn.prepare(
    `SELECT target_section, content_after FROM master_rewrite_diff WHERE session_id=? AND diff_order=?`
  ).get(sessionId, diffOrder);
  if (!diff) throw new Error(`diff session=${sessionId} order=${diffOrder} not found`);
  if (!diff.content_after) throw new Error('content_after empty');

  console.log(`session=${sessionId} post_id=${session.post_id} diff_order=${diffOrder} target=${diff.target_section}`);

  console.log('\n[1] WP raw fetch');
  const wpHtml = await fetchWpContent(session.post_id);
  assert(wpHtml.length > 0, `WP raw fetched (${wpHtml.length} chars)`);

  console.log('\n[2] buildClassMap');
  const classMap = buildClassMap(wpHtml);
  assert(classMap.size > 0, `class map built (${classMap.size} tags with class/style)`);
  for (const [tag, arr] of classMap.entries()) {
    const top = arr[0];
    console.log(`    ${tag}: ${arr.length} variant(s), top="${top.cls}" style="${top.style || ''}" (n=${top.count})`);
  }

  console.log('\n[3] injectClasses');
  const before = diff.content_after;
  const beforeClassCount = (before.match(/class\s*=/g) || []).length;
  const beforeStyleCount = (before.match(/style\s*=/g) || []).length;
  const { html: after, stats } = injectClasses({ contentHtml: before, classMap });
  const afterClassCount = (after.match(/class\s*=/g) || []).length;
  const afterStyleCount = (after.match(/style\s*=/g) || []).length;
  console.log(`    before: class=${beforeClassCount} style=${beforeStyleCount}, length=${before.length}`);
  console.log(`    after : class=${afterClassCount} style=${afterStyleCount}, length=${after.length}`);
  console.log(`    stats : injected=${stats.injected} skipped=${stats.skipped} by_tag=${JSON.stringify(stats.by_tag)}`);
  assert(stats.injected > 0, `injected > 0 (got ${stats.injected})`);
  assert(afterClassCount > beforeClassCount, `class count increased (${beforeClassCount} → ${afterClassCount})`);

  console.log('\n[4] output cheerio parse');
  let parsedOk = true;
  try { cheerio.load(after, { decodeEntities: true }); } catch { parsedOk = false; }
  assert(parsedOk, 'output HTML parses');

  console.log('\n[5] sample comparison (冒頭 500 字)');
  console.log('--- before ---');
  console.log(before.slice(0, 500));
  console.log('--- after ---');
  console.log(after.slice(0, 500));

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nsmoke OK');
})().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
