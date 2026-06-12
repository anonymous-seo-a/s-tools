import { useState, useEffect } from 'react';
import { api } from './api';
import MonitorView from './MonitorView';
import MastersView from './masters/MastersView';
import RewriteQueueView from './RewriteQueueView';
import RewriteJudgmentView from './RewriteJudgmentView';
import MeasurementView from './MeasurementView';

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
    <div className="model-toggle">
      {[['analysis', '分析'], ['generation', '生成']].map(([role, label]) => (
        <label key={role}>
          <span>{label}</span>
          <select value={config.current[role]} onChange={(e) => select(role, e.target.value)}>
            {config.allowed.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

const TABS = [
  { key: 'rewrite-judgment', label: '判定' },
  { key: 'rewrite-queue',    label: '対象選定' },
  { key: 'measurement',      label: '効果測定' },
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
        <div className="header-title-row">
          <h1>リライトツール</h1>
          <a href="/" className="header-back">← s-tools トップ</a>
        </div>
        <div className="header-nav">
          <div className="header-tabs">
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
        {page === 'measurement'      && <MeasurementView showToast={showToast} />}
        {page === 'monitor'          && <MonitorView showToast={showToast} />}
        {page === 'masters'          && <MastersView showToast={showToast} />}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
