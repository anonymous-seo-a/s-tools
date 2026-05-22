import { useState, useEffect } from 'react';
import { api } from '../api';

const PRODUCTS = [
  { id: 'acom', name: 'アコム' },
  { id: 'aiful', name: 'アイフル' },
  { id: 'promise', name: 'プロミス' },
  { id: 'mobit', name: 'SMBCモビット' },
];

const EMPTY = {
  product_id: 'acom',
  product_name: 'アコム',
  category: 'cardloan',
  trigger_pattern: '',
  trigger_type: 'keyword',
  trigger_priority: 0,
  annotation_type: '',
  annotation_text: '',
  symbol: '',
  scope: '商材言及時',
  source_url: '',
  verified_at: '',
  verified_by: '',
  status: 'draft',
};

function validate(form) {
  const errs = {};
  if (!form.product_id) errs.product_id = '必須';
  if (!form.product_name) errs.product_name = '必須';
  if (!form.category) errs.category = '必須';
  if (!form.trigger_pattern) errs.trigger_pattern = '必須';
  if (!form.annotation_type) errs.annotation_type = '必須';
  if (!form.annotation_text) errs.annotation_text = '必須';
  if (form.trigger_type === 'regex' && form.trigger_pattern) {
    try { new RegExp(form.trigger_pattern); }
    catch { errs.trigger_pattern = '正規表現として不正です'; }
  }
  if (form.source_url && !/^https?:\/\//.test(form.source_url)) {
    errs.source_url = 'URL 形式（http:// or https://）で入力';
  }
  if (form.verified_at && !/^\d{4}-\d{2}-\d{2}$/.test(form.verified_at)) {
    errs.verified_at = 'YYYY-MM-DD 形式';
  }
  return errs;
}

export default function AnnotationEdit({ id, navigate, showToast }) {
  const isNew = id === 'new';
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isNew) return;
    api.getAnnotation(id).then(d => {
      setForm({ ...EMPTY, ...d, verified_at: d.verified_at || '' });
      setLoading(false);
    }).catch(e => { showToast?.(e.message, 'error'); setLoading(false); });
  }, [id, isNew, showToast]);

  const update = (k, v) => {
    const next = { ...form, [k]: v };
    if (k === 'product_id') {
      const p = PRODUCTS.find(x => x.id === v);
      if (p) next.product_name = p.name;
    }
    setForm(next);
  };

  const handleSave = async () => {
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      showToast?.('入力エラーがあります', 'error');
      return;
    }
    if (!confirm(isNew ? '新規追加しますか？' : '保存しますか？')) return;
    setSaving(true);
    try {
      const body = { ...form };
      if (!body.verified_at) delete body.verified_at;
      if (isNew) await api.createAnnotation(body);
      else await api.updateAnnotation(id, body);
      showToast?.('保存しました');
      navigate('annotations');
    } catch (e) {
      showToast?.(e.message, 'error');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('論理削除（status=deprecated）します。よろしいですか？')) return;
    try {
      await api.deleteAnnotation(id);
      showToast?.('削除しました');
      navigate('annotations');
    } catch (e) { showToast?.(e.message, 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner" /> 読み込み中...</div>;

  return (
    <div className="article-group" style={{ padding: 16, maxWidth: 800 }}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>{isNew ? '注釈マスター 新規追加' : `注釈マスター 編集 (id=${id})`}</h2>

      <div className="result-field">
        <label>商材</label>
        <select value={form.product_id} onChange={e => update('product_id', e.target.value)}>
          {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
        </select>
      </div>

      <div className="result-field">
        <label>カテゴリ</label>
        <input value={form.category} onChange={e => update('category', e.target.value)} placeholder="cardloan" />
      </div>
      {errors.category && <div style={{ color: '#c62828', fontSize: 12 }}>{errors.category}</div>}

      <div className="result-field">
        <label>トリガー種別</label>
        <select value={form.trigger_type} onChange={e => update('trigger_type', e.target.value)}>
          <option value="keyword">keyword (完全一致)</option>
          <option value="regex">regex (正規表現)</option>
          <option value="and_condition">and_condition (AND条件)</option>
        </select>
      </div>

      <div className="result-field">
        <label>トリガー</label>
        <input value={form.trigger_pattern} onChange={e => update('trigger_pattern', e.target.value)}
          placeholder="例: 最短20分 / 事前審査,15秒" />
      </div>
      {errors.trigger_pattern && <div style={{ color: '#c62828', fontSize: 12 }}>{errors.trigger_pattern}</div>}

      <div className="result-field">
        <label>注釈タイプ</label>
        <input value={form.annotation_type} onChange={e => update('annotation_type', e.target.value)}
          placeholder="例: 審査・融資 / 限度額" />
      </div>
      {errors.annotation_type && <div style={{ color: '#c62828', fontSize: 12 }}>{errors.annotation_type}</div>}

      <div className="result-field" style={{ alignItems: 'flex-start' }}>
        <label>注釈本文</label>
        <textarea rows={4} value={form.annotation_text} onChange={e => update('annotation_text', e.target.value)} />
      </div>
      {errors.annotation_text && <div style={{ color: '#c62828', fontSize: 12 }}>{errors.annotation_text}</div>}

      <div className="result-field">
        <label>記号</label>
        <input value={form.symbol || ''} onChange={e => update('symbol', e.target.value)}
          placeholder="例: ※a / ※ai / ※p / ※m" style={{ maxWidth: 100 }} />
      </div>

      <div className="result-field">
        <label>スコープ</label>
        <input value={form.scope} onChange={e => update('scope', e.target.value)} placeholder="商材言及時" />
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
        <button className="btn-secondary btn-small" onClick={() => navigate('annotations')}>キャンセル</button>
        <button className="btn-approve btn-small" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : (isNew ? '追加' : '保存')}
        </button>
        {!isNew && <button className="btn-reject btn-small" onClick={handleDelete}>論理削除</button>}
      </div>
    </div>
  );
}
