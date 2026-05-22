import { useState, useEffect } from 'react';
import { api } from '../api';

const PRODUCT_LABELS = {
  acom: 'アコム',
  aiful: 'アイフル',
  promise: 'プロミス',
  mobit: 'SMBCモビット',
};

function ProgressBar({ value, total, color = '#1565c0' }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ background: '#e0e0e0', borderRadius: 4, height: 10, overflow: 'hidden' }}>
        <div style={{ background: color, height: 10, width: `${pct}%`, transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{value} / {total} ({pct}%)</div>
    </div>
  );
}

export default function Dashboard({ navigate, showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCompletenessSummary()
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { showToast?.(e.message, 'error'); setLoading(false); });
  }, [showToast]);

  if (loading) return <div className="loading"><div className="spinner" /> 読み込み中...</div>;
  if (!data || data.length === 0) return <div className="loading">データなし</div>;

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>商材別 完成度</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
        {data.map(p => (
          <div key={p.product_id} className="article-group" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  {PRODUCT_LABELS[p.product_id] || p.product_id}
                  <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>({p.product_id})</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-secondary btn-small" onClick={() => navigate('checklist', { product_id: p.product_id })}>
                  チェック
                </button>
                <button className="btn-secondary btn-small" onClick={() => navigate('annotations', { product_id: p.product_id })}>
                  注釈
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                  チェックリスト進捗（done / total）
                </div>
                <ProgressBar value={p.checklist.done} total={p.checklist.total} color="#2e7d32" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                  注釈検証進捗（verified / total）
                </div>
                <ProgressBar value={p.annotations.verified} total={p.annotations.total} color="#1565c0" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: 12, background: '#f8f9fa', borderRadius: 8, fontSize: 12, color: '#555' }}>
        <strong>運用フロー:</strong> draft で投入 → ゆかちゃんがチェック完了 → Daiki が verified に昇格
      </div>
    </div>
  );
}
