import { useState, useCallback, useEffect } from 'react';
import { api } from '../api';
import CsvIO from './CsvIO';

const STATUS_LABEL = { draft: 'draft', verified: 'verified', deprecated: 'deprecated' };

export default function RuleList({ navigate, showToast }) {
  const [filter, setFilter] = useState({ category: '', rule_type: '', status: '', search: '' });
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.category)  params.category = filter.category;
      if (filter.rule_type) params.rule_type = filter.rule_type;
      if (filter.status)    params.status = filter.status;
      const r = await api.listRules(params);
      setData(r);
    } catch (e) { showToast?.(e.message, 'error'); }
    setLoading(false);
  }, [filter.category, filter.rule_type, filter.status, showToast]);

  useEffect(() => { reload(); }, [reload]);

  const visible = data.rows.filter(r => {
    if (!filter.search) return true;
    const q = filter.search.toLowerCase();
    return (r.ng_text || '').toLowerCase().includes(q)
        || (r.correct_text || '').toLowerCase().includes(q)
        || (r.product_ids || '').toLowerCase().includes(q);
  });

  const toggleAll = () => {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map(r => r.id)));
  };
  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const bulkStatus = async (status) => {
    if (selected.size === 0) return;
    if (!confirm(`選択 ${selected.size} 件を ${status} に変更しますか？`)) return;
    try {
      for (const id of selected) await api.updateRule(id, { status });
      showToast?.(`${selected.size} 件を更新しました`);
      setSelected(new Set());
      reload();
    } catch (e) { showToast?.(e.message, 'error'); }
  };

  return (
    <div>
      <div className="filters" style={{ marginBottom: 12 }}>
        <select value={filter.category} onChange={e => setFilter(f => ({ ...f, category: e.target.value }))}>
          <option value="">全カテゴリ</option>
          <option value="cardloan">cardloan</option>
        </select>
        <select value={filter.rule_type} onChange={e => setFilter(f => ({ ...f, rule_type: e.target.value }))}>
          <option value="">全種別</option>
          <option value="禁止表現">禁止表現</option>
          <option value="必須表現">必須表現</option>
          <option value="正式表記">正式表記</option>
        </select>
        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
          <option value="">全ステータス</option>
          <option value="draft">draft</option>
          <option value="verified">verified</option>
          <option value="deprecated">deprecated</option>
        </select>
        <input placeholder="検索..." value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))} style={{ maxWidth: 200 }} />
        <button className="btn-approve btn-small" onClick={() => navigate('rule-edit', { id: 'new' })} style={{ marginLeft: 'auto' }}>
          + 新規追加
        </button>
      </div>

      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <CsvIO table="master_rules" filter={{
          category: filter.category, status: filter.status,
        }} onImported={reload} showToast={showToast} />
        {selected.size > 0 && (
          <>
            <span style={{ fontSize: 12, color: '#666' }}>{selected.size} 件選択中</span>
            <button className="btn-approve btn-small" onClick={() => bulkStatus('verified')}>一括 verified</button>
            <button className="btn-secondary btn-small" onClick={() => bulkStatus('draft')}>一括 draft</button>
            <button className="btn-reject btn-small" onClick={() => bulkStatus('deprecated')}>一括 deprecated</button>
          </>
        )}
        <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>{visible.length} / {data.total} 件</span>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /> 読み込み中...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: 8, width: 30 }}>
                  <input type="checkbox" checked={visible.length > 0 && selected.size === visible.length} onChange={toggleAll} />
                </th>
                <th style={{ padding: 8, textAlign: 'left' }}>種別</th>
                <th style={{ padding: 8, textAlign: 'left' }}>商材</th>
                <th style={{ padding: 8, textAlign: 'left' }}>NG 表現</th>
                <th style={{ padding: 8, textAlign: 'left' }}>正しい表現</th>
                <th style={{ padding: 8, textAlign: 'left' }}>条件</th>
                <th style={{ padding: 8, textAlign: 'center' }}>状態</th>
                <th style={{ padding: 8 }}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: r.status === 'deprecated' ? 0.5 : 1 }}>
                  <td style={{ padding: 6, textAlign: 'center' }}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td style={{ padding: 6 }}>
                    <span className={`status-badge ${r.rule_type === '禁止表現' ? 'rejected' : r.rule_type === '必須表現' ? 'pending' : 'approved'}`}>
                      {r.rule_type}
                    </span>
                  </td>
                  <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 12 }}>{r.product_ids}</td>
                  <td style={{ padding: 6, fontSize: 12 }}>{r.ng_text}</td>
                  <td style={{ padding: 6, fontSize: 12 }}>{r.correct_text || <span style={{ color: '#aaa' }}>—</span>}</td>
                  <td style={{ padding: 6, fontSize: 12 }}>{r.condition}</td>
                  <td style={{ padding: 6, textAlign: 'center' }}>
                    <span className={`status-badge ${r.status === 'verified' ? 'approved' : r.status === 'deprecated' ? 'rejected' : 'pending'}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td style={{ padding: 6, textAlign: 'right' }}>
                    <button className="btn-secondary btn-small" onClick={() => navigate('rule-edit', { id: r.id })}>編集</button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#888' }}>該当データなし</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
