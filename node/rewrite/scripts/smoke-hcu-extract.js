#!/usr/bin/env node
'use strict';
/**
 * 案B (#5) HCU 38 項目 LLM 評価 smoke runner.
 *
 * Usage:
 *   node node/rewrite/scripts/smoke-hcu-extract.js --post-id 7170
 *
 * 確認項目 (戻し条件チェック):
 *   - 38 項目すべてに pass / comment が生成されているか
 *   - JSON パース成功 (失敗なら戻し)
 *   - polarity 補正後の compliance 集計が妥当か
 *   - comment が 50 字以内 (大幅超過なら戻し)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

function getArg(name) {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}

(async () => {
  const postIdArg = getArg('post-id');
  if (!postIdArg) {
    console.error('Usage: smoke-hcu-extract.js --post-id <ID>');
    process.exit(1);
  }
  const postId = parseInt(postIdArg, 10);

  const { evaluateHcuForPost, items } = require('../hcu-checklist/extract');

  const t0 = Date.now();
  const r = await evaluateHcuForPost(postId);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // polarity 補正で compliance 計算 (insert.js が同ロジックを Phase 3 で実装)
  const itemsById = new Map(items.items.map((it) => [it.id, it]));
  let compliant = 0;
  let nonCompliant = 0;
  let unknown = 0;
  const details = [];
  for (const ev of r.evaluations) {
    const def = itemsById.get(ev.id);
    if (!def) {
      unknown++;
      continue;
    }
    const isCompliant =
      (def.polarity === 'positive' && ev.pass === true) ||
      (def.polarity === 'negative' && ev.pass === false);
    if (isCompliant) compliant++;
    else nonCompliant++;
    details.push({ id: ev.id, polarity: def.polarity, pass: ev.pass, compliant: isCompliant, comment: ev.comment });
  }

  console.log('=== HCU Evaluation ===');
  console.log(`post_id=${r.post_id}`);
  console.log(`title=${r.title}`);
  console.log(`source_url=${r.source_url}`);
  console.log(`struct_chars=${r.struct_chars} body_used=${r.body_chars}`);
  console.log(`checklist_version=${r.checklist_version} total_count=${r.total_count}`);
  console.log(`evaluations_returned=${r.evaluations.length} (expected ${r.total_count})`);
  console.log(`unknown_id=${unknown}`);
  console.log(`usage: in=${r.usage.input_tokens} out=${r.usage.output_tokens}`);
  console.log('');
  console.log(`compliance: compliant=${compliant} non_compliant=${nonCompliant}`);
  console.log(`pass_rate (compliance / total): ${(compliant / r.total_count).toFixed(3)}`);

  // comment length 統計 (戻し条件: 50 字大幅超過)
  const commentLens = r.evaluations.map((e) => (e.comment || '').length);
  const maxLen = Math.max(0, ...commentLens);
  const avgLen = commentLens.length ? (commentLens.reduce((a, b) => a + b, 0) / commentLens.length).toFixed(1) : 0;
  const over50 = commentLens.filter((l) => l > 50).length;
  const over75 = commentLens.filter((l) => l > 75).length;
  console.log(`comment length: avg=${avgLen} max=${maxLen} over_50=${over50} over_75=${over75}`);

  // 欠損 (項目欠落) 検出
  const returnedIds = new Set(r.evaluations.map((e) => e.id));
  const missing = items.items.filter((it) => !returnedIds.has(it.id)).map((it) => it.id);
  if (missing.length) {
    console.log(`missing_ids: ${missing.join(',')}`);
  } else {
    console.log('missing_ids: none');
  }

  // サンプル詳細 (compliant 3 件 + non-compliant 3 件)
  console.log('\n=== Compliant samples (top 3) ===');
  for (const d of details.filter((x) => x.compliant).slice(0, 3)) {
    console.log(`  #${d.id} [${d.polarity}] pass=${d.pass} → compliant: ${d.comment}`);
  }
  console.log('\n=== Non-compliant samples (top 3) ===');
  for (const d of details.filter((x) => !x.compliant).slice(0, 3)) {
    console.log(`  #${d.id} [${d.polarity}] pass=${d.pass} → non-compliant: ${d.comment}`);
  }

  console.log(`\nelapsed: ${elapsed}s`);
})().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
