import { useState } from 'react';
import { api } from '../api';

/**
 * CSV インポート/エクスポート共通コンポーネント。
 * - エクスポート: 現在のフィルタを引き継いで CSV ダウンロード
 * - インポート: ドラッグ&ドロップ → プレビュー（編集可能） → 確定
 *
 * UTF-8 BOM は backend 側で付与済み。Excel での文字化け防止。
 */
function parseCSV(text) {
  // BOM 除去
  const t = text.replace(/^﻿/, '');
  const rows = [];
  let cur = '';
  let row = [];
  let inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') {
        if (t[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); cur = ''; row = []; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.length > 0 && r.some(v => v !== ''));
}

export default function CsvIO({ table, filter = {}, onImported, showToast }) {
  const [importRows, setImportRows] = useState(null); // { header, data }
  const [importing, setImporting] = useState(false);

  const handleExport = () => {
    const url = api.exportMastersUrl(table, filter);
    window.open(url, '_blank');
  };

  const handleFile = async (file) => {
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) { showToast?.('CSV が空です', 'error'); return; }
      const header = rows[0];
      const data = rows.slice(1).map(r => {
        const obj = {};
        header.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
        // id/created_at/updated_at は新規 INSERT 時に無視
        delete obj.id; delete obj.created_at; delete obj.updated_at;
        return obj;
      });
      setImportRows({ header: header.filter(h => h !== 'id' && h !== 'created_at' && h !== 'updated_at'), data });
    } catch (e) {
      showToast?.(e.message, 'error');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleConfirm = async () => {
    setImporting(true);
    try {
      const r = await api.importMasters(table, importRows.data);
      showToast?.(`${r.inserted_count} 件をインポートしました`);
      setImportRows(null);
      onImported?.();
    } catch (e) {
      showToast?.(e.message, 'error');
    }
    setImporting(false);
  };

  const updateCell = (rowIdx, key, val) => {
    setImportRows(prev => {
      const next = { ...prev, data: prev.data.slice() };
      next.data[rowIdx] = { ...next.data[rowIdx], [key]: val };
      return next;
    });
  };

  const removeRow = (rowIdx) => {
    setImportRows(prev => ({ ...prev, data: prev.data.filter((_, i) => i !== rowIdx) }));
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn-secondary btn-small" onClick={handleExport}>CSVエクスポート</button>

      <label className="btn-secondary btn-small" style={{ cursor: 'pointer' }}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}>
        CSVインポート
        <input type="file" accept=".csv" style={{ display: 'none' }}
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </label>

      {importRows && (
        <div className="modal-overlay" onClick={() => setImportRows(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <h2>インポートプレビュー（{importRows.data.length} 件）</h2>
            <p style={{ fontSize: 12, color: '#666' }}>
              プレビュー上で値を編集できます。確定で全行を新規 INSERT します（重複チェックなし）。
            </p>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {importRows.header.map(h => (
                      <th key={h} style={{ padding: 6, textAlign: 'left', borderBottom: '1px solid #eee' }}>{h}</th>
                    ))}
                    <th style={{ padding: 6 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.data.map((row, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      {importRows.header.map(h => (
                        <td key={h} style={{ padding: 4 }}>
                          <input value={row[h] || ''} onChange={e => updateCell(ri, h, e.target.value)}
                            style={{ width: '100%', minWidth: 100, fontSize: 12, padding: 4 }} />
                        </td>
                      ))}
                      <td style={{ padding: 4 }}>
                        <button className="btn-reject btn-small" onClick={() => removeRow(ri)}>削除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn-secondary" onClick={() => setImportRows(null)}>キャンセル</button>
              <button className="btn-approve" onClick={handleConfirm} disabled={importing || importRows.data.length === 0}>
                {importing ? 'インポート中...' : `${importRows.data.length} 件をインポート`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
