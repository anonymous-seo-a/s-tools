#!/usr/bin/env node
'use strict';
/**
 * 空テンプレBOX 検出器 (補完対象の洗い出し・誤検出ゼロ検証用)。
 *
 * 対象 = 「体言止めタイトル(特徴/違い/メリット/料金体系 等)」をラベルに持ち、本体が空のBOX のみ。
 * 一文ポイントBOX (「郵送物なしで契約できる」等、主張それ自体が中身) は対象外。
 *
 * Usage: node rewrite/scripts/empty-box-detect.js [--per 12]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env'), quiet: true });
const cheerio = require('cheerio');

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; }
const PER = parseInt(arg('per', '12'), 10);
const CATS = ['securities', 'cardloan', 'cryptocurrency'];

function wpRoot() { const r = (process.env.WP_API_BASE_URL || '').replace(/\/$/, ''); return /\/wp-json\/wp\/v\d+/.test(r) ? r : `${r}/wp-json/wp/v2`; }
const AUTH = 'Basic ' + Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
async function wpGet(p) { const r = await fetch(`${wpRoot()}${p}`, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(`WP ${r.status} ${p}`); return r.json(); }

const jaLen = (s) => (s || '').replace(/\s+/g, '').length;

// タイトル(体言止め)とみなす末尾名詞のホワイトリスト。callout 主張文は通常これで終わらない。
const TITLE_ENDINGS = [
  '特徴', '違い', 'メリット', 'デメリット', '料金体系', '料金表', '手数料体系',
  '比較', '一覧', 'まとめ', 'ポイント', '種類', '手順', '流れ', '早見表',
  'ランキング', 'チェックリスト', '注意点', '条件', '基準', '仕組み', '概要',
  'スペック', '内訳', '対応表', '相関', 'メリット・デメリット',
];
// 文末(=主張文=対象外)の語尾。これで終わるラベルは callout とみなし除外。
const SENTENCE_END = /(です|ます|ません|でした|ない|だ|た|る|い|ね|よ|か|。|！|？|\?|!|でしょう|ください|ましょう|できる|できます|あります|なります|されます|可能|不可|無料|注意|推奨)\s*$/;

function detectEmptyTitleBoxes(raw) {
  const found = [];
  const htmlBlocks = [...raw.matchAll(/<!--\s*wp:html\s*-->([\s\S]*?)<!--\s*\/wp:html\s*-->/g)].map((m) => m[1]);
  for (const blk of htmlBlocks) {
    const $ = cheerio.load(blk);
    const div = $('div').first();
    if (!div.length) continue;
    const style = (div.attr('style') || '') + ' ' + (div.attr('class') || '');
    if (!/border|background|box-/.test(style)) continue; // 装飾BOXのみ

    const labelEl = $('p, strong, b, h1, h2, h3, h4, h5, h6').first();
    const label = labelEl.text().replace(/\s+/g, ' ').trim();
    if (!label) continue;

    // 本体 = ラベル以外に実質コンテンツがあるか
    const hasMedia = div.find('table, ul, ol, img').length > 0;
    const bodyLen = jaLen(div.text()) - jaLen(label);
    if (hasMedia || bodyLen >= 8) continue; // 中身あり → 対象外

    // ラベルがタイトル(体言止め名詞句)か:
    //   - ホワイトリスト末尾 (特徴/違い/メリット/料金体系 等)
    //   - 文末語尾でない
    //   - 主語/主題/並立の格助詞 が/は/も を含まない (含む=「…が特徴」等の主張文=callout)
    //   - 読点なし・短い
    const clean = label.replace(/[　\s]+$/, '');
    const endsTitle = TITLE_ENDINGS.some((t) => clean.endsWith(t));
    const hasClauseParticle = /[がはも]/.test(clean); // ひらがな格助詞 → 主張文
    const looksSentence = SENTENCE_END.test(clean) || /[、，]/.test(clean) || clean.length > 28;

    if (endsTitle && !hasClauseParticle && !looksSentence) {
      found.push({ label: clean, bodyLen });
    }
  }
  return found;
}

async function main() {
  const targets = [];
  let scanned = 0, totalBoxes = 0;
  for (const cat of CATS) {
    let cid = null;
    try { cid = (await wpGet(`/categories?slug=${cat}&_fields=id`))[0]?.id; } catch {}
    const q = cid ? `/posts?categories=${cid}&per_page=${PER}&_fields=id,link,content&context=edit`
                  : `/posts?search=${cat}&per_page=${PER}&_fields=id,link,content&context=edit`;
    let posts = [];
    try { posts = await wpGet(q); } catch (e) { console.error(`[${cat}] ${e.message}`); continue; }
    for (const p of posts) {
      scanned++;
      const raw = p.content?.raw || '';
      totalBoxes += (raw.match(/<!--\s*wp:html\s*-->/g) || []).length;
      const boxes = detectEmptyTitleBoxes(raw);
      for (const b of boxes) targets.push({ id: p.id, link: p.link, ...b });
    }
  }
  console.log(`スキャン記事数: ${scanned} / wp:html ブロック総数: ${totalBoxes}`);
  console.log(`\n=== 補完対象 (空テンプレBOX) ${targets.length}件 ===`);
  for (const t of targets) console.log(`  post ${t.id}: 「${t.label}」`);
  console.log('\n各targetを目視で確認し、すべて「中身を入れるべき空のタイトルBOX」かを検証してください。');
}
main().catch((e) => { console.error(e); process.exit(1); });
