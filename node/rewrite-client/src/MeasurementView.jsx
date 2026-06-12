import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

// rank は小さいほど上位なので min が上端 (y 軸は反転しない)。
// GSC (確定、青実線) と Yahoo スクレイプ (速報、ピンク破線) を重ね、適用日に縦線。
function Sparkline({ series, yahooSeries, appliedDate }) {
  const gsc = series || [];
  const yahoo = yahooSeries || [];
  if (gsc.length + yahoo.length < 2) {
    return <span className="meas-nodata">データ不足</span>;
  }
  const w = 200, h = 44, pad = 4;
  const dates = [...new Set([...gsc, ...yahoo].map((p) => p.date))].sort();
  const ranks = [...gsc, ...yahoo].map((p) => p.rank);
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const span = max - min || 1;
  const xOf = (date) => pad + (dates.indexOf(date) / Math.max(dates.length - 1, 1)) * (w - pad * 2);
  const yOf = (r) => pad + ((r - min) / span) * (h - pad * 2);
  const toPath = (pts) => pts
    .map((p, i) => `${i ? 'L' : 'M'}${xOf(p.date).toFixed(1)},${yOf(p.rank).toFixed(1)}`)
    .join(' ');
  const boundary = dates.findIndex((d) => d > appliedDate);
  const bx = boundary > 0
    ? (xOf(dates[boundary]) + xOf(dates[boundary - 1])) / 2
    : null;
  return (
    <svg width={w} height={h} className="meas-sparkline">
      {bx != null && (
        <line x1={bx} y1={0} x2={bx} y2={h} stroke="#e67e22" strokeWidth="1" strokeDasharray="3,2" />
      )}
      {gsc.length >= 2 && <path d={toPath(gsc)} fill="none" stroke="#1565c0" strokeWidth="1.5" />}
      {yahoo.length >= 2 && (
        <path d={toPath(yahoo)} fill="none" stroke="#e91e63" strokeWidth="1.2" strokeDasharray="4,2" />
      )}
      {yahoo.length === 1 && (
        <circle cx={xOf(yahoo[0].date)} cy={yOf(yahoo[0].rank)} r="2" fill="#e91e63" />
      )}
    </svg>
  );
}

function DeltaCell({ delta }) {
  if (delta == null) return <span className="meas-muted">—</span>;
  const improved = delta > 0;
  const flat = delta === 0;
  return (
    <span className={`meas-delta ${flat ? 'flat' : improved ? 'up' : 'down'}`}>
      {improved ? '↑' : flat ? '→' : '↓'} {Math.abs(delta).toFixed(1)}
    </span>
  );
}

function RankPair({ before, after, waiting }) {
  return (
    <span className="meas-rankpair">
      <span className="meas-before">{before != null ? before.toFixed(1) : '—'}</span>
      <span className="meas-arrow">→</span>
      {after != null
        ? <span className="meas-after">{after.toFixed(1)}</span>
        : waiting
          ? <span className="meas-waiting">確定待ち</span>
          : <span className="meas-muted">—</span>}
    </span>
  );
}

export default function MeasurementView({ showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getRewriteMeasurement();
      setData(r);
    } catch (e) {
      showToast(e.message, 'error');
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const items = data?.items || [];
  const decided = items.filter((it) => it.rank_delta != null || it.yahoo_delta != null);
  const improved = decided.filter((it) => (it.rank_delta ?? it.yahoo_delta) > 0).length;
  const worsened = decided.filter((it) => (it.rank_delta ?? it.yahoo_delta) < 0).length;
  const waiting = items.length - decided.length;

  return (
    <div>
      <div className="filters meas-toolbar">
        <button className="btn-secondary btn-small" onClick={load} disabled={loading}>
          {loading ? '読込中...' : '再読込'}
        </button>
        {data && (
          <span className="meas-freshness">
            GSC確定: {data.latest_metric_date || '—'} (約4日遅れ) ·
            Yahoo速報: {data.latest_yahoo_date || '—'} (毎日02:00取得)
          </span>
        )}
      </div>

      {!loading && data && items.length > 0 && (
        <div className="stats meas-stats">
          <div className="stat-card"><div className="number">{items.length}</div><div className="label">適用済みリライト</div></div>
          <div className="stat-card"><div className="number meas-num-up">{improved}</div><div className="label">順位改善</div></div>
          <div className="stat-card"><div className="number meas-num-down">{worsened}</div><div className="label">順位悪化</div></div>
          <div className="stat-card"><div className="number meas-num-wait">{waiting}</div><div className="label">計測待ち</div></div>
        </div>
      )}

      {loading && <div className="loading"><div className="spinner" /> 読み込み中...</div>}

      {!loading && data && items.length === 0 && (
        <div className="loading">WP 適用済みのリライトがまだありません</div>
      )}

      {!loading && data && items.length > 0 && (
        <div className="meas-table-wrap">
          <table className="meas-table">
            <thead>
              <tr>
                <th rowSpan={2} className="meas-th-article">記事</th>
                <th rowSpan={2}>適用日</th>
                <th colSpan={2}>GSC 確定 (前28d → 後)</th>
                <th colSpan={2}>Yahoo 速報 (前28d → 後)</th>
                <th rowSpan={2} className="meas-th-spark">
                  推移 <span className="meas-legend"><i className="lg-gsc">―GSC</i> <i className="lg-yahoo">--Yahoo</i></span>
                </th>
              </tr>
              <tr>
                <th>順位</th><th>Δ</th>
                <th>順位</th><th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.session_id}>
                  <td className="meas-article">
                    {it.url ? (
                      <a href={it.url} target="_blank" rel="noreferrer">{it.title || it.url}</a>
                    ) : (it.title || '—')}
                    <span className="meas-article-meta">
                      {it.post_id} · {it.genre} · session #{it.session_id} · diff {it.applied_diff_count}件
                    </span>
                  </td>
                  <td className="meas-date">{it.applied_date}</td>
                  <td className="meas-rank">
                    <RankPair before={it.rank_before} after={it.rank_after} waiting={it.days_after === 0} />
                    <span className="meas-days">{it.days_after > 0 ? `${it.days_after}日計測` : ''}</span>
                  </td>
                  <td className="meas-deltacell"><DeltaCell delta={it.rank_delta} /></td>
                  <td className="meas-rank">
                    <RankPair before={it.yahoo_before} after={it.yahoo_after} waiting={false} />
                    <span className="meas-days">{it.yahoo_days_after > 0 ? `${it.yahoo_days_after}日計測` : ''}</span>
                  </td>
                  <td className="meas-deltacell"><DeltaCell delta={it.yahoo_delta} /></td>
                  <td className="meas-spark">
                    <Sparkline series={it.series} yahooSeries={it.yahoo_series} appliedDate={it.applied_date} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
