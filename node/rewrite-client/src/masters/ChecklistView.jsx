import { useState, useCallback, useEffect } from 'react';
import { api } from '../api';
import CsvIO from './CsvIO';

const STATUS_OPTIONS = [
  { value: 'pending',     label: '未着手',  color: '#9e9e9e' },
  { value: 'in_progress', label: '進行中',  color: '#1565c0' },
  { value: 'done',        label: '完了',    color: '#2e7d32' },
];

export default function ChecklistView({ showToast }) {
  const [filter, setFilter] = useState({ category: '', product_id: '', status: '' });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.category)   params.category = filter.category;
      if (filter.product_id) params.product_id = filter.product_id;
      if (filter.status)     params.status = filter.status;
      const r = await api.listChecklist(params);
      setRows(Array.isArray(r) ? r : (r.rows || []));
    } catch (e) { showToast?.(e.message, 'error'); }
    setLoading(false);
  }, [filter.category, filter.product_id, filter.status, showToast]);

  useEffect(() => { reload(); }, [reload]);

  const handleStatusChange = async (id, status) => {
    try {
      await api.updateChecklistItem(id, { status });
      reload();
    } catch (e) { showToast?.(e.message, 'error'); }
  };

  const handleNotesChange = async (id, notes) => {
    try {
      await api.updateChecklistItem(id, { notes });
      reload();
    } catch (e) { showToast?.(e.message, 'error'); }
  };

  // 商材別グルーピング
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.product_id]) grouped[r.product_id] = [];
    grouped[r.product_id].push(r);
  }
  for (const k of Object.keys(grouped)) {
    grouped[k].sort((a, b) => a.check_order - b.check_order);
  }

  return (
    <div>
      <div className="filters" style={{ marginBottom: 12 }}>
        <select value={filter.product_id} onChange={e => setFilter(f => ({ ...f, product_id: e.target.value }))}>
          <option value="">全商材</option>
          <option value="acom">acom</option>
          <option value="aiful">aiful</option>
          <option value="promise">promise</option>
          <option value="mobit">mobit</option>
        </select>
        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
          <option value="">全ステータス</option>
          <option value="pending">未着手</option>
          <option value="in_progress">進行中</option>
          <option value="done">完了</option>
        </select>
        <CsvIO table="master_completeness_checklist" filter={{
          category: filter.category, product_id: filter.product_id, status: filter.status,
        }} onImported={reload} showToast={showToast} />
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /> 読み込み中...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="loading">データなし</div>
      ) : (
        Object.entries(grouped).map(([pid, items]) => {
          const done = items.filter(i => i.status === 'done').length;
          return (
            <div key={pid} className="article-group" style={{ marginBottom: 12 }}>
              <div className="article-header">
                <div>
                  <div className="article-title">{pid}</div>
                  <div className="article-meta">{done} / {items.length} 完了</div>
                </div>
              </div>

              {items.map(item => (
                <div key={item.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#888', minWidth: 24 }}>{item.check_order}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{item.check_item}</span>
                  <span style={{ fontSize: 11, color: '#666', padding: '2px 6px', background: '#f0f0f0', borderRadius: 4 }}>
                    {item.assignee || '-'}
                  </span>
                  <select value={item.status} onChange={e => handleStatusChange(item.id, e.target.value)}
                    style={{ fontSize: 12, padding: '4px 8px' }}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input placeholder="メモ" defaultValue={item.notes || ''}
                    onBlur={e => { if (e.target.value !== (item.notes || '')) handleNotesChange(item.id, e.target.value); }}
                    style={{ flex: '1 1 200px', minWidth: 150, fontSize: 12, padding: '4px 8px' }} />
                  {item.completed_at && (
                    <span style={{ fontSize: 11, color: '#888' }}>完了: {item.completed_at}</span>
                  )}
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
