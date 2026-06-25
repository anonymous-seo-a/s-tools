#!/usr/bin/env node
'use strict';
/**
 * 改行リズム比較: OLD(1文1ブロック+空ブロック) vs NEW(最大2文/段落・空ブロックなし) を実テーマで描画。
 * Usage: node rewrite/scripts/preview-rhythm-compare.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env'), quiet: true });
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { htmlToBlocks } = require('../apply/gutenberg-apply');

function wpRoot() { const r = (process.env.WP_API_BASE_URL || '').replace(/\/$/, ''); return /\/wp-json\/wp\/v\d+/.test(r) ? r : `${r}/wp-json/wp/v2`; }
const AUTH = 'Basic ' + Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
async function wpGet(p) { const r = await fetch(`${wpRoot()}${p}`, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(`WP ${r.status}`); return r.json(); }

// LLM が出しがちな本文 (4185 の楽天/SBI 風・複数文混在)
const SAMPLE = `<p>国内株式の取引手数料を無料とする「ゼロコース」がスタートしました。SBI証券も同様に手数料を無料化しているため、手数料の面では同率1位です。</p>
<p>楽天証券の大きな魅力は、楽天ポイントとの連携です。投資信託の保有残高に応じてポイントが貯まり、貯まったポイントで投資信託を購入することも可能です。</p>
<p>ミニ株サービス「かぶミニ®」も買・売ともに手数料無料化されており、少額投資にも最適な環境が整っています。</p>`;

// OLD 再現: 1文=1ブロック + 段落間に空ブロック
function oldRender(html) {
  const sentences = html.replace(/<\/?p>/g, '').split('\n').flatMap((line) => line.split(/(?<=[。！？])/)).map((s) => s.trim()).filter(Boolean);
  return sentences.map((s) => `<!-- wp:paragraph --><p>${s}</p><!-- /wp:paragraph -->`).join('<!-- wp:paragraph --><p>&nbsp;</p><!-- /wp:paragraph -->');
}
const blockToHtml = (mk) => mk.replace(/<!--[^>]*-->/g, '');

(async () => {
  const wp = await wpGet('/posts/4185?context=edit&_fields=link');
  const outDir = path.resolve(__dirname, '..', '..', '..', 'design', 'preview');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 680, height: 1200 }, deviceScaleFactor: 2 });
  await page.goto(wp.link, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => document.querySelectorAll('.ad,.adsbygoogle,iframe').forEach((e) => e.remove()));

  for (const [tag, markup] of [['OLD_1文+空ブロック', oldRender(SAMPLE)], ['NEW_最大2文', htmlToBlocks(SAMPLE)]]) {
    await page.evaluate((html) => {
      const c = document.querySelector('.editor-content'); if (!c) return;
      c.innerHTML = '<div id="__rhythm" style="background:#fff;padding:16px;">' + html + '</div>';
    }, blockToHtml(markup));
    await page.waitForTimeout(500);
    const file = path.join(outDir, `rhythm_${tag.startsWith('OLD') ? 'old' : 'new'}.png`);
    await page.locator('#__rhythm').screenshot({ path: file });
    console.log(`${tag} → ${path.basename(file)}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
