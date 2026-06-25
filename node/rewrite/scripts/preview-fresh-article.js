#!/usr/bin/env node
'use strict';
/**
 * 未リライト記事をフル生成して Before/After を実WPテーマ上でレンダリングする (一回性プレビュー)。
 * 本番記事は変更しない (実ページを開いて .editor-content をクライアント側で差し替えるだけ)。
 *
 * Usage: node rewrite/scripts/preview-fresh-article.js --post 4722 --genre securities
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env'), quiet: true });
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const db = require('../db');
const { open } = db;
const { collectCompetitorCorpus } = require('../competitor-corpus/collect');
const { extractForQueryFanout } = require('../fact-set/extract');
const { calcIgScore } = require('../fact-set/ig-score');
const { runAnalysis } = require('../llm-execution/analysis-runner');
const { runDiffGeneration } = require('../llm-execution/diff-runner');
const { getModels } = require('../../shared/llm-adapters/anthropic-adapter');
const { planGutenbergApply, applyGutenbergOps } = require('../apply/gutenberg-apply');

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; }
const POST = parseInt(arg('post', '4722'), 10);
const GENRE = arg('genre', 'securities');

function wpRoot() { const r = (process.env.WP_API_BASE_URL || '').replace(/\/$/, ''); return /\/wp-json\/wp\/v\d+/.test(r) ? r : `${r}/wp-json/wp/v2`; }
const AUTH = 'Basic ' + Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
async function wpGet(p) { const r = await fetch(`${wpRoot()}${p}`, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(`WP ${r.status} ${p}`); return r.json(); }

// prepareCandidate 相当 (monitor.db の top query → query_fanout)
async function prepare(postId, genre) {
  const mdb = require('../../monitor-db');
  const mc = require('../../monitor-collectors');
  const mconn = mdb.getDB();
  const art = mconn.prepare('SELECT url FROM articles WHERE post_id=?').get(postId);
  if (!art) throw new Error(`post ${postId} が monitor.db に無い`);
  const latest = mconn.prepare('SELECT MAX(date) d FROM daily_metrics').get().d;
  const start = mconn.prepare("SELECT date(?, '-28 day') d").get(latest).d;
  const top = await mc.fetchTopQueryForPage(art.url, { startDate: start, endDate: latest, topN: 1 });
  const targetQuery = top[0]?.query;
  if (!targetQuery) throw new Error('top query 取得不可');
  const conn = open();
  const existing = conn.prepare(`SELECT id FROM master_query_fanout WHERE sub_query=? AND generation_method='auto-pick' ORDER BY id DESC LIMIT 1`).get(targetQuery);
  if (existing) return { query_fanout_id: existing.id, target_query: targetQuery };
  const info = conn.prepare(`INSERT INTO master_query_fanout (seed_query, sub_query, layer, generation_method, priority, notes) VALUES (?,?,1,'auto-pick',1,?)`).run(targetQuery, targetQuery, `preview post ${postId}`);
  return { query_fanout_id: info.lastInsertRowid, target_query: targetQuery };
}

(async () => {
  const conn = open();
  conn.pragma('foreign_keys = ON');

  console.log(`■ post ${POST} (${GENRE}) フル生成`);
  const { query_fanout_id, target_query } = await prepare(POST, GENRE);
  console.log(`  target_query="${target_query}" fanout=${query_fanout_id}`);

  const m = getModels();
  const sid = conn.prepare(
    `INSERT INTO master_rewrite_session (post_id, model_analysis, model_generation, triggered_by, status, genre) VALUES (?,?,?,'preview-fresh','planned',?)`
  ).run(POST, m.analysis, m.generation, GENRE).lastInsertRowid;

  const fanout = conn.prepare('SELECT sub_query FROM master_query_fanout WHERE id=?').get(query_fanout_id);
  if (!conn.prepare('SELECT COUNT(*) n FROM master_competitor_corpus WHERE query_fanout_id=?').get(query_fanout_id).n) {
    console.log('  競合コーパス収集...'); await collectCompetitorCorpus(query_fanout_id, { topN: 5 });
  }
  if (!conn.prepare('SELECT COUNT(*) n FROM master_information_gain_score WHERE post_id=? AND target_query=?').get(POST, fanout.sub_query).n) {
    console.log('  fact抽出 + IG...'); await extractForQueryFanout({ post_id: POST, query_fanout_id }); calcIgScore({ post_id: POST, query_fanout_id });
  }
  console.log('  analysis (Opus)...');
  await runAnalysis({ session_id: sid, post_id: POST, query_fanout_id, genre: GENRE });
  conn.prepare(`UPDATE master_rewrite_session SET policy_judgment='approved', policy_judgment_at=CURRENT_TIMESTAMP, status='generating' WHERE id=?`).run(sid);
  console.log('  diff生成 (Opus)...');
  const r = await runDiffGeneration({ session_id: sid, genre: GENRE });
  console.log(`  diff ${r.diffs_inserted}件 (rejected ${r.diffs_rejected})`);

  const diffs = conn.prepare(
    `SELECT id, target_section, change_type, content_before, content_after, daiki_edit_content FROM master_rewrite_diff WHERE session_id=? ORDER BY diff_order`
  ).all(sid).map((d) => ({ ...d, daiki_judgment: 'approved' }));

  const wp = await wpGet(`/posts/${POST}?context=edit&_fields=content,link`);
  const rawBefore = wp.content.raw;
  const { ops } = planGutenbergApply(rawBefore, diffs);
  const { raw: rawAfter, applied, conflicts } = applyGutenbergOps(rawBefore, ops);
  console.log(`  適用 ops=${ops.length} applied=${applied} conflicts=${conflicts.length}`);

  const sectionTexts = [...new Set(diffs.filter((d) => /^h[1-4]#/.test(d.target_section || '')).map((d) => d.target_section.replace(/^h[1-4]#/, '')))];
  console.log(`  変更セクション: ${sectionTexts.length}個`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 760, height: 1200 }, userAgent: 'Mozilla/5.0 FundIt-StyleBot/1.0', deviceScaleFactor: 2 });
  await page.goto(wp.link, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => { document.querySelectorAll('.ad, .adsbygoogle, iframe').forEach((e) => e.remove()); });
  const outDir = path.resolve(__dirname, '..', '..', '..', 'design', 'preview');
  fs.mkdirSync(outDir, { recursive: true });

  const wrapSection = (txt) => page.evaluate((t) => {
    const norm = (s) => (s || '').replace(/\s+/g, '');
    const c = document.querySelector('.editor-content'); if (!c) return false;
    document.querySelectorAll('#__secwrap').forEach((w) => { while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w); w.remove(); });
    const heads = [...c.querySelectorAll('h2,h3,h4')];
    const h = heads.find((e) => norm(e.textContent).includes(norm(t))); if (!h) return false;
    const group = [h]; let n = h.nextElementSibling;
    while (n && !/^H[2-4]$/.test(n.tagName)) { group.push(n); n = n.nextElementSibling; }
    const wrap = document.createElement('div'); wrap.id = '__secwrap'; wrap.style.background = '#fff'; wrap.style.padding = '8px';
    h.parentNode.insertBefore(wrap, h); group.forEach((g) => wrap.appendChild(g)); return true;
  }, txt);

  async function shoot(tag) {
    for (let i = 0; i < sectionTexts.length; i++) {
      if (!(await wrapSection(sectionTexts[i]))) { console.log(`    [${tag}] "${sectionTexts[i].slice(0, 16)}" 未検出`); continue; }
      const f = path.join(outDir, `${POST}_sec${i + 1}_${tag}.png`);
      await page.locator('#__secwrap').screenshot({ path: f });
      console.log(`    [${tag}] sec${i + 1} → ${path.basename(f)}`);
    }
  }
  console.log('  BEFORE:'); await shoot('before');
  await page.evaluate(({ html }) => { const el = document.querySelector('.editor-content'); if (el) el.innerHTML = html; }, { html: rawAfter });
  await page.waitForTimeout(800);
  console.log('  AFTER:'); await shoot('after');
  await browser.close();

  conn.prepare('DELETE FROM master_rewrite_diff WHERE session_id=?').run(sid);
  conn.prepare('DELETE FROM master_rewrite_session WHERE id=?').run(sid);
  console.log(`  cleanup session ${sid} 削除 (本番WP記事${POST}は未変更)`);
})().catch((e) => { console.error(e); process.exit(1); });
