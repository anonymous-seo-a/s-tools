import { useState, useCallback, useEffect, Fragment } from 'react';
import { api } from '../api';

const FragmentBox = Fragment;

const ACTION_LABEL = {
  create: { label: '作成', color: 'approved' },
  update: { label: '更新', color: 'pending' },
  delete: { label: '削除', color: 'rejected' },
};

const TABLE_LABEL = {
  master_annotations: '注釈',
  master_rules: 'ルール',
  master_completeness_checklist: 'チェック',
};

export default function AuditLogView({ showToast }) {
  const [filter, setFilter] = useState({ table_name: '', record_id: '', since: '', until: '' });
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.table_name) params.table_name = filter.table_name;
      if (filter.record_id)  params.record_id = filter.record_id;
      if (filter.since)      params.since = filter.since;
      if (filter.until)      params.until = filter.until;
      const r = await api.listAuditLog(params);
      setData(r);
    } catch (e) { showToast?.(e.message, 'error'); }
    setLoading(false);
  }, [filter.table_name, filter.record_id, filter.since, filter.until, showToast]);

  useEffect(() => { reload(); }, [reload]);

  const renderJSON = (str) => {
    if (!str) return <span style={{ color: '#aaa' }}>—</span>;
    try {
      return <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {JSON.stringify(JSON.parse(str), null, 2)}
      </pre>;
    } catch {
      return <span>{str}</span>;
    }
  };

  return (
    <div>
      <div className="filters" style={{ marginBottom: 12 }}>
        <select value={filter.table_name} onChange={e => setFilter(f => ({ ...f, table_name: e.target.value }))}>
          <option value="">全テーブル</option>
          <option value="master_annotations">注釈</option>
          <option value="master_rules">ルール</option>
          <option value="master_completeness_checklist">チェック</option>
        </select>
        <input placeholder="record_id" value={filter.record_id} onChange={e => setFilter(f => ({ ...f, record_id: e.target.value }))} style={{ maxWidth: 100 }} />
        <input type="date" value={filter.since} onChange={e => setFilter(f => ({ ...f, since: e.target.value }))} />
        <input type="date" value={filter.until} onChange={e => setFilter(f => ({ ...f, until: e.target.value }))} />
        <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>{data.rows.length} / {data.total} 件</span>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /> 読み込み中...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: 8, textAlign: 'left' }}>日時</th>
                <th style={{ padding: 8, textAlign: 'left' }}>テーブル</th>
                <th style={{ padding: 8, textAlign: 'left' }}>record_id</th>
                <th style={{ padding: 8, textAlign: 'left' }}>操作</th>
                <th style={{ padding: 8, textAlign: 'left' }}>ユーザー</th>
                <th style={{ padding: 8 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(r => (
                <FragmentBox key={r.id}>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: 6, fontSize: 12 }}>{r.changed_at}</td>
                    <td style={{ padding: 6, fontSize: 12 }}>{TABLE_LABEL[r.table_name] || r.table_name}</td>
                    <td style={{ padding: 6, fontFamily: 'monospace' }}>{r.record_id}</td>
                    <td style={{ padding: 6 }}>
                      <span className={`status-badge ${ACTION_LABEL[r.action]?.color || 'pending'}`}>
                        {ACTION_LABEL[r.action]?.label || r.action}
                      </span>
                    </td>
                    <td style={{ padding: 6, fontSize: 12 }}>{r.changed_by}</td>
                    <td style={{ padding: 6 }}>
                      <button className="btn-secondary btn-small"
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                        {expandedId === r.id ? '閉じる' : '詳細'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: 12, background: '#fafafa' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>BEFORE</div>
                            {renderJSON(r.before_value)}
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>AFTER</div>
                            {renderJSON(r.after_value)}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentBox>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#888' }}>履歴なし</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
