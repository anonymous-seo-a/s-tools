'use strict';
/**
 * C 学習ループ: 記録 → 抽出 → 反映 の「抽出」層。
 *
 * Daiki の判定 (master_rewrite_diff の daiki_judgment / reject_reason / reject_note /
 * daiki_edit_content) をジャンル別に集計し、次回生成プロンプトへ注入する学習ノートを作る。
 *   - 却下理由の頻度 (何が嫌われるか)
 *   - 却下メモ (具体的な指摘文)
 *   - Daiki の修正例 (AI 案 → 採用版): LLM 出力をどう直されたか = 最も強い学習信号
 *
 * 決定的 (LLM 非依存) な集計。履歴ゼロなら null を返し、プロンプトに何も足さない。
 */

const db = require('../db');

function plain(s, n) {
  return (s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
}

/**
 * @param {string} genre
 * @param {object} [opts] { lookback = 300, maxNotes = 6, maxEdits = 4 }
 * @returns {{ reject_reasons: Array<[string,number]>, reject_notes: string[], edits: Array<{before,after}>, judged_total: number } | null}
 */
function buildLearningNotes(genre, { lookback = 300, maxNotes = 6, maxEdits = 4 } = {}) {
  const conn = db.open();
  const rows = conn.prepare(`
    SELECT d.daiki_judgment AS judgment, d.daiki_reject_reason AS reason,
           d.daiki_reject_note AS note, d.content_after AS proposal, d.daiki_edit_content AS adopted
    FROM master_rewrite_diff d
    JOIN master_rewrite_session s ON s.id = d.session_id
    WHERE s.genre = ? AND d.judged_at IS NOT NULL
    ORDER BY d.judged_at DESC
    LIMIT ?
  `).all(genre, lookback);
  if (rows.length === 0) return null;

  // 却下理由 頻度
  const reasonCount = new Map();
  const notes = [];
  const edits = [];
  for (const r of rows) {
    if (r.judgment === 'rejected') {
      if (r.reason) reasonCount.set(r.reason, (reasonCount.get(r.reason) || 0) + 1);
      const n = plain(r.note, 80);
      if (n && notes.length < maxNotes && !notes.includes(n)) notes.push(n);
    }
    // Daiki が編集して採用 = 修正例 (AI 案と異なる場合のみ)
    if (r.adopted && r.adopted !== r.proposal && edits.length < maxEdits) {
      const before = plain(r.proposal, 70);
      const after = plain(r.adopted, 70);
      if (before && after && before !== after) edits.push({ before, after });
    }
  }
  const reject_reasons = [...reasonCount.entries()].sort((a, b) => b[1] - a[1]);
  if (reject_reasons.length === 0 && notes.length === 0 && edits.length === 0) return null;
  return { reject_reasons, reject_notes: notes, edits, judged_total: rows.length };
}

// プロンプト注入用テキスト。
function renderLearningNotes(ln) {
  if (!ln) return '';
  const lines = ['# 過去の判定から学んだ注意点 (このジャンルで Daiki が却下/修正した傾向)'];
  if (ln.reject_reasons.length) {
    lines.push('よくある却下理由: ' + ln.reject_reasons.map(([r, n]) => `${r}(${n})`).join(' / '));
  }
  if (ln.reject_notes.length) {
    lines.push('却下メモ(具体指摘):');
    ln.reject_notes.forEach((n) => lines.push(`  - ${n}`));
  }
  if (ln.edits.length) {
    lines.push('Daiki の修正例 (AI案 → 採用版。同じ直しを繰り返さない):');
    ln.edits.forEach((e) => lines.push(`  - AI案: ${e.before} → 採用: ${e.after}`));
  }
  lines.push('上記を踏まえ、過去に却下・修正された傾向を繰り返さないこと。');
  return lines.join('\n');
}

module.exports = { buildLearningNotes, renderLearningNotes };
