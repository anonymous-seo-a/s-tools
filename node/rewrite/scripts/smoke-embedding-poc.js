#!/usr/bin/env node
'use strict';
/**
 * 段階A PoC: embedding 型ギャップ判定の検証 smoke runner (1 記事 × 1 Q[i] スコープ)。
 *
 * 既存資産非破壊:
 *   - master_passage_embedding / master_query_coverage_baseline / master_passage_gap のみ書込み
 *   - master_fact_set / master_information_gain_score は READ-ONLY
 *
 * 通し動作:
 *   1. 既存 master_information_gain_score 行を取得 (post_id, query_fanout_id 起点)
 *   2. self 記事 WP REST 取得 → sections[] → splitToPassages
 *   3. master_competitor_corpus から rank 1〜3 の URL 取得 → HTML fetch → splitToPassages
 *   4. Voyage で self / competitor passages + Q[i] + 各 fact_sample を一括 embed
 *   5. baseline 計算 (competitor_max_cosine for Q[i]) → master_query_coverage_baseline 投入
 *   6. self_max_cosine 計算 → gap_flag → master_passage_gap (judge_type='embedding') 投入
 *   7. fact-set 側 gap_fact_samples (notes JSON) を mirror → master_passage_gap (judge_type='factset') 投入
 *   8. fact 単位の embedding 再判定 (各 fact_sample に対し self_max_cosine 計算 → divergent 抽出)
 *   9. report 出力 (主表 + fact-level divergent 別掲)
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-embedding-poc.js --ig-id 1 [--delta 0.05]
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
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WP REST ${res.status} for post ${postId}: ${body.slice(0, 200)}`);
  }
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
  const igIdArg = getArg('ig-id');
  const postIdArg = getArg('post-id');
  const qfIdArg = getArg('query-fanout-id');
  const deltaArg = getArg('delta');
  // Mode A: --ig-id (既存、ig_score notes 由来 fact_samples)
  // Mode B: --post-id + --query-fanout-id (新規、competitor union 由来 fact_samples + in-memory self_facts)
  if (!igIdArg && !(postIdArg && qfIdArg)) {
    console.error('Usage:');
    console.error('  Mode A: smoke-embedding-poc.js --ig-id <ID> [--delta 0.05]');
    console.error('  Mode B: smoke-embedding-poc.js --post-id <P> --query-fanout-id <Q> [--delta 0.05]');
    process.exit(1);
  }
  const mode = igIdArg ? 'A' : 'B';
  const delta = deltaArg ? parseFloat(deltaArg) : 0.05;
  const calibratedArg = process.argv.includes('--calibrated');
  // クエリ長別 δ 較正 (短語クエリの偽陽性回避)
  function deltaForQuery(text) {
    if (!calibratedArg) return delta;
    const len = (text || '').length;
    if (len <= 5) return -0.05;
    if (len <= 15) return 0.0;
    return 0.05;
  }

  const db = require('../db');
  const { applyMigration } = require('../embedding-poc/migration');
  const { extractSelfArticle, extractCompetitorContent, splitToPassages } = require('../../shared/wp-structured');
  const { embed, DEFAULT_MODEL } = require('../../shared/voyage-adapter');
  const { cosineDense, maxCosineOverPassages, float32ToBlob } = require('../embedding-poc/coverage');
  const { renderMainTable, renderFactDivergence, renderDivergentOnly } = require('../embedding-poc/report');

  const conn = db.open();
  applyMigration(conn);

  const pocRunId = `poc-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  console.log(`poc_run_id=${pocRunId}  mode=${mode}  delta=${delta}  model=${DEFAULT_MODEL}\n`);

  // === 1. fact-set context (mode 別) ===
  let targetPostId, fanout, factSamples, factsetGapPredicate, originCounts;
  // factsetGapPredicate(fact_text, layer) → 1 (gap) / 0 (no-gap)

  if (mode === 'A') {
    const igId = parseInt(igIdArg, 10);
    const ig = conn
      .prepare('SELECT id, post_id, target_query, layer1_gap_count, layer2_gap_count, layer3_gain_score, notes FROM master_information_gain_score WHERE id=?')
      .get(igId);
    if (!ig) throw new Error(`master_information_gain_score id=${igId} not found`);
    targetPostId = ig.post_id;
    fanout = conn
      .prepare('SELECT id, seed_query, sub_query FROM master_query_fanout WHERE sub_query=? LIMIT 1')
      .get(ig.target_query);
    if (!fanout) throw new Error(`master_query_fanout for "${ig.target_query}" not found`);
    const igNotes = JSON.parse(ig.notes || '{}');
    factSamples = [];
    for (const layer of [1, 2, 3]) {
      const arr = igNotes?.gap_fact_samples?.[`layer${layer}`];
      if (Array.isArray(arr)) {
        for (const text of arr) {
          if (text && typeof text === 'string') factSamples.push({ layer, text });
        }
      }
    }
    factsetGapPredicate = () => 1; // 全件 fact-set gap (notes は gap_fact_samples)
    originCounts = { layer1_gap: ig.layer1_gap_count, layer2_gap: ig.layer2_gap_count, layer3_gain: ig.layer3_gain_score };
    console.log(`=== 1. fact-set context (Mode A, ig_id=${igId}) ===`);
    console.log(`  post_id=${targetPostId}  query_fanout_id=${fanout.id}  Q[i]="${ig.target_query}"`);
    console.log(`  factset gap_counts: layer1=${originCounts.layer1_gap} layer2=${originCounts.layer2_gap} layer3_gain=${originCounts.layer3_gain}`);
    console.log(`  fact_samples (all factset gap): ${factSamples.length}`);
  } else {
    targetPostId = parseInt(postIdArg, 10);
    fanout = conn.prepare('SELECT id, seed_query, sub_query FROM master_query_fanout WHERE id=?').get(parseInt(qfIdArg, 10));
    if (!fanout) throw new Error(`master_query_fanout id=${qfIdArg} not found`);

    // self_facts 抽出 (in-memory only, NO DB write)
    console.log(`=== 1. fact-set context (Mode B, post=${targetPostId} query_fanout=${fanout.id}) ===`);
    console.log(`  Q[i]="${fanout.sub_query}"`);
    console.log(`  extracting self_facts in-memory (no DB write)...`);
    const { extractSelfFacts } = require('../fact-set/extract');
    const selfFactRes = await extractSelfFacts(targetPostId);
    const norm = (s) => String(s).trim().toLowerCase();
    const selfSets = {
      1: new Set(selfFactRes.facts.layer1.map(norm)),
      2: new Set(selfFactRes.facts.layer2.map(norm)),
      3: new Set(selfFactRes.facts.layer3.map(norm)),
    };
    console.log(`  self_facts: layer1=${selfSets[1].size} layer2=${selfSets[2].size} layer3=${selfSets[3].size}`);

    // competitor union (existing snapshots, read-only)
    const compRows = conn
      .prepare('SELECT id, competitor_url, fact_set_snapshot FROM master_competitor_corpus WHERE query_fanout_id=?')
      .all(fanout.id);
    const compUnion = { 1: new Map(), 2: new Map(), 3: new Map() }; // normalized → original
    for (const c of compRows) {
      let snap;
      try { snap = JSON.parse(c.fact_set_snapshot); } catch { continue; }
      for (const layer of [1, 2, 3]) {
        const arr = Array.isArray(snap[`layer${layer}`]) ? snap[`layer${layer}`] : [];
        for (const f of arr) {
          if (typeof f === 'string') compUnion[layer].set(norm(f), f);
        }
      }
    }
    console.log(`  competitor_union: layer1=${compUnion[1].size} layer2=${compUnion[2].size} layer3=${compUnion[3].size}`);

    factSamples = [];
    for (const layer of [1, 2, 3]) {
      for (const [n, original] of compUnion[layer]) {
        factSamples.push({ layer, text: original, normalized: n });
      }
    }
    factsetGapPredicate = (factText, layer) => (selfSets[layer].has(norm(factText)) ? 0 : 1);

    const gap1 = factSamples.filter((f) => f.layer === 1 && factsetGapPredicate(f.text, 1)).length;
    const gap2 = factSamples.filter((f) => f.layer === 2 && factsetGapPredicate(f.text, 2)).length;
    const gap3 = factSamples.filter((f) => f.layer === 3 && factsetGapPredicate(f.text, 3)).length;
    originCounts = { layer1_gap: gap1, layer2_gap: gap2, layer3_gap: gap3 };
    console.log(`  factset gap_counts (derived): layer1=${gap1} layer2=${gap2} layer3=${gap3}`);
    console.log(`  fact_samples (all competitor union): ${factSamples.length}`);
  }
  const ig = mode === 'A' ? { post_id: targetPostId, target_query: fanout.sub_query, layer1_gap_count: originCounts.layer1_gap, layer2_gap_count: originCounts.layer2_gap, layer3_gain_score: originCounts.layer3_gain } : { post_id: targetPostId, target_query: fanout.sub_query, layer1_gap_count: originCounts.layer1_gap, layer2_gap_count: originCounts.layer2_gap, layer3_gain_score: 0 };
  const igId = mode === 'A' ? parseInt(igIdArg, 10) : null;

  // === 2. self passages ===
  console.log(`\n=== 2. self article passage split ===`);
  const wp = await fetchWpContent(ig.post_id);
  const selfStruct = extractSelfArticle(wp.content_html);
  const selfPassages = splitToPassages({ sections: selfStruct.sections });
  console.log(`  sections=${selfStruct.sections.length} → passages=${selfPassages.length} (avg ${(selfPassages.reduce((s, p) => s + p.char_count, 0) / selfPassages.length).toFixed(0)} chars)`);

  // === 3. competitor passages ===
  console.log(`\n=== 3. competitor passage split ===`);
  const comps = conn
    .prepare(`SELECT id, competitor_url, rank_position FROM master_competitor_corpus WHERE query_fanout_id=? ORDER BY rank_position`)
    .all(fanout.id);
  const compPassages = [];
  for (const c of comps) {
    try {
      const html = await fetchCompetitorHtml(c.competitor_url);
      const ext = extractCompetitorContent(html);
      const ps = splitToPassages({ plain_text: ext.plain_text });
      for (const p of ps) compPassages.push({ ...p, competitor_url: c.competitor_url, rank: c.rank_position });
      console.log(`  rank ${c.rank_position} ${c.competitor_url} → passages=${ps.length}`);
    } catch (e) {
      console.warn(`  [warn] rank ${c.rank_position} ${c.competitor_url} fetch failed: ${e.message}`);
    }
  }

  // === 4. embed ===
  console.log(`\n=== 4. Voyage embed ===`);
  const tEmb = Date.now();
  const allDocTexts = [...selfPassages.map((p) => p.text), ...compPassages.map((p) => p.text)];
  const docRes = await embed(allDocTexts, { inputType: 'document' });
  const selfEmbeds = docRes.embeddings.slice(0, selfPassages.length).map((e) => Float32Array.from(e));
  const compEmbeds = docRes.embeddings.slice(selfPassages.length).map((e) => Float32Array.from(e));

  const queryTexts = [ig.target_query, ...factSamples.map((f) => f.text)];
  const qRes = await embed(queryTexts, { inputType: 'query' });
  const qEmbeds = qRes.embeddings.map((e) => Float32Array.from(e));
  const queryEmbed = qEmbeds[0];
  const factEmbeds = qEmbeds.slice(1);

  console.log(`  documents: ${allDocTexts.length} (self=${selfPassages.length} comp=${compPassages.length})`);
  console.log(`  queries:   ${queryTexts.length} (Q[i]=1 + facts=${factSamples.length})`);
  console.log(`  tokens=${docRes.usage.total_tokens + qRes.usage.total_tokens}  batches=${docRes.batches + qRes.batches}  elapsed=${((Date.now() - tEmb) / 1000).toFixed(1)}s`);

  // === 5. passage embeddings 投入 ===
  const insertPassage = conn.prepare(
    `INSERT INTO master_passage_embedding
       (post_id, competitor_url, source_type, passage_idx, text, char_count, embedding, dim, model, poc_run_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const tx5 = conn.transaction(() => {
    for (let i = 0; i < selfPassages.length; i++) {
      insertPassage.run(ig.post_id, null, 'self', i, selfPassages[i].text, selfPassages[i].char_count, float32ToBlob(selfEmbeds[i]), selfEmbeds[i].length, docRes.model, pocRunId);
    }
    for (let i = 0; i < compPassages.length; i++) {
      insertPassage.run(null, compPassages[i].competitor_url, 'competitor', i, compPassages[i].text, compPassages[i].char_count, float32ToBlob(compEmbeds[i]), compEmbeds[i].length, docRes.model, pocRunId);
    }
  });
  tx5();
  console.log(`\n=== 5. passages persisted ===`);
  console.log(`  self=${selfPassages.length}  competitor=${compPassages.length}  total=${selfPassages.length + compPassages.length}`);

  // === 6. baseline (Q[i] vs competitor) + self_max (Q[i] vs self) ===
  const compMaxQ = maxCosineOverPassages(compEmbeds, queryEmbed);
  const selfMaxQ = maxCosineOverPassages(selfEmbeds, queryEmbed);
  const embeddingGapQ = selfMaxQ.max < (compMaxQ.max + delta) ? 1 : 0;

  conn
    .prepare(
      `INSERT INTO master_query_coverage_baseline
         (query_fanout_id, competitor_max_cosine, competitor_url_winner, competitor_passage_idx, delta, model, poc_run_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fanout.id,
      compMaxQ.max,
      compMaxQ.argmaxIdx >= 0 ? compPassages[compMaxQ.argmaxIdx].competitor_url : null,
      compMaxQ.argmaxIdx,
      delta,
      docRes.model,
      pocRunId,
      JSON.stringify({ ig_id: igId, target_query: ig.target_query })
    );
  console.log(`\n=== 6. baseline computed ===`);
  console.log(`  Q[i] vs competitor: max=${compMaxQ.max.toFixed(4)} (winner=rank${compPassages[compMaxQ.argmaxIdx]?.rank})`);
  console.log(`  Q[i] vs self:       max=${selfMaxQ.max.toFixed(4)}`);
  console.log(`  threshold = competitor_max + δ = ${(compMaxQ.max + delta).toFixed(4)}`);
  console.log(`  embedding gap_flag = ${embeddingGapQ} (${embeddingGapQ ? 'gap' : 'no-gap'})`);

  // === 7. gap 投入 (Q[i] embedding 判定 + factset mirror) ===
  const insertGap = conn.prepare(
    `INSERT INTO master_passage_gap
       (post_id, query_fanout_id, target_text, target_kind, fact_layer,
        self_max_cosine, competitor_max_cosine, delta, gap_flag, judge_type, model, poc_run_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const factsetGapQ = (ig.layer1_gap_count + ig.layer2_gap_count) > 0 ? 1 : 0;
  const tx7 = conn.transaction(() => {
    insertGap.run(ig.post_id, fanout.id, ig.target_query, 'query', null, selfMaxQ.max, compMaxQ.max, delta, embeddingGapQ, 'embedding', docRes.model, pocRunId, null);
    insertGap.run(ig.post_id, fanout.id, ig.target_query, 'query', null, null, null, null, factsetGapQ, 'factset', null, pocRunId, JSON.stringify({ ig_id: igId, layer1_gap_count: ig.layer1_gap_count, layer2_gap_count: ig.layer2_gap_count }));
  });
  tx7();

  // === 8. fact-level 再判定 (各 fact_sample に対し self_max_cosine 計算) ===
  console.log(`\n=== 7. fact-level re-judgement (embedding) ===`);
  if (calibratedArg) console.log('  δ calibration: ON (短語=-0.05 / 短句=0.0 / 長文=0.05)');
  const factRows = [];
  const tx8 = conn.transaction(() => {
    for (let i = 0; i < factSamples.length; i++) {
      const fs = factSamples[i];
      const selfMaxF = maxCosineOverPassages(selfEmbeds, factEmbeds[i]);
      const compMaxF = maxCosineOverPassages(compEmbeds, factEmbeds[i]);
      const deltaF = deltaForQuery(fs.text);
      const embGap = selfMaxF.max < (compMaxF.max + deltaF) ? 1 : 0;
      const fsGap = factsetGapPredicate(fs.text, fs.layer);
      insertGap.run(ig.post_id, fanout.id, fs.text, 'fact', fs.layer, selfMaxF.max, compMaxF.max, deltaF, embGap, 'embedding', docRes.model, pocRunId, null);
      insertGap.run(ig.post_id, fanout.id, fs.text, 'fact', fs.layer, null, null, null, fsGap, 'factset', null, pocRunId, null);
      factRows.push({
        fact_layer: fs.layer,
        target_text: fs.text,
        self_max_cosine: selfMaxF.max,
        competitor_max_cosine: compMaxF.max,
        embedding_gap: embGap,
        factset_gap: fsGap,
        delta: deltaF,
      });
    }
  });
  tx8();
  console.log(`  inserted ${factSamples.length * 2} rows (factset + embedding 各 ${factSamples.length})`);

  // === 9. レポート ===
  console.log(`\n========================================`);
  console.log(`== 主表 (Q[i] 単位 2 系統判定)`);
  console.log(`========================================`);
  console.log(
    renderMainTable([
      {
        query_text: ig.target_query,
        factset_gap: factsetGapQ,
        embedding_gap: embeddingGapQ,
        self_max_cosine: selfMaxQ.max,
        competitor_max_cosine: compMaxQ.max,
        delta,
      },
    ])
  );

  console.log(`\n========================================`);
  console.log(`== 別掲: fact-level (★ = fact-set gap ∩ embedding no-gap)`);
  console.log(`========================================`);
  console.log(renderFactDivergence(factRows));

  console.log(`\n========================================`);
  console.log(`== divergent rows only (focused diagnostic)`);
  console.log(`========================================`);
  console.log(renderDivergentOnly(factRows));

  console.log(`\nPoC smoke OK  poc_run_id=${pocRunId}`);
})().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
