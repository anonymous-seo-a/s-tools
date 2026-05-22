import { useState, useEffect } from 'react';
import { api } from '../api';

const EMPTY = {
  category: 'cardloan',
  product_ids: 'ALL',
  rule_type: '禁止表現',
  ng_text: '',
  correct_text: '',
  condition: '常に',
  legal_basis: '',
  source_url: '',
  verified_at: '',
  verified_by: '',
  status: 'draft',
};

function validate(form) {
  const errs = {};
  if (!form.category) errs.category = '必須';
  if (!form.product_ids) errs.product_ids = '必須（ALL or カンマ区切り）';
  if (!form.rule_type) errs.rule_type = '必須';
  if (!form.ng_text) errs.ng_text = '必須';
  if (form.source_url && !/^https?:\/\//.test(form.source_url)) errs.source_url = 'URL 形式';
  if (form.verified_at && !/^\d{4}-\d{2}-\d{2}$/.test(form.verified_at)) errs.verified_at = 'YYYY-MM-DD';
  return errs;
}

export default function RuleEdit({ id, navigate, showToast }) {
  const isNew = id === 'new';
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isNew) return;
    api.getRule(id).then(d => {
      setForm({ ...EMPTY, ...d, verified_at: d.verified_at || '' });
      setLoading(false);
    }).catch(e => { showToast?.(e.message, 'error'); setLoading(false); });
  }, [id, isNew, showToast]);

  const update = (k, v) => setForm({ ...form, [k]: v });

  const handleSave = async () => {
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) { showToast?.('入力エラーがあります', 'error'); return; }
    if (!confirm(isNew ? '新規追加しますか？' : '保存しますか？')) return;
    setSaving(true);
    try {
      const body = { ...form };
      if (!body.verified_at) delete body.verified_at;
      if (isNew) await api.createRule(body);
      else await api.updateRule(id, body);
      showToast?.('保存しました');
      navigate('rules');
    } catch (e) { showToast?.(e.message, 'error'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('論理削除（status=deprecated）します。よろしいですか？')) return;
    try {
      await api.deleteRule(id);
      showToast?.('削除しました');
      navigate('rules');
    } catch (e) { showToast?.(e.message, 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner" /> 読み込み中...</div>;

  return (
    <div className="article-group" style={{ padding: 16, maxWidth: 800 }}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>{isNew ? 'ルールマスター 新規追加' : `ルールマスター 編集 (id=${id})`}</h2>

      <div className="result-field">
        <label>カテゴリ</label>
        <input value={form.category} onChange={e => update('category', e.target.value)} placeholder="cardloan" />
      </div>

      <div className="result-field">
        <label>商材 ID</label>
        <input value={form.product_ids} onChange={e => update('product_ids', e.target.value)}
          placeholder="ALL / acom / promise,aiful,mobit" />
      </div>
      {errors.product_ids && <div style={{ color: '#c62828', fontSize: 12 }}>{errors.product_ids}</div>}

      <div className="result-field">
        <label>種別</label>
        <select value={form.rule_type} onChange={e => update('rule_type', e.target.value)}>
          <option value="禁止表現">禁止表現</option>
          <option value="必須表現">必須表現</option>
          <option value="正式表記">正式表記</option>
        </select>
      </div>

      <div className="result-field" style={{ alignItems: 'flex-start' }}>
        <label>NG 表現</label>
        <textarea rows={2} value={form.ng_text} onChange={e => update('ng_text', e.target.value)} />
      </div>
      {errors.ng_text && <div style={{ color: '#c62828', fontSize: 12 }}>{errors.ng_text}</div>}

      <div className="result-field" style={{ alignItems: 'flex-start' }}>
        <label>正しい表現</label>
        <textarea rows={2} value={form.correct_text || ''} onChange={e => update('correct_text', e.target.value)}
          placeholder="禁止表現の場合は空欄可" />
      </div>

      <div className="result-field">
        <label>条件</label>
        <select value={form.condition} onChange={e => update('condition', e.target.value)}>
          <option value="常に">常に</option>
          <option value="商材言及時">商材言及時</option>
        </select>
      </div>

      <div className="result-field">
        <label>法的根拠</label>
        <input value={form.legal_basis || ''} onChange={e => update('legal_basis', e.target.value)}
          placeholder="貸金業法 16 条 / 景表法 など" />
      </div>

      <div className="result-field">
        <label>出典 URL</label>
        <input value={form.source_url || ''} onChange={e => update('source_url', e.target.value)} placeholder="https://..." />
      </div>
      {errors.source_url && <div style={{ color: '#c62828', fontSize: 12 }}>{errors.source_url}</div>}

      <div className="result-field">
        <label>検証日</label>
        <input type="date" value={form.verified_at || ''} onChange={e => update('verified_at', e.target.value)} />
      </div>
      {errors.verified_at && <div style={{ color: '#c62828', fontSize: 12 }}>{errors.verified_at}</div>}

      <div className="result-field">
        <label>検証者</label>
        <input value={form.verified_by || ''} onChange={e => update('verified_by', e.target.value)} placeholder="Daiki / ゆかちゃん" />
      </div>

      <div className="result-field">
        <label>ステータス</label>
        <select value={form.status} onChange={e => update('status', e.target.value)}>
          <option value="draft">draft</option>
          <option value="verified">verified</option>
          <option value="deprecated">deprecated</option>
        </select>
      </div>

      <div className="result-actions" style={{ marginTop: 16 }}>
        <button className="btn-secondary btn-small" onClick={() => navigate('rules')}>キャンセル</button>
        <button className="btn-approve btn-small" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : (isNew ? '追加' : '保存')}
        </button>
        {!isNew && <button className="btn-reject btn-small" onClick={handleDelete}>論理削除</button>}
      </div>
    </div>
  );
}
