'use strict';
/**
 * Playwright 実機DOM 確定測定: soico no1 ハウススタイル定量値。
 * cheerio(content.rendered)推定の N 過大評価を、ユーザーが実際に見るレンダリング結果で補正する。
 *
 * 視覚要素判定 = 地の基準(computed style):
 *   - tag が table/figure/blockquote/ul/ol、または子に table/img/ul/ol/figure/iframe を含む
 *   - または computed style が「箱」: 背景色が透明/白以外、または border 幅 > 0
 *   - または class が box-* / soico-cta-* / swell 系
 * これにより「インラインstyleの装飾divボックス」も視覚要素として正しく数える。
 */
require('dotenv').config({ quiet: true });
const { chromium } = require('playwright');

const IDS = {
  securities: [30007, 6022, 5966, 5957, 5921, 5891, 5780, 11594],
  cardloan: [31585, 31575, 31567, 31554, 31545, 31537, 31534, 31530],
  crypto: [23376, 22241, 22235, 21966, 21965, 21960, 21957, 21949],
};

function wpRoot() { const r = (process.env.WP_API_BASE_URL || '').replace(/\/$/, ''); return /\/wp-json\/wp\/v\d+/.test(r) ? r : `${r}/wp-json/wp/v2`; }
const AUTH = 'Basic ' + Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
async function link(id) { const j = await fetch(`${wpRoot()}/posts/${id}?_fields=link`, { headers: { Authorization: AUTH } }).then(r => r.ok ? r.json() : null); return j?.link || null; }

const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;

async function measurePage(page) {
  return page.evaluate(() => {
    const c = document.querySelector('.editor-content') || document.querySelector('.entry-content') || document.querySelector('article');
    if (!c) return null;
    const isWhite = (col) => !col || col === 'rgba(0, 0, 0, 0)' || col === 'transparent' || col === 'rgb(255, 255, 255)';
    const VIS = new Set(['TABLE', 'FIGURE', 'BLOCKQUOTE', 'UL', 'OL']);
    function classify(el) {
      const tag = el.tagName;
      const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
      if (/^H[1-4]$/.test(tag)) return 'heading';
      if (/ez-toc|pr-notice/.test(cls)) return 'skip';
      if (tag === 'STYLE' || tag === 'SCRIPT') return 'skip';
      if (/box-|soico-cta|swell|rkt-pr/.test(cls)) return 'visual';
      if (VIS.has(tag)) return 'visual';
      if (el.querySelector('table,img,ul,ol,figure,iframe')) return 'visual';
      // computed: 箱(背景/枠)を持つか
      const s = getComputedStyle(el);
      const bw = parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth) + parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth);
      if (!isWhite(s.backgroundColor) || bw > 0) return 'visual';
      // 子divが箱の場合
      for (const ch of el.children) {
        if (ch.tagName === 'DIV') {
          const cs = getComputedStyle(ch);
          const cbw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
          if (!isWhite(cs.backgroundColor) || cbw > 0) return 'visual';
        }
      }
      return 'plain';
    }
    const len = (t) => (t || '').replace(/\s+/g, '').length;
    const paraLens = [], plainRuns = [];
    let run = 0, sec = 0, secVisual = 0, curSecVisual = false, started = false;
    let strong = 0, total = 0;

    for (const el of c.children) {
      const kind = classify(el);
      if (kind === 'skip') continue;
      strong += el.querySelectorAll('strong,b').length;
      const L = len(el.innerText);
      total += L;
      if (kind === 'heading') {
        if (started) { if (curSecVisual) secVisual++; }
        sec++; started = true; curSecVisual = false;
        if (run > 0) { plainRuns.push(run); run = 0; }
      } else if (kind === 'visual') {
        curSecVisual = true;
        if (run > 0) { plainRuns.push(run); run = 0; }
      } else { // plain
        if (el.tagName === 'P' && L > 0) paraLens.push(L);
        run += L;
      }
    }
    if (run > 0) plainRuns.push(run);
    if (started && curSecVisual) secVisual++;
    return { paraLens, plainRuns, sec, secVisual, strong, total };
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: 'Mozilla/5.0 FundIt-StyleBot/1.0' });
  const all = { paraLens: [], plainRuns: [], sec: 0, secVisual: 0, strong: 0, total: 0 };
  const perCat = {};

  for (const [cat, ids] of Object.entries(IDS)) {
    const cur = { paraLens: [], plainRuns: [], sec: 0, secVisual: 0, strong: 0, total: 0, n: 0 };
    for (const id of ids) {
      const url = await link(id);
      if (!url) { console.error(`[${cat}] ${id} no link`); continue; }
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
      catch (e) { console.error(`[${cat}] ${id} goto: ${e.message}`); continue; }
      const m = await measurePage(page);
      if (!m) { console.error(`[${cat}] ${id} no container`); continue; }
      cur.n++;
      for (const k of ['paraLens', 'plainRuns']) { cur[k].push(...m[k]); all[k].push(...m[k]); }
      for (const k of ['sec', 'secVisual', 'strong', 'total']) { cur[k] += m[k]; all[k] += m[k]; }
    }
    perCat[cat] = cur;
  }
  await browser.close();

  const report = (label, d) => {
    console.log(`[${label}] n=${d.n ?? ''}`);
    console.log(`  段落字数 mean=${mean(d.paraLens)} median=${pct(d.paraLens, 0.5)} p90=${pct(d.paraLens, 0.9)} p95=${pct(d.paraLens, 0.95)} max=${d.paraLens.length ? Math.max(...d.paraLens) : 0}`);
    console.log(`  連続プレーン run mean=${mean(d.plainRuns)} median=${pct(d.plainRuns, 0.5)} p90=${pct(d.plainRuns, 0.9)} p95=${pct(d.plainRuns, 0.95)} max=${d.plainRuns.length ? Math.max(...d.plainRuns) : 0} (n=${d.plainRuns.length}run)`);
    console.log(`  視覚要素あり見出し率=${d.sec ? Math.round(d.secVisual / d.sec * 100) : 0}% (${d.secVisual}/${d.sec})`);
    console.log(`  太字密度=${d.total ? Math.round(d.strong / d.total * 1000 * 10) / 10 : 0}/1000字\n`);
  };
  console.log('\n===== 実機DOM 確定測定 (computed-style 視覚判定) =====\n');
  for (const cat of Object.keys(IDS)) report(cat, perCat[cat]);
  console.log('----- 全体 -----');
  report('ALL', all);
}
main().catch((e) => { console.error(e); process.exit(1); });
