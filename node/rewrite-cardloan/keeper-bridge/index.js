'use strict';

// ─────────────────────────────────────────────────────────────
// keeper-bridge — cardloan-keeper (一次情報管理者) との接続層
//
// 供給は file-based + CLI の疎結合 (fact-keeper 供給思想と同型):
//   - 商材レジストリ: keeper data/export/products.json (export_bridge.py が生成)
//   - L0 レギュ論点 : regstore.py query --json (BM25 検索)
//   - L3 最終ゲート : check_article.py --json (公式規制+法令 → 違反候補)
//
// 方針: L3 ゲートは fail-closed (ゲート自体の失敗 = 適用ブロック)。
//   YMYL 領域で「チェックできなかったので通す」は許容しない。
//   緊急回避は環境変数 KEEPER_GATE_SKIP=1 (使用は Daiki 判断のみ)。
// ─────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const KEEPER_DIR = process.env.KEEPER_DIR
  || path.join(__dirname, '..', '..', '..', 'cardloan-keeper');
const KEEPER_PY = path.join(KEEPER_DIR, '.venv', 'bin', 'python');
const PRODUCTS_JSON = path.join(KEEPER_DIR, 'data', 'export', 'products.json');

let productsCache = null;
let productsMtime = 0;

function loadProducts() {
  const st = fs.statSync(PRODUCTS_JSON);
  if (!productsCache || st.mtimeMs !== productsMtime) {
    productsCache = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf8'));
    productsMtime = st.mtimeMs;
  }
  return productsCache;
}

// 記事テキストから言及商材を検出 (alias 部分一致)。
// 停止商材 (status=stopped) も検出対象に含める — 記事に登場すること自体が要検知情報。
function detectProducts(text) {
  const hits = [];
  for (const p of loadProducts()) {
    const found = (p.aliases || []).some((a) => text.includes(a));
    if (found) hits.push(p);
  }
  return hits;
}

function runKeeperScript(script, args, stdinText, timeoutMs) {
  const r = spawnSync(KEEPER_PY, [path.join(KEEPER_DIR, 'scripts', script), ...args], {
    input: stdinText || undefined,
    encoding: 'utf8',
    timeout: timeoutMs || 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`keeper ${script} 実行失敗: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(`keeper ${script} exit=${r.status}: ${(r.stderr || '').slice(0, 400)}`);
  }
  return r.stdout;
}

// L0: 該当商材のレギュレーション論点を取得 (プロンプト注入用)。
function queryRegulations(productIds, queryText, { k = 8 } = {}) {
  if (!productIds.length) return [];
  const out = runKeeperScript('regstore.py',
    ['query', productIds.join(','), queryText, '--json'], null, 60000);
  const rows = JSON.parse(out.trim().split('\n').pop());
  return rows.slice(0, k);
}

// L0 注入ブロックのレンダリング (user プロンプト末尾に付す)。
function renderRegulationBlock(productIds, queryText) {
  let topics;
  try {
    topics = queryRegulations(productIds, queryText);
  } catch (e) {
    // L0 は予防層のため fail-open (L1/L2/L3 が防衛線)。ただし警告は残す。
    console.warn(`[keeper-bridge] L0 レギュ取得失敗 (続行): ${e.message}`);
    return '';
  }
  if (!topics.length) return '';
  const lines = topics.map((t) => `- [${t.tier === 'client_official' ? '公式' : '推定'}] ${t.context}: ${t.text.replace(/\n/g, ' ').slice(0, 220)}`);
  return [
    '',
    '# 対象商材のレギュレーション (cardloan-keeper regstore / 遵守必須)',
    `対象: ${productIds.join(', ')}`,
    ...lines,
    '上記の指定表記・完全NG・注記義務に反する文言を生成しないこと。「最短」「無利息」等の規制対象値には必須注記を必ず併記すること。',
  ].join('\n');
}

// L3: 適用前最終ゲート。fail-closed。
// 返り値: { ok, violations, blocking, overall, rules_checked } / throw = ゲート実行不能 (ブロック扱い)
function checkArticleGate(productIds, plainText) {
  if (process.env.KEEPER_GATE_SKIP === '1') {
    console.warn('[keeper-bridge] ⚠ KEEPER_GATE_SKIP=1 により L3 ゲートをスキップ');
    return { ok: true, skipped: true, violations: [], blocking: [], overall: 'gate skipped' };
  }
  const ids = productIds.length ? productIds : ['acom']; // 商材検出ゼロでも共通則+法令で検査する
  const out = runKeeperScript('check_article.py', [ids.join(','), '--json'], plainText, 180000);
  const res = JSON.parse(out.trim().split('\n').pop());
  const violations = res.violations || [];
  // high/medium はブロック。low は警告として通す (判定タブに表示)。
  const blocking = violations.filter((v) => v.severity === 'high' || v.severity === 'medium');
  return {
    ok: blocking.length === 0,
    violations,
    blocking,
    overall: res.overall || '',
    rules_checked: res.rules_checked || 0,
  };
}

// Gutenberg raw → 検査用プレーンテキスト (ブロックコメント・タグ除去)。
function rawToPlainText(raw) {
  return String(raw)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[ \t　]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  KEEPER_DIR,
  loadProducts,
  detectProducts,
  queryRegulations,
  renderRegulationBlock,
  checkArticleGate,
  rawToPlainText,
};
