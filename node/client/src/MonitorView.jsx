import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from './api';

const DEFAULT_THRESHOLDS = {
  rankWorsen: 3,        // 順位が +3 以上悪化
  rankImprove: -3,      // 順位が -3 以上改善
  pvDrop: -30,          // PV -30% 以上
  pvUp: 30,             // PV +30% 以上
  clickDrop: -30,       // aff_click -30% 以上
  clickUp: 30,          // aff_click +30% 以上
};

const THRESHOLD_LS_KEY = 'monitor_thresholds_v1';

function loadThresholds() {
  try {
    const raw = localStorage.getItem(THRESHOLD_LS_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

function saveThresholds(t) {
  localStorage.setItem(THRESHOLD_LS_KEY, JSON.stringify(t));
}

// ========= 数値フォーマット =========
function fmtRank(v) {
  if (v == null) return '—';
  return Number(v).toFixed(1);
}
function fmtInt(v) {
  if (v == null) return '—';
  return Math.round(Number(v)).toLocaleString();
}
function fmtPct(v) {
  if (v == null) return '—';
  return (Number(v) * 100).toFixed(1) + '%';
}

// ========= 比較計算 =========
// rank: 値が小さい方が良い。diff = new - old（正で悪化）
// それ以外 (click/pv/impressions): 値が大きい方が良い。pctDiff = (new - old) / old * 100
function rankDiff(now, before) {
  if (now == null || before == null) return null;
  return Number(now) - Number(before);
}
function pctDiff(now, before) {
  if (now == null || before == null) return null;
  const a = Number(now);
  const b = Number(before);
  if (b === 0) return a === 0 ? 0 : null;
  return ((a - b) / b) * 100;
}
function fmtRankDiff(d) {
  if (d == null) return '';
  const s = d > 0 ? '+' : '';
  return `${s}${d.toFixed(1)}`;
}
function fmtPctDiff(d) {
  if (d == null) return '';
  const s = d > 0 ? '+' : '';
  return `${s}${d.toFixed(0)}%`;
}

// ========= アラート判定 =========
function classifyRank(diff, thresholds) {
  if (diff == null) return '';
  if (diff >= thresholds.rankWorsen) return 'bad';
  if (diff <= thresholds.rankImprove) return 'good';
  return '';
}
function classifyPct(diff, badBelow, goodAbove) {
  if (diff == null) return '';
  if (diff <= badBelow) return 'bad';
  if (diff >= goodAbove) return 'good';
  return '';
}

// ========= アラートスコア（ソート用） =========
// dir='worsen': 悪化度が強いほど高スコア / dir='improve': 改善度が強いほど高スコア
function alertScore(article, thresholds, dir = 'worsen') {
  let score = 0;
  const latest = article.latest;
  const prev1 = article.prev1;
  const avg7 = article.avg7;
  const avg7p = article.avg7_prev;
  const avg30 = article.avg30;
  const avg30p = article.avg30_prev;

  for (const [now, before] of [[latest?.rank, prev1?.rank], [avg7?.rank, avg7p?.rank], [avg30?.rank, avg30p?.rank]]) {
    const d = rankDiff(now, before);
    if (d == null) continue;
    if (dir === 'worsen' && d >= thresholds.rankWorsen) score += d;
    else if (dir === 'improve' && d <= thresholds.rankImprove) score += Math.abs(d);
  }
  for (const [now, before] of [[latest?.pv, prev1?.pv], [avg7?.pv, avg7p?.pv], [avg30?.pv, avg30p?.pv]]) {
    const d = pctDiff(now, before);
    if (d == null) continue;
    if (dir === 'worsen' && d <= thresholds.pvDrop) score += Math.abs(d) / 10;
    else if (dir === 'improve' && d >= thresholds.pvUp) score += d / 10;
  }
  for (const [now, before] of [[latest?.aff_click, prev1?.aff_click], [avg7?.aff_click, avg7p?.aff_click], [avg30?.aff_click, avg30p?.aff_click]]) {
    const d = pctDiff(now, before);
    if (d == null) continue;
    if (dir === 'worsen' && d <= thresholds.clickDrop) score += Math.abs(d) / 10;
    else if (dir === 'improve' && d >= thresholds.clickUp) score += d / 10;
  }
  return score;
}

// ========= 閾値設定パネル =========
function ThresholdPanel({ thresholds, setThresholds, onClose }) {
  const [t, setT] = useState(thresholds);
  const update = (k, v) => setT(prev => ({ ...prev, [k]: Number(v) }));
  const save = () => {
    saveThresholds(t);
    setThresholds(t);
    onClose();
  };
  const reset = () => {
    saveThresholds(DEFAULT_THRESHOLDS);
    setThresholds(DEFAULT_THRESHOLDS);
    setT(DEFAULT_THRESHOLDS);
  };
  return (
    <div className="monitor-threshold-panel">
      <h3>アラート閾値</h3>
      <div className="monitor-threshold-grid">
        <label>順位悪化 (正で悪化) ≥
          <input type="number" value={t.rankWorsen} onChange={e => update('rankWorsen', e.target.value)} />
        </label>
        <label>順位改善 (負で改善) ≤
          <input type="number" value={t.rankImprove} onChange={e => update('rankImprove', e.target.value)} />
        </label>
        <label>PV 下落 (%) ≤
          <input type="number" value={t.pvDrop} onChange={e => update('pvDrop', e.target.value)} />
        </label>
        <label>PV 上昇 (%) ≥
          <input type="number" value={t.pvUp} onChange={e => update('pvUp', e.target.value)} />
        </label>
        <label>aff_click 下落 (%) ≤
          <input type="number" value={t.clickDrop} onChange={e => update('clickDrop', e.target.value)} />
        </label>
        <label>aff_click 上昇 (%) ≥
          <input type="number" value={t.clickUp} onChange={e => update('clickUp', e.target.value)} />
        </label>
      </div>
      <div className="monitor-threshold-actions">
        <button onClick={save}>保存</button>
        <button onClick={reset} className="btn-secondary">デフォルトに戻す</button>
        <button onClick={onClose} className="btn-secondary">閉じる</button>
      </div>
    </div>
  );
}

// ========= セル（値 + 差分） =========
function MetricCell({ value, diffLabel, cls, isRank = false }) {
  return (
    <td className={`monitor-cell ${cls || ''}`}>
      <div className="monitor-cell-value">{isRank ? fmtRank(value) : fmtInt(value)}</div>
      {diffLabel && <div className="monitor-cell-diff">{diffLabel}</div>}
    </td>
  );
}

// ========= 1行 =========
function MonitorRow({ article, thresholds, onOpenTimeline }) {
  const latest = article.latest || {};
  const prev1 = article.prev1 || {};
  const avg7 = article.avg7 || {};
  const avg7p = article.avg7_prev || {};
  const avg30 = article.avg30 || {};
  const avg30p = article.avg30_prev || {};

  // rank
  const rankD1 = rankDiff(latest.rank, prev1.rank);
  const rankD7 = rankDiff(avg7.rank, avg7p.rank);
  const rankD30 = rankDiff(avg30.rank, avg30p.rank);
  // pv
  const pvD1 = pctDiff(latest.pv, prev1.pv);
  const pvD7 = pctDiff(avg7.pv, avg7p.pv);
  const pvD30 = pctDiff(avg30.pv, avg30p.pv);
  // aff_click
  const affD1 = pctDiff(latest.aff_click, prev1.aff_click);
  const affD7 = pctDiff(avg7.aff_click, avg7p.aff_click);
  const affD30 = pctDiff(avg30.aff_click, avg30p.aff_click);

  const title = article.title || `(no title) ${article.post_id}`;

  return (
    <tr>
      <td className="monitor-article-cell">
        <div className="monitor-article-title">
          <a href={article.url} target="_blank" rel="noopener">{title}</a>
        </div>
        <div className="monitor-article-meta">
          {article.category} | ID:{article.post_id}
          {article.top_kw && <span className="monitor-topkw"> | KW: {article.top_kw}</span>}
        </div>
        <button className="btn-tiny" onClick={() => onOpenTimeline(article)}>推移 ›</button>
      </td>

      <MetricCell value={latest.rank} diffLabel={fmtRankDiff(rankD1)} cls={classifyRank(rankD1, thresholds)} isRank />
      <MetricCell value={avg7.rank} diffLabel={fmtRankDiff(rankD7)} cls={classifyRank(rankD7, thresholds)} isRank />
      <MetricCell value={avg30.rank} diffLabel={fmtRankDiff(rankD30)} cls={classifyRank(rankD30, thresholds)} isRank />

      <MetricCell value={latest.pv} diffLabel={fmtPctDiff(pvD1)} cls={classifyPct(pvD1, thresholds.pvDrop, thresholds.pvUp)} />
      <MetricCell value={avg7.pv} diffLabel={fmtPctDiff(pvD7)} cls={classifyPct(pvD7, thresholds.pvDrop, thresholds.pvUp)} />
      <MetricCell value={avg30.pv} diffLabel={fmtPctDiff(pvD30)} cls={classifyPct(pvD30, thresholds.pvDrop, thresholds.pvUp)} />

      <MetricCell value={latest.aff_click} diffLabel={fmtPctDiff(affD1)} cls={classifyPct(affD1, thresholds.clickDrop, thresholds.clickUp)} />
      <MetricCell value={avg7.aff_click} diffLabel={fmtPctDiff(affD7)} cls={classifyPct(affD7, thresholds.clickDrop, thresholds.clickUp)} />
      <MetricCell value={avg30.aff_click} diffLabel={fmtPctDiff(affD30)} cls={classifyPct(affD30, thresholds.clickDrop, thresholds.clickUp)} />

      <td className="monitor-ctr-cell">
        <div>{fmtPct(latest.ctr)}</div>
        <div className="monitor-cell-diff">imp {fmtInt(latest.impressions)}</div>
      </td>
    </tr>
  );
}

// ========= タイムラインモーダル =========
function TimelineModal({ article, onClose }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api.getMonitorTimeline(article.post_id, 90).then(setRows).catch(e => setErr(e.message));
  }, [article.post_id]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal monitor-timeline-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{article.title || article.post_id}</div>
            <div className="modal-sub">{article.url}</div>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        {err && <div className="error">{err}</div>}
        {!rows ? <div className="loading">読み込み中...</div> : (
          <table className="monitor-timeline-table">
            <thead>
              <tr><th>日付</th><th>rank</th><th>clicks</th><th>imp</th><th>ctr</th><th>pv</th><th>aff_click</th></tr>
            </thead>
            <tbody>
              {rows.slice().reverse().map(r => (
                <tr key={r.date}>
                  <td>{r.date}</td>
                  <td>{fmtRank(r.rank)}</td>
                  <td>{fmtInt(r.gsc_click)}</td>
                  <td>{fmtInt(r.impressions)}</td>
                  <td>{fmtPct(r.ctr)}</td>
                  <td>{fmtInt(r.pv)}</td>
                  <td>{fmtInt(r.aff_click)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ========= メインビュー =========
export default function MonitorView({ showToast }) {
  const [status, setStatus] = useState(null);
  const [articles, setArticles] = useState(null);
  const [latest, setLatest] = useState(null);
  const [err, setErr] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [thresholds, setThresholds] = useState(loadThresholds());
  const [showThresholds, setShowThresholds] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState('alert'); // alert | rank7 | pv7 | click7
  const [sortDir, setSortDir] = useState('worsen');  // worsen (悪化順) | improve (改善順)
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [timelineFor, setTimelineFor] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [st, lst] = await Promise.all([api.getMonitorStatus(), api.getMonitorArticles()]);
      setStatus(st);
      setArticles(lst.articles);
      setLatest(lst.latest);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const r = await api.refreshMonitor();
      if (r.noop) showToast && showToast('既に最新です');
      else if (r.skipped) showToast && showToast('既に実行中: ' + (r.reason || ''));
      else showToast && showToast(`${r.metrics || 0}件取り込み完了`);
      await loadAll();
    } catch (e) {
      showToast && showToast(e.message, 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleStartBackfill = async () => {
    try {
      const r = await api.startMonitorBackfill();
      if (r.skipped) showToast && showToast('既に実行中です');
      else showToast && showToast('バックフィルを開始しました（バックグラウンド実行）');
      loadAll();
    } catch (e) {
      showToast && showToast(e.message, 'error');
    }
  };

  const handleWpMeta = async () => {
    try {
      const r = await api.runWpMetaBackfill();
      showToast && showToast(`WPメタ ${r.filled}件を更新`);
      await loadAll();
    } catch (e) {
      showToast && showToast(e.message, 'error');
    }
  };

  const handleKwSnapshot = async () => {
    try {
      const r = await api.runKwSnapshot();
      if (r.skipped) showToast && showToast('既に実行中です');
      else showToast && showToast(`KWスナップショット ${r.rows_inserted || 0}件`);
      await loadAll();
    } catch (e) {
      showToast && showToast(e.message, 'error');
    }
  };

  const categories = useMemo(() => {
    if (!articles) return [];
    return [...new Set(articles.map(a => a.category).filter(Boolean))].sort();
  }, [articles]);

  const filteredSorted = useMemo(() => {
    if (!articles) return [];
    let arr = articles;
    if (filterCategory !== 'all') arr = arr.filter(a => a.category === filterCategory);
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter(a =>
        (a.title || '').toLowerCase().includes(s) ||
        String(a.post_id).includes(s) ||
        (a.url || '').toLowerCase().includes(s)
      );
    }
    const scored = arr.map(a => ({ ...a, _score: alertScore(a, thresholds, sortDir) }));
    if (onlyAlerts) {
      return scored.filter(a => a._score > 0).sort((a, b) => b._score - a._score);
    }
    const worsen = sortDir === 'worsen';
    // rank: 正=悪化 / pv, click: 負=下落
    if (sortMode === 'alert') return scored.sort((a, b) => b._score - a._score);
    if (sortMode === 'rank7') {
      return scored.sort((a, b) => {
        const da = rankDiff(a.avg7?.rank, a.avg7_prev?.rank);
        const db = rankDiff(b.avg7?.rank, b.avg7_prev?.rank);
        const na = da == null ? (worsen ? -Infinity : Infinity) : da;
        const nb = db == null ? (worsen ? -Infinity : Infinity) : db;
        return worsen ? nb - na : na - nb; // worsen: 大きい(悪化)が上 / improve: 小さい(改善)が上
      });
    }
    if (sortMode === 'pv7') {
      return scored.sort((a, b) => {
        const da = pctDiff(a.avg7?.pv, a.avg7_prev?.pv);
        const db = pctDiff(b.avg7?.pv, b.avg7_prev?.pv);
        const na = da == null ? (worsen ? Infinity : -Infinity) : da;
        const nb = db == null ? (worsen ? Infinity : -Infinity) : db;
        return worsen ? na - nb : nb - na; // worsen: 小さい(下落)が上 / improve: 大きい(上昇)が上
      });
    }
    if (sortMode === 'click7') {
      return scored.sort((a, b) => {
        const da = pctDiff(a.avg7?.aff_click, a.avg7_prev?.aff_click);
        const db = pctDiff(b.avg7?.aff_click, b.avg7_prev?.aff_click);
        const na = da == null ? (worsen ? Infinity : -Infinity) : da;
        const nb = db == null ? (worsen ? Infinity : -Infinity) : db;
        return worsen ? na - nb : nb - na;
      });
    }
    return scored;
  }, [articles, filterCategory, search, onlyAlerts, sortMode, sortDir, thresholds]);

  const alertCount = useMemo(() => (articles || []).filter(a => alertScore(a, thresholds, sortDir) > 0).length, [articles, thresholds, sortDir]);

  const backfill = status?.backfill;
  const backfillLabel = backfill
    ? backfill.status === 'done'
      ? 'バックフィル完了'
      : backfill.status === 'stage1_done'
      ? 'Stage1完了 / Stage2実行中'
      : backfill.status === 'stage2_running'
      ? `Stage2実行中 (${backfill.cursor_date} → ${backfill.target_start})`
      : backfill.status
    : null;

  return (
    <>
      <div className="monitor-header">
        <div className="monitor-summary">
          <div><strong>最新データ:</strong> {latest || '—'}</div>
          <div><strong>対象記事:</strong> {status?.articleCount ?? '—'}</div>
          <div><strong>メトリクス行数:</strong> {status?.metricsCount?.toLocaleString() ?? '—'}</div>
          <div><strong>{sortDir === 'improve' ? '改善候補' : 'アラート'}:</strong> <span className={alertCount > 0 ? (sortDir === 'improve' ? 'monitor-improve-count' : 'monitor-alert-count') : ''}>{alertCount}</span></div>
          {backfillLabel && <div className="monitor-backfill-status">{backfillLabel}</div>}
        </div>
        <div className="monitor-actions">
          <button onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? '実行中...' : '今すぐ更新'}
          </button>
          <button onClick={handleStartBackfill} className="btn-secondary">バックフィル再開</button>
          <button onClick={handleKwSnapshot} className="btn-secondary">KWスナップショット</button>
          <button onClick={handleWpMeta} className="btn-secondary">WPメタ補完</button>
          <button onClick={() => setShowThresholds(!showThresholds)} className="btn-secondary">閾値設定</button>
        </div>
      </div>

      {showThresholds && (
        <ThresholdPanel thresholds={thresholds} setThresholds={setThresholds} onClose={() => setShowThresholds(false)} />
      )}

      {err && <div className="error-banner">エラー: {err}</div>}

      <div className="filters monitor-filters">
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="all">全カテゴリ</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="タイトル / ID / URL 検索..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={sortDir} onChange={e => setSortDir(e.target.value)}>
          <option value="worsen">悪化順</option>
          <option value="improve">改善順</option>
        </select>
        <select value={sortMode} onChange={e => setSortMode(e.target.value)}>
          <option value="alert">総合</option>
          <option value="rank7">順位(7日)</option>
          <option value="pv7">PV(7日)</option>
          <option value="click7">aff_click(7日)</option>
        </select>
        <label><input type="checkbox" checked={onlyAlerts} onChange={e => setOnlyAlerts(e.target.checked)} /> {sortDir === 'improve' ? '改善候補のみ' : 'アラートのみ'}</label>
      </div>

      {!articles ? (
        <div className="loading"><div className="spinner" /> 読み込み中...</div>
      ) : articles.length === 0 ? (
        <div className="loading">
          データなし。バックフィルの完了を待つか「今すぐ更新」を実行してください。
        </div>
      ) : (
        <div className="monitor-table-wrap">
          <table className="monitor-table">
            <thead>
              <tr>
                <th rowSpan={2} className="monitor-th-article">記事</th>
                <th colSpan={3}>順位 (GSC)</th>
                <th colSpan={3}>PV (GA4)</th>
                <th colSpan={3}>aff_click</th>
                <th rowSpan={2}>CTR / imp</th>
              </tr>
              <tr>
                <th>最新</th><th>7日平均</th><th>30日平均</th>
                <th>最新</th><th>7日平均</th><th>30日平均</th>
                <th>最新</th><th>7日平均</th><th>30日平均</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map(a => (
                <MonitorRow
                  key={a.post_id}
                  article={a}
                  thresholds={thresholds}
                  onOpenTimeline={setTimelineFor}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {timelineFor && <TimelineModal article={timelineFor} onClose={() => setTimelineFor(null)} />}
    </>
  );
}
