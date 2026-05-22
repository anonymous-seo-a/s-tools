import { useState, useCallback } from 'react';
import Dashboard from './Dashboard';
import AnnotationList from './AnnotationList';
import AnnotationEdit from './AnnotationEdit';
import RuleList from './RuleList';
import RuleEdit from './RuleEdit';
import ChecklistView from './ChecklistView';
import AuditLogView from './AuditLogView';

/**
 * マスター管理画面のルート。
 * 既存 App.jsx が state ベースのタブ運用なので、こちらも内部で
 * { page, params } の state ベース subroute で揃える。
 * （react-router-dom 採用は将来全タブを URL ルーティングに統一する際に検討）
 */
export default function MastersView({ showToast }) {
  const [route, setRoute] = useState({ page: 'dashboard', params: {} });

  const navigate = useCallback((page, params = {}) => {
    setRoute({ page, params });
    window.scrollTo(0, 0);
  }, []);

  const tabs = [
    { key: 'dashboard',   label: 'ダッシュボード' },
    { key: 'annotations', label: '注釈マスター' },
    { key: 'rules',       label: 'ルールマスター' },
    { key: 'checklist',   label: '完成度チェック' },
    { key: 'audit-log',   label: '編集履歴' },
  ];

  const activeTab =
    route.page === 'annotations' || route.page === 'annotation-edit' ? 'annotations'
    : route.page === 'rules' || route.page === 'rule-edit' ? 'rules'
    : route.page;

  return (
    <div>
      <div className="filters" style={{ marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.key}
            className={activeTab === t.key ? 'btn-apply btn-small' : 'btn-secondary btn-small'}
            onClick={() => navigate(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {route.page === 'dashboard' && <Dashboard navigate={navigate} showToast={showToast} />}

      {route.page === 'annotations' && (
        <AnnotationList navigate={navigate} showToast={showToast} />
      )}
      {route.page === 'annotation-edit' && (
        <AnnotationEdit id={route.params.id} navigate={navigate} showToast={showToast} />
      )}

      {route.page === 'rules' && (
        <RuleList navigate={navigate} showToast={showToast} />
      )}
      {route.page === 'rule-edit' && (
        <RuleEdit id={route.params.id} navigate={navigate} showToast={showToast} />
      )}

      {route.page === 'checklist' && (
        <ChecklistView showToast={showToast} />
      )}
      {route.page === 'audit-log' && (
        <AuditLogView showToast={showToast} />
      )}
    </div>
  );
}

