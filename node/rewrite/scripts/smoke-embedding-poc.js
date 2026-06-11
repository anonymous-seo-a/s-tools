#!/usr/bin/env node
'use strict';
/**
 * 段階B B-6: 本実装ベース smoke (B-2〜B-5 モジュール統合)
 *
 * 旧 PoC smoke (poc_run_id ベース) を全面置換。新 schema + 本実装モジュールで動作:
 *   - master_rewrite_session (案D 4.M' 多対多接続点) を一時 INSERT して session_id 取得
 *   - passage-store.getOrComputeEmbeddings (B-3 cache 経由、2 回目以降は voyage_tokens=0)
 *   - delta-calibration.judgeGapFlag (B-4 較正規則)
 *   - case-c-bundle.buildCaseCInputBundle (B-5 案C 入力 3 系統集約) を最後に preview
 *
 * 通し動作:
 *   1. 一時 session INSERT (triggered_by='smoke-test')
 *   2. WP fetch + passage 分割 (self)
 *   3. master_competitor_corpus から rank 1〜3 取得 + 競合 passage 分割
 *   4. self / competitor 各 passage を passage-store 経由で embed (cache 効く)
 *   5. Q[i] + competitor fact union を query 側 embed
 *   6. baseline (Q[i] vs competitor max cosine) を master_query_coverage_baseline に INSERT
 *   7. Q[i] / fact 毎に judgeGapFlag で embedding 判定、factset 判定と並列で master_passage_gap INSERT
 *   8. buildCaseCInputBundle を実行して 3 系統 (A/B/C) preview 表示
 *   9. report 出力 (main table / fact-level / divergent only)
 *  10. --keep-session 指定がなければ session を DELETE (CASCADE で gap / baseline 全消し)
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-embedding-poc.js \
 *     --post-id 11077 --query-fanout-id 11 [--keep-session]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

function getArg(name) {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}
const flag = (name) => process.argv.includes(`--${name}`);

async function fetchWpContent(postId) {
  const raw = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  const apiRoot = /\/wp-json\/wp\/v\d+/.test(raw) ? raw : `${raw}/wp-json/wp/v2`;
  const auth = Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
  const url = `${apiRoot}/posts/${postId}?_fields=id,title,content,link`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WP REST ${res.status} for post ${postId}`);
  const p = await res.json();
  return { post_id: p.id, title: p.title?.rendered || '', content_html: p.content?.rendered || '', url: p.link };
}

async function fetchCompetitorHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FundIt-RewriteBot/1.0)', Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.text();
}

(async () => {
  const postId = parseInt(getArg('post-id'), 10);
  const queryFanoutId = parseInt(getArg('query-fanout-id'), 10);
  const keepSession = flag('keep-session');
  if (!Number.isFinite(postId) || !Number.isFinite(queryFanoutId)) {
    console.error('Usage: smoke-embedding-poc.js --post-id <P> --query-fanout-id <Q> [--keep-session]');
    process.exit(1);
  }

  const db = require('../db');
  const { applyMigration } = require('../embedding-poc/migration');
  const { extractSelfArticle, extractCompetitorContent, splitToPassages } = require('../../shared/wp-structured');
  const { embed, DEFAULT_MODEL } = require('../../shared/voyage-adapter');
  const { getOrComputeEmbeddings } = require('../embedding-poc/passage-store');
  const { judgeGapFlag } = require('../embedding-poc/delta-calibration');
  const { maxCosineOverPassages } = require('../embedding-poc/coverage');
  const { buildCaseCInputBundle } = require('../embedding-poc/case-c-bundle');
  const { renderMainTable, renderFactDivergence, renderDivergentOnly } = require('../embedding-poc/report');
  const { extractSelfFacts } = require('../fact-set/extract');

  const conn = db.open();
  applyMigration(conn);
  conn.pragma('foreign_keys = ON');

  // === 1. 一時 session INSERT ===
  const llmModels = require('../../shared/llm-adapters/anthropic-adapter').getModels();
  const sessionInfo = conn
    .prepare(
      `INSERT INTO master_rewrite_session (post_id, model_analysis, model_generation, triggered_by, status)
       VALUES (?, ?, ?, 'smoke-test', 'planned')`
    )
    .run(postId, llmModels.analysis, llmModels.generation);
  const sessionId = sessionInfo.lastInsertRowid;
  console.log(`=== smoke session_id=${sessionId} (post=${postId} qf=${queryFanoutId} model=${DEFAULT_MODEL}) ===\n`);

  try {
    // === 2. Q[i] 解決 + self_facts 取得 ===
    const fanout = conn.prepare('SELECT id, sub_query FROM master_query_fanout WHERE id=?').get(queryFanoutId);
    if (!fanout) throw new Error(`master_query_fanout id=${queryFanoutId} not found`);
    console.log(`=== Q[i]="${fanout.sub_query}" ===\n`);

    console.log('=== 1. self_facts 抽出 (in-memory) ===');
    const selfFactRes = await extractSelfFacts(postId);
    const norm = (s) => String(s).trim().toLowerCase();
    const selfSets = {
      1: new Set(selfFactRes.facts.layer1.map(norm)),
      2: new Set(selfFactRes.facts.layer2.map(norm)),
      3: new Set(selfFactRes.facts.layer3.map(norm)),
    };
    console.log(`  self_facts: L1=${selfSets[1].size} L2=${selfSets[2].size} L3=${selfSets[3].size}\n`);

    // === 3. self passages embed (cache 経由) ===
    console.log('=== 2. self passages embed ===');
    const wp = await fetchWpContent(postId);
    const selfStruct = extractSelfArticle(wp.content_html);
    const selfPassages = splitToPassages({ sections: selfStruct.sections });
    const t1 = Date.now();
    const selfEmbedRes = await getOrComputeEmbeddings({
      source: { source_type: 'self', post_id: postId },
      plain_text: selfStruct.plain_text,
      passages: selfPassages,
    });
    console.log(`  passages=${selfPassages.length} cache=${selfEmbedRes.cache_hit ? 'HIT' : 'MISS'} ` +
                `inserted=${selfEmbedRes.inserted} reused=${selfEmbedRes.reused} ` +
                `tokens=${selfEmbedRes.voyage_tokens} elapsed=${((Date.now() - t1) / 1000).toFixed(2)}s\n`);
    const selfEmbeds = selfEmbedRes.embeddings;

    // === 4. competitor passages embed (cache 経由) ===
    console.log('=== 3. competitor passages embed ===');
    const comps = conn
      .prepare('SELECT id, competitor_url, rank_position FROM master_competitor_corpus WHERE query_fanout_id=? ORDER BY rank_position')
      .all(queryFanoutId);
    const compPassages = [];
    const compEmbedsAll = [];
    for (const c of comps) {
      const t2 = Date.now();
      let html;
      try { html = await fetchCompetitorHtml(c.competitor_url); }
      catch (e) { console.warn(`  [warn] rank ${c.rank_position} fetch failed: ${e.message}`); continue; }
      const ext = extractCompetitorContent(html);
      const ps = splitToPassages({ plain_text: ext.plain_text });
      const r = await getOrComputeEmbeddings({
        source: { source_type: 'competitor', competitor_url: c.competitor_url },
        plain_text: ext.plain_text,
        passages: ps,
      });
      for (let i = 0; i < ps.length; i++) {
        compPassages.push({ ...ps[i], competitor_url: c.competitor_url, rank: c.rank_position });
        compEmbedsAll.push(r.embeddings[i]);
      }
      console.log(`  rank ${c.rank_position} passages=${ps.length} cache=${r.cache_hit ? 'HIT' : 'MISS'} ` +
                  `tokens=${r.voyage_tokens} elapsed=${((Date.now() - t2) / 1000).toFixed(2)}s`);
    }
    console.log('');

    // === 5. Q[i] + fact 候補 embed (query side、cache なし、毎回) ===
    console.log('=== 4. query side embed (Q[i] + fact union) ===');
    const compRows = conn
      .prepare('SELECT fact_set_snapshot FROM master_competitor_corpus WHERE query_fanout_id=?')
      .all(queryFanoutId);
    const factSamples = [];
    const factSeen = new Set();
    for (const cr of compRows) {
      let snap;
      try { snap = JSON.parse(cr.fact_set_snapshot); } catch { continue; }
      for (const layer of [1, 2, 3]) {
        const arr = Array.isArray(snap[`layer${layer}`]) ? snap[`layer${layer}`] : [];
        for (const f of arr) {
          if (typeof f !== 'string') continue;
          const key = `${layer}::${norm(f)}`;
          if (factSeen.has(key)) continue;
          factSeen.add(key);
          factSamples.push({ layer, text: f });
        }
      }
    }
    const queryTexts = [fanout.sub_query, ...factSamples.map((f) => f.text)];
    const t3 = Date.now();
    const qRes = await embed(queryTexts, { inputType: 'query' });
    const qEmbeds = qRes.embeddings.map((e) => Float32Array.from(e));
    const queryEmbed = qEmbeds[0];
    const factEmbeds = qEmbeds.slice(1);
    console.log(`  queries=${queryTexts.length} (Q[i]=1 + facts=${factSamples.length}) ` +
                `tokens=${qRes.usage.total_tokens} elapsed=${((Date.now() - t3) / 1000).toFixed(2)}s\n`);

    // === 6. baseline (Q[i] vs competitor) ===
    const compMaxQ = maxCosineOverPassages(compEmbedsAll, queryEmbed);
    const selfMaxQ = maxCosineOverPassages(selfEmbeds, queryEmbed);
    const judgeQ = judgeGapFlag({ self_max: selfMaxQ.max, comp_max: compMaxQ.max, query_text: fanout.sub_query });

    conn.prepare(
      `INSERT INTO master_query_coverage_baseline
         (session_id, query_fanout_id, competitor_max_cosine, competitor_url_winner, competitor_passage_idx,
          delta, model, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId, queryFanoutId, compMaxQ.max,
      compMaxQ.argmaxIdx >= 0 ? compPassages[compMaxQ.argmaxIdx].competitor_url : null,
      compMaxQ.argmaxIdx, judgeQ.delta, qRes.model,
      JSON.stringify({ bucket: judgeQ.bucket_label })
    );

    console.log(`=== 5. baseline ===`);
    console.log(`  Q[i] vs competitor: max=${compMaxQ.max.toFixed(4)} (winner=rank${compPassages[compMaxQ.argmaxIdx]?.rank})`);
    console.log(`  Q[i] vs self:       max=${selfMaxQ.max.toFixed(4)}`);
    console.log(`  judge: bucket=${judgeQ.bucket_label} δ=${judgeQ.delta} threshold=${judgeQ.threshold.toFixed(4)} gap_flag=${judgeQ.gap_flag}\n`);

    // === 7. gap 投入 (Q[i] + fact-level、judgeGapFlag 一元化) ===
    const insertGap = conn.prepare(
      `INSERT INTO master_passage_gap
         (session_id, post_id, query_fanout_id, target_text, target_kind, fact_layer,
          self_max_cosine, competitor_max_cosine, delta, gap_flag, judge_type, model, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // Q[i] レベル: embedding + factset 並列
    const factsetGapQuery = (factSamples.some((f) => !selfSets[f.layer].has(norm(f.text)))) ? 1 : 0;
    const tx7q = conn.transaction(() => {
      insertGap.run(sessionId, postId, queryFanoutId, fanout.sub_query, 'query', null,
        selfMaxQ.max, compMaxQ.max, judgeQ.delta, judgeQ.gap_flag, 'embedding', qRes.model, null);
      insertGap.run(sessionId, postId, queryFanoutId, fanout.sub_query, 'query', null,
        null, null, null, factsetGapQuery, 'factset', null,
        JSON.stringify({ logic: 'any-uncovered-fact' }));
    });
    tx7q();

    // fact レベル: 各 sample に対し judgeGapFlag + factsetGapPredicate
    console.log(`=== 6. fact-level judgement (${factSamples.length} samples) ===`);
    const factRows = [];
    const tx8 = conn.transaction(() => {
      for (let i = 0; i < factSamples.length; i++) {
        const fs = factSamples[i];
        const selfMaxF = maxCosineOverPassages(selfEmbeds, factEmbeds[i]);
        const compMaxF = maxCosineOverPassages(compEmbedsAll, factEmbeds[i]);
        const judgeF = judgeGapFlag({ self_max: selfMaxF.max, comp_max: compMaxF.max, query_text: fs.text });
        const factsetGap = selfSets[fs.layer].has(norm(fs.text)) ? 0 : 1;

        insertGap.run(sessionId, postId, queryFanoutId, fs.text, 'fact', fs.layer,
          selfMaxF.max, compMaxF.max, judgeF.delta, judgeF.gap_flag, 'embedding', qRes.model, null);
        insertGap.run(sessionId, postId, queryFanoutId, fs.text, 'fact', fs.layer,
          null, null, null, factsetGap, 'factset', null, null);

        factRows.push({
          fact_layer: fs.layer,
          target_text: fs.text,
          self_max_cosine: selfMaxF.max,
          competitor_max_cosine: compMaxF.max,
          embedding_gap: judgeF.gap_flag,
          factset_gap: factsetGap,
          delta: judgeF.delta,
        });
      }
    });
    tx8();
    console.log(`  inserted ${factSamples.length * 2} rows (factset + embedding 各 ${factSamples.length})\n`);

    // === 8. 案C 入力 bundle preview (B-5) ===
    console.log('=== 7. 案C 入力 bundle preview (B-5) ===');
    const bundle = buildCaseCInputBundle({ session_id: sessionId, post_id: postId, query_fanout_id: queryFanoutId });
    console.log(`  A. required_additions:  ${bundle.required_additions.length} 件 (fact-set notes 由来)`);
    console.log(`  B. shallow_queries:     ${bundle.shallow_queries.length} 件`);
    console.log(`  C. shallow_facts:       ${bundle.shallow_facts.length} 件 (divergent: emb gap ∩ factset no-gap)`);
    console.log(`  meta: ${JSON.stringify(bundle.meta)}\n`);
    if (bundle.shallow_facts.length > 0) {
      console.log('  C 系統 サンプル:');
      for (const f of bundle.shallow_facts.slice(0, 5)) {
        console.log(`    L${f.layer} "${f.fact_text.slice(0, 60)}" self=${f.self_max.toFixed(3)} comp=${f.comp_max.toFixed(3)}`);
      }
      console.log('');
    }

    // === 9. report ===
    console.log('========================================');
    console.log('== 主表 (Q[i] 単位 2 系統判定)');
    console.log('========================================');
    console.log(renderMainTable([{
      query_text: fanout.sub_query,
      factset_gap: factsetGapQuery,
      embedding_gap: judgeQ.gap_flag,
      self_max_cosine: selfMaxQ.max,
      competitor_max_cosine: compMaxQ.max,
      delta: judgeQ.delta,
    }]));

    console.log('\n========================================');
    console.log('== 別掲: divergent rows');
    console.log('========================================');
    console.log(renderDivergentOnly(factRows));

  } finally {
    if (keepSession) {
      console.log(`\n--keep-session: session_id=${sessionId} 保持`);
    } else {
      conn.prepare('DELETE FROM master_rewrite_session WHERE id=?').run(sessionId);
      console.log(`\nsession_id=${sessionId} 削除 (CASCADE で gap/baseline cleanup)`);
    }
  }

  console.log('\nsmoke OK');
})().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
