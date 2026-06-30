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

// detail 行を pivot に応じて集約。
function aggregate(rows, pivot) {
  if (pivot === 'detail') return rows;
  const key = pivot === 'article' ? (r) => r.post_id : (r) => r.advertiser;
  const map = new Map();
  for (const r of rows) {
    const k = key(r);
    const g = map.get(k) || {
      post_id: r.post_id, post_title: r.post_title, post_url: r.post_url,
      advertiser: r.advertiser, clicks: 0, users: 0, _userMax: 0,
      variants: 0, last_click: '',
    };
    g.clicks += r.clicks;
    // ユニークは行集約では厳密に足せない(重複ユーザ)。近似: 同一グループ内の最大行ユニークを下限、合計を上限。
    // 表示は「合計クリック」主軸とし、users は detail のみ厳密。集約では参考値(行users合計)。
    g.users += r.users;
    g.variants += 1;
    if (r.last_click > g.last_click) g.last_click = r.last_click;
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.clicks - a.clicks);
}

function StatCards({ totals, serverTime, rowCount }) {
  if (!totals) return null;
  return (
    <div className="stats meas-stats">
      <div className="stat-card"><div className="number">{totals.clicks}</div><div className="label">総クリック</div></div>
      <div className="stat-card"><div className="number">{totals.users}</div><div className="label">ユニークユーザ</div></div>
      <div className="stat-card"><div className="number">{totals.posts}</div><div className="label">記事数</div></div>
      <div className="stat-card"><div className="number">{totals.advertisers}</div><div className="label">リンク(商材)数</div></div>
      <div className="stat-card"><div className="number" style={{ fontSize: 13 }}>{fmtTime(serverTime)}</div><div className="label">最終取得 ({rowCount}行)</div></div>
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
  const view = useMemo(() => aggregate(rows, pivot), [rows, pivot]);

  const preset = (days) => {
    const e = todayISO();
    setEnd(e);
    setStart(days === 0 ? e : addDaysISO(e, -days));
  };

  const exportCsv = () => {
    const head = pivot === 'detail'
      ? ['post_id', 'article', 'advertiser', 'dest_host', 'clicks', 'users', 'last_click', 'url']
      : pivot === 'article'
        ? ['post_id', 'article', 'links', 'clicks', 'users', 'last_click', 'url']
        : ['advertiser', 'articles', 'clicks', 'users', 'last_click'];
    const line = (r) => pivot === 'detail'
      ? [r.post_id, r.post_title, r.advertiser, r.dest_host, r.clicks, r.users, r.last_click, r.post_url]
      : pivot === 'article'
        ? [r.post_id, r.post_title, r.variants, r.clicks, r.users, r.last_click, r.post_url]
        : [r.advertiser, r.variants, r.clicks, r.users, r.last_click];
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

      <StatCards totals={data?.totals} serverTime={data?.server_time} rowCount={rows.length} />

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
                  <th>最終</th>
                </tr>
              )}
              {pivot === 'article' && (
                <tr>
                  <th className="meas-th-article">記事</th>
                  <th>リンク数</th>
                  <th>クリック</th>
                  <th>ユニーク(参考)</th>
                  <th>最終</th>
                </tr>
              )}
              {pivot === 'link' && (
                <tr>
                  <th>リンク(商材)</th>
                  <th>記事数</th>
                  <th>クリック</th>
                  <th>ユニーク(参考)</th>
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
                    <td style={{ fontSize: 11 }}>{fmtTime(r.last_click)}</td>
                  </>}
                  {pivot === 'link' && <>
                    <td><button className="btn-link" onClick={() => setFilter({ advertiser: r.advertiser })}>{r.advertiser || '—'}</button></td>
                    <td style={{ textAlign: 'right' }}>{r.variants}</td>
                    <td style={{ fontWeight: 700, textAlign: 'right' }}>{r.clicks}</td>
                    <td style={{ textAlign: 'right' }}>{r.users}</td>
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
