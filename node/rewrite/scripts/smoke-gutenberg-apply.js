'use strict';
// gutenberg-apply 中核エンジン (run レベル) の検証 (合成 raw、WP 非依存)。

const assert = require('assert');
const {
  parseTopLevelBlocks, isProtectedType, htmlToBlocks,
  planGutenbergApply, applyGutenbergOps, segmentSectionRuns, findHeadingIndex, parseTarget,
} = require('../apply/gutenberg-apply');

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('  ✓', m); pass++; };
const eq = (a, b, m) => { assert.strictEqual(a, b, `${m} (got ${JSON.stringify(a)})`); console.log('  ✓', m); pass++; };

// 実構造を模した raw。証券カード型: 見出し + リード本文 + 再利用ブロック + 表の後ろの独立本文。
const RAW = [
  '<!-- wp:heading -->\n<h2>導入セクション</h2>\n<!-- /wp:heading -->',
  '<!-- wp:paragraph -->\n<p>導入の段落その1。十分な長さの説明文をここに置きます。</p>\n<!-- /wp:paragraph -->',
  '<!-- wp:paragraph -->\n<p>導入の段落その2。さらに説明を続けます。</p>\n<!-- /wp:paragraph -->',
  '<!-- wp:heading -->\n<h3>1位：楽天証券</h3>\n<!-- /wp:heading -->',
  '<!-- wp:paragraph -->\n<p>楽天証券はリード本文。手数料が業界最安水準で初心者に人気です。</p>\n<!-- /wp:paragraph -->',
  '<!-- wp:block {"ref":12345} /-->',
  '<!-- wp:soico-cta/securities-spec-table {"partner":"rakuten"} /-->',
  '<!-- wp:paragraph -->\n<p>表の後ろの独立本文。米国株の取扱が豊富で積立にも対応しています。</p>\n<!-- /wp:paragraph -->',
  '<!-- wp:soico-cta/securities-cta {"partner":"rakuten"} /-->',
  '<!-- wp:paragraph -->\n<p>CTAの後ろの締め本文。総合力で1位にふさわしい証券会社です。</p>\n<!-- /wp:paragraph -->',
  '<!-- wp:heading -->\n<h2>まとめ</h2>\n<!-- /wp:heading -->',
  '<!-- wp:paragraph -->\n<p>まとめの段落。十分な長さがあります。</p>\n<!-- /wp:paragraph -->',
].join('\n\n');

const BLOCKS = parseTopLevelBlocks(RAW);
const idxOf = (t) => findHeadingIndex(BLOCKS, parseTarget(t));

console.log('§1 ブロックパース');
{
  eq(BLOCKS.length, 12, 'top-level ブロック数 12');
  ok(BLOCKS.filter((b) => b.type === 'heading').length === 3, 'heading 3');
  ok(BLOCKS.find((b) => b.type === 'block').isProtected, '再利用ブロック protected');
  ok(BLOCKS.find((b) => b.type === 'soico-cta/securities-spec-table').isProtected, 'CTA spec-table protected');
}

console.log('§2 segmentSectionRuns: カード section は run が「表の前/後/締め」3つ');
{
  const hIdx = idxOf('h3#1位：楽天証券');
  const runs = segmentSectionRuns(RAW, BLOCKS, hIdx);
  eq(runs.length, 3, 'run 数 3 (リード / 表の後 / CTAの後)');
  ok(runs[0].markup.includes('リード本文'), 'run0 = リード');
  ok(runs[1].markup.includes('表の後ろの独立本文'), 'run1 = 表の後ろ本文');
  ok(runs[2].markup.includes('CTAの後ろの締め本文'), 'run2 = 締め');
  ok(!runs.some((r) => /wp:block|soico-cta/.test(r.markup)), 'run に保護ブロックは含まれない');
}

console.log('§3 run 単位 rewrite: 表の後ろの本文(run1)だけ置換、保護ブロックは位置保持');
{
  const hIdx = idxOf('h3#1位：楽天証券');
  const runs = segmentSectionRuns(RAW, BLOCKS, hIdx);
  const diffs = [{
    id: 1, target_section: 'h3#1位：楽天証券', change_type: 'rewrite_run', daiki_judgment: 'approved',
    content_before: runs[1].markup,  // 表の後ろの run
    content_after: '<p>表の後ろの本文を書き換えました。NISA対応や米国株手数料が魅力です。</p>',
  }];
  const plan = planGutenbergApply(RAW, diffs);
  eq(plan.planned.length, 1, 'planned 1');
  const res = applyGutenbergOps(RAW, plan.ops);
  ok(res.raw.includes('表の後ろの本文を書き換えました'), 'run1 置換反映');
  ok(!res.raw.includes('表の後ろの独立本文。米国株'), '旧 run1 消去');
  ok(res.raw.includes('リード本文'), 'run0(リード) は無傷');
  ok(res.raw.includes('CTAの後ろの締め本文'), 'run2(締め) は無傷');
  ok(/wp:block \{"ref":12345\}/.test(res.raw), '再利用ブロック保持');
  ok(/soico-cta\/securities-spec-table/.test(res.raw) && /soico-cta\/securities-cta/.test(res.raw), 'spec表/CTA 保持');
  // 位置検証: 表(spec-table)は run1新本文より前、CTAは run1新本文より後ろ
  ok(res.raw.indexOf('securities-spec-table') < res.raw.indexOf('書き換えました'), 'spec表は新run1の前(位置保持)');
  ok(res.raw.indexOf('書き換えました') < res.raw.indexOf('securities-cta'), '新run1はCTAの前(位置保持)');
}

console.log('§4 複数 run を同時 rewrite (リード+締め)、間の表/CTA/中間本文は不動');
{
  const hIdx = idxOf('h3#1位：楽天証券');
  const runs = segmentSectionRuns(RAW, BLOCKS, hIdx);
  const diffs = [
    { id: 2, target_section: 'h3#1位：楽天証券', change_type: 'rewrite_run', daiki_judgment: 'approved', content_before: runs[0].markup, content_after: '<p>新リード。楽天証券の総合評価を刷新しました。</p>' },
    { id: 3, target_section: 'h3#1位：楽天証券', change_type: 'rewrite_run', daiki_judgment: 'approved', content_before: runs[2].markup, content_after: '<p>新しい締め本文。手数料の安さが決め手です。</p>' },
  ];
  const plan = planGutenbergApply(RAW, diffs);
  eq(plan.planned.length, 2, 'planned 2');
  const res = applyGutenbergOps(RAW, plan.ops);
  ok(res.conflicts.length === 0, '競合なし (run は重ならない)');
  ok(res.raw.includes('新リード') && res.raw.includes('新しい締め本文'), '両 run 置換');
  ok(res.raw.includes('表の後ろの独立本文'), '中間 run(run1) は不動');
  ok(/wp:block \{"ref":12345\}/.test(res.raw) && /securities-cta/.test(res.raw), '保護ブロック全保持');
}

console.log('§5 保護ブロックの無い section は body 全体が1 run');
{
  const hIdx = idxOf('h2#導入セクション');
  const runs = segmentSectionRuns(RAW, BLOCKS, hIdx);
  eq(runs.length, 1, 'run 1 (段落2つが1 run)');
  const diffs = [{ id: 4, target_section: 'h2#導入セクション', change_type: 'rewrite_section', daiki_judgment: 'approved', content_before: runs[0].markup, content_after: '<p>書き換えた導入本文。新しい説明をここに置きます。</p>' }];
  const plan = planGutenbergApply(RAW, diffs);
  eq(plan.planned.length, 1, 'planned 1');
  const res = applyGutenbergOps(RAW, plan.ops);
  ok(res.raw.includes('書き換えた導入本文') && !res.raw.includes('導入の段落その1'), '本文置換');
  ok(res.raw.includes('<h2>導入セクション</h2>'), '見出しは保持 (run に含まれない)');
}

console.log('§6 insert_before / insert_after (再利用/CTA 保持)');
{
  const diffs = [
    { id: 5, target_section: 'h2#まとめ', change_type: 'insert_before', daiki_judgment: 'approved', content_after: '<h2>新セクション</h2><p>まとめ前に挿入。十分な長さ。</p>' },
    { id: 6, target_section: 'h3#1位：楽天証券', change_type: 'insert_after', daiki_judgment: 'approved', content_after: '<p>カード末尾に追記。十分な長さ。</p>' },
  ];
  const plan = planGutenbergApply(RAW, diffs);
  eq(plan.planned.length, 2, 'insert 2 planned');
  const res = applyGutenbergOps(RAW, plan.ops);
  ok(res.raw.includes('まとめ前に挿入') && res.raw.includes('カード末尾に追記'), '挿入反映');
  ok(/wp:block \{"ref":12345\}/.test(res.raw), '再利用ブロック保持');
  ok(res.raw.indexOf('新セクション') < res.raw.indexOf('<h2>まとめ'), 'insert_before は見出し前');
}

console.log('§7 drift / 未承認 / 非対象 / content_before 無し');
{
  const diffs = [
    { id: 7, target_section: 'h3#1位：楽天証券', change_type: 'rewrite_run', daiki_judgment: 'approved', content_before: '<!-- wp:paragraph -->\n<p>存在しない原文</p>\n<!-- /wp:paragraph -->', content_after: '<p>x</p>' },
    { id: 8, target_section: 'h2#導入セクション', change_type: 'rewrite_run', daiki_judgment: 'pending', content_before: 'x', content_after: '<p>x</p>' },
    { id: 9, target_section: 'meta:title', change_type: 'update_title', daiki_judgment: 'approved', content_after: '<title>x</title>' },
    { id: 10, target_section: 'h2#まとめ', change_type: 'rewrite_run', daiki_judgment: 'approved', content_after: '<p>x</p>' }, // content_before 無し
  ];
  const plan = planGutenbergApply(RAW, diffs);
  eq(plan.planned.length, 0, 'planned 0');
  ok(plan.skipped.some((s) => /見つからない/.test(s.reason)), 'drift skip');
  ok(plan.skipped.some((s) => /not approved/.test(s.reason)), '未承認 skip');
  ok(plan.skipped.some((s) => /非対象/.test(s.reason)), 'meta 非対象 skip');
  ok(plan.skipped.some((s) => /content_before/.test(s.reason)), 'content_before 無し skip');
}

console.log('§8 防御: content_before に保護ブロックが紛れていたら skip');
{
  const hIdx = idxOf('h3#1位：楽天証券');
  // 不正な content_before (再利用ブロックを含む)
  const bad = RAW.slice(BLOCKS[hIdx + 1].start, BLOCKS[hIdx + 2].end); // リード + 再利用ブロック
  const diffs = [{ id: 11, target_section: 'h3#1位：楽天証券', change_type: 'rewrite_run', daiki_judgment: 'approved', content_before: bad, content_after: '<p>x</p>' }];
  const plan = planGutenbergApply(RAW, diffs);
  eq(plan.planned.length, 0, 'planned 0');
  ok(/保護ブロックが含まれる/.test(plan.skipped[0].reason), '保護ブロック混入を検出して skip');
}

console.log(`\nALL PASS (${pass} assertions)`);
