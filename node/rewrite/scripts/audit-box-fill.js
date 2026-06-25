#!/usr/bin/env node
'use strict';
/**
 * #3 空BOX補完 監査 STEP2: 生成内容 + 数値grounding (Aクラス・ゲートのプロトタイプ)。
 *
 * 各記事で detect → fillEmptyBoxes(実コードパス) → 生成HTMLの数値を抽出・正規化し、
 * fact∪context に grounding されているか決定論判定。創作数値(ungrounded)の頻度を実測する。
 *
 * Usage: node rewrite/scripts/audit-box-fill.js --posts 4195,5957,5921,4185,9315
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { detectEmptyTitleBoxes } = require('../apply/empty-box-detector');
const { fillEmptyBoxes } = require('../llm-execution/empty-box-filler');
const db = require('../db');
const MD = []; // Markdown レポート蓄積

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; }
const POSTS = arg('posts', '4195,5957,5921,4185,9315').split(',').map((s) => parseInt(s, 10));

function wpRoot() { const r = (process.env.WP_API_BASE_URL || '').replace(/\/$/, ''); return /\/wp-json\/wp\/v\d+/.test(r) ? r : `${r}/wp-json/wp/v2`; }
const AUTH = 'Basic ' + Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
async function wpGet(p) { const r = await fetch(`${wpRoot()}${p}`, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(`WP ${r.status} ${p}`); return r.json(); }

// 数値正規化: 全角→半角, ％→%, カンマ/空白除去, 「,000」等の桁区切り除去
function norm(s) {
  return (s || '')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
    .replace(/[．]/g, '.').replace(/[％]/g, '%')
    .replace(/[,，]/g, '').replace(/\s+/g, '');
}
// テキストから数値トークン抽出 (数字+任意単位)。年(西暦4桁)は除外しすぎないが grounding 判定では緩く扱う。
function extractNumbers(text) {
  const t = norm(text);
  const re = /\d+(?:\.\d+)?(?:万|億|千)?(?:円|%|倍|銭|社|件|銘柄|株|ポイント|pt|年|か月|ヶ月|日|歳)?/g;
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const tok = m[0];
    if (/^\d{1,2}$/.test(tok)) continue; // 単独1-2桁(「3つ」「5社」の数詞核)はノイズ→除外
    out.push(tok);
  }
  return [...new Set(out)];
}
// grounding: トークンの数値コア(digits)が haystack(正規化)に現れるか
function isGrounded(tok, hay) {
  const core = (tok.match(/\d+(?:\.\d+)?/) || [])[0];
  if (!core) return true;
  return hay.includes(core);
}

(async () => {
  let totalBoxes = 0, totalFilled = 0, boxesWithNum = 0, boxesUngrounded = 0;
  const ungroundedSamples = [];
  for (const POST of POSTS) {
    let wp;
    try { wp = await wpGet(`/posts/${POST}?context=edit&_fields=title,content,link`); } catch (e) { console.error(`post ${POST}: ${e.message}`); continue; }
    const raw = wp.content.raw;
    const title = wp.title.raw || wp.title.rendered || '';
    const link = wp.link || '';
    const boxes = detectEmptyTitleBoxes(raw);
    if (!boxes.length) { console.log(`\n## post ${POST}: 空BOX 0件`); continue; }
    let facts = [];
    try { facts = db.open().prepare('SELECT content, source_url FROM master_fact_set WHERE post_id=? ORDER BY layer').all(POST); } catch {}
    const { filled } = await fillEmptyBoxes({ title, boxes, facts });
    console.log(`\n## post ${POST} 「${title.slice(0, 30)}」: 空BOX ${boxes.length} / 生成 ${filled.length} / fact ${facts.length}`);
    totalBoxes += boxes.length; totalFilled += filled.length;
    MD.push(`\n## post ${POST}: ${title}`, `ライブ: ${link}  (fact ${facts.length}件)\n`);

    for (const b of filled) {
      // grounding 母数 = この箱の context + 全fact
      const hay = norm((b.contextText || '') + ' ' + facts.map((f) => f.content).join(' '));
      const fillText = cheerio.load(b.fillHtml).text();
      const nums = extractNumbers(fillText);
      const ungrounded = nums.filter((n) => !isGrounded(n, hay));
      if (nums.length) boxesWithNum++;
      const tag = ungrounded.length ? '❌UNGROUNDED' : (nums.length ? '✓grounded' : '— no-num');
      console.log(`   ${tag} 「${b.label}」 数値[${nums.join(', ') || 'なし'}]${ungrounded.length ? ' ← 創作疑い: ' + ungrounded.join(', ') : ''}`);
      const fillBullets = cheerio.load(b.fillHtml)('li').map((_, el) => `- ${cheerio.load(b.fillHtml)(el).text().trim()}`).get().join('\n') || `- ${fillText.replace(/\s+/g, ' ').trim()}`;
      MD.push(
        `### ${tag} 「${b.label}」 (${b.format})`,
        `**数値**: ${nums.join(', ') || 'なし'}${ungrounded.length ? `  ⚠創作疑い: ${ungrounded.join(', ')}` : ''}`,
        `\n**source(直後本文・生成の根拠)**:\n> ${(b.contextText || '(なし)').replace(/\s+/g, ' ').trim()}`,
        `\n**生成された中身(After)**:\n${fillBullets}\n`
      );
      if (ungrounded.length) {
        boxesUngrounded++;
        ungroundedSamples.push({ post: POST, label: b.label, ungrounded, fill: fillText.slice(0, 160), ctx: (b.contextText || '').slice(0, 120) });
      }
    }
  }
  console.log(`\n=== STEP2 集計 ===`);
  console.log(`空BOX ${totalBoxes} / 生成 ${totalFilled} / 数値を含む箱 ${boxesWithNum} / うちungrounded(創作疑い)を含む箱 ${boxesUngrounded}`);
  const outPath = path.resolve(__dirname, '..', '..', '..', 'design', 'preview', 'box_fill_audit.md');
  const header = `# 空BOX補完 監査レポート (自分の目で確認用)\n\n` +
    `見方: 各箱の「source(直後本文)」= 生成の唯一の根拠。「生成された中身(After)」の数値・主張がsourceに含まれるかを目視で照合する。\n` +
    `- ✓grounded = 数値が source/fact にある  / ❌UNGROUNDED = source/fact に無い数値(創作疑い)  / — no-num = 数値なし\n` +
    `- A(創作): After の数値が source に無いものがあるか / B(誇大): 「必ず/誰でも/最も得」等の新規断定が足されてないか / C(誤紐付け): ラベルの社・主題に合わない項目が混じってないか\n\n` +
    `集計: 空BOX ${totalBoxes} / 生成 ${totalFilled} / 数値含む箱 ${boxesWithNum} / 創作疑いを含む箱 ${boxesUngrounded}\n`;
  fs.writeFileSync(outPath, header + MD.join('\n'));
  console.log(`\n📄 Markdownレポート: ${outPath}`);
  if (ungroundedSamples.length) {
    console.log(`\n=== 創作疑いサンプル (Aクラス事故候補) ===`);
    for (const s of ungroundedSamples) {
      console.log(`\n[post ${s.post}] 「${s.label}」 創作疑い数値: ${s.ungrounded.join(', ')}`);
      console.log(`  fill : ${s.fill}`);
      console.log(`  ctx  : ${s.ctx}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
