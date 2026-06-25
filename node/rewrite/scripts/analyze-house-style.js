'use strict';
/**
 * soico no1 ハウススタイル定量解析 (一回性の測定スクリプト)。
 *
 * 目的: リライト前(人間執筆)記事の表現特徴を実測し、Phase 1 の基準値を出す。
 *   - 段落(<p>)あたり文字数の分布 (mean/median/p90/max)
 *   - 視覚要素を挟まず連続するプレーン本文の最大文字数 (N候補)
 *   - 見出しあたりの視覚要素(ul/ol/table/figure/img/box)出現率・間隔
 *   - 太字(<strong>/<b>)密度
 *
 * 使い方: cd node && node rewrite/scripts/analyze-house-style.js
 */

require('dotenv').config();
const cheerio = require('cheerio');
const Database = require('better-sqlite3');
const path = require('path');

const CATEGORIES = ['securities', 'cardloan', 'crypto'];
const SAMPLE_PER_CATEGORY = 8;

function wpApiRoot() {
  const raw = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  if (!raw) throw new Error('WP_API_BASE_URL not set');
  return /\/wp-json\/wp\/v\d+/.test(raw) ? raw : `${raw}/wp-json/wp/v2`;
}
function authHeader() {
  return 'Basic ' + Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
}

async function wpGet(pathQuery) {
  const url = `${wpApiRoot()}${pathQuery}`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) throw new Error(`WP ${res.status} ${pathQuery}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

function touchedPostIds() {
  const db = new Database(path.join(__dirname, '../../data/rewrite.db'), { readonly: true });
  const rows = db.prepare('SELECT DISTINCT post_id FROM master_rewrite_session').all();
  db.close();
  return new Set(rows.map((r) => r.post_id));
}

// 視覚要素か判定 (box は SWELL/汎用の class 名で緩く検出)
const VISUAL_TAGS = new Set(['ul', 'ol', 'table', 'figure', 'img', 'blockquote']);
function isVisual(tag, $el) {
  if (VISUAL_TAGS.has(tag)) return true;
  const cls = ($el.attr('class') || '').toLowerCase();
  return /box|swell-block|cap_box|memo|alert|info|caution|point/.test(cls);
}

const jaLen = (s) => (s || '').replace(/\s+/g, '').length; // 空白除外の実文字数

function analyzeArticle(html) {
  const $ = cheerio.load(html);
  // 本文トップレベル要素を順に走査 (article/entry-content 配下を優先、無ければ body)
  const root = $('.entry-content, .post_content, article').first();
  const scope = root.length ? root : $('body');
  const children = scope.children().toArray();

  const paraLens = [];      // <p> ごとの文字数
  let strongCount = 0;
  let totalChars = 0;
  let headingCount = 0;
  const visualGaps = [];    // 視覚要素どうしの間に挟まったプレーン本文文字数
  let runPlain = 0;         // 視覚要素を挟まない連続プレーン本文の現在の文字数
  let maxPlainRun = 0;      // その最大
  // 見出しセクションごとの視覚要素有無
  let secHasVisual = false;
  let sectionsWithVisual = 0;
  let plainRunInSection = 0;
  let maxPlainRunInSection = 0;

  function flushSection() {
    if (headingCount > 0) {
      if (secHasVisual) sectionsWithVisual++;
      if (plainRunInSection > maxPlainRunInSection) maxPlainRunInSection = plainRunInSection;
    }
  }

  for (const node of children) {
    if (node.type !== 'tag') continue;
    const tag = node.tagName.toLowerCase();
    const $el = $(node);
    if (/^h[1-4]$/.test(tag)) {
      flushSection();
      headingCount++;
      secHasVisual = false;
      plainRunInSection = 0;
      continue;
    }
    const txt = $el.text();
    const len = jaLen(txt);
    strongCount += $el.find('strong, b').length;
    totalChars += len;

    if (tag === 'p') {
      if (len > 0) paraLens.push(len);
      // 段落内に視覚要素が無ければプレーン扱い
      const hasInlineVisual = $el.find('img, table, ul, ol').length > 0;
      if (hasInlineVisual || isVisual(tag, $el)) {
        if (runPlain > 0) visualGaps.push(runPlain);
        if (runPlain > maxPlainRun) maxPlainRun = runPlain;
        runPlain = 0;
        secHasVisual = true;
        plainRunInSection = 0;
      } else {
        runPlain += len;
        plainRunInSection += len;
        if (runPlain > maxPlainRun) maxPlainRun = runPlain;
      }
    } else if (isVisual(tag, $el)) {
      if (runPlain > 0) visualGaps.push(runPlain);
      runPlain = 0;
      secHasVisual = true;
      plainRunInSection = 0;
    } else {
      // div ラッパ等: 中に視覚要素があるか
      const inner = $el.find('ul, ol, table, img, figure, blockquote');
      if (inner.length || isVisual(tag, $el)) {
        if (runPlain > 0) visualGaps.push(runPlain);
        runPlain = 0;
        secHasVisual = true;
        plainRunInSection = 0;
      } else {
        runPlain += len;
        plainRunInSection += len;
      }
    }
  }
  flushSection();

  return {
    paraLens, strongCount, totalChars, headingCount, sectionsWithVisual,
    maxPlainRun, maxPlainRunInSection, visualGaps,
  };
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);

async function main() {
  const touched = touchedPostIds();
  const allParas = [];
  const allMaxPlainRun = [];
  const allSectionPlainRun = [];
  let totalSections = 0, totalVisualSections = 0;
  let totalStrong = 0, totalChars = 0;
  const perCat = {};

  for (const cat of CATEGORIES) {
    let catId = null;
    try {
      const terms = await wpGet(`/categories?slug=${cat}&_fields=id,slug`);
      catId = terms[0]?.id || null;
    } catch (e) { /* ignore */ }
    const q = catId
      ? `/posts?categories=${catId}&per_page=${SAMPLE_PER_CATEGORY + 10}&orderby=date&_fields=id,link,content`
      : `/posts?search=${cat}&per_page=${SAMPLE_PER_CATEGORY + 10}&_fields=id,link,content`;
    let posts = [];
    try { posts = await wpGet(q); } catch (e) { console.error(`[${cat}] fetch fail: ${e.message}`); continue; }
    const sample = posts.filter((p) => !touched.has(p.id)).slice(0, SAMPLE_PER_CATEGORY);

    const catParas = [];
    let catStrong = 0, catChars = 0, catSec = 0, catVisSec = 0;
    const catPlain = [];
    for (const p of sample) {
      const a = analyzeArticle(p.content?.rendered || '');
      catParas.push(...a.paraLens);
      allParas.push(...a.paraLens);
      catStrong += a.strongCount; totalStrong += a.strongCount;
      catChars += a.totalChars; totalChars += a.totalChars;
      catSec += a.headingCount; totalSections += a.headingCount;
      catVisSec += a.sectionsWithVisual; totalVisualSections += a.sectionsWithVisual;
      allMaxPlainRun.push(a.maxPlainRun);
      allSectionPlainRun.push(a.maxPlainRunInSection);
      catPlain.push(a.maxPlainRunInSection);
    }
    perCat[cat] = {
      n: sample.length, ids: sample.map((p) => p.id),
      paraMean: mean(catParas), paraP90: pct(catParas, 0.9), paraMax: catParas.length ? Math.max(...catParas) : 0,
      visualSectionRate: catSec ? (catVisSec / catSec) : 0,
      maxSectionPlainRun: catPlain.length ? Math.max(...catPlain) : 0,
      strongPer1k: catChars ? Math.round((catStrong / catChars) * 1000 * 10) / 10 : 0,
    };
  }

  console.log('\n===== soico no1 ハウススタイル実測 =====\n');
  for (const cat of CATEGORIES) {
    const c = perCat[cat]; if (!c) continue;
    console.log(`[${cat}] n=${c.n} ids=${c.ids.join(',')}`);
    console.log(`  段落文字数  mean=${c.paraMean}  p90=${c.paraP90}  max=${c.paraMax}`);
    console.log(`  視覚要素あり見出し率 = ${(c.visualSectionRate * 100).toFixed(0)}%`);
    console.log(`  見出し内・連続プレーン本文の最大 = ${c.maxSectionPlainRun}文字`);
    console.log(`  太字密度 = ${c.strongPer1k}個/1000字\n`);
  }
  console.log('----- 全体集計 -----');
  console.log(`段落文字数: mean=${mean(allParas)}  median=${pct(allParas, 0.5)}  p90=${pct(allParas, 0.9)}  p95=${pct(allParas, 0.95)}  max=${allParas.length ? Math.max(...allParas) : 0}  (n=${allParas.length}段落)`);
  console.log(`連続プレーン本文(記事横断 max分布): median=${pct(allSectionPlainRun, 0.5)}  p90=${pct(allSectionPlainRun, 0.9)}  max=${allSectionPlainRun.length ? Math.max(...allSectionPlainRun) : 0}`);
  console.log(`視覚要素あり見出し率 = ${totalSections ? ((totalVisualSections / totalSections) * 100).toFixed(0) : 0}% (${totalVisualSections}/${totalSections})`);
  console.log(`太字密度 = ${totalChars ? (Math.round((totalStrong / totalChars) * 1000 * 10) / 10) : 0}個/1000字`);
  console.log('\n（N候補=連続プレーン上限、M候補=段落上限 の根拠データ）');
}

main().catch((e) => { console.error(e); process.exit(1); });
