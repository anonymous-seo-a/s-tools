import { useState, useEffect } from 'react';
import { api } from './api';
import MonitorView from './MonitorView';
import MastersView from './masters/MastersView';
import RewriteQueueView from './RewriteQueueView';
import RewriteJudgmentView from './RewriteJudgmentView';

function Toast({ message, type, onClose }) {
  // エラーは自動消滅させない (500 本文など長文を読み切れるように)。クリックで閉じる。
  useEffect(() => {
    if (type === 'error') return undefined;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose, type]);
  return (
    <div
      className={`toast ${type}`}
      onClick={onClose}
      title="クリックで閉じる"
      style={{ cursor: 'pointer', whiteSpace: 'pre-wrap', maxWidth: 480, wordBreak: 'break-word' }}
    >{message}</div>
  );
}

// ロール別 LLM モデルトグル (analysis = 分析, generation = 生成)。
// 選択肢はサーバ側 ALLOWED_MODELS が真実の源。切替は即 PUT → 永続化。
function ModelToggle({ showToast }) {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    api.getLlmModels().then(setConfig).catch(() => {});
  }, []);

  if (!config) return null;

  const select = async (role, id) => {
    if (config.current[role] === id) return;
    try {
      const next = await api.updateLlmModels({ [role]: id });
      setConfig(next);
      showToast(`${role === 'analysis' ? '分析' : '生成'}モデル → ${id}`);
    } catch (err) {
      showToast(`モデル切替失敗: ${err.message}`, 'error');
    }
  };

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11 }}>
      {[['analysis', '分析'], ['generation', '生成']].map(([role, label]) => (
        <div key={role} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ opacity: 0.7 }}>{label}</span>
          {config.allowed.map((m) => (
            <button
              key={m.id}
              onClick={() => select(role, m.id)}
              style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: config.current[role] === m.id ? 'white' : 'rgba(255,255,255,0.15)',
                color: config.current[role] === m.id ? '#1565c0' : 'white',
              }}
            >{m.label}</button>
          ))}
        </div>
      ))}
    </div>
  );
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
        <div className="header-nav" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 16 }}>
            {TABS.map(t => (
              <button key={t.key} className={page === t.key ? 'active' : ''} onClick={() => setPage(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <ModelToggle showToast={showToast} />
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
