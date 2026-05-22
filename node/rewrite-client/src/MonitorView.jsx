import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from './api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Label,
} from 'recharts';

const DEFAULT_THRESHOLDS = {
  rankWorsen: 3,        // 順位が +3 以上悪化
  rankImprove: -3,      // 順位が -3 以上改善
  pvDrop: -30,          // PV -30% 以上
  pvUp: 30,             // PV +30% 以上
  clickDrop: -30,       // aff_click -30% 以上
  clickUp: 30,          // aff_click +30% 以上
  kwDriftMin: 0.4,      // KW変動判定: Jaccard < この値 なら「KWが変わった」扱い
};

const THRESHOLD_LS_KEY = 'monitor_thresholds_v1';

function loadThresholds() {
  try {
    const raw = localStorage.getItem(THRESHOLD_LS_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

function saveThresholds(t) {
  localStorage.setItem(THRESHOLD_LS_KEY, JSON.stringify(t));
}

// ========= 数値フォーマット =========
function fmtRank(v) {
  if (v == null) return '—';
  return Number(v).toFixed(1);
}
function fmtInt(v) {
  if (v == null) return '—';
  return Math.round(Number(v)).toLocaleString();
}
function fmtPct(v) {
  if (v == null) return '—';
  return (Number(v) * 100).toFixed(1) + '%';
}

// ========= 比較計算 =========
// rank: 値が小さい方が良い。diff = new - old（正で悪化）
// それ以外 (click/pv/impressions): 値が大きい方が良い。pctDiff = (new - old) / old * 100
function rankDiff(now, before) {
  if (now == null || before == null) return null;
  return Number(now) - Number(before);
}
function pctDiff(now, before) {
  if (now == null || before == null) return null;
  const a = Number(now);
  const b = Number(before);
  if (b === 0) return a === 0 ? 0 : null;
  return ((a - b) / b) * 100;
}

// KW drift の Jaccard → 表示用フォーマット
function fmtJaccard(v) {
  if (v == null) return '—';
  return Number(v).toFixed(2);
}
function classifyKwDrift(jaccard, min) {
  if (jaccard == null) return '';
  return jaccard < min ? 'bad' : '';
}
function fmtRankDiff(d) {
  if (d == null) return '';
  const s = d > 0 ? '+' : '';
  return `${s}${d.toFixed(1)}`;
}
function fmtPctDiff(d) {
  if (d == null) return '';
  const s = d > 0 ? '+' : '';
  return `${s}${d.toFixed(0)}%`;
}

// ========= アラート判定 =========
function classifyRank(diff, thresholds) {
  if (diff == null) return '';
  if (diff >= thresholds.rankWorsen) return 'bad';
  if (diff <= thresholds.rankImprove) return 'good';
  return '';
}
function classifyPct(diff, badBelow, goodAbove) {
  if (diff == null) return '';
  if (diff <= badBelow) return 'bad';
  if (diff >= goodAbove) return 'good';
  return '';
}

// ========= アラートスコア（ソート用） =========
// dir='worsen': 悪化度が強いほど高スコア / dir='improve': 改善度が強いほど高スコア
function alertScore(article, thresholds, dir = 'worsen') {
  let score = 0;
  const latest = article.latest;
  const prev1 = article.prev1;
  const avg7 = article.avg7;
  const avg7p = article.avg7_prev;
  const avg30 = article.avg30;
  const avg30p = article.avg30_prev;

  for (const [now, before] of [[latest?.rank, prev1?.rank], [avg7?.rank, avg7p?.rank], [avg30?.rank, avg30p?.rank]]) {
    const d = rankDiff(now, before);
    if (d == null) continue;
    if (dir === 'worsen' && d >= thresholds.rankWorsen) score += d;
    else if (dir === 'improve' && d <= thresholds.rankImprove) score += Math.abs(d);
  }
  for (const [now, before] of [[latest?.pv, prev1?.pv], [avg7?.pv, avg7p?.pv], [avg30?.pv, avg30p?.pv]]) {
    const d = pctDiff(now, before);
    if (d == null) continue;
    if (dir === 'worsen' && d <= thresholds.pvDrop) score += Math.abs(d) / 10;
    else if (dir === 'improve' && d >= thresholds.pvUp) score += d / 10;
  }
  for (const [now, before] of [[latest?.aff_click, prev1?.aff_click], [avg7?.aff_click, avg7p?.aff_click], [avg30?.aff_click, avg30p?.aff_click]]) {
    const d = pctDiff(now, before);
    if (d == null) continue;
    if (dir === 'worsen' && d <= thresholds.clickDrop) score += Math.abs(d) / 10;
    else if (dir === 'improve' && d >= thresholds.clickUp) score += d / 10;
  }
  return score;
}

// ========= 閾値設定パネル =========
function ThresholdPanel({ thresholds, setThresholds, onClose }) {
  const [t, setT] = useState(thresholds);
  const update = (k, v) => setT(prev => ({ ...prev, [k]: Number(v) }));
  const save = () => {
    saveThresholds(t);
    setThresholds(t);
    onClose();
  };
  const reset = () => {
    saveThresholds(DEFAULT_THRESHOLDS);
    setThresholds(DEFAULT_THRESHOLDS);
    setT(DEFAULT_THRESHOLDS);
  };
  return (
    <div className="monitor-threshold-panel">
      <h3>アラート閾値</h3>
      <div className="monitor-threshold-grid">
        <label>順位悪化 (正で悪化) ≥
          <input type="number" value={t.rankWorsen} onChange={e => update('rankWorsen', e.target.value)} />
        </label>
        <label>順位改善 (負で改善) ≤
          <input type="number" value={t.rankImprove} onChange={e => update('rankImprove', e.target.value)} />
        </label>
        <label>PV 下落 (%) ≤
          <input type="number" value={t.pvDrop} onChange={e => update('pvDrop', e.target.value)} />
        </label>
        <label>PV 上昇 (%) ≥
          <input type="number" value={t.pvUp} onChange={e => update('pvUp', e.target.value)} />
        </label>
        <label>aff_click 下落 (%) ≤
          <input type="number" value={t.clickDrop} onChange={e => update('clickDrop', e.target.value)} />
        </label>
        <label>aff_click 上昇 (%) ≥
          <input type="number" value={t.clickUp} onChange={e => update('clickUp', e.target.value)} />
        </label>
        <label>KW変動 Jaccard &lt;
          <input type="number" step="0.05" min="0" max="1" value={t.kwDriftMin} onChange={e => update('kwDriftMin', e.target.value)} />
        </label>
      </div>
      <div className="monitor-threshold-actions">
        <button onClick={save}>保存</button>
        <button onClick={reset} className="btn-secondary">デフォルトに戻す</button>
        <button onClick={onClose} className="btn-secondary">閉じる</button>
      </div>
    </div>
  );
}

// ========= セル（値 + 差分） =========
function MetricCell({ value, diffLabel, cls, isRank = false }) {
  return (
    <td className={`monitor-cell ${cls || ''}`}>
      <div className="monitor-cell-value">{isRank ? fmtRank(value) : fmtInt(value)}</div>
      {diffLabel && <div className="monitor-cell-diff">{diffLabel}</div>}
    </td>
  );
}

// ========= 1行 =========
function MonitorRow({ article, thresholds, onOpenTimeline }) {
  const latest = article.latest || {};
  const prev1 = article.prev1 || {};
  const avg7 = article.avg7 || {};
  const avg7p = article.avg7_prev || {};
  const avg30 = article.avg30 || {};
  const avg30p = article.avg30_prev || {};

  // rank
  const rankD1 = rankDiff(latest.rank, prev1.rank);
  const rankD7 = rankDiff(avg7.rank, avg7p.rank);
  const rankD30 = rankDiff(avg30.rank, avg30p.rank);
  // pv
  const pvD1 = pctDiff(latest.pv, prev1.pv);
  const pvD7 = pctDiff(avg7.pv, avg7p.pv);
  const pvD30 = pctDiff(avg30.pv, avg30p.pv);
  // aff_click
  const affD1 = pctDiff(latest.aff_click, prev1.aff_click);
  const affD7 = pctDiff(avg7.aff_click, avg7p.aff_click);
  const affD30 = pctDiff(avg30.aff_click, avg30p.aff_click);

  const title = article.title || `(no title) ${article.post_id}`;

  return (
    <tr>
      <td className="monitor-article-cell">
        <div className="monitor-article-title">
          <a href={article.url} target="_blank" rel="noopener">{title}</a>
        </div>
        <div className="monitor-article-meta">
          {article.category} | ID:{article.post_id}
          {article.top_kw && <span className="monitor-topkw"> | KW: {article.top_kw}</span>}
        </div>
        <button className="btn-tiny" onClick={() => onOpenTimeline(article)}>推移 ›</button>
      </td>

      <MetricCell value={latest.rank} diffLabel={fmtRankDiff(rankD1)} cls={classifyRank(rankD1, thresholds)} isRank />
      <MetricCell value={avg7.rank} diffLabel={fmtRankDiff(rankD7)} cls={classifyRank(rankD7, thresholds)} isRank />
      <MetricCell value={avg30.rank} diffLabel={fmtRankDiff(rankD30)} cls={classifyRank(rankD30, thresholds)} isRank />

      <MetricCell value={latest.pv} diffLabel={fmtPctDiff(pvD1)} cls={classifyPct(pvD1, thresholds.pvDrop, thresholds.pvUp)} />
      <MetricCell value={avg7.pv} diffLabel={fmtPctDiff(pvD7)} cls={classifyPct(pvD7, thresholds.pvDrop, thresholds.pvUp)} />
      <MetricCell value={avg30.pv} diffLabel={fmtPctDiff(pvD30)} cls={classifyPct(pvD30, thresholds.pvDrop, thresholds.pvUp)} />

      <MetricCell value={latest.aff_click} diffLabel={fmtPctDiff(affD1)} cls={classifyPct(affD1, thresholds.clickDrop, thresholds.clickUp)} />
      <MetricCell value={avg7.aff_click} diffLabel={fmtPctDiff(affD7)} cls={classifyPct(affD7, thresholds.clickDrop, thresholds.clickUp)} />
      <MetricCell value={avg30.aff_click} diffLabel={fmtPctDiff(affD30)} cls={classifyPct(affD30, thresholds.clickDrop, thresholds.clickUp)} />

      <td className="monitor-ctr-cell">
        <div>{fmtPct(latest.ctr)}</div>
        <div className="monitor-cell-diff">imp {fmtInt(latest.impressions)}</div>
      </td>

      <td className={`monitor-cell monitor-kwdrift-cell ${classifyKwDrift(article.kw_drift?.jaccard, thresholds.kwDriftMin)}`} title={
        article.kw_drift
          ? `今週 Top3: ${article.kw_drift.curr_kw.join(' / ')}\n前週 Top3: ${article.kw_drift.prev_kw.join(' / ')}`
          : 'KW比較データ不足（2週分揃うまで表示されません）'
      }>
        <div className="monitor-cell-value">{fmtJaccard(article.kw_drift?.jaccard)}</div>
        {article.kw_drift && article.kw_drift.jaccard < thresholds.kwDriftMin && (
          <div className="monitor-cell-diff">KW変動</div>
        )}
      </td>
    </tr>
  );
}

// ========= タイムラインモーダル（Phase 2: グラフ + マーカー） =========
const PERIOD_OPTIONS = [
  { value: 30, label: '30日' },
  { value: 90, label: '90日' },
  { value: 180, label: '180日' },
  { value: 365, label: '365日' },
];

const MARKER_STYLES = {
  cta_insert: { stroke: '#2e7d32', label: 'CTA挿入' },
  link_replace: { stroke: '#f57f17', label: 'リンク張替' },
  other: { stroke: '#888', label: '反映' },
};

function formatDateShort(iso) {
  if (!iso) return '';
  // YYYY-MM-DD → MM/DD
  return iso.slice(5).replace('-', '/');
}

// markers: {wp_modified, apply_history[]} の配列に対して、同日マーカーをグループ化
function groupMarkersByDate(markers) {
  if (!markers) return [];
  const map = new Map();
  for (const m of markers.apply_history || []) {
    if (!map.has(m.date)) map.set(m.date, []);
    map.get(m.date).push(m);
  }
  if (markers.wp_modified) {
    const d = markers.wp_modified;
    if (!map.has(d)) map.set(d, []);
    map.get(d).push({ date: d, type: 'wp_modified', label: `WP更新: ${d}` });
  }
  return [...map.entries()].map(([date, items]) => ({ date, items }));
}

function MarkerTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="recharts-tooltip">
      <div className="recharts-tooltip-date">{p.date}</div>
      {payload.map((v, i) => (
        <div key={i} style={{ color: v.color }}>
          {v.name}: {v.value == null ? '—' : (typeof v.value === 'number' ? v.value.toFixed(v.name === 'rank' ? 1 : 0) : v.value)}
        </div>
      ))}
      {p.markers && p.markers.length > 0 && (
        <div className="recharts-tooltip-markers">
          {p.markers.map((m, i) => <div key={i}>● {m.label}</div>)}
        </div>
      )}
    </div>
  );
}

function ChartPanel({ title, data, dataKey, color, markers, reverseY, unit, overlayKey, overlayColor, overlayLabel, topKwChanges }) {
  const groupedMarkers = groupMarkersByDate(markers);
  // データが全て null の場合
  const hasData = data.some(d => d[dataKey] != null);
  return (
    <div className="monitor-chart-panel">
      <div className="monitor-chart-title">{title}{unit ? ` (${unit})` : ''}</div>
      {!hasData ? (
        <div className="monitor-chart-empty">データなし</div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={formatDateShort} minTickGap={20} />
            <YAxis
              tick={{ fontSize: 10 }}
              reversed={reverseY}
              domain={reverseY ? [1, 'auto'] : ['auto', 'auto']}
              allowDecimals={dataKey === 'rank'}
            />
            <Tooltip content={<MarkerTooltip />} />
            {groupedMarkers.map(({ date, items }) => {
              // 同日複数マーカー → 優先度: cta_insert > link_replace > wp_modified > other
              const primary = items.find(i => i.type === 'cta_insert')
                || items.find(i => i.type === 'link_replace')
                || items.find(i => i.type === 'wp_modified')
                || items[0];
              const style = primary.type === 'wp_modified'
                ? { stroke: '#1565c0', strokeDasharray: '4 2' }
                : MARKER_STYLES[primary.type] || MARKER_STYLES.other;
              return (
                <ReferenceLine
                  key={date}
                  x={date}
                  stroke={style.stroke}
                  strokeDasharray={style.strokeDasharray}
                  strokeWidth={1.5}
                />
              );
            })}
            {(topKwChanges || []).map(c => (
              <ReferenceLine
                key={`kw-${c.date}`}
                x={c.date}
                stroke="#6a1b9a"
                strokeDasharray="2 3"
                strokeWidth={1}
                ifOverflow="extendDomain"
              >
                <Label value={`KW→${c.to}`} position="top" fill="#6a1b9a" fontSize={10} />
              </ReferenceLine>
            ))}
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
              name={title}
            />
            {overlayKey && (
              <Line
                type="monotone"
                dataKey={overlayKey}
                stroke={overlayColor || '#e91e63'}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={{ r: 2 }}
                connectNulls
                name={overlayLabel || overlayKey}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

const PARTNER_COLORS = ['#c62828', '#1565c0', '#2e7d32', '#f57f17', '#6a1b9a', '#00838f', '#ad1457', '#4e342e'];

function AffiliateBreakdown({ postId, days }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setData(null); setErr(null);
    api.getMonitorAffBreakdown(postId, days).then(setData).catch(e => setErr(e.message));
  }, [postId, days]);
  if (err) return <div className="error-banner">{err}</div>;
  if (!data) return <div className="loading"><div className="spinner" /></div>;
  if (data.partners.length === 0) return <div className="monitor-affbrk-empty">期間内にクリックなし</div>;

  const topPartners = data.partners.slice(0, 5);
  // 折れ線用: 日付 x 商材マトリクス
  const dateSet = new Set();
  for (const p of topPartners) for (const d of p.daily) dateSet.add(d.date);
  const dates = [...dateSet].sort();
  const chartRows = dates.map(date => {
    const row = { date };
    for (const p of topPartners) {
      const cell = p.daily.find(d => d.date === date);
      row[p.partner] = cell ? cell.clicks : 0;
    }
    return row;
  });
  const totalAll = data.partners.reduce((s, p) => s + p.total, 0);

  return (
    <div className="monitor-affbrk">
      <div className="monitor-affbrk-note">
        期間内クリック合計: <strong>{totalAll.toLocaleString()}</strong>（商材 {data.partners.length}件）
      </div>
      {topPartners.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={formatDateShort} minTickGap={20} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            {topPartners.map((p, i) => (
              <Line key={p.partner} type="monotone" dataKey={p.partner} stroke={PARTNER_COLORS[i % PARTNER_COLORS.length]} strokeWidth={2} dot={false} connectNulls name={p.partner} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      <table className="monitor-affbrk-table">
        <thead>
          <tr><th>商材</th><th>合計</th><th>シェア</th></tr>
        </thead>
        <tbody>
          {data.partners.map((p, i) => (
            <tr key={p.partner}>
              <td>
                <span className="affbrk-dot" style={{ background: i < 5 ? PARTNER_COLORS[i % PARTNER_COLORS.length] : '#ccc' }} />
                {p.partner}
              </td>
              <td className="affbrk-num">{p.total.toLocaleString()}</td>
              <td className="affbrk-num">{totalAll > 0 ? ((p.total / totalAll) * 100).toFixed(1) : '0'}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderMd(text) {
  if (!text) return '';
  // **bold** → <strong>
  return text.split('\n').map((line, i) => {
    const parts = [];
    let rest = line;
    let idx = 0;
    const re = /\*\*([^*]+)\*\*/g;
    let m;
    while ((m = re.exec(rest)) !== null) {
      if (m.index > idx) parts.push(rest.slice(idx, m.index));
      parts.push(<strong key={`${i}-${m.index}`}>{m[1]}</strong>);
      idx = m.index + m[0].length;
    }
    if (idx < rest.length) parts.push(rest.slice(idx));
    return <div key={i} className="analysis-line">{parts}</div>;
  });
}

function AnalysisSection({ postId, days }) {
  const [comments, setComments] = useState(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);

  const loadComments = useCallback(() => {
    api.getMonitorComments(postId, 20).then(setComments).catch(e => setErr(e.message));
  }, [postId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const handleRun = async () => {
    setRunning(true); setErr(null);
    try {
      await api.analyzeArticle(postId, days);
      loadComments();
    } catch (e) {
      setErr(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="monitor-analysis">
      <div className="monitor-analysis-actions">
        <button onClick={handleRun} disabled={running}>
          {running ? '分析中...(10〜30秒)' : `要因分析を実行 (過去${days}日)`}
        </button>
      </div>
      {err && <div className="error-banner">{err}</div>}
      {comments && comments.length === 0 && !running && (
        <div className="monitor-analysis-empty">コメントなし。ボタンで分析を実行してください。</div>
      )}
      {comments && comments.map(c => (
        <div key={c.id} className="monitor-analysis-comment">
          <div className="analysis-meta">
            {c.created_at?.slice(0, 19).replace('T', ' ')}
            {c.context_days && <span> / 過去{c.context_days}日</span>}
            {c.tokens_used ? <span> / {c.tokens_used.toLocaleString()} tokens</span> : null}
          </div>
          <div className="analysis-body">{renderMd(c.comment)}</div>
        </div>
      ))}
    </div>
  );
}

const KW_LINE_COLORS = [
  '#c62828', '#1565c0', '#2e7d32', '#f57f17', '#6a1b9a',
  '#00838f', '#ad1457', '#4e342e', '#827717', '#ef6c00',
];

function KwLineChart({ hist }) {
  const weeks = hist.weeks;
  const rows = weeks.map(w => {
    const row = { week: w };
    for (const kw of hist.keywords) {
      const c = kw.cells[w];
      row[kw.keyword] = c?.rank != null ? Number(c.rank) : null;
    }
    return row;
  });
  const hasAny = hist.keywords.some(kw => weeks.some(w => kw.cells[w]?.rank != null));
  if (!hasAny) {
    return <div className="monitor-kwhist-empty">GSC rank が全 KW / 全週で null のため折れ線を描画できません</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={rows} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="week" tick={{ fontSize: 10 }} tickFormatter={w => w.slice(5)} />
        <YAxis reversed tick={{ fontSize: 10 }} domain={[1, 'auto']} allowDecimals />
        <Tooltip
          formatter={(v) => (v == null ? '—' : Number(v).toFixed(1))}
          labelFormatter={(w) => `週: ${w}`}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {hist.keywords.map((kw, i) => (
          <Line
            key={kw.keyword}
            type="monotone"
            dataKey={kw.keyword}
            stroke={KW_LINE_COLORS[i % KW_LINE_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
            name={kw.keyword}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function KwHistorySection({ postId }) {
  const [hist, setHist] = useState(null);
  const [err, setErr] = useState(null);
  const [view, setView] = useState('line'); // line | table
  useEffect(() => {
    setHist(null); setErr(null);
    api.getMonitorKwHistory(postId, 10).then(setHist).catch(e => setErr(e.message));
  }, [postId]);
  if (err) return <div className="error-banner">{err}</div>;
  if (!hist) return <div className="loading"><div className="spinner" /></div>;
  if (hist.weeks.length === 0) return <div className="monitor-kwhist-empty">KW スナップショット未取得</div>;
  const weeks = hist.weeks;
  return (
    <div className="monitor-kwhist">
      <div className="monitor-kwhist-toolbar">
        <button className={view === 'line' ? 'active' : ''} onClick={() => setView('line')}>折れ線</button>
        <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>マトリクス表</button>
      </div>
      {view === 'line' ? (
        <KwLineChart hist={hist} />
      ) : (
        <>
          <div className="monitor-kwhist-note">
            各セル: 週ごとの順位。上段が Top 内 rank_order (#1〜#10)、下段が GSC 平均 rank。空白はその週 Top10 圏外。
          </div>
          <div className="monitor-kwhist-table-wrap">
            <table className="monitor-kwhist-table">
              <thead>
                <tr>
                  <th>KW</th>
                  {weeks.map(w => <th key={w}>{w.slice(5)}</th>)}
                </tr>
              </thead>
              <tbody>
                {hist.keywords.map(kw => (
                  <tr key={kw.keyword}>
                    <td className="kwhist-kw">{kw.keyword}</td>
                    {weeks.map(w => {
                      const c = kw.cells[w];
                      if (!c) return <td key={w} className="kwhist-empty">—</td>;
                      return (
                        <td key={w} className={`kwhist-cell rank-${c.rank_order <= 3 ? 'top3' : c.rank_order <= 5 ? 'top5' : 'top10'}`}>
                          <div className="kwhist-order">#{c.rank_order}</div>
                          <div className="kwhist-rank">{c.rank == null ? '' : Number(c.rank).toFixed(1)}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function TimelineModal({ article, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [days, setDays] = useState(90);

  useEffect(() => {
    setData(null);
    setErr(null);
    api.getMonitorTimeline(article.post_id, days)
      .then(setData)
      .catch(e => setErr(e.message));
  }, [article.post_id, days]);

  // 日付を欠けなく埋めてグラフ用データを作る
  const chartData = useMemo(() => {
    if (!data || !data.metrics) return [];
    const map = new Map();
    for (const m of data.metrics) {
      map.set(m.date, m);
    }
    const markersByDate = new Map();
    for (const m of (data.markers?.apply_history || [])) {
      if (!markersByDate.has(m.date)) markersByDate.set(m.date, []);
      markersByDate.get(m.date).push(m);
    }
    if (data.markers?.wp_modified) {
      const d = data.markers.wp_modified;
      if (!markersByDate.has(d)) markersByDate.set(d, []);
      markersByDate.get(d).push({ date: d, type: 'wp_modified', label: `WP更新: ${d}` });
    }
    // range: metrics の最初〜最新
    if (data.metrics.length === 0) return [];
    const start = data.metrics[0].date;
    const end = data.metrics[data.metrics.length - 1].date;
    // scraped yahoo rank のマップ
    const yahooMap = new Map();
    for (const r of (data.scraped?.yahoo || [])) yahooMap.set(r.date, r.rank);
    const result = [];
    let cursor = start;
    while (cursor <= end) {
      const m = map.get(cursor) || { date: cursor };
      result.push({
        date: cursor,
        rank: m.rank ?? null,
        pv: m.pv ?? null,
        aff_click: m.aff_click ?? null,
        gsc_click: m.gsc_click ?? null,
        impressions: m.impressions ?? null,
        ctr: m.ctr ?? null,
        yahoo_rank: yahooMap.has(cursor) ? yahooMap.get(cursor) : null,
        markers: markersByDate.get(cursor) || [],
      });
      // 次の日
      const d = new Date(cursor + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      cursor = d.toISOString().slice(0, 10);
    }
    return result;
  }, [data]);

  const markerSummary = data?.markers;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal monitor-timeline-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{article.title || article.post_id}</div>
            <div className="modal-sub">
              <a href={article.url} target="_blank" rel="noopener">{article.url}</a>
            </div>
            {article.top_kw && <div className="modal-sub">Top KW: {article.top_kw}</div>}
          </div>
          <button onClick={onClose}>×</button>
        </div>

        <div className="monitor-period-selector">
          <span>期間:</span>
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={days === opt.value ? 'active' : ''}
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </button>
          ))}
          <span className="monitor-marker-legend">
            <span className="legend-marker cta">● CTA挿入</span>
            <span className="legend-marker lr">● リンク張替</span>
            <span className="legend-marker wp">┆ WP更新</span>
            <span className="legend-marker kwchg">┆ Top KW変動</span>
          </span>
        </div>

        {err && <div className="error-banner">{err}</div>}
        {!data ? (
          <div className="loading"><div className="spinner" /> 読み込み中...</div>
        ) : chartData.length === 0 ? (
          <div className="loading">期間内のデータなし</div>
        ) : (
          <>
            <ChartPanel title="順位" dataKey="rank" color="#c62828" data={chartData} markers={markerSummary} reverseY
              overlayKey="yahoo_rank" overlayColor="#e91e63" overlayLabel="Yahoo順位"
              topKwChanges={markerSummary?.top_kw_changes || []} />
            <ChartPanel title="PV" dataKey="pv" color="#1565c0" data={chartData} markers={markerSummary} />
            <ChartPanel title="aff_click" dataKey="aff_click" color="#f57f17" data={chartData} markers={markerSummary} />
            <ChartPanel title="GSC clicks" dataKey="gsc_click" color="#6a1b9a" data={chartData} markers={markerSummary} />

            {markerSummary?.apply_history?.length > 0 && (
              <div className="monitor-marker-list">
                <h4>反映履歴（期間内）</h4>
                <ul>
                  {markerSummary.apply_history.map((m, i) => (
                    <li key={i}>
                      <span className={`marker-dot type-${m.type}`}>●</span>
                      <span className="marker-date">{m.date}</span>
                      <span>{m.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="monitor-section-title">要因分析（Claude）</div>
            <AnalysisSection postId={article.post_id} days={days} />

            <div className="monitor-section-title">商材別 aff_click 内訳（期間内）</div>
            <AffiliateBreakdown postId={article.post_id} days={days} />

            <div className="monitor-section-title">KW 順位推移（週別 Top10）</div>
            <KwHistorySection postId={article.post_id} />
          </>
        )}
      </div>
    </div>
  );
}

// ========= スクレイピング設定パネル =========
function ScraperSettingsPanel({ onClose, showToast }) {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([api.getScraperSettings(), api.getScraperStatus()]);
      setSettings({
        enabled: !!s.enabled,
        limit: s.limit ?? 200,
        intervalSec: s.intervalSec ?? 15,
      });
      setStatus(st);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // 実行中はステータスをポーリング
  useEffect(() => {
    if (!status?.running) return;
    const t = setInterval(() => {
      api.getScraperStatus().then(setStatus).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [status?.running]);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await api.updateScraperSettings(settings);
      showToast && showToast('スクレイピング設定を保存しました');
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true); setErr(null);
    try {
      const r = await api.runScraper({ limit: settings.limit, intervalSec: settings.intervalSec });
      if (r.skipped) showToast && showToast('既に実行中です');
      else showToast && showToast(`スクレイピングを開始 (${settings.limit}件 / ${settings.intervalSec}秒間隔)`);
      await loadAll();
    } catch (e) {
      setErr(e.message);
    } finally {
      setRunning(false);
    }
  };

  if (!settings) return <div className="monitor-scraper-panel"><div className="loading"><div className="spinner" /></div></div>;

  const s = status?.status;
  const p = s?.progress;
  return (
    <div className="monitor-scraper-panel">
      <h3>Yahoo! 順位スクレイピング</h3>
      <div className="monitor-scraper-note">
        Top N 記事を対象に、Yahoo! 検索で top_kw の順位 (1〜50位) を毎日スクレイピングします。15秒間隔 / UA 偽装。
      </div>
      <div className="monitor-scraper-grid">
        <label>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={e => setSettings({ ...settings, enabled: e.target.checked })}
          />
          毎日 02:00 JST に自動実行
        </label>
        <label>対象記事数 (PV 上位):
          <input type="number" min="1" max="500"
            value={settings.limit}
            onChange={e => setSettings({ ...settings, limit: Number(e.target.value) })} />
        </label>
        <label>クエリ間隔 (秒):
          <input type="number" min="5" max="60"
            value={settings.intervalSec}
            onChange={e => setSettings({ ...settings, intervalSec: Number(e.target.value) })} />
        </label>
      </div>
      <div className="monitor-scraper-actions">
        <button onClick={save} disabled={saving}>{saving ? '保存中...' : '設定を保存'}</button>
        <button onClick={runNow} disabled={running || status?.running} className="btn-secondary">
          {status?.running ? '実行中...' : '今すぐ実行'}
        </button>
        <button onClick={loadAll} className="btn-secondary">状態を更新</button>
        <button onClick={onClose} className="btn-secondary">閉じる</button>
      </div>
      {err && <div className="error-banner">{err}</div>}
      {p && (
        <div className="monitor-scraper-progress">
          <div>進捗: {p.index} / {p.total}</div>
          <div>発見: {p.succeeded}　圏外: {p.notFound}　失敗: {p.failed}</div>
          {s?.started_at && <div className="monitor-scraper-meta">開始: {new Date(s.started_at).toLocaleString('ja-JP')}</div>}
          {s?.finished_at && !status?.running && <div className="monitor-scraper-meta">終了: {new Date(s.finished_at).toLocaleString('ja-JP')}</div>}
          {s?.result && !status?.running && (
            <div className="monitor-scraper-meta">
              結果: total {s.result.total} / 発見 {s.result.succeeded} / 圏外 {s.result.notFound} / 失敗 {s.result.failed}
            </div>
          )}
        </div>
      )}
      {s?.error && (
        <div className="monitor-scraper-lasterror">直近エラー: {s.error}</div>
      )}
    </div>
  );
}

// ========= メインビュー =========
export default function MonitorView({ showToast }) {
  const [status, setStatus] = useState(null);
  const [articles, setArticles] = useState(null);
  const [latest, setLatest] = useState(null);
  const [err, setErr] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [thresholds, setThresholds] = useState(loadThresholds());
  const [showThresholds, setShowThresholds] = useState(false);
  const [showScraper, setShowScraper] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState('alert'); // alert | rank7 | pv7 | click7
  const [sortDir, setSortDir] = useState('worsen');  // worsen (悪化順) | improve (改善順)
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [timelineFor, setTimelineFor] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [st, lst] = await Promise.all([api.getMonitorStatus(), api.getMonitorArticles()]);
      setStatus(st);
      setArticles(lst.articles);
      setLatest(lst.latest);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const r = await api.refreshMonitor();
      if (r.noop) showToast && showToast('既に最新です');
      else if (r.skipped) showToast && showToast('既に実行中: ' + (r.reason || ''));
      else showToast && showToast(`${r.metrics || 0}件取り込み完了`);
      await loadAll();
    } catch (e) {
      showToast && showToast(e.message, 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleStartBackfill = async () => {
    try {
      const r = await api.startMonitorBackfill();
      if (r.skipped) showToast && showToast('既に実行中です');
      else showToast && showToast('バックフィルを開始しました（バックグラウンド実行）');
      loadAll();
    } catch (e) {
      showToast && showToast(e.message, 'error');
    }
  };

  const handleWpMeta = async () => {
    try {
      const r = await api.runWpMetaBackfill();
      showToast && showToast(`WPメタ ${r.filled}件を更新`);
      await loadAll();
    } catch (e) {
      showToast && showToast(e.message, 'error');
    }
  };

  const handleKwSnapshot = async () => {
    try {
      const r = await api.runKwSnapshot();
      if (r.skipped) showToast && showToast('既に実行中です');
      else showToast && showToast(`KWスナップショット ${r.rows_inserted || 0}件`);
      await loadAll();
    } catch (e) {
      showToast && showToast(e.message, 'error');
    }
  };

  const categories = useMemo(() => {
    if (!articles) return [];
    return [...new Set(articles.map(a => a.category).filter(Boolean))].sort();
  }, [articles]);

  const filteredSorted = useMemo(() => {
    if (!articles) return [];
    let arr = articles;
    if (filterCategory !== 'all') arr = arr.filter(a => a.category === filterCategory);
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter(a =>
        (a.title || '').toLowerCase().includes(s) ||
        String(a.post_id).includes(s) ||
        (a.url || '').toLowerCase().includes(s)
      );
    }
    const scored = arr.map(a => ({ ...a, _score: alertScore(a, thresholds, sortDir) }));
    if (onlyAlerts) {
      return scored.filter(a => a._score > 0).sort((a, b) => b._score - a._score);
    }
    const worsen = sortDir === 'worsen';
    // rank: 正=悪化 / pv, click: 負=下落
    if (sortMode === 'alert') return scored.sort((a, b) => b._score - a._score);
    if (sortMode === 'rank7') {
      return scored.sort((a, b) => {
        const da = rankDiff(a.avg7?.rank, a.avg7_prev?.rank);
        const db = rankDiff(b.avg7?.rank, b.avg7_prev?.rank);
        const na = da == null ? (worsen ? -Infinity : Infinity) : da;
        const nb = db == null ? (worsen ? -Infinity : Infinity) : db;
        return worsen ? nb - na : na - nb; // worsen: 大きい(悪化)が上 / improve: 小さい(改善)が上
      });
    }
    if (sortMode === 'pv7') {
      return scored.sort((a, b) => {
        const da = pctDiff(a.avg7?.pv, a.avg7_prev?.pv);
        const db = pctDiff(b.avg7?.pv, b.avg7_prev?.pv);
        const na = da == null ? (worsen ? Infinity : -Infinity) : da;
        const nb = db == null ? (worsen ? Infinity : -Infinity) : db;
        return worsen ? na - nb : nb - na; // worsen: 小さい(下落)が上 / improve: 大きい(上昇)が上
      });
    }
    if (sortMode === 'click7') {
      return scored.sort((a, b) => {
        const da = pctDiff(a.avg7?.aff_click, a.avg7_prev?.aff_click);
        const db = pctDiff(b.avg7?.aff_click, b.avg7_prev?.aff_click);
        const na = da == null ? (worsen ? Infinity : -Infinity) : da;
        const nb = db == null ? (worsen ? Infinity : -Infinity) : db;
        return worsen ? na - nb : nb - na;
      });
    }
    if (sortMode === 'kwdrift') {
      // 変動大 = Jaccard 小。null は末尾
      return scored.sort((a, b) => {
        const da = a.kw_drift?.jaccard;
        const db = b.kw_drift?.jaccard;
        const na = da == null ? Infinity : da;
        const nb = db == null ? Infinity : db;
        return na - nb;
      });
    }
    return scored;
  }, [articles, filterCategory, search, onlyAlerts, sortMode, sortDir, thresholds]);

  const alertCount = useMemo(() => (articles || []).filter(a => alertScore(a, thresholds, sortDir) > 0).length, [articles, thresholds, sortDir]);

  const backfill = status?.backfill;
  const backfillLabel = backfill
    ? backfill.status === 'done'
      ? 'バックフィル完了'
      : backfill.status === 'stage1_done'
      ? 'Stage1完了 / Stage2実行中'
      : backfill.status === 'stage2_running'
      ? `Stage2実行中 (${backfill.cursor_date} → ${backfill.target_start})`
      : backfill.status
    : null;

  return (
    <>
      <div className="monitor-header">
        <div className="monitor-summary">
          <div><strong>最新データ:</strong> {latest || '—'}</div>
          <div><strong>対象記事:</strong> {status?.articleCount ?? '—'}</div>
          <div><strong>メトリクス行数:</strong> {status?.metricsCount?.toLocaleString() ?? '—'}</div>
          <div><strong>{sortDir === 'improve' ? '改善候補' : 'アラート'}:</strong> <span className={alertCount > 0 ? (sortDir === 'improve' ? 'monitor-improve-count' : 'monitor-alert-count') : ''}>{alertCount}</span></div>
          {backfillLabel && <div className="monitor-backfill-status">{backfillLabel}</div>}
        </div>
        <div className="monitor-actions">
          <button onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? '実行中...' : '今すぐ更新'}
          </button>
          <button onClick={handleStartBackfill} className="btn-secondary">バックフィル再開</button>
          <button onClick={handleKwSnapshot} className="btn-secondary">KWスナップショット</button>
          <button onClick={handleWpMeta} className="btn-secondary">WPメタ補完</button>
          <button onClick={() => setShowThresholds(!showThresholds)} className="btn-secondary">閾値設定</button>
          <button onClick={() => setShowScraper(!showScraper)} className="btn-secondary">スクレイピング設定</button>
        </div>
      </div>

      {showThresholds && (
        <ThresholdPanel thresholds={thresholds} setThresholds={setThresholds} onClose={() => setShowThresholds(false)} />
      )}

      {showScraper && (
        <ScraperSettingsPanel onClose={() => setShowScraper(false)} showToast={showToast} />
      )}

      {err && <div className="error-banner">エラー: {err}</div>}

      <div className="filters monitor-filters">
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="all">全カテゴリ</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="タイトル / ID / URL 検索..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={sortDir} onChange={e => setSortDir(e.target.value)}>
          <option value="worsen">悪化順</option>
          <option value="improve">改善順</option>
        </select>
        <select value={sortMode} onChange={e => setSortMode(e.target.value)}>
          <option value="alert">総合</option>
          <option value="rank7">順位(7日)</option>
          <option value="pv7">PV(7日)</option>
          <option value="click7">aff_click(7日)</option>
          <option value="kwdrift">KW変動大</option>
        </select>
        <label><input type="checkbox" checked={onlyAlerts} onChange={e => setOnlyAlerts(e.target.checked)} /> {sortDir === 'improve' ? '改善候補のみ' : 'アラートのみ'}</label>
      </div>

      {!articles ? (
        <div className="loading"><div className="spinner" /> 読み込み中...</div>
      ) : articles.length === 0 ? (
        <div className="loading">
          データなし。バックフィルの完了を待つか「今すぐ更新」を実行してください。
        </div>
      ) : (
        <div className="monitor-table-wrap">
          <table className="monitor-table">
            <thead>
              <tr>
                <th rowSpan={2} className="monitor-th-article">記事</th>
                <th colSpan={3}>順位 (GSC)</th>
                <th colSpan={3}>PV (GA4)</th>
                <th colSpan={3}>aff_click</th>
                <th rowSpan={2}>CTR / imp</th>
                <th rowSpan={2} title="Top3 KWの Jaccard 類似度（前週比）。低いほど上位KWが変動。">KW変動</th>
              </tr>
              <tr>
                <th>最新</th><th>7日平均</th><th>30日平均</th>
                <th>最新</th><th>7日平均</th><th>30日平均</th>
                <th>最新</th><th>7日平均</th><th>30日平均</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map(a => (
                <MonitorRow
                  key={a.post_id}
                  article={a}
                  thresholds={thresholds}
                  onOpenTimeline={setTimelineFor}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {timelineFor && <TimelineModal article={timelineFor} onClose={() => setTimelineFor(null)} />}
    </>
  );
}
