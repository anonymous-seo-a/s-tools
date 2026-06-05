'use strict';
// buildRunStructuredView + makeRunResolver + プロンプト整形 + content_before 解決の offline 検証。
const assert=require('assert');
const { buildRunStructuredView, makeRunResolver, parseTopLevelBlocks, segmentSectionRuns, planGutenbergApply, applyGutenbergOps } = require('../apply/gutenberg-apply');
let pass=0; const ok=(c,m)=>{assert.ok(c,m);console.log('  ✓',m);pass++;};
const eq=(a,b,m)=>{assert.strictEqual(a,b,`${m} (got ${JSON.stringify(a)})`);console.log('  ✓',m);pass++;};

const RAW=[
 '<!-- wp:heading -->\n<h3>1位：楽天証券</h3>\n<!-- /wp:heading -->',
 '<!-- wp:paragraph -->\n<p>リード本文。手数料が業界最安水準です。</p>\n<!-- /wp:paragraph -->',
 '<!-- wp:soico-cta/securities-spec-table {"p":"rakuten"} /-->',
 '<!-- wp:paragraph -->\n<p>表の後ろの独立本文。米国株が豊富です。</p>\n<!-- /wp:paragraph -->',
 '<!-- wp:soico-cta/securities-cta /-->',
 '<!-- wp:paragraph -->\n<p>締め本文。総合1位です。</p>\n<!-- /wp:paragraph -->',
].join('\n\n');

console.log('§1 buildRunStructuredView');
const view=buildRunStructuredView(RAW);
eq(view.length,1,'section 1');
const s=view[0];
eq(s.target_section,'h3#1位：楽天証券','target_section');
eq(s.runs.length,3,'run 3');
// items の順序: run0, protected(spec), run1, protected(cta), run2
const kinds=s.items.map(i=>i.kind==='run'?`run${i.run_index}`:`P:${i.type}`);
eq(kinds.join(' '), 'run0 P:soico-cta/securities-spec-table run1 P:soico-cta/securities-cta run2','items 順序が本文/保護ブロック交互');
ok(s.items.find(i=>i.kind==='protected').label.includes('部品'),'保護ラベル');

console.log('§2 makeRunResolver で content_before 解決');
const resolve=makeRunResolver(view);
ok(resolve('h3#1位：楽天証券',1).includes('表の後ろの独立本文'),'run1 markup 解決');
ok(resolve('h3#1位：楽天証券',1).indexOf('soico-cta')<0,'run markup に保護ブロック無し');
eq(resolve('h3#1位：楽天証券',9),null,'存在しない run は null');

console.log('§3 解決した content_before で apply が run1 を位置保持置換');
const diffs=[{id:1,target_section:'h3#1位：楽天証券',change_type:'rewrite_run',run_index:1,daiki_judgment:'approved',
  content_before:resolve('h3#1位：楽天証券',1), content_after:'<p>NISA対応で書き換えた表の後ろ本文。</p>'}];
const plan=planGutenbergApply(RAW,diffs); eq(plan.planned.length,1,'planned 1');
const res=applyGutenbergOps(RAW,plan.ops);
ok(res.raw.includes('NISA対応で書き換えた'),'run1 置換反映');
ok(res.raw.includes('リード本文')&&res.raw.includes('締め本文'),'run0/run2 不動');
ok(res.raw.indexOf('spec-table')<res.raw.indexOf('NISA対応')&&res.raw.indexOf('NISA対応')<res.raw.indexOf('securities-cta'),'表→新run1→CTA の位置保持');

console.log(`\nALL PASS (${pass})`);
