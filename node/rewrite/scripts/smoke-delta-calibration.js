#!/usr/bin/env node
'use strict';
/**
 * 段階B B-4 smoke: delta-calibration 単体検証 (unit-test 相当)。
 *
 * 検証項目:
 *   1. バケット境界 (短語 / 短句 / 長文) の正しい振り分け
 *   2. 段階A PoC で観察された具体的 ▲ ケースが judgeGapFlag で no-gap に転じるか
 *   3. 段階A PoC で観察された ★ ケースが judgeGapFlag で no-gap (= ★ 維持) になるか
 *   4. 段階C 移行時の判定エントリポイント (judgeGapFlag) 一元化確認
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-delta-calibration.js
 */

const { DELTA_BUCKETS, bucketForQuery, deltaForQuery, judgeGapFlag } =
  require('../embedding-poc/delta-calibration');

let failed = 0;
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    console.error(`  ✗ ${msg}\n      actual=${actual}  expected=${expected}`);
    failed++;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

console.log('=== 1. バケット境界 ===');
assertEq(bucketForQuery('').label,        'short_word',   '空文字 → short_word');
assertEq(bucketForQuery('アコム').label,    'short_word',   '3 char (アコム) → short_word');
assertEq(bucketForQuery('プロミス').label,  'short_word',   '4 char (プロミス) → short_word');
assertEq(bucketForQuery('総量規制').label,  'short_word',   '4 char (総量規制) → short_word');
assertEq(bucketForQuery('SMBCモビット').label, 'short_phrase', '8 char (SMBCモビット) → short_phrase');
assertEq(bucketForQuery('楽天銀行スーパーローン').label, 'short_phrase', '11 char → short_phrase');
assertEq(bucketForQuery('即日融資 カードローン 金利 比較').label, 'full_claim', '16 char → full_claim');
assertEq(bucketForQuery('総量規制により年収の3分の1を超える借入は原則禁止').label, 'full_claim', '27 char → full_claim');

assertEq(deltaForQuery('アコム'), -0.05, 'deltaForQuery アコム = -0.05');
assertEq(deltaForQuery('SMBCモビット'), 0.00, 'deltaForQuery SMBCモビット = 0.00');
assertEq(deltaForQuery('総量規制により年収の3分の1を超える借入は原則禁止'), 0.05, 'deltaForQuery 長文 = 0.05');

console.log('\n=== 2. 段階A PoC で偽陽性だった ▲ ケース (post 11077) ===');
// 段階A PoC で観察された数値 (δ=0.05 固定では gap、較正後 no-gap になるべき)
const reverse_divergent_cases = [
  { name: 'アイフル',       self: 0.489, comp: 0.486, expected_gap: 0 },
  { name: 'アコム',         self: 0.654, comp: 0.635, expected_gap: 0 },
  { name: 'SMBCモビット',   self: 0.596, comp: 0.591, expected_gap: 0 },
  { name: 'プロミス',       self: 0.471, comp: 0.492, expected_gap: 0 },
  { name: 'レイク',         self: 0.457, comp: 0.495, expected_gap: 0 },
];
for (const c of reverse_divergent_cases) {
  const r = judgeGapFlag({ self_max: c.self, comp_max: c.comp, query_text: c.name });
  assertEq(r.gap_flag, c.expected_gap,
    `"${c.name}" (self=${c.self} comp=${c.comp}) → gap_flag=${r.gap_flag} bucket=${r.bucket_label} threshold=${r.threshold.toFixed(3)}`);
}

console.log('\n=== 3. 段階A PoC で ★ embedding 救出だった長文 fact ===');
// 較正後も ★ 維持 (gap_flag=0 = no-gap、fact-set との divergent を維持)
const star_cases = [
  { text: '総量規制により年収の3分の1を超える借入は原則禁止', self: 0.658, comp: 0.576, expected_gap: 0 },
  { text: '貸金業者の登録数は1,538社ある（金融庁データ参照）',  self: 0.604, comp: 0.547, expected_gap: 0 },
];
for (const c of star_cases) {
  const r = judgeGapFlag({ self_max: c.self, comp_max: c.comp, query_text: c.text });
  assertEq(r.gap_flag, c.expected_gap,
    `★ "${c.text.slice(0, 30)}..." (self=${c.self} comp=${c.comp}) → gap_flag=${r.gap_flag} bucket=${r.bucket_label}`);
}

console.log('\n=== 4. 正常 gap 判定 (self が comp 大幅下回り) ===');
// 自記事に明確に存在しないケース、長文 δ=+0.05 でも gap 判定
const gap_cases = [
  { text: '即日融資と謳っていても金融機関指定の時間内に申込みをしないと当日中に借り入れができない場合がある', self: 0.500, comp: 0.700, expected_gap: 1 },
];
for (const c of gap_cases) {
  const r = judgeGapFlag({ self_max: c.self, comp_max: c.comp, query_text: c.text });
  assertEq(r.gap_flag, c.expected_gap,
    `gap "${c.text.slice(0, 30)}..." (self=${c.self} comp=${c.comp}) → gap_flag=${r.gap_flag}`);
}

console.log('\n=== 5. DELTA_BUCKETS 不変性 ===');
const originalLength = DELTA_BUCKETS.length;
try {
  DELTA_BUCKETS.push({ max_length: 999, delta: 999, label: 'mutation' });
  console.error('  ✗ DELTA_BUCKETS が mutable (Object.freeze 失敗)');
  failed++;
} catch (e) {
  console.log(`  ✓ DELTA_BUCKETS frozen (push が ${e.constructor.name} で reject)`);
}
assertEq(DELTA_BUCKETS.length, originalLength, 'DELTA_BUCKETS 長さ不変');

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nsmoke OK');
