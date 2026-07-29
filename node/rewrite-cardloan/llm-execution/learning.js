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
const fs = require('fs');

// signals.db (seo-signals 所有) Read-Only 自己探索。無ければ null = graceful。
const SIGNALS_DB_CANDIDATES = [
  process.env.SIGNALS_DB,
  '/opt/seo-signals/db/signals.db',
  '/Users/daikinozawa/Projects/seo-signals/db/signals.db',
].filter(Boolean);
let _sigConn;
function getSignalsDB() {
  if (_sigConn !== undefined) return _sigConn;
  _sigConn = null;
  try {
    const p = SIGNALS_DB_CANDIDATES.find((x) => fs.existsSync(x));
    if (p) _sigConn = new (require('better-sqlite3'))(p, { readonly: true, fileMustExist: true });
  } catch { _sigConn = null; }
  return _sigConn;
}

// この記事の top_kw が AIO引用ギャップ(AI Overview 出現・soico未引用)かを判定。
// 該当すれば生成時に「引用適性」強化を促すガイダンス材料を返す。
function buildAioGuidance(postId) {
  if (!postId) return null;
  try {
    const sig = getSignalsDB();
    if (!sig) return null;
    const art = require('../../monitor-db').getDB()
      .prepare('SELECT top_kw FROM articles WHERE post_id = ?').get(postId);
    if (!art || !art.top_kw) return null;
    const latest = sig.prepare('SELECT MAX(date) AS d FROM aio_occupancy').get()?.d;
    if (!latest) return null;
    const row = sig.prepare(
      'SELECT aio_present, soico_cited FROM aio_occupancy WHERE date = ? AND keyword = ?'
    ).get(latest, art.top_kw);
    if (row && row.aio_present === 1 && row.soico_cited === 0) return { keyword: art.top_kw };
    return null;
  } catch { return null; }
}

function plain(s, n) {
  return (s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
}

/**
 * @param {string} genre
 * @param {object} [opts] { lookback = 300, maxNotes = 6, maxEdits = 4 }
 * @returns {{ reject_reasons: Array<[string,number]>, reject_notes: string[], edits: Array<{before,after}>, judged_total: number } | null}
 */
/**
 * 効果フィードバック: confidence の自動消費。
 * 効果測定(measurement)の結果を、地合い変動(market_shift)で汚れた測定を除外した
 * 「クリーンな効果」だけ集計して生成へ返す。これにより signals.db の confidence が
 * 表示にとどまらず、次回生成の方向付けを自動駆動する（B群の目的が生成まで届く）。
 *   - 適用後 minDaysAfter 日以上 かつ confidence high/medium のみ採用（low/gap は除外）
 *   - rank_delta>0=改善 / <0=悪化（rankは小さいほど上位）
 * @returns {{n,improved,worsened,flat,excluded}|null}
 */
function buildEffectFeedback(genre, { minDaysAfter = 7, minN = 3 } = {}) {
  let data;
  try {
    const { computeMeasurements } = require('../api/measurement');
    data = computeMeasurements();
  } catch (e) {
    return null; // 効果測定が回せない環境では何も足さない（graceful）
  }
  // 効果は地合いβ補正後(market_adjusted_delta)を優先。無ければ生の rank_delta。
  const effOf = (it) => (it.market_adjusted_delta != null ? it.market_adjusted_delta : it.rank_delta);
  const all = (data.items || []).filter((it) => it.genre === genre && it.days_after >= minDaysAfter);
  // クリーン = 地合い信頼(high/medium) かつ A/B有意(十分な期間×ノイズ超)。
  // 有意でない/汚染された測定は learning に載せない（誤診＝毒化の防止）。
  const clean = all.filter(
    (it) => effOf(it) != null && it.significant
      && (it.measurement_confidence === 'high' || it.measurement_confidence === 'medium')
  );
  if (clean.length < minN) return null; // 統計的に語れる最小件数に満たない
  let improved = 0, worsened = 0, flat = 0;
  for (const it of clean) {
    const e = effOf(it);
    if (e > 0.5) improved++;
    else if (e < -0.5) worsened++;
    else flat++;
  }
  const excluded = all.filter((it) => it.measurement_confidence === 'low').length;
  return { n: clean.length, improved, worsened, flat, excluded };
}

function buildLearningNotes(genre, { lookback = 300, maxNotes = 6, maxEdits = 4, postId = null } = {}) {
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
  const effect = buildEffectFeedback(genre); // confidence の自動消費（clean な効果のみ）
  const aio = buildAioGuidance(postId);       // AIO引用ギャップ → 引用適性ガイダンス
  const hasJudgment = reject_reasons.length > 0 || notes.length > 0 || edits.length > 0;
  if (!hasJudgment && !effect && !aio) return null;
  return { reject_reasons, reject_notes: notes, edits, judged_total: rows.length, effect, aio };
}

// プロンプト注入用テキスト。
function renderLearningNotes(ln) {
  if (!ln) return '';
  const lines = [];
  const hasJudgment = ln.reject_reasons.length || ln.reject_notes.length || ln.edits.length;
  if (hasJudgment) {
    lines.push('# 過去の判定から学んだ注意点 (このジャンルで Daiki が却下/修正した傾向)');
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
  }
  if (ln.effect) {
    const e = ln.effect;
    lines.push('# 効果フィードバック (地合い変動を除いたクリーンな効果測定 / このジャンルの適用済みリライト)');
    lines.push(`適用後7日以上・信頼できる測定 ${e.n} 件: 改善 ${e.improved} / 悪化 ${e.worsened} / 横ばい ${e.flat}`
      + (e.excluded ? ` (地合い変動で ${e.excluded} 件を測定から除外)` : ''));
    if (e.worsened > e.improved) {
      lines.push('※ このジャンルは悪化が改善を上回っている。効果の薄い/逆効果な変更を避け、'
        + '検索意図への即答性・独自情報(Experience)・信頼性(YMYL)の補強に絞ること。');
    } else if (e.improved > e.worsened && e.improved > 0) {
      lines.push('※ クリーンな測定で改善傾向。効いている方向(網羅性・独自情報の追加・構造化)を継続する。');
    }
  }
  if (ln.aio) {
    lines.push('# AIO引用適性（このKWは AI Overview が表示されるが soico.jp が未引用）');
    lines.push(`対象KW「${ln.aio.keyword}」は AI Overview に出現するのに未引用。引用適性を最優先で強化:`);
    lines.push('  - 冒頭で結論を即答（定義・数値・結論を AIO が抜き出しやすい簡潔な一段落で）');
    lines.push('  - 独自データ・一次情報・体験(Experience)を明示し、他社の焼き直しにしない');
    lines.push('  - 箇条書き/表/小見出しで構造化し、想定質問に一対一で答える段落を置く');
  }
  return lines.join('\n');
}

module.exports = { buildLearningNotes, renderLearningNotes, buildEffectFeedback };
