#!/usr/bin/env node
'use strict';
/**
 * #3 空BOX補完 監査 STEP1: 検出のみ (LLM不使用)。
 * - 実検出器(detectEmptyTitleBoxes)が拾った箱を列挙
 * - 検出器が「装飾BOX × bodyLen<8 × labelあり」だが最終的に弾いた near-miss を理由付きで列挙
 *   → recall漏れ(本来埋めるべき空BOXの取りこぼし)を目視監査する
 *
 * Usage: node audit-box-detect.js --per 15
 */
require('dotenv').config({ path: '/Users/daikinozawa/Projects/s-tools/node/.env', quiet: true });
const cheerio = require('cheerio');
const { detectEmptyTitleBoxes, TITLE_ENDINGS } = require('/Users/daikinozawa/Projects/s-tools/node/rewrite/apply/empty-box-detector');

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; }
const PER = parseInt(arg('per', '15'), 10);
const CATS = ['securities', 'cryptocurrency']; // cardloan はリライト停止中

function wpRoot() { const r = (process.env.WP_API_BASE_URL || '').replace(/\/$/, ''); return /\/wp-json\/wp\/v\d+/.test(r) ? r : `${r}/wp-json/wp/v2`; }
const AUTH = 'Basic ' + Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
async function wpGet(p) { const r = await fetch(`${wpRoot()}${p}`, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(`WP ${r.status} ${p}`); return r.json(); }
const jaLen = (s) => (s || '').replace(/\s+/g, '').length;
const SENTENCE_END = /(です|ます|ません|でした|ない|だ|た|る|い|ね|よ|か|。|！|？|\?|!|でしょう|ください|ましょう|できる|できます|あります|なります|されます|可能|不可|無料|注意|推奨)\s*$/;

// 装飾BOX × bodyLen<8 × labelあり の「空っぽ装飾BOX」を全部拾い、実検出器が弾いた理由を付ける
function nearMisses(raw, detectedLabels) {
  const out = [];
  const blocks = [...raw.matchAll(/<!--\s*wp:html\s*-->([\s\S]*?)<!--\s*\/wp:html\s*-->/g)].map((m) => m[1]);
  for (const blk of blocks) {
    const $ = cheerio.load(blk);
    const div = $('div').first();
    if (!div.length) continue;
    const style = (div.attr('style') || '') + ' ' + (div.attr('class') || '');
    if (!/border|background|box-/.test(style)) continue;
    const labelEl = $('p, strong, b, h1, h2, h3, h4, h5, h6').first();
    const label = labelEl.text().replace(/\s+/g, ' ').trim();
    if (!label) continue;
    const hasMedia = div.find('table, ul, ol, img').length > 0;
    const bodyLen = jaLen(div.text()) - jaLen(label);
    if (hasMedia || bodyLen >= 8) continue; // 中身あり = 空BOXではない
    const clean = label.replace(/[　\s]+$/, '');
    if (detectedLabels.has(clean)) continue; // 既に検出済み
    const reasons = [];
    if (!TITLE_ENDINGS.some((t) => clean.endsWith(t))) reasons.push('末尾がTITLE_ENDINGS外');
    if (/[がはも]/.test(clean)) reasons.push('格助詞(が/は/も)あり');
    if (SENTENCE_END.test(clean)) reasons.push('文末語尾');
    if (/[、，]/.test(clean)) reasons.push('読点あり');
    if (clean.length > 28) reasons.push('28字超');
    const likelyTitleMiss = reasons.length === 1 && reasons[0] === '末尾がTITLE_ENDINGS外' && clean.length <= 18;
    out.push({ label: clean, bodyLen, reasons, likelyTitleMiss });
  }
  return out;
}

async function main() {
  let scanned = 0, totalHtmlBoxes = 0;
  const detected = [];
  const misses = [];
  for (const cat of CATS) {
    let cid = null;
    try { cid = (await wpGet(`/categories?slug=${cat}&_fields=id`))[0]?.id; } catch {}
    const q = cid ? `/posts?categories=${cid}&per_page=${PER}&_fields=id,link,title,content&context=edit`
                  : `/posts?search=${cat}&per_page=${PER}&_fields=id,link,title,content&context=edit`;
    let posts = [];
    try { posts = await wpGet(q); } catch (e) { console.error(`[${cat}] ${e.message}`); continue; }
    for (const p of posts) {
      scanned++;
      const raw = p.content?.raw || '';
      totalHtmlBoxes += (raw.match(/<!--\s*wp:html\s*-->/g) || []).length;
      const boxes = detectEmptyTitleBoxes(raw);
      const labels = new Set(boxes.map((b) => b.label));
      for (const b of boxes) detected.push({ cat, id: p.id, label: b.label, format: b.format, ctxLen: (b.contextText || '').length });
      for (const m of nearMisses(raw, labels)) misses.push({ cat, id: p.id, ...m });
    }
  }
  console.log(`=== STEP1 検出監査 (securities+cryptocurrency, per=${PER}) ===`);
  console.log(`スキャン記事: ${scanned} / wp:html ブロック総数: ${totalHtmlBoxes}`);
  console.log(`\n■ 検出された空BOX: ${detected.length}件`);
  for (const d of detected) console.log(`  [${d.cat}] post ${d.id}: 「${d.label}」(${d.format}, ctx ${d.ctxLen}字)`);
  const rejectedCallouts = misses.filter((m) => !m.likelyTitleMiss).length;
  const recallMisses = misses.filter((m) => m.likelyTitleMiss);
  console.log(`\n■ 空っぽ装飾BOXで検出器が弾いた: ${misses.length}件 (うち一文callout等の正しい除外=${rejectedCallouts}件)`);
  console.log(`\n■ 真のrecall漏れ候補 (体言止めタイトルだが末尾がリスト外): ${recallMisses.length}件`);
  for (const m of recallMisses) console.log(`  [${m.cat}] post ${m.id}: 「${m.label}」`);
}
main().catch((e) => { console.error(e); process.exit(1); });
