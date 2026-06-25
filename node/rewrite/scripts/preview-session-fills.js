#!/usr/bin/env node
'use strict';
/**
 * セッションの fill_empty_box の「実生成内容」を実WPテーマ上で Before/After スクショ。
 * preview-box-fill.js と違い再生成せず、DB に保存済みの content_after をそのまま描画する。
 * 本番記事は変更しない (クライアント側で該当BOXを差し替えるだけ)。
 *
 * Usage: node rewrite/scripts/preview-session-fills.js --post 4185 --fills /path/s160_fills.json
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env'), quiet: true });
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; }
const POST = parseInt(arg('post', '4185'), 10);
const FILLS = JSON.parse(fs.readFileSync(arg('fills'), 'utf8'));

function wpRoot() { const r = (process.env.WP_API_BASE_URL || '').replace(/\/$/, ''); return /\/wp-json\/wp\/v\d+/.test(r) ? r : `${r}/wp-json/wp/v2`; }
const AUTH = 'Basic ' + Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
async function wpGet(p) { const r = await fetch(`${wpRoot()}${p}`, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(`WP ${r.status}`); return r.json(); }

(async () => {
  const wp = await wpGet(`/posts/${POST}?context=edit&_fields=content,link`);
  let raw = wp.content.raw;
  let applied = 0;
  for (const f of FILLS) {
    if (f.content_before && raw.includes(f.content_before)) { raw = raw.replace(f.content_before, f.content_after); applied++; }
  }
  console.log(`差し替え ${applied}/${FILLS.length} 件`);

  const outDir = path.resolve(__dirname, '..', '..', '..', 'design', 'preview');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 680, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto(wp.link, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => document.querySelectorAll('.ad,.adsbygoogle,iframe').forEach((e) => e.remove()));

  const wrapBox = (labelText) => page.evaluate((txt) => {
    const norm = (s) => (s || '').replace(/\s+/g, '');
    document.querySelectorAll('#__boxwrap').forEach((w) => { while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w); w.remove(); });
    const c = document.querySelector('.editor-content'); if (!c) return false;
    const box = [...c.querySelectorAll('div')].find((d) => norm(d.textContent).startsWith(norm(txt)) && norm(d.textContent).length < norm(txt).length + 500);
    const target = box || [...c.querySelectorAll('*')].find((e) => norm(e.textContent) === norm(txt));
    if (!target) return false;
    const wrap = document.createElement('div'); wrap.id = '__boxwrap'; wrap.style.background = '#fff'; wrap.style.padding = '12px';
    target.parentNode.insertBefore(wrap, target); wrap.appendChild(target);
    return true;
  }, labelText);

  const labels = FILLS.map((f) => f.target_section.replace(/^box:/, ''));
  async function shoot(tag) {
    for (let i = 0; i < labels.length; i++) {
      if (!(await wrapBox(labels[i]))) { console.log(`  [${tag}] 「${labels[i]}」未検出`); continue; }
      const file = path.join(outDir, `s160_${POST}_${i + 1}_${tag}.png`);
      await page.locator('#__boxwrap').screenshot({ path: file });
      console.log(`  [${tag}] 「${labels[i]}」→ ${path.basename(file)}`);
    }
  }
  console.log('BEFORE:'); await shoot('before');
  await page.evaluate(({ html }) => { const el = document.querySelector('.editor-content'); if (el) el.innerHTML = html; }, { html: raw });
  await page.waitForTimeout(700);
  console.log('AFTER:'); await shoot('after');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
