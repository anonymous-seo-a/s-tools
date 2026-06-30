import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from './api';

// 台帳直結のライブ・クリック分析。
//   どの記事から / どのリンクが / 何回クリックされたか + ユニークユーザ。
//   cron / monitor.db を経由せず WP の台帳を都度照会するため常に最新。

const todayISO = () => {
  // JST 当日。サーバ(台帳)も JST 保存なので合わせる。
  const now = new Date();
  const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return jst.toISOString().slice(0, 10);
};
const addDaysISO = (iso, d) => {
  const t = new Date(`${iso}T00:00:00`);
  t.setDate(t.getDate() + d);
  return t.toISOString().slice(0, 10);
};

const PIVOTS = [
  { key: 'detail', label: '明細 (記事 × リンク)' },
  { key: 'article', label: '記事ごと' },
  { key: 'link', label: 'リンク(商材)ごと' },
];

function fmtTime(s) {
  if (!s) return '—';
  // "YYYY-MM-DD HH:MM:SS" → 当日は HH:MM、他日は MM/DD HH:MM
  const [d, t] = s.split(' ');
  const hm = (t || '').slice(0, 5);
  return d === todayISO() ? hm : `${d.slice(5)} ${hm}`;
}

// detail 行を pivot に応じて集約。ユニークは行 users 合算だと重複過大になるため、
// サーバが返す厳密値(users_by_post / users_by_advertiser)を当てる。
function aggregate(rows, pivot, data) {
  if (pivot === 'detail') return rows;
  const usersMap = pivot === 'article' ? (data?.users_by_post || {}) : (data?.users_by_advertiser || {});
  const key = pivot === 'article' ? (r) => r.post_id : (r) => r.advertiser;
  const map = new Map();
  for (const r of rows) {
    const k = key(r);
    const g = map.get(k) || {
      post_id: r.post_id, post_title: r.post_title, post_url: r.post_url,
      advertiser: r.advertiser, clicks: 0, users: null, cv: 0, reward: 0, variants: 0, last_click: '',
    };
    g.clicks += r.clicks;
    g.cv += r.cv || 0;
    g.reward += r.reward || 0;
    g.variants += 1;
    if (r.last_click > g.last_click) g.last_click = r.last_click;
    map.set(k, g);
  }
  for (const g of map.values()) {
    const mk = pivot === 'article' ? String(g.post_id) : g.advertiser;
    g.users = usersMap[mk] ?? null;
  }
  return [...map.values()].sort((a, b) => b.clicks - a.clicks);
}

// 時系列トレンド: クリック数バー + リライト適用日(赤線)。単日=時間別、複数日=日次。
function Trend({ series, bucket, markers }) {
  if (!series || series.length < 2) return null;
  const w = 680, h = 96, padL = 28, padR = 8, padT = 10, padB = 18;
  const n = series.length;
  const max = Math.max(...series.map((p) => p.clicks), 1);
  const bw = (w - padL - padR) / n;
  const xOf = (i) => padL + i * bw;
  const yOf = (v) => padT + (1 - v / max) * (h - padT - padB);
  const label = (t) => (bucket === 'hour' ? t.slice(11, 13) + '時' : t.slice(5));
  const step = Math.ceil(n / 12);
  return (
    <div className="meas-table-wrap" style={{ marginBottom: 12 }}>
      <svg width={w} height={h} style={{ maxWidth: '100%' }}>
        <line x1={padL} y1={yOf(max)} x2={w - padR} y2={yOf(max)} stroke="#eee" />
        <text x={2} y={yOf(max) + 4} fontSize="9" fill="#999">{max}</text>
        <line x1={padL} y1={yOf(0)} x2={w - padR} y2={yOf(0)} stroke="#ccc" />
        {series.map((p, i) => (
          <rect key={i} x={xOf(i) + 1} y={yOf(p.clicks)} width={Math.max(bw - 2, 1)}
            height={yOf(0) - yOf(p.clicks)} fill="#1565c0" rx="1">
            <title>{p.t}: {p.clicks}クリック / {p.users}ユニーク</title>
          </rect>
        ))}
        {series.map((p, i) => (i % step === 0
          ? <text key={`l${i}`} x={xOf(i) + bw / 2} y={h - 5} fontSize="9" fill="#999" textAnchor="middle">{label(p.t)}</text>
          : null))}
        {(markers || []).map((d, k) => {
          const idx = series.findIndex((p) => p.t.slice(0, 10) === d);
          if (idx < 0) return null;
          const x = xOf(idx) + bw / 2;
          return <g key={`m${k}`}>
            <line x1={x} y1={padT} x2={x} y2={yOf(0)} stroke="#c62828" strokeWidth="1.5" />
            <title>リライト適用: {d}</title>
          </g>;
        })}
      </svg>
      <div style={{ fontSize: 11, color: '#888', padding: '2px 8px' }}>
        ■クリック数 / {bucket === 'hour' ? '時間別' : '日次'}
        {markers && markers.length > 0 && <span style={{ color: '#c62828' }}> ｜ 赤線=リライト適用日</span>}
      </div>
    </div>
  );
}

function StatCards({ totals, serverTime, rowCount }) {
  if (!totals) return null;
  return (
    <div className="stats meas-stats">
      <div className="stat-card"><div className="number">{totals.clicks}</div><div className="label">総クリック</div></div>
      <div className="stat-card"><div className="number">{totals.users}</div><div className="label">ユニークユーザ</div></div>
      <div className="stat-card"><div className="number">{totals.posts}</div><div className="label">記事数</div></div>
      <div className="stat-card"><div className="number">{totals.advertisers}</div><div className="label">リンク(商材)数</div></div>
      {totals.cv > 0 && <div className="stat-card"><div className="number meas-num-up">{totals.cv}</div><div className="label">成果CV</div></div>}
      {totals.reward > 0 && <div className="stat-card"><div className="number meas-num-up">¥{Math.round(totals.reward).toLocaleString()}</div><div className="label">報酬</div></div>}
      <div className="stat-card"><div className="number" style={{ fontSize: 13 }}>{fmtTime(serverTime)}</div><div className="label">最終取得 ({rowCount}行)</div></div>
    </div>
  );
}

// ASP 成果CSV取込パネル。列マッピング(subid 必須)で書式非依存に正規化して送信。
function ConversionImport({ showToast, onDone }) {
  const [open, setOpen] = useState(false);
  const [asp, setAsp] = useState('');
  const [csv, setCsv] = useState('');
  const [headers, setHeaders] = useState([]);
  const [map, setMap] = useState({ subid: '', reward: '', status: '', order_id: '', occurred_at: '' });
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setCsv(text);
    const firstLine = text.replace(/\r\n/g, '\n').split('\n')[0] || '';
    // ヘッダ推定（引用符無し前提の簡易。サーバ側で厳密パース）。
    const hs = firstLine.split(',').map((h) => h.replace(/^"|"$/g, '').trim());
    setHeaders(hs);
    // subid 列を名前から自動推測。
    const guess = hs.find((h) => /sub|click|id1|rk|args|param/i.test(h)) || '';
    setMap((m) => ({ ...m, subid: guess }));
  };

  const run = async () => {
    if (!asp || !map.subid) { showToast('ASP名 と subid列 は必須', 'error'); return; }
    setBusy(true);
    try {
      const r = await api.importConversions({ asp, csv, mapping: map });
      showToast(`取込: ${r.inserted}件 / 既存${r.skipped} / クリック突合${r.matched_to_click}件`);
      onDone?.();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  };

  const sel = (field, label, required) => (
    <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span>{label}{required && <span style={{ color: '#c62828' }}>*</span>}</span>
      <select value={map[field]} onChange={(e) => setMap((m) => ({ ...m, [field]: e.target.value }))}>
        <option value="">—</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  );

  return (
    <div style={{ marginBottom: 10 }}>
      <button className="btn-tiny" onClick={() => setOpen((v) => !v)}>{open ? '▼' : '▶'} ASP成果CSV取込</button>
      {open && (
        <div className="meas-table-wrap" style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>ASP名<span style={{ color: '#c62828' }}>*</span></span>
            <input value={asp} onChange={(e) => setAsp(e.target.value)} placeholder="afb / 82comb ..." style={{ width: 120 }} />
          </label>
          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>CSVファイル</span>
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
          </label>
          {headers.length > 0 && <>
            {sel('subid', 'subid列(=click_id)', true)}
            {sel('reward', '報酬列')}
            {sel('status', 'ステータス列')}
            {sel('order_id', '注文ID列')}
            {sel('occurred_at', '発生日時列')}
          </>}
          <button className="btn-secondary btn-small" onClick={run} disabled={busy || !csv}>{busy ? '取込中...' : '取込実行'}</button>
          <div style={{ flexBasis: '100%', fontSize: 11, color: '#888' }}>
            subid列 = ASP成果に返るサブID（台帳 click_id と一致）。突合0件なら subID注入未反映 or 列違い。
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClickAnalysisView({ showToast }) {
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [pivot, setPivot] = useState('detail');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [filter, setFilter] = useState(null); // { post_id } | { advertiser }
  const timerRef = useRef(null);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const r = await api.getAffClicks({ start, end, ...filter, ...opts });
      setData(r);
    } catch (e) {
      showToast(e.message, 'error');
    }
    setLoading(false);
  }, [start, end, filter, showToast]);

  useEffect(() => { load(); }, [load]);

  // 自動更新 (当日を含む範囲のときのみ意味があるため end が今日なら 30s ごと)。
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (auto && end >= todayISO()) {
      timerRef.current = setInterval(() => load(), 30000);
    }
    return () => timerRef.current && clearInterval(timerRef.current);
  }, [auto, end, load]);

  const rows = data?.rows || [];
  const view = useMemo(() => aggregate(rows, pivot, data), [rows, pivot, data]);

  const preset = (days) => {
    const e = todayISO();
    setEnd(e);
    setStart(days === 0 ? e : addDaysISO(e, -days));
  };

  const exportCsv = () => {
    const head = pivot === 'detail'
      ? ['post_id', 'article', 'advertiser', 'dest_host', 'clicks', 'users', 'cv', 'reward', 'last_click', 'url']
      : pivot === 'article'
        ? ['post_id', 'article', 'links', 'clicks', 'users', 'cv', 'reward', 'last_click', 'url']
        : ['advertiser', 'articles', 'clicks', 'users', 'cv', 'reward', 'last_click'];
    const line = (r) => pivot === 'detail'
      ? [r.post_id, r.post_title, r.advertiser, r.dest_host, r.clicks, r.users, r.cv, r.reward, r.last_click, r.post_url]
      : pivot === 'article'
        ? [r.post_id, r.post_title, r.variants, r.clicks, r.users, r.cv, r.reward, r.last_click, r.post_url]
        : [r.advertiser, r.variants, r.clicks, r.users, r.cv, r.reward, r.last_click];
    const csv = [head, ...view.map(line)]
      .map((cols) => cols.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aff-clicks_${pivot}_${start}_${end}.csv`;
    a.click();
  };

  return (
    <div>
      <div className="filters meas-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
        <span>→</span>
        <input type="date" value={end} min={start} max={todayISO()} onChange={(e) => setEnd(e.target.value)} />
        <button className="btn-tiny" onClick={() => preset(0)}>今日</button>
        <button className="btn-tiny" onClick={() => preset(6)}>7日</button>
        <button className="btn-tiny" onClick={() => preset(29)}>30日</button>
        <span style={{ width: 12 }} />
        {PIVOTS.map((p) => (
          <button key={p.key} className={`btn-tiny ${pivot === p.key ? 'active' : ''}`} onClick={() => setPivot(p.key)}>{p.label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          自動更新30s
        </label>
        <button className="btn-secondary btn-small" onClick={() => load()} disabled={loading}>
          {loading ? '読込中...' : '再読込'}
        </button>
        <button className="btn-tiny" onClick={exportCsv} disabled={!view.length}>CSV</button>
      </div>

      {filter && (
        <div className="meas-freshness" style={{ marginBottom: 8 }}>
          絞り込み中: {filter.post_id ? `記事 #${filter.post_id}` : `商材 ${filter.advertiser}`}
          <button className="btn-tiny" style={{ marginLeft: 8 }} onClick={() => setFilter(null)}>解除</button>
        </div>
      )}

      <ConversionImport showToast={showToast} onDone={() => load()} />

      <StatCards totals={data?.totals} serverTime={data?.server_time} rowCount={rows.length} />

      {data && <Trend series={data.series} bucket={data.bucket} markers={data.apply_markers} />}

      {loading && !data && <div className="loading"><div className="spinner" /> 読み込み中...</div>}

      {data && view.length === 0 && (
        <div className="loading">この期間のクリックはまだありません</div>
      )}

      {view.length > 0 && (
        <div className="meas-table-wrap">
          <table className="meas-table">
            <thead>
              {pivot === 'detail' && (
                <tr>
                  <th className="meas-th-article">記事</th>
                  <th>リンク(商材)</th>
                  <th>宛先</th>
                  <th>クリック</th>
                  <th>ユニーク</th>
                  <th>回/人</th>
                  <th>CV</th>
                  <th>報酬</th>
                  <th>最終</th>
                </tr>
              )}
              {pivot === 'article' && (
                <tr>
                  <th className="meas-th-article">記事</th>
                  <th>リンク数</th>
                  <th>クリック</th>
                  <th>ユニーク</th>
                  <th>CV</th>
                  <th>報酬</th>
                  <th>最終</th>
                </tr>
              )}
              {pivot === 'link' && (
                <tr>
                  <th>リンク(商材)</th>
                  <th>記事数</th>
                  <th>クリック</th>
                  <th>ユニーク</th>
                  <th>CV</th>
                  <th>報酬</th>
                  <th>最終</th>
                </tr>
              )}
            </thead>
            <tbody>
              {view.map((r, i) => (
                <tr key={i}>
                  {pivot === 'detail' && <>
                    <td className="meas-article">
                      {r.post_url
                        ? <a href={r.post_url} target="_blank" rel="noreferrer">{r.post_title || `#${r.post_id}`}</a>
                        : (r.post_title || `#${r.post_id}`)}
                      <span className="meas-article-meta">
                        {r.post_id} ·
                        <button className="btn-tiny" style={{ marginLeft: 4 }} onClick={() => setFilter({ post_id: r.post_id })}>この記事で絞る</button>
                      </span>
                    </td>
                    <td>
                      <button className="btn-link" onClick={() => setFilter({ advertiser: r.advertiser })} title="この商材で絞る">{r.advertiser || '—'}</button>
                    </td>
                    <td style={{ fontSize: 11, color: '#888' }}>{r.dest_host || '—'}</td>
                    <td style={{ fontWeight: 700, textAlign: 'right' }}>{r.clicks}</td>
                    <td style={{ textAlign: 'right' }}>{r.users}</td>
                    <td style={{ textAlign: 'right', color: r.users && r.clicks / r.users >= 2 ? '#c62828' : '#555' }}>
                      {r.users ? (r.clicks / r.users).toFixed(1) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: r.cv ? 700 : 400, color: r.cv ? '#2e7d32' : '#bbb' }}>{r.cv || '—'}</td>
                    <td style={{ textAlign: 'right', color: r.reward ? '#2e7d32' : '#bbb' }}>{r.reward ? `¥${Math.round(r.reward).toLocaleString()}` : '—'}</td>
                    <td style={{ fontSize: 11 }}>{fmtTime(r.last_click)}</td>
                  </>}
                  {pivot === 'article' && <>
                    <td className="meas-article">
                      {r.post_url
                        ? <a href={r.post_url} target="_blank" rel="noreferrer">{r.post_title || `#${r.post_id}`}</a>
                        : (r.post_title || `#${r.post_id}`)}
                      <span className="meas-article-meta">{r.post_id}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.variants}</td>
                    <td style={{ fontWeight: 700, textAlign: 'right' }}>{r.clicks}</td>
                    <td style={{ textAlign: 'right' }}>{r.users}</td>
                    <td style={{ textAlign: 'right', fontWeight: r.cv ? 700 : 400, color: r.cv ? '#2e7d32' : '#bbb' }}>{r.cv || '—'}</td>
                    <td style={{ textAlign: 'right', color: r.reward ? '#2e7d32' : '#bbb' }}>{r.reward ? `¥${Math.round(r.reward).toLocaleString()}` : '—'}</td>
                    <td style={{ fontSize: 11 }}>{fmtTime(r.last_click)}</td>
                  </>}
                  {pivot === 'link' && <>
                    <td><button className="btn-link" onClick={() => setFilter({ advertiser: r.advertiser })}>{r.advertiser || '—'}</button></td>
                    <td style={{ textAlign: 'right' }}>{r.variants}</td>
                    <td style={{ fontWeight: 700, textAlign: 'right' }}>{r.clicks}</td>
                    <td style={{ textAlign: 'right' }}>{r.users}</td>
                    <td style={{ textAlign: 'right', fontWeight: r.cv ? 700 : 400, color: r.cv ? '#2e7d32' : '#bbb' }}>{r.cv || '—'}</td>
                    <td style={{ textAlign: 'right', color: r.reward ? '#2e7d32' : '#bbb' }}>{r.reward ? `¥${Math.round(r.reward).toLocaleString()}` : '—'}</td>
                    <td style={{ fontSize: 11 }}>{fmtTime(r.last_click)}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
