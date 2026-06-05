'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

// apply engine (buildDom / planApply / applyOps) の純粋ロジック検証。
// diff-runner の content_before 補完 (extractSelfArticle.raw_html_block) と
// apply の section 突合パリティ、drift skip、複数置換、非 h*# skip を確認する。

const assert = require('assert');
const { _applyEngine } = require('../api/judgment');
const { extractSelfArticle } = require('../../shared/wp-structured');
const { buildDom, planApply, applyOps } = _applyEngine;

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('  ✓', msg); pass++; };

// WP content.rendered を模した HTML (entity / table / 改行 / 複数 section)
const RENDERED = [
  '<h2>消費者金融と銀行カードローンの違い</h2>',
  '<p>金利は<strong>年18.0&#37;</strong>程度です。AT&amp;T 例。銀行は上限金利が低い傾向にあります。</p>',
  '<table><tr><td>A &lt; B</td></tr></table>',
  '<h2>即日融資の条件</h2>',
  '<p>最短30分で審査が完了し、当日中に振込まで完了する場合があります。申込は午前中が確実です。</p>',
  '<h2>まとめ</h2>',
  '<p>以上、消費者金融と銀行カードローンの違いと即日融資の条件について解説しました。</p>',
].join('\n');

// 差分生成時と同一パイプラインで content_before (= raw_html_block) を得る
const struct = extractSelfArticle(RENDERED);
const sec1 = struct.sections.find((s) => s.heading === '消費者金融と銀行カードローンの違い');
const sec2 = struct.sections.find((s) => s.heading === '即日融資の条件');
assert.ok(sec1 && sec2, 'fixture sections found');

console.log('§1 正常系: h*# section 完全一致 → planned');
{
  const diffs = [{
    id: 1, target_section: 'h2#消費者金融と銀行カードローンの違い', daiki_judgment: 'approved',
    content_before: sec1.raw_html_block, content_after: '<h2>消費者金融と銀行の違い(改)</h2><p>更新後の本文。</p>',
  }];
  const $ = buildDom(RENDERED);
  const plan = planApply($, diffs);
  ok(plan.planned.length === 1, 'planned 1 (raw_html_block パリティ成立)');
  ok(plan.skipped.length === 0, 'skipped 0');
  const out = applyOps($, plan.planned, plan.ops);
  ok(out.includes('消費者金融と銀行の違い(改)'), 'content_after が反映');
  ok(!out.includes('A &lt; B') && !out.includes('年18.0'), '旧 section (table含む) が消えた');
  ok(out.includes('即日融資の条件') && out.includes('まとめ'), '他 section は保持');
}

console.log('§2 drift: 現 HTML が編集され content_before 不一致 → skip (安全側)');
{
  const drifted = RENDERED.replace('最短30分', '最短20分'); // sec2 を別 section にして使う想定ではなく sec1 を狙う
  // sec1 を狙うが HTML を別 section で改変しても sec1 一致するので、sec1 自体を改変
  const drifted2 = RENDERED.replace('年18.0', '年17.5');
  const diffs = [{
    id: 2, target_section: 'h2#消費者金融と銀行カードローンの違い', daiki_judgment: 'approved',
    content_before: sec1.raw_html_block, content_after: '<h2>x</h2><p>y</p>',
  }];
  const $ = buildDom(drifted2);
  const plan = planApply($, diffs);
  ok(plan.planned.length === 0, 'planned 0');
  ok(/drifted/.test(plan.skipped[0].reason), `skip 理由が drift: "${plan.skipped[0].reason}"`);
}

console.log('§3 複数 section 同時置換: 兄弟構成変化の影響を受けない');
{
  const diffs = [
    { id: 3, target_section: 'h2#消費者金融と銀行カードローンの違い', daiki_judgment: 'approved',
      content_before: sec1.raw_html_block, content_after: '<h2>S1新</h2><p>p1</p>' },
    { id: 4, target_section: 'h2#即日融資の条件', daiki_judgment: 'approved',
      content_before: sec2.raw_html_block, content_after: '<h2>S2新</h2><p>p2</p>' },
  ];
  const $ = buildDom(RENDERED);
  const plan = planApply($, diffs);
  ok(plan.planned.length === 2, 'planned 2');
  const out = applyOps($, plan.planned, plan.ops);
  ok(out.includes('S1新') && out.includes('S2新'), '両 section が置換');
  ok(out.includes('まとめ'), '無関係 section 保持');
}

console.log('§3.5 script 保持: 置換対象外 section の script は適用後も残る + パリティ成立');
{
  // 「導入」を置換、script は「本編」section 側に配置 → 本編は非置換なので script 保持されるべき。
  const withScript = [
    '<h2>導入</h2>',
    '<p>これは導入のための十分に長い段落であり閾値50字を超えています。確実に超過させます。</p>',
    '<h2>本編セクションで非置換の見出し</h2>',
    '<p>本編の説明文。これも十分に長い段落であり50字の閾値を確実に超えるようにしています。</p>',
    '<script>window.cta1=1;</script>',
  ].join('\n');
  const st = extractSelfArticle(withScript);
  const secIntro = st.sections.find((s) => s.heading === '導入');
  // 導入 section に script は無いが、本編 section の span 内に script がある。
  const diffs = [{
    id: 8, target_section: 'h2#導入', daiki_judgment: 'approved',
    content_before: secIntro.raw_html_block, content_after: '<h2>導入(改)</h2><p>新しい導入文。</p>',
  }];
  const $ = buildDom(withScript);
  const plan = planApply($, diffs);
  ok(plan.planned.length === 1, 'planned 1 (script 混在 DOM でも raw_html_block パリティ成立)');
  const out = applyOps($, plan.planned, plan.ops);
  ok(out.includes('導入(改)'), '導入 section 置換');
  ok(out.includes('window.cta1'), '非置換 section の script が適用後も保持される (データ損失なし)');
}

console.log('§4 非 h*# (meta) → skip');
{
  const diffs = [{ id: 5, target_section: 'meta:description', daiki_judgment: 'approved',
    content_before: 'x'.repeat(60), content_after: '新しい説明文' }];
  const $ = buildDom(RENDERED);
  const plan = planApply($, diffs);
  ok(plan.planned.length === 0 && /not a body heading/.test(plan.skipped[0].reason), 'meta は本文 skip');
}

console.log('§5 未承認 / 短すぎ content_before → skip');
{
  const diffs = [
    { id: 6, target_section: 'h2#まとめ', daiki_judgment: 'pending',
      content_before: struct.sections.find((s)=>s.heading==='まとめ').raw_html_block, content_after: '<h2>z</h2>' },
    { id: 7, target_section: 'h2#まとめ', daiki_judgment: 'approved',
      content_before: '<h2>短</h2>', content_after: '<h2>z</h2>' },
  ];
  const $ = buildDom(RENDERED);
  const plan = planApply($, diffs);
  ok(plan.planned.length === 0, 'planned 0');
  ok(plan.skipped.some((s)=>/not approved/.test(s.reason)), 'pending skip');
  ok(plan.skipped.some((s)=>/too short/.test(s.reason)), 'too short skip');
}

console.log(`\nALL PASS (${pass} assertions)`);
