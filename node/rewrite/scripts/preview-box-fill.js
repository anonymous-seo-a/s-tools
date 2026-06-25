#!/usr/bin/env node
'use strict';
/**
 * 空BOX補完の検証: 検出→LLM生成→適用→実WPテーマ上で Before/After スクショ。
 * 本番記事は変更しない (実ページの該当BOXをクライアント側で差し替えるだけ)。
 *
 * Usage: node rewrite/scripts/preview-box-fill.js --post 4722
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env'), quiet: true });
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { detectEmptyTitleBoxes } = require('../apply/empty-box-detector');
const { fillEmptyBoxes, buildBoxFillOps } = require('../llm-execution/empty-box-filler');
const { applyGutenbergOps } = require('../apply/gutenberg-apply');
const db = require('../db');

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; }
const POST = parseInt(arg('post', '4722'), 10);

function wpRoot() { const r = (process.env.WP_API_BASE_URL || '').replace(/\/$/, ''); return /\/wp-json\/wp\/v\d+/.test(r) ? r : `${r}/wp-json/wp/v2`; }
const AUTH = 'Basic ' + Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
async function wpGet(p) { const r = await fetch(`${wpRoot()}${p}`, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(`WP ${r.status}`); return r.json(); }

(async () => {
  const wp = await wpGet(`/posts/${POST}?context=edit&_fields=title,content,link`);
  const raw = wp.content.raw;
  const title = wp.title.raw || wp.title.rendered || '';
  const boxes = detectEmptyTitleBoxes(raw);
  console.log(`■ post ${POST}: 空BOX ${boxes.length}件`);
  boxes.forEach((b) => console.log(`   - 「${b.label}」(${b.format})`));
  if (!boxes.length) { console.log('対象なし'); return; }

  // 既に収集済みの fact (具体数値の出典) を渡す
  let facts = [];
  try {
    facts = db.open().prepare(
      `SELECT content, source_url FROM master_fact_set WHERE post_id=? ORDER BY layer`
    ).all(POST);
  } catch (e) { console.error('fact 取得失敗:', e.message); }
  console.log(`fact ${facts.length}件を投入`);
  const { filled } = await fillEmptyBoxes({ title, boxes, facts });
  console.log(`生成成功: ${filled.length}/${boxes.length}件`);
  filled.forEach((b) => console.log(`   ✓ 「${b.label}」→ ${b.fillHtml.slice(0, 60)}…`));
  if (!filled.length) { console.log('生成0件'); return; }

  const ops = buildBoxFillOps(filled);
  const { raw: rawAfter, applied } = applyGutenbergOps(raw, ops);
  console.log(`適用 ${applied}件`);

  const outDir = path.resolve(__dirname, '..', '..', '..', 'design', 'preview');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 680, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto(wp.link, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => document.querySelectorAll('.ad,.adsbygoogle,iframe').forEach((e) => e.remove()));

  // ラベルを含む BOX(div) を見つけて包んでスクショ
  const wrapBox = (labelText) => page.evaluate((txt) => {
    const norm = (s) => (s || '').replace(/\s+/g, '');
    document.querySelectorAll('#__boxwrap').forEach((w) => { while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w); w.remove(); });
    const c = document.querySelector('.editor-content'); if (!c) return false;
    const divs = [...c.querySelectorAll('div')];
    const box = divs.find((d) => norm(d.textContent).startsWith(norm(txt)) && norm(d.textContent).length < norm(txt).length + 400);
    const target = box || [...c.querySelectorAll('*')].find((e) => norm(e.textContent) === norm(txt));
    if (!target) return false;
    const wrap = document.createElement('div'); wrap.id = '__boxwrap'; wrap.style.background = '#fff'; wrap.style.padding = '12px';
    target.parentNode.insertBefore(wrap, target); wrap.appendChild(target);
    return true;
  }, labelText);

  async function shoot(tag) {
    for (let i = 0; i < filled.length; i++) {
      if (!(await wrapBox(filled[i].label))) { console.log(`  [${tag}] 「${filled[i].label}」未検出`); continue; }
      const f = path.join(outDir, `box_${POST}_${i + 1}_${tag}.png`);
      await page.locator('#__boxwrap').screenshot({ path: f });
      console.log(`  [${tag}] ${i + 1} 「${filled[i].label.slice(0, 14)}」→ ${path.basename(f)}`);
    }
  }
  console.log('BEFORE:'); await shoot('before');
  await page.evaluate(({ html }) => { const el = document.querySelector('.editor-content'); if (el) el.innerHTML = html; }, { html: rawAfter });
  await page.waitForTimeout(700);
  console.log('AFTER:'); await shoot('after');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
