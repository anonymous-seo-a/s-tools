#!/usr/bin/env node
'use strict';
/**
 * 案B (#9) α: master_article_similarity smoke runner.
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-article-similarity.js \
 *     --post-ids 7170,7196,7235,11063,11077 [--top-k 3]
 *
 * 通し動作:
 *   1. WP REST で本文取得 + extractSelfArticle で plain_text 抽出
 *   2. computeSimilarities で bigram TF-IDF + cosine + Top-K
 *   3. insertSimilarities で master_article_similarity 一括投入
 *   4. SELECT 確認 (書き捨て、共通化禁止)
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
  if (!raw || !username || !appPassword) {
    throw new Error('WP_API_BASE_URL / WP_API_USERNAME / WP_API_APP_PASSWORD not set');
  }
  const apiRoot = /\/wp-json\/wp\/v\d+/.test(raw) ? raw : `${raw}/wp-json/wp/v2`;
  const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const url = `${apiRoot}/posts/${postId}?_fields=id,title,content,link`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WP REST ${res.status} for post ${postId}: ${body.slice(0, 200)}`);
  }
  const p = await res.json();
  return {
    post_id: p.id,
    title: p.title?.rendered || '',
    content_html: p.content?.rendered || '',
    url: p.link,
  };
}

(async () => {
  const postIdsArg = getArg('post-ids');
  const topKArg = getArg('top-k');
  if (!postIdsArg) {
    console.error('Usage: smoke-article-similarity.js --post-ids 7170,7196,... [--top-k 3]');
    process.exit(1);
  }
  const postIds = postIdsArg.split(',').map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);
  if (postIds.length < 2) {
    console.error('At least 2 post-ids required.');
    process.exit(1);
  }
  const topK = topKArg ? parseInt(topKArg, 10) : Math.max(3, Math.min(postIds.length - 1, 5));

  const { extractSelfArticle } = require('../../shared/wp-structured');
  const { computeSimilarities } = require('../article-similarity/compute');
  const { insertSimilarities } = require('../article-similarity/insert');
  const db = require('../db');

  // --- 1. WP fetch + extract
  console.log('=== 1. WP fetch + extract ===');
  const t0 = Date.now();
  const docs = [];
  for (const postId of postIds) {
    const wp = await fetchWpContent(postId);
    const struct = extractSelfArticle(wp.content_html);
    docs.push({
      post_id: wp.post_id,
      title: wp.title,
      text: struct.plain_text,
      char_count: struct.char_count,
    });
    console.log(`  post_id=${wp.post_id} chars=${struct.char_count} title=${wp.title.slice(0, 40)}`);
  }
  console.log(`  fetch elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // --- 2. compute
  console.log('\n=== 2. compute (bigram TF-IDF + cosine) ===');
  const t1 = Date.now();
  const results = computeSimilarities(docs, topK);
  console.log(`  elapsed: ${((Date.now() - t1) / 1000).toFixed(2)}s topK=${topK}`);
  for (const r of results) {
    const top = r.pairs.map((p) => `${p.target_post_id}:${p.text_similarity.toFixed(3)}`).join(' ');
    console.log(`  source=${r.source_post_id} tokens=${r.token_count} top: ${top}`);
  }

  // --- 3. insert
  console.log('\n=== 3. INSERT master_article_similarity ===');
  const ins = insertSimilarities({
    results,
    corpusSize: docs.length,
    extraNotes: { smoke: true, smoke_at: new Date().toISOString() },
  });
  console.log(`  inserted=${ins.inserted} calculated_at=${ins.calculated_at}`);

  // --- 4. SELECT 確認 (書き捨て、共通化禁止)
  const conn = db.open();
  const placeholders = postIds.map(() => '?').join(',');
  const rows = conn
    .prepare(
      `SELECT source_post_id, target_post_id, text_similarity, rank_in_source, calculation_method
       FROM master_article_similarity
       WHERE calculated_at=? AND source_post_id IN (${placeholders})
       ORDER BY source_post_id, rank_in_source`
    )
    .all(ins.calculated_at, ...postIds);
  console.log(`\n=== 4. SELECT (rows=${rows.length}) ===`);
  for (const r of rows) {
    console.log(`  ${r.source_post_id} → ${r.target_post_id} sim=${r.text_similarity.toFixed(3)} rank=${r.rank_in_source} method=${r.calculation_method}`);
  }

  // sanity: rank 連番 + 自己参照なし
  const bySource = new Map();
  for (const r of rows) {
    if (!bySource.has(r.source_post_id)) bySource.set(r.source_post_id, []);
    bySource.get(r.source_post_id).push(r);
  }
  for (const [src, arr] of bySource) {
    if (arr.some((r) => r.target_post_id === src)) {
      console.error(`SANITY FAIL: self-pair in source=${src}`);
      process.exit(2);
    }
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].rank_in_source !== i + 1) {
        console.error(`SANITY FAIL: rank non-sequential source=${src}`);
        process.exit(2);
      }
    }
  }

  console.log('\nsmoke OK');
})().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
