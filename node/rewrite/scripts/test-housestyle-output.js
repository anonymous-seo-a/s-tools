#!/usr/bin/env node
'use strict';
/**
 * Phase 1 検証: 新ハウススタイル・プロンプトで diff を再生成し、content_after の
 * 段落分割・視覚要素・太字・可読性バリデータ挙動を確認する (一回性)。
 *
 * 既存セッションの analysis_output / notes を一時セッションに複製し、diff 生成だけ
 * 新プロンプトで再実行する (上流再計算なし、Sonnet 約$0.10×件数のみ)。
 *
 * Usage: node rewrite/scripts/test-housestyle-output.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env'), quiet: true });
const cheerio = require('cheerio');
const db = require('../db');
const { runDiffGeneration } = require('../llm-execution/diff-runner');
const { checkReadability } = require('../llm-execution/readability-checker');

// 先に劣化と判定した securities 記事の元セッション (analysis 再利用元)
const SOURCES = [
  { src_session: 53, post_id: 5978 },
  { src_session: 52, post_id: 6573 },
  { src_session: 45, post_id: 6944 },
];

const jaLen = (s) => (s || '').replace(/\s+/g, '').length;

function metricsOf(html) {
  const $ = cheerio.load(html || '', { decodeEntities: false });
  const ps = $('p').toArray().map((p) => jaLen($(p).text())).filter((n) => n > 0);
  const visual = $('ul,ol,table,figure,blockquote').length + $('[style*="background"],[class*="box-"]').length;
  const strong = $('strong,b').length;
  const totalChars = jaLen($('body').text());
  return {
    pCount: ps.length,
    pMax: ps.length ? Math.max(...ps) : 0,
    pMean: ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : 0,
    visual, strong, totalChars,
  };
}

(async () => {
  const conn = db.open();
  conn.pragma('foreign_keys = ON');
  const tempIds = [];

  for (const { src_session, post_id } of SOURCES) {
    const src = conn.prepare(
      `SELECT post_id, analysis_output, notes, genre, model_analysis, model_generation
       FROM master_rewrite_session WHERE id=?`
    ).get(src_session);
    if (!src || !src.analysis_output || !src.notes) { console.error(`src ${src_session} 不可`); continue; }

    const info = conn.prepare(
      `INSERT INTO master_rewrite_session
        (post_id, model_analysis, model_generation, triggered_by, status, genre, analysis_output, notes, policy_judgment, policy_judgment_at)
       VALUES (?,?,?,'housestyle-test','generating',?,?,?, 'approved', CURRENT_TIMESTAMP)`
    ).run(src.post_id, src.model_analysis, src.model_generation, src.genre, src.analysis_output, src.notes);
    const tmp = info.lastInsertRowid;
    tempIds.push(tmp);

    console.log(`\n${'='.repeat(70)}\n■ post ${post_id} (新プロンプトで diff 再生成 / temp session ${tmp})`);
    try {
      const r = await runDiffGeneration({ session_id: tmp, genre: src.genre });
      console.log(`  生成 diff: ${r.diffs_inserted}件 (rejected ${r.diffs_rejected})`);
    } catch (e) {
      console.error(`  生成失敗: ${e.message}`);
      continue;
    }

    const diffs = conn.prepare(
      `SELECT diff_order, target_section, change_type, content_after
       FROM master_rewrite_diff WHERE session_id=? ORDER BY diff_order`
    ).all(tmp);

    for (const d of diffs) {
      if (!d.content_after) continue;
      const m = metricsOf(d.content_after);
      const vio = checkReadability(d.content_after).violations;
      console.log(`\n  [#${d.diff_order} ${d.change_type} ${d.target_section}]`);
      console.log(`    段落=${m.pCount}個 mean=${m.pMean} max=${m.pMax} / 視覚要素=${m.visual} / 太字=${m.strong} (${m.totalChars}字)`);
      console.log(`    可読性: ${vio.length ? '⚠ ' + vio.map((v) => v.type + ':' + v.chars).join(', ') : 'OK'}`);
    }
    // 最初の rewrite_run の content_after を全文表示 (目視確認用)
    const sample = diffs.find((d) => d.change_type === 'rewrite_run' && d.content_after);
    if (sample) {
      console.log(`\n  --- 目視サンプル (#${sample.diff_order}) content_after 全文 ---`);
      console.log(sample.content_after.split('\n').map((l) => '    ' + l).join('\n'));
    }
  }

  // クリーンアップ
  const del = conn.prepare('DELETE FROM master_rewrite_session WHERE id=?');
  for (const id of tempIds) del.run(id);
  console.log(`\n\n[cleanup] temp session 削除: ${tempIds.join(', ')}`);
})().catch((e) => { console.error(e); process.exit(1); });
