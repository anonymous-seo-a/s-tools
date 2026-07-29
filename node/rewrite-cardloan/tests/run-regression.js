'use strict';

// ─────────────────────────────────────────────────────────────
// Phase C 回帰検証ランナー
//   各ケースを L1 (master_rules verified 禁止表現の決定論 indexOf) と
//   L3 (keeper-bridge checkArticleGate) に通し、検出マトリクスを出力する。
//   合格基準: 全ケースが L1 または L3 (blocking) で検出されること。
//   既知ギャップ (公式レギュ未受領のレイク等) は GAP として明示する。
//
// 実行 (本番VPS): node tests/run-regression.js [--case <id>]
// ─────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const { open, initSchema } = require('../db');
const bridge = require('../keeper-bridge');

const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'regression-corpus.json'), 'utf8'));

function l1Check(conn, text) {
  const rules = conn.prepare(
    `SELECT ng_text FROM master_rules
     WHERE status='verified' AND detection_layer=1 AND rule_type='禁止表現' AND condition='常に'`
  ).all();
  return rules.filter((r) => text.includes(r.ng_text)).map((r) => r.ng_text);
}

async function main() {
  const onlyIdx = process.argv.indexOf('--case');
  const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;
  initSchema();
  const conn = open();
  const results = [];
  for (const c of corpus.cases) {
    if (only && c.id !== only) continue;
    const l1hits = l1Check(conn, c.text);
    let l3 = null;
    let l3err = null;
    try {
      l3 = bridge.checkArticleGate(c.products, c.text);
    } catch (e) {
      l3err = e.message;
    }
    const l3blocking = l3 ? l3.blocking.length : 0;
    const detected = l1hits.length > 0 || l3blocking > 0;
    results.push({
      id: c.id,
      detected,
      l1: l1hits,
      l3_blocking: l3 ? l3.blocking.map((v) => `[${v.severity}]${(v.excerpt || '').slice(0, 24)}`) : [],
      l3_low: l3 ? l3.violations.filter((v) => v.severity === 'low').length : 0,
      l3_error: l3err,
      expect: c.expect,
    });
    const mark = detected ? '✅' : '❌';
    console.log(`${mark} ${c.id}`);
    console.log(`   期待: ${c.expect}`);
    if (l1hits.length) console.log(`   L1: ${l1hits.join(' / ')}`);
    if (l3blocking) console.log(`   L3: ${results[results.length - 1].l3_blocking.join(' / ')}`);
    if (l3err) console.log(`   L3実行エラー: ${l3err.slice(0, 120)}`);
    if (!detected) console.log('   ⚠ MISS — ギャップとして記録');
  }
  const pass = results.filter((r) => r.detected).length;
  console.log(`\n===== 回帰結果: ${pass}/${results.length} 検出 =====`);
  const misses = results.filter((r) => !r.detected);
  if (misses.length) {
    console.log('MISS一覧:');
    for (const m of misses) console.log(`  - ${m.id}: ${m.expect}`);
  }
  fs.writeFileSync(path.join(__dirname, 'regression-result.json'),
    JSON.stringify({ ran_at: new Date().toISOString(), pass, total: results.length, results }, null, 1));
}

main();
