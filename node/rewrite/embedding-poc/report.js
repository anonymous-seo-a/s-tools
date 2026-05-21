'use strict';
/**
 * 段階A PoC: 2 系統 (embedding / factset) 比較レポート生成。
 *
 * 入力:
 *   - master_passage_gap (judge_type='embedding' / 'factset' の両方を集約)
 *   - master_information_gain_score (既存 fact-set 系の gap_count + notes JSON)
 *
 * 出力:
 *   - 主表 (Q[i] × 2 系統 × max_cosine × 一致/不一致)
 *   - 別掲 (fact-set が拾い embedding が落とす gap = factset gap_flag=1 かつ embedding gap_flag=0 の fact)
 *
 * stdout に表形式 + JSON ファイル化は呼出側で実施。
 */

function renderMainTable(rows) {
  if (rows.length === 0) return '(no rows)';
  const header = `| Q[i] | fact-set判定 | embedding判定 | self_max | comp_max+δ | 一致 |`;
  const sep =    `|------|--------------|---------------|----------|------------|------|`;
  const lines = [header, sep];
  for (const r of rows) {
    const factGap = r.factset_gap === 1 ? 'gap' : 'no-gap';
    const embGap = r.embedding_gap === 1 ? 'gap' : 'no-gap';
    const agree = r.factset_gap === r.embedding_gap ? '✓' : '✗';
    const sm = r.self_max_cosine != null ? r.self_max_cosine.toFixed(3) : '---';
    const cm = r.competitor_max_cosine != null
      ? (r.competitor_max_cosine + (r.delta || 0)).toFixed(3)
      : '---';
    lines.push(`| ${r.query_text} | ${factGap} | ${embGap} | ${sm} | ${cm} | ${agree} |`);
  }
  return lines.join('\n');
}

/**
 * fact-set 側 gap_fact_samples を embedding 側で再判定した結果と突合。
 * embedding 判定で gap_flag=0 (= 自記事に近い passage がある) になった fact が
 * 「fact-set が拾い embedding が落とす gap」。
 */
function renderFactDivergence(factRows) {
  if (factRows.length === 0) return '(no fact-level rows)';
  const header = `| layer | fact text                                                    | self_max | embedding判定 | factset判定 | divergent |`;
  const sep =    `|-------|--------------------------------------------------------------|----------|---------------|-------------|-----------|`;
  const lines = [header, sep];
  let divergentCount = 0;
  for (const r of factRows) {
    const text = (r.target_text || '').slice(0, 60).padEnd(60, ' ');
    const sm = r.self_max_cosine != null ? r.self_max_cosine.toFixed(3) : '---';
    const emb = r.embedding_gap === 1 ? 'gap' : 'no-gap';
    const fs = r.factset_gap === 1 ? 'gap' : 'no-gap';
    const divergent = r.factset_gap === 1 && r.embedding_gap === 0;
    if (divergent) divergentCount++;
    lines.push(`| ${r.fact_layer || '-'}     | ${text} | ${sm}    | ${emb}        | ${fs}      | ${divergent ? '★' : ' '}       |`);
  }
  lines.push('');
  lines.push(`divergent (fact-set gap ∩ embedding no-gap) = ${divergentCount} / ${factRows.length}`);
  return lines.join('\n');
}

function renderDivergentOnly(factRows) {
  const divergent = factRows.filter((r) => r.factset_gap === 1 && r.embedding_gap === 0);
  const inverse = factRows.filter((r) => r.factset_gap === 0 && r.embedding_gap === 1);
  if (divergent.length === 0 && inverse.length === 0) {
    return '(no divergent rows)';
  }
  const lines = [];
  if (divergent.length > 0) {
    lines.push(`★ fact-set gap ∩ embedding no-gap (= fact-set 過剰検出, embedding 救出): ${divergent.length} 件`);
    for (const r of divergent) {
      lines.push(`  L${r.fact_layer} self_max=${r.self_max_cosine.toFixed(3)} comp_max=${r.competitor_max_cosine.toFixed(3)}  "${r.target_text.slice(0, 80)}"`);
    }
  }
  if (inverse.length > 0) {
    lines.push('');
    lines.push(`▲ fact-set no-gap ∩ embedding gap (= fact-set 見落とし, embedding 検出): ${inverse.length} 件`);
    for (const r of inverse) {
      lines.push(`  L${r.fact_layer} self_max=${r.self_max_cosine.toFixed(3)} comp_max=${r.competitor_max_cosine.toFixed(3)}  "${r.target_text.slice(0, 80)}"`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  renderMainTable,
  renderFactDivergence,
  renderDivergentOnly,
};
