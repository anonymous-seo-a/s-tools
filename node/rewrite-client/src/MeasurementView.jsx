import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

// rank は小さいほど上位なので y 軸は反転しない (min が上端)。
// 適用日の境界に縦線を引き、前後を視覚で分離する。
function Sparkline({ series, appliedDate }) {
  if (!series || series.length < 2) {
    return <span style={{ color: '#bbb', fontSize: 11 }}>データ不足</span>;
  }
  const w = 180, h = 40, pad = 3;
  const ranks = series.map((p) => p.rank);
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const span = max - min || 1;
  const x = (i) => pad + (i / (series.length - 1)) * (w - pad * 2);
  const y = (r) => pad + ((r - min) / span) * (h - pad * 2);
  const path = series
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rank).toFixed(1)}`)
    .join(' ');
  const boundaryIdx = series.findIndex((p) => p.date > appliedDate);
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {boundaryIdx > 0 && (
        <line
          x1={x(boundaryIdx - 0.5)} y1={0} x2={x(boundaryIdx - 0.5)} y2={h}
          stroke="#e67e22" strokeWidth="1" strokeDasharray="3,2"
        />
      )}
      <path d={path} fill="none" stroke="#1565c0" strokeWidth="1.5" />
    </svg>
  );
}

function DeltaCell({ delta }) {
  if (delta == null) return <span style={{ color: '#bbb' }}>—</span>;
  const improved = delta > 0;
  const flat = delta === 0;
  return (
    <span style={{ fontWeight: 600, color: flat ? '#888' : improved ? '#2e7d32' : '#c62828' }}>
      {improved ? '↑' : flat ? '→' : '↓'} {Math.abs(delta).toFixed(1)}
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

  return (
    <div>
      <div className="filters">
        <button className="btn-secondary btn-small" onClick={load} disabled={loading}>
          {loading ? '読込中...' : '再読込'}
        </button>
        {data && (
          <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>
            {data.count}件 · 順位データ最新日: {data.latest_metric_date || '—'} (GSC 約4日遅れ)
          </span>
        )}
      </div>

      {loading && <div className="loading"><div className="spinner" /> 読み込み中...</div>}

      {!loading && data && data.items.length === 0 && (
        <div className="loading">WP 適用済みのリライトがまだありません</div>
      )}

      {!loading && data && data.items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>記事</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>ジャンル</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>適用日</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>適用前 (28d)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>適用後</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Δ順位</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>計測日数</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>推移 (前28d〜)</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.session_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 12px', maxWidth: 280 }}>
                    <span style={{ fontFamily: 'monospace', color: '#888', marginRight: 6 }}>{it.post_id}</span>
                    {it.url ? (
                      <a href={it.url} target="_blank" rel="noreferrer" style={{ color: '#1565c0', textDecoration: 'none' }}>
                        {it.title || it.url}
                      </a>
                    ) : (it.title || '—')}
                    <span className="article-meta" style={{ display: 'block', fontSize: 11, color: '#999' }}>
                      session #{it.session_id} · diff {it.applied_diff_count}件適用
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>{it.genre}</td>
                  <td style={{ padding: '8px 12px', fontSize: 12 }}>{it.applied_date}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    {it.rank_before != null ? it.rank_before.toFixed(1) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                    {it.rank_after != null ? it.rank_after.toFixed(1) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <DeltaCell delta={it.rank_delta} />
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#888' }}>
                    {it.days_after}日
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <Sparkline series={it.series} appliedDate={it.applied_date} />
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
