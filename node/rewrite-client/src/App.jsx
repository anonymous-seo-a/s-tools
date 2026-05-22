import { useState, useEffect } from 'react';
import MonitorView from './MonitorView';
import MastersView from './masters/MastersView';
import RewriteQueueView from './RewriteQueueView';
import RewriteJudgmentView from './RewriteJudgmentView';

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast ${type}`}>{message}</div>;
}

const TABS = [
  { key: 'rewrite-judgment', label: '判定' },
  { key: 'rewrite-queue',    label: '対象選定' },
  { key: 'monitor',          label: '順位モニタリング' },
  { key: 'masters',          label: 'マスター' },
];

export default function App() {
  const [page, setPage] = useState('rewrite-judgment');
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => setToast({ message, type });

  return (
    <>
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1>リライトツール</h1>
          <a href="/" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, textDecoration: 'none' }}>← s-tools トップ</a>
        </div>
        <div className="header-nav">
          {TABS.map(t => (
            <button key={t.key} className={page === t.key ? 'active' : ''} onClick={() => setPage(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="container">
        {page === 'rewrite-judgment' && <RewriteJudgmentView showToast={showToast} />}
        {page === 'rewrite-queue'    && <RewriteQueueView showToast={showToast} />}
        {page === 'monitor'          && <MonitorView showToast={showToast} />}
        {page === 'masters'          && <MastersView showToast={showToast} />}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
