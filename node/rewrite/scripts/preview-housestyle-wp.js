#!/usr/bin/env node
'use strict';
/**
 * Phase 1 視覚確認: 新プロンプトのリライト結果を「実WPテーマCSS上」でレンダリングし
 * Before/After スクショを撮る。本番は一切変更しない (実ページを開いて .editor-content を
 * クライアント側で差し替えるだけ)。
 *
 * Usage: node rewrite/scripts/preview-housestyle-wp.js [--src-session 53 --post 5978]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env'), quiet: true });
const path = require('path');
const { chromium } = require('playwright');
const db = require('../db');
const { runDiffGeneration } = require('../llm-execution/diff-runner');
const { planGutenbergApply, applyGutenbergOps } = require('../apply/gutenberg-apply');

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; }
const SRC_SESSION = parseInt(arg('src-session', '53'), 10);
const POST = parseInt(arg('post', '5978'), 10);

function wpRoot() { const r = (process.env.WP_API_BASE_URL || '').replace(/\/$/, ''); return /\/wp-json\/wp\/v\d+/.test(r) ? r : `${r}/wp-json/wp/v2`; }
const AUTH = 'Basic ' + Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
async function wpGet(p) { const r = await fetch(`${wpRoot()}${p}`, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(`WP ${r.status} ${p}`); return r.json(); }

(async () => {
  const conn = db.open();
  conn.pragma('foreign_keys = ON');

  // 1. analysis 再利用で一時セッション生成 → diff 生成 (新プロンプト)
  const src = conn.prepare(`SELECT post_id, analysis_output, notes, genre, model_analysis, model_generation FROM master_rewrite_session WHERE id=?`).get(SRC_SESSION);
  const info = conn.prepare(
    `INSERT INTO master_rewrite_session (post_id, model_analysis, model_generation, triggered_by, status, genre, analysis_output, notes, policy_judgment, policy_judgment_at)
     VALUES (?,?,?,'housestyle-preview','generating',?,?,?, 'approved', CURRENT_TIMESTAMP)`
  ).run(src.post_id, src.model_analysis, src.model_generation, src.genre, src.analysis_output, src.notes);
  const tmp = info.lastInsertRowid;
  console.log(`temp session ${tmp} / post ${POST} 生成中...`);
  const r = await runDiffGeneration({ session_id: tmp, genre: src.genre });
  console.log(`diff ${r.diffs_inserted}件`);

  // 2. 全 diff を承認扱いにして適用 (プレビュー用、DBは触らずメモリ上で)
  const diffs = conn.prepare(
    `SELECT id, target_section, change_type, content_before, content_after, daiki_edit_content FROM master_rewrite_diff WHERE session_id=? ORDER BY diff_order`
  ).all(tmp).map((d) => ({ ...d, daiki_judgment: 'approved' }));

  const wp = await wpGet(`/posts/${POST}?context=edit&_fields=content,link`);
  const rawBefore = wp.content.raw;
  const link = wp.link;
  const { ops } = planGutenbergApply(rawBefore, diffs);
  const { raw: rawAfter, applied, conflicts } = applyGutenbergOps(rawBefore, ops);
  console.log(`適用 ops=${ops.length} applied=${applied} conflicts=${conflicts.length}`);

  // 変更セクションの見出しテキスト (target_section の 'h*#text' から抽出)
  const sectionTexts = [...new Set(diffs
    .filter((d) => /^h[1-4]#/.test(d.target_section || ''))
    .map((d) => d.target_section.replace(/^h[1-4]#/, '')))];

  // 3. 実ページを開き、.editor-content を差し替えて「変更セクション単位」で Before/After スクショ
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 760, height: 1200 }, userAgent: 'Mozilla/5.0 FundIt-StyleBot/1.0', deviceScaleFactor: 2 });
  await page.goto(link, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => { document.querySelectorAll('.ad, .adsbygoogle, iframe').forEach((e) => e.remove()); });
  const outDir = path.resolve(__dirname, '..', '..', '..', 'design', 'preview');
  require('fs').mkdirSync(outDir, { recursive: true });

  // 見出しテキストのセクション(見出し〜次見出し直前)を一時divで包む→ id を返す
  const wrapSection = (headingText) => page.evaluate((txt) => {
    const norm = (s) => (s || '').replace(/\s+/g, '');
    const c = document.querySelector('.editor-content');
    document.querySelectorAll('#__secwrap').forEach((w) => { while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w); w.remove(); });
    const heads = [...c.querySelectorAll('h2,h3,h4')];
    const h = heads.find((e) => norm(e.textContent).includes(norm(txt)));
    if (!h) return false;
    const group = [h];
    let n = h.nextElementSibling;
    while (n && !/^H[2-4]$/.test(n.tagName)) { group.push(n); n = n.nextElementSibling; }
    const wrap = document.createElement('div');
    wrap.id = '__secwrap';
    wrap.style.background = '#fff'; wrap.style.padding = '8px';
    h.parentNode.insertBefore(wrap, h);
    group.forEach((g) => wrap.appendChild(g));
    return true;
  }, headingText);

  async function shoot(tag) {
    for (let i = 0; i < sectionTexts.length; i++) {
      const ok = await wrapSection(sectionTexts[i]);
      if (!ok) { console.log(`  [${tag}] "${sectionTexts[i]}" 見つからず`); continue; }
      const file = path.join(outDir, `${POST}_sec${i + 1}_${tag}.png`);
      await page.locator('#__secwrap').screenshot({ path: file });
      console.log(`  [${tag}] sec${i + 1} "${sectionTexts[i].slice(0, 18)}" → ${path.basename(file)}`);
    }
  }

  console.log('BEFORE (現在の公開版):');
  await shoot('before');

  await page.evaluate(({ html }) => { const el = document.querySelector('.editor-content'); if (el) el.innerHTML = html; }, { html: rawAfter });
  await page.waitForTimeout(800);
  console.log('AFTER (新プロンプト):');
  await shoot('after');

  await browser.close();

  // 4. クリーンアップ
  conn.prepare('DELETE FROM master_rewrite_diff WHERE session_id=?').run(tmp);
  conn.prepare('DELETE FROM master_rewrite_session WHERE id=?').run(tmp);
  console.log(`cleanup session ${tmp} 削除`);
})().catch((e) => { console.error(e); process.exit(1); });
