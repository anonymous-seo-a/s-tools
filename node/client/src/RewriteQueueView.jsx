import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

const AXIS_OPTIONS = [
  { key: 'axis1_information_gain', label: '軸1 構造的不足', short: '軸1' },
  { key: 'axis2_potential',        label: '軸2 経済合理性', short: '軸2' },
  { key: 'axis3_freshness',        label: '軸3 鮮度',       short: '軸3' },
  { key: 'axis4_decay',            label: '軸4 Content decay', short: '軸4' },
];

const STATUS_OPTIONS = [
  { key: '',           label: '全て' },
  { key: 'queued',      label: '待機中' },
  { key: 'in_progress', label: '進行中' },
  { key: 'completed',   label: '完了' },
  { key: 'cancelled',   label: 'キャンセル' },
];

function formatScore(v, axis) {
  if (v == null) return '—';
  if (axis === 'axis2_potential') return Math.round(v).toLocaleString();
  if (axis === 'axis3_freshness') return v.toFixed(1) + 'ヶ月';
  if (axis === 'axis4_decay') return v.toFixed(3);
  return v.toFixed(2);
}

function ComponentSummary({ axis, components }) {
  if (!components) return null;
  if (axis === 'axis2_potential') {
    return (
      <span className="article-meta">
        impr={Number(components.sum_impressions || 0).toLocaleString()} ·
        avg_pos={(components.impression_weighted_avg_position ?? 0).toFixed(1)} ·
        days={components.days_with_data}
      </span>
    );
  }
  if (axis === 'axis3_freshness') {
    return (
      <span className="article-meta">
        wp_modified={String(components.wp_modified || '').slice(0, 10)}
      </span>
    );
  }
  if (axis === 'axis4_decay') {
    const d = components.deltas || {};
    return (
      <span className="article-meta">
        Δclick={d.click_delta_pct == null ? 'n/a' : (d.click_delta_pct * 100).toFixed(1) + '%'} ·
        Δimpr={d.impr_delta_pct == null ? 'n/a' : (d.impr_delta_pct * 100).toFixed(1) + '%'} ·
        Δpos={(d.position_delta ?? 0).toFixed(2)}
      </span>
    );
  }
  if (axis === 'axis1_information_gain') {
    return <span className="article-meta">{components.status || ''}</span>;
  }
  return null;
}

function AxisQueue({ showToast, onRegister }) {
  const [axis, setAxis] = useState('axis2_potential');
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getRewriteCandidates(axis, limit);
      setData(r);
    } catch (e) {
      showToast(e.message, 'error');
    }
    setLoading(false);
  }, [axis, limit, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleRegister = async (item) => {
    try {
      await api.createRewriteQueue({
        post_id: item.post_id,
        selected_axis: item.axis,
        selected_score: item.score_value,
        rewrite_target_score_id: item.id,
      });
      showToast(`post=${item.post_id} をキュー登録しました`);
      onRegister?.();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  return (
    <div>
      <div className="filters">
        <label style={{ fontSize: 12, color: '#888' }}>軸</label>
        <select value={axis} onChange={(e) => setAxis(e.target.value)}>
          {AXIS_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <label style={{ fontSize: 12, color: '#888', marginLeft: 12 }}>表示件数</label>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ minWidth: 80 }}>
          {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn-secondary btn-small" onClick={load} disabled={loading}>
          {loading ? '読込中...' : '再読込'}
        </button>
        {data?.calculated_at && (
          <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>
            最終計算: {new Date(data.calculated_at).toLocaleString('ja-JP')}
          </span>
        )}
      </div>

      {loading && <div className="loading"><div className="spinner" /> 読み込み中...</div>}

      {!loading && data && data.items.length === 0 && (
        <div className="loading">
          {axis === 'axis1_information_gain'
            ? '軸1 (IG Score) は Phase 2 で実装予定です'
            : 'スコア計算結果なし。日次バッチ実行後に再表示してください'}
        </div>
      )}

      {!loading && data && data.items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>#</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>post_id</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>スコア</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>内訳</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, i) => {
                const isPending = item.score_value === null;
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: isPending ? 0.65 : 1 }}>
                    <td style={{ padding: '8px 12px', color: '#888' }}>{i + 1}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                      {item.post_id}
                      {isPending && (
                        <span className="status-badge pending" style={{ marginLeft: 8, fontSize: 10 }}>
                          pending_phase2
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                      {formatScore(item.score_value, item.axis)}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#555' }}>
                      <ComponentSummary axis={item.axis} components={item.score_components} />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <button className="btn-apply btn-small" onClick={() => handleRegister(item)}>キュー登録</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function QueueStatus({ showToast, refreshKey }) {
  const [status, setStatus] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getRewriteQueue(status || undefined);
      setItems(r.items || []);
    } catch (e) {
      showToast(e.message, 'error');
    }
    setLoading(false);
  }, [status, showToast]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await api.updateRewriteQueue(id, { status: newStatus });
      showToast('ステータス更新');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  return (
    <div>
      <div className="filters">
        <label style={{ fontSize: 12, color: '#888' }}>ステータス</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button className="btn-secondary btn-small" onClick={load} disabled={loading}>
          {loading ? '読込中...' : '再読込'}
        </button>
        <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>{items.length}件</span>
      </div>

      {loading && <div className="loading"><div className="spinner" /> 読み込み中...</div>}

      {!loading && items.length === 0 && (
        <div className="loading">登録されたキューがありません</div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>id</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>post_id</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>選定軸</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>スコア</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>登録日時</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>ステータス</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q) => {
                const axisLabel = AXIS_OPTIONS.find((o) => o.key === q.selected_axis)?.short || q.selected_axis || '—';
                const badgeClass = q.status === 'queued' ? 'pending'
                  : q.status === 'in_progress' ? 'applied'
                  : q.status === 'completed' ? 'approved'
                  : 'rejected';
                return (
                  <tr key={q.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 12px', color: '#888' }}>{q.id}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{q.post_id}</td>
                    <td style={{ padding: '8px 12px' }}>{axisLabel}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {formatScore(q.selected_score, q.selected_axis)}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#888' }}>
                      {new Date(q.selected_at).toLocaleString('ja-JP')}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={`status-badge ${badgeClass}`}>{q.status}</span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <select
                        value={q.status}
                        onChange={(e) => handleStatusChange(q.id, e.target.value)}
                        style={{ width: 'auto', minWidth: 130, fontSize: 12, padding: '4px 8px' }}
                      >
                        {STATUS_OPTIONS.filter((o) => o.key).map((o) => (
                          <option key={o.key} value={o.key}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RewriteQueueView({ showToast }) {
  const [tab, setTab] = useState('candidates');
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div>
      <div className="filters" style={{ background: 'transparent', boxShadow: 'none', padding: 0 }}>
        <button
          className={tab === 'candidates' ? 'btn-apply btn-small' : 'btn-secondary btn-small'}
          onClick={() => setTab('candidates')}
        >
          軸別候補
        </button>
        <button
          className={tab === 'queue' ? 'btn-apply btn-small' : 'btn-secondary btn-small'}
          onClick={() => setTab('queue')}
        >
          登録済みキュー
        </button>
      </div>

      {tab === 'candidates' && (
        <AxisQueue showToast={showToast} onRegister={() => setRefreshKey((k) => k + 1)} />
      )}
      {tab === 'queue' && (
        <QueueStatus showToast={showToast} refreshKey={refreshKey} />
      )}
    </div>
  );
}
