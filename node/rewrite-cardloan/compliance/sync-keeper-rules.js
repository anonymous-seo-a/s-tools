'use strict';

// ─────────────────────────────────────────────────────────────
// L1 同期 — cardloan-keeper regstore (client_official) → master_rules
//
// regstore の公式チャンクから【完全NG】欄の短い定型句を抽出し、
// Layer1 (決定論 indexOf) の master_rules 候補として draft 投入する。
//
// 規律:
//   - 自動では status='draft' 止まり (Layer1 は verified のみ実行対象)。
//     誤抽出フレーズが決定論層に入って偽陽性を量産するのを防ぐため、
//     昇格 (draft→verified) は masters UI で Daiki が行う。
//   - 抽出対象は 3〜25 字の定型句のみ (長文=説明文は Layer2/L3 の領域)。
//   - 既存 (ng_text × target_partner) と重複するものは skip (冪等)。
//
// 実行: node compliance/sync-keeper-rules.js [--dry]
// ─────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const { open, initSchema } = require('../db');
const { KEEPER_DIR } = require('../keeper-bridge');

const CHUNKS_JSON = path.join(KEEPER_DIR, 'data', 'regstore', 'chunks.json');

// scope.match の先頭要素 → target_partner スラッグ
const PARTNER_SLUG = { 'アコム': 'acom', 'プロミス': 'promise', 'モビット': 'mobit', 'アイフル': 'aiful' };

function extractNgPhrases(chunkText) {
  // 【完全NG】以降、次の【…】マーカーまでの行を候補化
  const phrases = [];
  const re = /【完全NG】([\s\S]*?)(?=【|$)/g;
  let m;
  while ((m = re.exec(chunkText)) !== null) {
    for (let line of m[1].split('\n')) {
      line = line.replace(/^[・\-\s]+/, '').replace(/[\s]+$/, '');
      if (!line) continue;
      // 定型句のみ: 3〜25字・文末説明や括弧書きの長文は除外
      if (line.length < 3 || line.length > 25) continue;
      if (/(すること|ください|場合|ため|など|等の記載)/.test(line)) continue;
      phrases.push(line);
    }
  }
  return [...new Set(phrases)];
}

function main() {
  const dry = process.argv.includes('--dry');
  const data = JSON.parse(fs.readFileSync(CHUNKS_JSON, 'utf8'));
  initSchema();
  const conn = open();
  const existing = new Set(
    conn.prepare(`SELECT ng_text || '|' || COALESCE(target_partner,'') AS k FROM master_rules`)
      .all().map((r) => r.k)
  );
  const insert = conn.prepare(
    `INSERT INTO master_rules
       (category, product_ids, rule_type, ng_text, condition, legal_basis, source_url,
        verified_by, status, target_partner, detection_layer, pattern_hint)
     VALUES ('cardloan', '[]', '禁止表現', ?, '常に', ?, ?, 'keeper-sync', 'draft', ?, 1, ?)`
  );
  let added = 0;
  let skipped = 0;
  for (const c of data.chunks) {
    if (c.source_tier !== 'client_official') continue;
    if (!c.scope || c.scope.kind !== 'advertiser') continue;
    const partner = PARTNER_SLUG[(c.scope.match || [])[0]] || null;
    for (const phrase of extractNgPhrases(c.text)) {
      const key = `${phrase}|${partner || ''}`;
      if (existing.has(key)) { skipped++; continue; }
      existing.add(key);
      if (!dry) {
        insert.run(phrase, `クライアント公式規制 (${c.context})`, c.source, partner, `keeper regstore: ${c.context}`);
      }
      added++;
      console.log(`  +[${partner || 'all'}] ${phrase}  ← ${c.context}`);
    }
  }
  console.log(`${dry ? '[dry] ' : ''}L1同期: 追加候補 ${added}件 (draft) / 既存skip ${skipped}件`);
  console.log('昇格 (draft→verified) は masters UI で Daiki が確認のうえ実施。');
}

main();
