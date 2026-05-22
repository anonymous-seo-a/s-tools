'use strict';

/**
 * smoke: shared/wp-structured.js の extractSelfArticle + findSectionByTargetSection
 *
 * 対象: post 11077 (cardloan、Phase 3 L0 判定 UI で実物が出ているため再現性高い)
 *
 * 検証観点:
 *   - sections[] 各 entry に raw_html_block が存在
 *   - "h3#即日融資可能なカードローン一覧" → raw_html_block にテーブル含む
 *   - "h3#金利の差でどれくらい返済額が変わるのか" → raw_html_block にテーブル含む
 *   - findSectionByTargetSection が target_section 文字列を解決できる
 *   - 不正な target_section (meta:* / p#…) は null を返す
 */

require('dotenv').config();
const { extractSelfArticle, findSectionByTargetSection } = require('../../shared/wp-structured');

const POST_ID = 11077;

async function fetchWp(postId) {
  const url = process.env.WP_API_BASE_URL + '/posts/' + postId;
  const auth = Buffer.from(process.env.WP_API_USERNAME + ':' + process.env.WP_API_APP_PASSWORD).toString('base64');
  const res = await fetch(url, { headers: { Authorization: 'Basic ' + auth } });
  if (!res.ok) throw new Error('WP fetch ' + postId + ': HTTP ' + res.status);
  const p = await res.json();
  return p.content?.rendered || '';
}

(async () => {
  let pass = 0;
  let fail = 0;
  const log = (label, ok, detail) => {
    const tag = ok ? '✓' : '✗';
    console.log('  ' + tag + ' ' + label + (detail ? '  → ' + detail : ''));
    if (ok) pass++; else fail++;
  };

  console.log('[smoke-wp-structured] post=' + POST_ID);
  const html = await fetchWp(POST_ID);
  console.log('  raw html length:', html.length);

  const struct = extractSelfArticle(html);
  log('extractSelfArticle returns sections[]',
    Array.isArray(struct.sections) && struct.sections.length > 0,
    'sections=' + struct.sections.length);

  log('all sections have raw_html_block',
    struct.sections.every((s) => typeof s.raw_html_block === 'string' && s.raw_html_block.length > 0),
    'sample length=' + struct.sections[0].raw_html_block.length);

  // ターゲット h3 検証
  const targets = [
    { ts: 'h3#即日融資可能なカードローン一覧', mustContain: ['<table', '即日融資'] },
    { ts: 'h3#金利の差でどれくらい返済額が変わるのか', mustContain: ['<table', '金利'] },
  ];
  for (const t of targets) {
    const sec = findSectionByTargetSection(struct, t.ts);
    if (!sec) {
      log('findSectionByTargetSection "' + t.ts + '"', false, 'not found');
      continue;
    }
    const html = sec.raw_html_block || '';
    const found = t.mustContain.filter((tok) => html.includes(tok));
    log('section "' + t.ts + '" raw_html_block contains expected tokens',
      found.length === t.mustContain.length,
      'len=' + html.length + ' found=' + found.join(',') + (found.length === t.mustContain.length ? '' : ' MISSING=' + t.mustContain.filter((tok) => !html.includes(tok)).join(',')));
  }

  // 不正 target_section
  for (const ts of ['meta:title', 'p#3-2', 'outline:section-3', 'foo']) {
    const sec = findSectionByTargetSection(struct, ts);
    log('findSectionByTargetSection "' + ts + '" → null', sec === null, 'result=' + (sec ? 'object' : sec));
  }

  // text と raw_html_block の整合 (空白を除去して比較、<strong>/<mark> 境界で空白挿入が起きるため)
  const sample = findSectionByTargetSection(struct, 'h3#即日融資可能なカードローン一覧');
  if (sample) {
    const norm = (s) => s.replace(/\s+/g, '');
    const blockText = sample.raw_html_block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const probe = sample.text.slice(0, 80);
    log('raw_html_block strip-text includes section.text core',
      norm(blockText).includes(norm(probe)) || sample.text.length === 0,
      'raw_strip_len=' + blockText.length + ' section.text_len=' + sample.text.length);
  }

  console.log('\n[smoke-wp-structured] pass=' + pass + ' fail=' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('[smoke-wp-structured] error:', e.message);
  process.exit(1);
});
