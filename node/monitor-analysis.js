/**
 * Phase 3-A: 記事の順位/PV/aff_click 変動の要因分析
 *   monitor-db の各データ + WP 本文 + apply-history を集約して Claude に投げる
 */
const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
const db = require('./monitor-db');
const col = require('./monitor-collectors');
const store = require('./store');

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

// 要因分析は最新 Opus を使用（Sonnet より推論精度重視）
const ANALYSIS_MODEL = 'claude-opus-4-7';

// 本文は長いと token 消費が大きいので最大 12K 文字に切り詰め
const MAX_CONTENT_CHARS = 12000;

async function analyzeArticle(post_id, { days = 30 } = {}) {
  const article = db.getArticle(post_id);
  if (!article) throw new Error(`article not found: ${post_id}`);

  const metrics = db.getArticleTimeline(post_id, days);
  const kwHistory = db.getArticleKwHistory(post_id, 10);
  const affBrk = db.getArticleAffiliateBreakdown(post_id, days);
  const kwDriftMap = db.getKwDriftMap(3);
  const kwDrift = kwDriftMap.get(post_id) || null;

  const history = await store.getHistory();
  const rangeStart = metrics.length > 0 ? metrics[0].date : null;
  const applyHistory = history
    .filter(h => String(h.postId) === String(post_id))
    .map(h => ({
      date: (h.timestamp || '').slice(0, 10),
      action: h.action,
      partner: h.partner,
      replacedCount: h.replacedCount,
      insertedCount: h.insertedCount || (h.items && h.items.length),
    }))
    .filter(h => h.date && (!rangeStart || h.date >= rangeStart))
    .sort((a, b) => a.date.localeCompare(b.date));

  let content = null;
  try { content = await col.fetchWpContent(post_id); } catch (e) { /* continue without */ }

  const prompt = buildPrompt({ article, metrics, kwHistory, affBrk, kwDrift, applyHistory, content });

  const response = await client.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const comment = response.content.map(c => c.text || '').join('\n').trim();
  const tokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  const id = db.saveAnalysisComment({
    post_id,
    comment,
    context_days: days,
    tokens_used: tokens,
  });

  return {
    id, post_id, comment, context_days: days, tokens_used: tokens,
    created_at: new Date().toISOString(),
  };
}

const SYSTEM_PROMPT = `あなたは SEO / アフィリエイト運用のアナリストです。
与えられた記事の順位・PV・アフィリクリックの変動と、期間内に起きたイベント（CTA挿入、リンク張替、WP更新、上位KWの変動）を突き合わせて、
「なぜ悪化（または改善）したか」の最も妥当な要因を 3 〜 5 点に絞って簡潔にまとめてください。

出力フォーマット（Markdown、見出し不要、箇条書きのみ）:
- **結論**: 1行で総合評価（悪化 / 改善 / 横ばい、および主因の概略）
- **要因**: 3〜5個、各1〜2行。「観測された変化」→「考えられる原因」の順で記述
- **アクション候補**: 1〜3個、実行可能な打ち手（CTA再配置、KWリライト、等）

断定を避け、データから読み取れない因果は推測と明記すること。`;

function buildPrompt({ article, metrics, kwHistory, affBrk, kwDrift, applyHistory, content }) {
  const parts = [];

  parts.push(`## 記事\n- post_id: ${article.post_id}\n- カテゴリ: ${article.category}\n- タイトル: ${article.title || '(no title)'}\n- URL: ${article.url}\n- WP最終更新: ${article.wp_modified || '不明'}\n- articles.top_kw: ${article.top_kw || '不明'}`);

  // メトリクス推移（最新 / 期間最初 / 中間の3点要約）
  if (metrics.length > 0) {
    const first = metrics[0];
    const last = metrics[metrics.length - 1];
    const mid = metrics[Math.floor(metrics.length / 2)];
    const summarize = m => `${m.date}: rank=${fmt(m.rank)}, pv=${fmt(m.pv)}, aff_click=${fmt(m.aff_click)}, gsc_click=${fmt(m.gsc_click)}, imp=${fmt(m.impressions)}`;
    parts.push(`## メトリクス推移（${metrics.length}日分）\n- 開始: ${summarize(first)}\n- 中間: ${summarize(mid)}\n- 最新: ${summarize(last)}`);
    // 日次も送る（token 節約のため CSV 圧縮）
    const daily = metrics.map(m => `${m.date},${fmt(m.rank)},${fmt(m.pv)},${fmt(m.aff_click)},${fmt(m.gsc_click)}`).join('\n');
    parts.push(`## 日次データ (date,rank,pv,aff_click,gsc_click)\n${daily}`);
  } else {
    parts.push('## メトリクス推移\n期間内データなし');
  }

  // KW 履歴
  if (kwHistory.weeks.length > 0) {
    const rows = kwHistory.keywords.slice(0, 10).map(kw => {
      const cells = kwHistory.weeks.map(w => {
        const c = kw.cells[w];
        return c ? `${w.slice(5)}:#${c.rank_order}(rank=${fmt(c.rank, 1)})` : `${w.slice(5)}:—`;
      }).join(' / ');
      return `- ${kw.keyword}: ${cells}`;
    }).join('\n');
    parts.push(`## Top10 KW の週別順位（前週→今週）\n${rows}`);
  }

  // KW drift
  if (kwDrift) {
    parts.push(`## KW drift（Jaccard）\n- jaccard=${fmt(kwDrift.jaccard, 2)} (0=総入替 / 1=完全一致)\n- 今週Top3: ${kwDrift.curr_kw.join(' / ')}\n- 前週Top3: ${kwDrift.prev_kw.join(' / ')}`);
  }

  // 商材別 aff_click
  if (affBrk.partners.length > 0) {
    const rows = affBrk.partners.slice(0, 8).map(p => `- ${p.partner}: 合計 ${p.total} clicks`).join('\n');
    parts.push(`## 商材別 aff_click（期間内合計、上位8件）\n${rows}`);
  }

  // apply history
  if (applyHistory.length > 0) {
    const rows = applyHistory.map(h => {
      if (h.action === 'link-replace') return `- ${h.date}: リンク張替 ${h.partner || ''} ${h.replacedCount || ''}件`;
      if (h.insertedCount) return `- ${h.date}: CTA挿入 ${h.insertedCount}件`;
      return `- ${h.date}: ${h.action}`;
    }).join('\n');
    parts.push(`## 期間内の反映履歴\n${rows}`);
  } else {
    parts.push('## 期間内の反映履歴\nなし');
  }

  // 本文
  if (content && content.content_text) {
    const trimmed = content.content_text.length > MAX_CONTENT_CHARS
      ? content.content_text.slice(0, MAX_CONTENT_CHARS) + `\n...(以下 ${content.content_text.length - MAX_CONTENT_CHARS} 文字省略)`
      : content.content_text;
    parts.push(`## 記事本文（テキスト化、${content.content_text.length}文字）\n${trimmed}`);
  }

  parts.push('---\n上記データを踏まえて要因分析してください。');
  return parts.join('\n\n');
}

function fmt(v, digits = 1) {
  if (v == null) return '—';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(digits);
  }
  return String(v);
}

module.exports = { analyzeArticle };
