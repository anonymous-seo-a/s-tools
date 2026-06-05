'use strict';
// gutenberg-apply 中核エンジンの検証 (合成 raw、WP 非依存)。

const assert = require('assert');
const {
  parseTopLevelBlocks, isProtectedType, htmlToBlocks,
  planGutenbergApply, applyGutenbergOps, sectionBlockRange, findHeadingIndex,
} = require('../apply/gutenberg-apply');

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('  ✓', m); pass++; };
const eq = (a, b, m) => { assert.strictEqual(a, b, `${m} (got ${JSON.stringify(a)})`); console.log('  ✓', m); pass++; };

// 実構造を模した raw: 段落・見出し・再利用ブロック ref・独自CTA・入れ子(columns)・list
const RAW = [
  '<!-- wp:heading -->\n<h2>導入セクション</h2>\n<!-- /wp:heading -->',
  '<!-- wp:paragraph -->\n<p>導入の段落その1。十分な長さの説明文をここに置きます。</p>\n<!-- /wp:paragraph -->',
  '<!-- wp:paragraph -->\n<p>導入の段落その2。さらに説明を続けます。</p>\n<!-- /wp:paragraph -->',
  '<!-- wp:heading -->\n<h2>ランキングセクション</h2>\n<!-- /wp:heading -->',
  '<!-- wp:paragraph -->\n<p>ランキングの前置き段落。</p>\n<!-- /wp:paragraph -->',
  '<!-- wp:block {"ref":12345} /-->',
  '<!-- wp:soico-cta/cardloan-inline-cta {"partner":"acom"} /-->',
  '<!-- wp:heading -->\n<h2>FAQセクション</h2>\n<!-- /wp:heading -->',
  '<!-- wp:list -->\n<ul><li>Q1</li><li>Q2</li></ul>\n<!-- /wp:list -->',
].join('\n\n');

console.log('§1 ブロックパース');
{
  const blocks = parseTopLevelBlocks(RAW);
  const types = blocks.map((b) => b.type);
  eq(blocks.length, 9, 'top-level ブロック数 9');
  ok(types.filter((t) => t === 'heading').length === 3, 'heading 3');
  ok(types.includes('block') && types.includes('soico-cta/cardloan-inline-cta'), '再利用/CTA ブロック検出');
  const refBlock = blocks.find((b) => b.type === 'block');
  ok(refBlock.selfClosing && refBlock.isProtected, '再利用ブロックは self-close & protected');
  ok(blocks.find((b) => b.type === 'soico-cta/cardloan-inline-cta').isProtected, 'CTA は protected');
  const h2 = blocks.find((b) => b.type === 'heading');
  eq(h2.headingLevel, 2, '見出しレベル抽出');
  eq(h2.headingText, '導入セクション', '見出しテキスト抽出');
  // markup が原文と一致 (offset 正確性)
  ok(RAW.slice(refBlock.start, refBlock.end) === refBlock.markup, 'block.start/end が原文に整合');
}

console.log('§2 入れ子ブロックを1つに畳む');
{
  const nested = '<!-- wp:columns -->\n<!-- wp:column -->\n<!-- wp:paragraph -->\n<p>中</p>\n<!-- /wp:paragraph -->\n<!-- /wp:column -->\n<!-- /wp:columns -->';
  const b = parseTopLevelBlocks(nested);
  eq(b.length, 1, 'columns 入れ子は top-level 1 ブロック');
  eq(b[0].type, 'columns', 'type=columns');
  ok(b[0].isProtected === false, 'columns は protected ではない(が SAFE_TYPES外→置換時は保護扱い)');
}

console.log('§3 isProtectedType');
{
  ok(isProtectedType('block') && isProtectedType('image') && isProtectedType('html'), '再利用/画像/html は protected');
  ok(isProtectedType('soico-cta/x') && isProtectedType('core/embed') === false ? true : isProtectedType('embed'), '名前空間付きは protected');
  ok(!isProtectedType('paragraph') && !isProtectedType('heading'), 'paragraph/heading は非protected');
}

console.log('§4 htmlToBlocks');
{
  const blk = htmlToBlocks('<h2>新見出し</h2><p>新段落です。十分長い文章。</p><ul><li>項目</li></ul>');
  ok(/<!-- wp:heading -->/.test(blk), 'heading ブロック化');
  ok(/<!-- wp:paragraph -->/.test(blk), 'paragraph ブロック化');
  ok(/<!-- wp:list/.test(blk), 'list ブロック化');
  // section ラッパは展開される
  const wrapped = htmlToBlocks('<section><p>包まれた段落。十分な長さ。</p></section>');
  ok(/<!-- wp:paragraph -->/.test(wrapped) && !/<section/.test(wrapped), 'section ラッパは展開して中身をブロック化');
}

console.log('§5 insert_before / insert_after');
{
  const diffs = [
    { id: 1, target_section: 'h2#FAQセクション', change_type: 'insert_before', daiki_judgment: 'approved', content_after: '<h2>新FAQ前置き</h2><p>挿入される前置き段落。十分な長さ。</p>' },
    { id: 2, target_section: 'h2#導入セクション', change_type: 'insert_after', daiki_judgment: 'approved', content_after: '<p>導入の後ろに足す段落。十分な長さがあります。</p>' },
  ];
  const plan = planGutenbergApply(RAW, diffs);
  eq(plan.planned.length, 2, 'insert 2 件 planned');
  const res = applyGutenbergOps(RAW, plan.ops);
  eq(res.conflicts.length, 0, '競合なし');
  ok(/新FAQ前置き/.test(res.raw), 'insert_before 反映');
  ok(/導入の後ろに足す段落/.test(res.raw), 'insert_after 反映');
  // 再利用ブロック・CTA が保持されている
  ok(/wp:block \{"ref":12345\}/.test(res.raw), '再利用ブロック保持');
  ok(/soico-cta\/cardloan-inline-cta/.test(res.raw), 'CTA ブロック保持');
  // insert_before は FAQ 見出しの前に入る
  ok(res.raw.indexOf('新FAQ前置き') < res.raw.indexOf('FAQセクション'), 'insert_before は見出し前');
}

console.log('§6 rewrite: 安全 section は置換');
{
  // 導入セクション = heading + paragraph×2 のみ (安全)
  const diffs = [{ id: 3, target_section: 'h2#導入セクション', change_type: 'rewrite_section', daiki_judgment: 'approved', content_after: '<h2>導入セクション(改)</h2><p>書き換えた導入。十分な長さの新しい文章です。</p>' }];
  const plan = planGutenbergApply(RAW, diffs);
  eq(plan.planned.length, 1, '安全 section は planned');
  const res = applyGutenbergOps(RAW, plan.ops);
  ok(/導入セクション\(改\)/.test(res.raw), '置換反映');
  ok(!/導入の段落その1/.test(res.raw), '旧段落が消えた');
  ok(/ランキングセクション/.test(res.raw) && /wp:block \{"ref":12345\}/.test(res.raw), '他 section と再利用ブロックは保持');
}

console.log('§7 rewrite: 保護ブロックを含む section は skip+報告');
{
  // ランキングセクション = paragraph + 再利用ブロック + CTA (保護あり)
  const diffs = [{ id: 4, target_section: 'h2#ランキングセクション', change_type: 'rewrite_section', daiki_judgment: 'approved', content_after: '<h2>ランキング(改)</h2><p>書き換え。十分な長さ。</p>' }];
  const plan = planGutenbergApply(RAW, diffs);
  eq(plan.planned.length, 0, 'planned 0');
  ok(/保護ブロックあり/.test(plan.skipped[0].reason), `skip 理由が保護ブロック: "${plan.skipped[0].reason}"`);
}

console.log('§8 アンカー無し / 未承認 / 非対象 change_type');
{
  const diffs = [
    { id: 5, target_section: 'h2#存在しない見出し', change_type: 'insert_after', daiki_judgment: 'approved', content_after: '<p>x</p>' },
    { id: 6, target_section: 'h2#導入セクション', change_type: 'rewrite_section', daiki_judgment: 'pending', content_after: '<p>x</p>' },
    { id: 7, target_section: 'meta:title', change_type: 'update_title', daiki_judgment: 'approved', content_after: '<title>x</title>' },
  ];
  const plan = planGutenbergApply(RAW, diffs);
  eq(plan.planned.length, 0, 'planned 0');
  ok(plan.skipped.some((s) => /見つからない/.test(s.reason)), 'アンカー無し skip');
  ok(plan.skipped.some((s) => /not approved/.test(s.reason)), '未承認 skip');
  ok(plan.skipped.some((s) => /非対象/.test(s.reason)), 'meta は非対象 skip');
}

console.log('§9 複数 op の offset 保全 (同時適用)');
{
  const diffs = [
    { id: 8, target_section: 'h2#導入セクション', change_type: 'insert_before', daiki_judgment: 'approved', content_after: '<p>最上部に挿入。十分な長さの文章。</p>' },
    { id: 9, target_section: 'h2#FAQセクション', change_type: 'insert_after', daiki_judgment: 'approved', content_after: '<p>最下部に挿入。十分な長さの文章。</p>' },
    { id: 10, target_section: 'h2#導入セクション', change_type: 'rewrite_section', daiki_judgment: 'approved', content_after: '<h2>導入(改)</h2><p>新本文。十分な長さ。</p>' },
  ];
  const plan = planGutenbergApply(RAW, diffs);
  // id8(insert_before 導入) と id10(rewrite 導入) は範囲が重なる → applyGutenbergOps で競合検出
  const res = applyGutenbergOps(RAW, plan.ops);
  ok(/最下部に挿入/.test(res.raw), 'FAQ への insert_after は反映');
  ok(res.conflicts.length >= 1 || (/最上部に挿入/.test(res.raw) && /導入\(改\)/.test(res.raw)), '重なり op は競合検出 or 両立');
  ok(/wp:block \{"ref":12345\}/.test(res.raw), '再利用ブロック保持(全 op 適用後)');
}

console.log(`\nALL PASS (${pass} assertions)`);
