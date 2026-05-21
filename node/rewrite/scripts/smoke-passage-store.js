#!/usr/bin/env node
'use strict';
/**
 * 段階B B-3 smoke: passage-store の cache miss → cache hit を検証。
 *
 * 通し動作:
 *   1. post 7170 を WP REST 取得 → splitToPassages → passage 配列
 *   2. getOrComputeEmbeddings (1 回目) → cache miss、Voyage 呼出、INSERT 確認
 *   3. getOrComputeEmbeddings (2 回目、同入力) → cache hit、Voyage 呼出ゼロ、reuse 確認
 *   4. embedding 整合性 (1 回目 vs 2 回目で同一ベクトル)
 *   5. invalidateBySource → 削除確認 → 3 回目 cache miss 確認
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-passage-store.js --post-id 7170
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

function getArg(name) {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}

async function fetchWpContent(postId) {
  const raw = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  const username = process.env.WP_API_USERNAME;
  const appPassword = process.env.WP_API_APP_PASSWORD;
  const apiRoot = /\/wp-json\/wp\/v\d+/.test(raw) ? raw : `${raw}/wp-json/wp/v2`;
  const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const url = `${apiRoot}/posts/${postId}?_fields=id,title,content,link`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WP REST ${res.status}`);
  const p = await res.json();
  return { post_id: p.id, title: p.title?.rendered || '', content_html: p.content?.rendered || '' };
}

(async () => {
  const postIdArg = getArg('post-id') || '7170';
  const postId = parseInt(postIdArg, 10);

  const db = require('../db');
  const { applyMigration } = require('../embedding-poc/migration');
  const { extractSelfArticle, splitToPassages } = require('../../shared/wp-structured');
  const { getOrComputeEmbeddings, invalidateBySource } = require('../embedding-poc/passage-store');

  const conn = db.open();
  applyMigration(conn);

  // --- 1. WP fetch + passage split
  console.log(`=== 1. WP fetch + passage split (post_id=${postId}) ===`);
  const wp = await fetchWpContent(postId);
  const struct = extractSelfArticle(wp.content_html);
  const passages = splitToPassages({ sections: struct.sections });
  console.log(`  plain_text chars=${struct.char_count}  passages=${passages.length}`);

  const source = { source_type: 'self', post_id: postId };

  // --- 2. 1 回目 (cache miss)
  console.log('\n=== 2. 1 回目 (cache miss 期待) ===');
  const t1 = Date.now();
  const r1 = await getOrComputeEmbeddings({
    source,
    plain_text: struct.plain_text,
    passages,
  });
  console.log(`  cache_hit=${r1.cache_hit}  inserted=${r1.inserted}  reused=${r1.reused}`);
  console.log(`  source_key=${r1.source_key}  content_hash=${r1.content_hash}`);
  console.log(`  voyage_tokens=${r1.voyage_tokens}  elapsed=${((Date.now() - t1) / 1000).toFixed(2)}s`);
  if (r1.cache_hit) {
    console.error('FAIL: 1 回目で cache_hit=true (期待 false)');
    process.exit(2);
  }

  // DB 件数確認
  const dbCount1 = conn
    .prepare(`SELECT COUNT(*) AS n FROM master_passage_embedding WHERE source_key=? AND content_hash=?`)
    .get(r1.source_key, r1.content_hash).n;
  console.log(`  DB row count: ${dbCount1} (expected ${passages.length})`);

  // --- 3. 2 回目 (cache hit)
  console.log('\n=== 3. 2 回目 (cache hit 期待) ===');
  const t2 = Date.now();
  const r2 = await getOrComputeEmbeddings({
    source,
    plain_text: struct.plain_text,
    passages,
  });
  console.log(`  cache_hit=${r2.cache_hit}  inserted=${r2.inserted}  reused=${r2.reused}`);
  console.log(`  voyage_tokens=${r2.voyage_tokens}  elapsed=${((Date.now() - t2) / 1000).toFixed(2)}s`);
  if (!r2.cache_hit) {
    console.error('FAIL: 2 回目で cache_hit=false (期待 true)');
    process.exit(2);
  }
  if (r2.voyage_tokens !== 0) {
    console.error(`FAIL: 2 回目で voyage_tokens=${r2.voyage_tokens} (期待 0)`);
    process.exit(2);
  }

  // --- 4. embedding 整合性 (1 回目 vs 2 回目)
  console.log('\n=== 4. embedding 整合性 ===');
  let maxDiff = 0;
  for (let i = 0; i < passages.length; i++) {
    const a = r1.embeddings[i];
    const b = r2.embeddings[i];
    for (let j = 0; j < a.length; j++) {
      const d = Math.abs(a[j] - b[j]);
      if (d > maxDiff) maxDiff = d;
    }
  }
  console.log(`  max abs diff across ${passages.length} passages x ${r1.embeddings[0].length} dims: ${maxDiff.toExponential(3)}`);
  if (maxDiff > 1e-6) {
    console.error(`FAIL: embedding 不一致 (max diff ${maxDiff})`);
    process.exit(2);
  }

  // --- 5. invalidate + 3 回目
  console.log('\n=== 5. invalidateBySource + 3 回目 ===');
  const deleted = invalidateBySource(r1.source_key);
  console.log(`  invalidated rows: ${deleted}`);

  const r3 = await getOrComputeEmbeddings({
    source,
    plain_text: struct.plain_text,
    passages,
  });
  console.log(`  3 回目: cache_hit=${r3.cache_hit}  inserted=${r3.inserted}  voyage_tokens=${r3.voyage_tokens}`);
  if (r3.cache_hit) {
    console.error('FAIL: invalidate 後の 3 回目で cache_hit=true');
    process.exit(2);
  }

  console.log('\nsmoke OK');
})().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
