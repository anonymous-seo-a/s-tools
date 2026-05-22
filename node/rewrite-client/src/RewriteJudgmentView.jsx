import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

const STATUS_OPTIONS = [
  { key: 'awaiting_diff_judgment', label: '判定待ち' },
  { key: '',                       label: '全て' },
  { key: 'completed',              label: '完了' },
  { key: 'generating',             label: '生成中' },
  { key: 'analyzing',              label: '分析中' },
  { key: 'failed',                 label: '失敗' },
];

const JUDGMENT_BADGE = {
  pending:  'pending',
  approved: 'approved',
  rejected: 'rejected',
};

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('ja-JP');
}

function fmtCost(v) {
  if (v == null) return '—';
  return `$${Number(v).toFixed(4)}`;
}

function SessionRow({ s, selected, onSelect }) {
  return (
    <tr
      style={{
        borderBottom: '1px solid #f0f0f0',
        background: selected ? '#e3f2fd' : 'transparent',
        cursor: 'pointer',
      }}
      onClick={() => onSelect(s.id)}
    >
      <td style={{ padding: '8px 12px', color: '#888' }}>{s.id}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{s.post_id}</td>
      <td style={{ padding: '8px 12px' }}>
        <span className={`status-badge ${s.status === 'awaiting_diff_judgment' ? 'pending'
                       : s.status === 'completed' ? 'approved'
                       : s.status === 'failed' ? 'rejected' : 'applied'}`}>
          {s.status}
        </span>
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{s.diff_count ?? 0}</td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
        <span style={{ color: '#f57f17' }}>{s.pending_count ?? 0}</span>
        {' / '}
        <span style={{ color: '#2e7d32' }}>{s.approved_count ?? 0}</span>
        {' / '}
        <span style={{ color: '#c62828' }}>{s.rejected_count ?? 0}</span>
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtCost(s.cost_total_usd)}</td>
      <td style={{ padding: '8px 12px', fontSize: 12, color: '#888' }}>{fmtDate(s.started_at)}</td>
    </tr>
  );
}

function DiffCard({ diff, onJudge, busyId }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNote, setRejectNote] = useState('');

  const isBusy = busyId === diff.id;
  const badgeClass = JUDGMENT_BADGE[diff.daiki_judgment] || 'pending';

  const handleApprove = () => onJudge(diff.id, { judgment: 'approved' });
  const handleStartReject = () => {
    setRejectReason(diff.daiki_reject_reason || '');
    setRejectNote(diff.daiki_reject_note || '');
    setRejecting(true);
  };
  const handleConfirmReject = () => {
    onJudge(diff.id, {
      judgment: 'rejected',
      reject_reason: rejectReason || null,
      reject_note: rejectNote || null,
    });
    setRejecting(false);
  };
  const handleResetPending = () => onJudge(diff.id, { judgment: 'pending' });

  return (
    <div className="result-row">
      <div className="result-row-header">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#888', fontSize: 12 }}>#{diff.diff_order}</span>
          <span className="result-heading">{diff.target_section}</span>
          <span className="status-badge applied">{diff.change_type}</span>
          <span style={{ fontSize: 11, color: '#888' }}>{diff.change_category}</span>
          {diff.risk_flag && diff.risk_flag !== 'none' && (
            <span className="status-badge rejected">risk: {diff.risk_flag}</span>
          )}
          <span style={{ fontSize: 11, color: '#888' }}>conf: {diff.llm_confidence}</span>
          <span className={`status-badge ${badgeClass}`}>{diff.daiki_judgment}</span>
          {diff.judged_at && (
            <span style={{ fontSize: 11, color: '#888' }}>判定: {fmtDate(diff.judged_at)}</span>
          )}
        </div>
      </div>

      {diff.rationale && (
        <div className="result-reason" style={{ marginTop: 6 }}>{diff.rationale}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>BEFORE</div>
          <pre style={{
            background: '#fafafa', border: '1px solid #eee', borderRadius: 6,
            padding: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 240, overflow: 'auto', margin: 0,
          }}>{diff.content_before || '(なし)'}</pre>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>AFTER</div>
          <pre style={{
            background: '#f1f8e9', border: '1px solid #dcedc8', borderRadius: 6,
            padding: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 240, overflow: 'auto', margin: 0,
          }}>{diff.content_after || '(なし)'}</pre>
        </div>
      </div>

      {diff.daiki_judgment === 'rejected' && (diff.daiki_reject_reason || diff.daiki_reject_note) && (
        <div style={{ marginTop: 8, padding: 8, background: '#ffebee', borderRadius: 6, fontSize: 12 }}>
          <strong>却下理由:</strong> {diff.daiki_reject_reason || '—'}
          {diff.daiki_reject_note && <div style={{ marginTop: 4, color: '#666' }}>{diff.daiki_reject_note}</div>}
        </div>
      )}

      {rejecting && (
        <div style={{ marginTop: 8, padding: 10, background: '#fff3e0', borderRadius: 6 }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>却下理由 (任意):</div>
          <input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="例: regulation_violation / off_topic / factually_wrong"
            style={{ marginBottom: 6 }}
          />
          <textarea
            rows={2}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="補足メモ (任意)"
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn-reject btn-small" onClick={handleConfirmReject} disabled={isBusy}>却下確定</button>
            <button className="btn-secondary btn-small" onClick={() => setRejecting(false)} disabled={isBusy}>キャンセル</button>
          </div>
        </div>
      )}

      <div className="result-actions" style={{ marginTop: 10 }}>
        {diff.daiki_judgment !== 'approved' && (
          <button className="btn-approve btn-small" onClick={handleApprove} disabled={isBusy || rejecting}>承認</button>
        )}
        {diff.daiki_judgment !== 'rejected' && !rejecting && (
          <button className="btn-reject btn-small" onClick={handleStartReject} disabled={isBusy}>却下</button>
        )}
        {diff.daiki_judgment !== 'pending' && !rejecting && (
          <button className="btn-secondary btn-small" onClick={handleResetPending} disabled={isBusy}>未判定に戻す</button>
        )}
      </div>
    </div>
  );
}

function SessionDetail({ sessionId, showToast, onJudged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyDiffId, setBusyDiffId] = useState(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const d = await api.getJudgmentSession(sessionId);
      setDetail(d);
    } catch (e) {
      showToast(e.message, 'error');
    }
    setLoading(false);
  }, [sessionId, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleJudge = async (diffId, body) => {
    setBusyDiffId(diffId);
    try {
      const updated = await api.updateDiffJudgment(diffId, body);
      setDetail((prev) => prev ? {
        ...prev,
        diffs: prev.diffs.map((d) => d.id === diffId ? { ...d, ...updated } : d),
      } : prev);
      showToast(`#${diffId} → ${body.judgment}`);
      onJudged?.();
    } catch (e) {
      showToast(e.message, 'error');
    }
    setBusyDiffId(null);
  };

  if (!sessionId) return <div className="loading">左の一覧からセッションを選択してください</div>;
  if (loading && !detail) return <div className="loading"><div className="spinner" /> 読み込み中...</div>;
  if (!detail) return null;

  const counts = detail.diffs.reduce((acc, d) => {
    acc[d.daiki_judgment] = (acc[d.daiki_judgment] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="article-group" style={{ marginTop: 16 }}>
      <div className="article-header">
        <div>
          <div className="article-title">
            session #{detail.id} · post_id={detail.post_id}
            <span className={`status-badge ${detail.status === 'awaiting_diff_judgment' ? 'pending'
                           : detail.status === 'completed' ? 'approved' : 'applied'}`}
                  style={{ marginLeft: 8 }}>
              {detail.status}
            </span>
          </div>
          <div className="article-meta" style={{ marginTop: 4 }}>
            {detail.model_analysis} → {detail.model_generation} · cost {fmtCost(detail.cost_total_usd)} · {fmtDate(detail.started_at)}
          </div>
          <div className="article-meta" style={{ marginTop: 2 }}>
            diffs: total {detail.diffs.length} · pending {counts.pending || 0} · approved {counts.approved || 0} · rejected {counts.rejected || 0}
          </div>
          {detail.high_risk_categories && (
            <div className="article-meta" style={{ marginTop: 2, color: '#c62828' }}>
              high_risk: {detail.high_risk_categories}
            </div>
          )}
        </div>
        <button className="btn-secondary btn-small" onClick={load} disabled={loading}>
          {loading ? '更新中...' : '再読込'}
        </button>
      </div>

      {detail.diffs.length === 0 ? (
        <div className="loading">このセッションには diff がありません</div>
      ) : (
        detail.diffs.map((d) => (
          <DiffCard key={d.id} diff={d} onJudge={handleJudge} busyId={busyDiffId} />
        ))
      )}
    </div>
  );
}

export default function RewriteJudgmentView({ showToast }) {
  const [status, setStatus] = useState('awaiting_diff_judgment');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getJudgmentSessions({ status: status || undefined, limit: 100 });
      setItems(r.items || []);
      if (selectedId == null && r.items && r.items.length > 0) {
        setSelectedId(r.items[0].id);
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
    setLoading(false);
  }, [status, selectedId, showToast]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  return (
    <div>
      <div className="filters">
        <label style={{ fontSize: 12, color: '#888' }}>ステータス</label>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setSelectedId(null); }}>
          {STATUS_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button className="btn-secondary btn-small" onClick={load} disabled={loading}>
          {loading ? '読込中...' : '再読込'}
        </button>
        <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>{items.length}件</span>
      </div>

      {loading && items.length === 0 && <div className="loading"><div className="spinner" /> 読み込み中...</div>}
      {!loading && items.length === 0 && <div className="loading">対象セッションがありません</div>}

      {items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse', background: 'white',
            borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', fontSize: 13,
          }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>id</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>post_id</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>status</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>diffs</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>pending / appr / rej</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>cost</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>開始</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <SessionRow key={s.id} s={s} selected={selectedId === s.id} onSelect={setSelectedId} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SessionDetail sessionId={selectedId} showToast={showToast} onJudged={load} />
    </div>
  );
}
