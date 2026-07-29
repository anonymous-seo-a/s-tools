'use strict';
/**
 * 案B (#5) HCU 38 項目評価結果を master_hcu_checklist に投入。
 *
 * 設計 (Daiki 確定):
 *   - polarity 補正で pass_count = compliant 数
 *       positive 極性 + pass=true  → compliant
 *       negative 極性 + pass=false → compliant
 *   - item_results JSON: id + section + polarity + pass + comment + compliant
 *     (外部 (items.json version 時点) 依存なし、警戒バイアス [22] 同型回避)
 *   - 履歴テーブル (UNIQUE 制約なし)、複数 row 許容
 *   - evaluated_by='claude_sonnet_4_6'、notes に usage 統計 JSON
 *
 * 警戒バイアス対チェック:
 *   [4]  機能を盛りたくなる: UPDATE / 最新取得 / 削除を作らない
 *   [11] Adapter 過剰抽象化: db.js conn 直接利用、ラッパなし
 *   [12] スケルトン隠れたコスト: ajv validation なし
 */
const db = require('../db');
const { getModels } = require('../../shared/llm-adapters/anthropic-adapter');
const items = require('../../shared/schemas/hcu-checklist-items.json');

const ITEMS_BY_ID = new Map(items.items.map((it) => [it.id, it]));

function computeItemResults(evaluations) {
  const merged = [];
  let compliant = 0;
  for (const ev of evaluations) {
    const def = ITEMS_BY_ID.get(ev.id);
    if (!def) continue;
    const isCompliant =
      (def.polarity === 'positive' && ev.pass === true) ||
      (def.polarity === 'negative' && ev.pass === false);
    if (isCompliant) compliant++;
    merged.push({
      id: ev.id,
      section: def.section,
      polarity: def.polarity,
      pass: ev.pass,
      comment: ev.comment || '',
      compliant: isCompliant,
    });
  }
  return { merged, compliant };
}

function insertHcuEvaluation({ llmResult, evaluatedBy, extraNotes = {} }) {
  // 抽出は generation ロール (extract.js の sonnet()) で実行されるため、現行設定を既定値にする
  if (!evaluatedBy) evaluatedBy = getModels().generation;
  if (!llmResult || typeof llmResult.post_id !== 'number') {
    throw new Error('insertHcuEvaluation: llmResult.post_id required');
  }
  const conn = db.open();

  const { merged, compliant } = computeItemResults(llmResult.evaluations || []);
  const total = items.total_count;
  const passRate = total > 0 ? compliant / total : 0;

  const itemResultsJson = JSON.stringify({
    version: items.version,
    items: merged,
  });

  const returnedIds = new Set((llmResult.evaluations || []).map((e) => e.id));
  const missingIds = items.items.filter((it) => !returnedIds.has(it.id)).map((it) => it.id);

  const notesJson = JSON.stringify({
    model: getModels().generation,
    input_tokens: llmResult.usage?.input_tokens ?? null,
    output_tokens: llmResult.usage?.output_tokens ?? null,
    body_chars: llmResult.body_chars ?? null,
    struct_chars: llmResult.struct_chars ?? null,
    source_url: llmResult.source_url ?? null,
    title: llmResult.title ?? null,
    missing_ids: missingIds,
    ...extraNotes,
  });

  const stmt = conn.prepare(
    `INSERT INTO master_hcu_checklist
       (post_id, checklist_version, evaluation_method, pass_count, total_count, pass_rate,
        item_results, evaluated_by, notes)
     VALUES (?, ?, 'llm', ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    llmResult.post_id,
    llmResult.checklist_version || items.version,
    compliant,
    total,
    passRate,
    itemResultsJson,
    evaluatedBy,
    notesJson
  );

  return {
    inserted_id: info.lastInsertRowid,
    post_id: llmResult.post_id,
    checklist_version: llmResult.checklist_version || items.version,
    pass_count: compliant,
    total_count: total,
    pass_rate: passRate,
    missing_ids: missingIds,
  };
}

module.exports = {
  insertHcuEvaluation,
  computeItemResults,
};
