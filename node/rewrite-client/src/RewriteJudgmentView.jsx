import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

const STATUS_OPTIONS = [
  { key: 'awaiting_diff_judgment', label: '判定待ち' },
  { key: '',                       label: '全て' },
  { key: 'completed',              label: '完了' },
  { key: 'generating',             label: '生成中' },
  { key: 'analyzing',              label: '分析中' },
  { key: 'failed',                 label: '失敗' },
];

const GENRE_OPTIONS = [
  { key: '',           label: '全カテゴリ' },
  { key: 'cardloan',   label: 'カードローン' },
  { key: 'securities', label: '証券' },
];
const GENRE_LABEL = { cardloan: 'カードローン', securities: '証券' };

// rationale.primary_source を人間可読ラベルへ
const PRIMARY_SOURCE_LABEL = {
  fact_set_required_addition: '競合にあり自記事に無い事実の追加',
  embedding_shallow_query: '競合より網羅が浅いクエリ領域の強化',
  embedding_shallow_fact: '浅い事実記述の深掘り',
  hcu_violation: 'HCU(有用性)観点の改善',
  compliance_rule: '規制・コンプラ対応',
};

const JUDGMENT_BADGE = {
  pending:  'pending',
  approved: 'approved',
  rejected: 'rejected',
};

// 却下理由プリセット (学習ループで集計可能にするため固定値)。値=保存テキスト。
const REJECT_REASONS = [
  '規制違反',
  '主題ずれ',
  '事実誤り',
  '冗長・不要',
  '改変が不十分',
  '構成を崩す',
  'その他',
];

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('ja-JP');
}

function fmtCost(v) {
  if (v == null) return '—';
  return `$${Number(v).toFixed(4)}`;
}

function SessionRow({ s, selected, onSelect }) {
  return (
    <tr
      style={{
        borderBottom: '1px solid #f0f0f0',
        background: selected ? '#e3f2fd' : 'transparent',
        cursor: 'pointer',
      }}
      onClick={() => onSelect(s.id)}
    >
      <td style={{ padding: '8px 12px', color: '#888' }}>{s.id}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{s.post_id}</td>
      <td style={{ padding: '8px 12px', fontSize: 11, color: s.genre === 'securities' ? '#1565c0' : '#6a1b9a' }}>
        {GENRE_LABEL[s.genre] || s.genre || '—'}
      </td>
      <td style={{ padding: '8px 12px' }}>
        <span className={`status-badge ${s.status === 'awaiting_diff_judgment' ? 'pending'
                       : s.status === 'completed' ? 'approved'
                       : s.status === 'failed' ? 'rejected' : 'applied'}`}>
          {s.status}
        </span>
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{s.diff_count ?? 0}</td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
        <span style={{ color: '#f57f17' }}>{s.pending_count ?? 0}</span>
        {' / '}
        <span style={{ color: '#2e7d32' }}>{s.approved_count ?? 0}</span>
        {' / '}
        <span style={{ color: '#c62828' }}>{s.rejected_count ?? 0}</span>
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtCost(s.cost_total_usd)}</td>
      <td style={{ padding: '8px 12px', fontSize: 12, color: '#888' }}>{fmtDate(s.started_at)}</td>
    </tr>
  );
}

// rationale JSON を自然言語で表示 (なぜこの diff か)。
function RationaleNote({ rationale }) {
  let p = rationale;
  if (typeof rationale === 'string') {
    try { p = JSON.parse(rationale); }
    catch { return rationale ? <div className="result-reason" style={{ marginTop: 6 }}>{rationale}</div> : null; }
  }
  if (!p || typeof p !== 'object') return null;
  const ann = Array.isArray(p.compliance?.sonnet_annotations) ? p.compliance.sonnet_annotations.filter(Boolean) : [];
  const reason = ann.join(' ');
  const srcLabel = PRIMARY_SOURCE_LABEL[p.primary_source] || p.primary_source || '';
  const ymyl = Array.isArray(p.compliance?.ymyl_requirements_met) ? p.compliance.ymyl_requirements_met : [];
  if (!reason && !srcLabel) return null;
  return (
    <div style={{ marginTop: 6, padding: 8, background: '#f5f7fa', borderLeft: '3px solid #90a4ae', borderRadius: 4, fontSize: 12 }}>
      {reason && <div><strong>リライト理由:</strong> {reason}</div>}
      {(srcLabel || ymyl.length > 0) && (
        <div style={{ marginTop: reason ? 4 : 0, color: '#78909c', fontSize: 11 }}>
          {srcLabel && <span>種別: {srcLabel}</span>}
          {ymyl.length > 0 && <span style={{ marginLeft: 8 }}>YMYL: {ymyl.join(' / ')}</span>}
        </div>
      )}
    </div>
  );
}

function ViolationsList({ rationale }) {
  let parsed = rationale;
  if (typeof rationale === 'string') {
    try { parsed = JSON.parse(rationale); } catch { return null; }
  }
  const violations = parsed?.compliance?.detected_violations;
  if (!Array.isArray(violations) || violations.length === 0) return null;
  return (
    <div style={{ marginTop: 8, padding: 10, background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#c62828', marginBottom: 6 }}>
        compliance violations ({violations.length})
      </div>
      {violations.map((v, i) => (
        <div key={i} style={{ marginBottom: 6, fontSize: 12 }}>
          <span style={{ background: '#c62828', color: 'white', padding: '1px 6px', borderRadius: 3, fontSize: 11, marginRight: 6 }}>
            rule#{v.rule_id} L{v.detection_layer}{v.severity ? ` ${v.severity}` : ''}
          </span>
          <strong>{v.ng_text}</strong>
          {v.reason && <div style={{ marginTop: 2, color: '#666' }}>{v.reason}</div>}
          {v.evidence_snippet && (
            <div style={{ marginTop: 2, padding: 4, background: 'white', borderRadius: 3, fontFamily: 'monospace', fontSize: 11 }}>
              {v.evidence_snippet}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DiffCard({ diff, onJudge, busyId }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const isBusy = busyId === diff.id;
  const badgeClass = JUDGMENT_BADGE[diff.daiki_judgment] || 'pending';
  // AFTER 表示は「実際に WP へ適用される Gutenberg block markup」(API 算出 content_after_blocks)。
  // BEFORE (content_before) も run の block markup なので、diff を投稿と同じブロック形式で確認できる。
  // fallback: 古い session (block 未算出) は素の content_after。
  const effectiveAfter = diff.content_after_blocks || diff.daiki_edit_content || diff.content_after || '';

  const handleApprove = () => onJudge(diff.id, { judgment: 'approved' });
  const handleStartReject = () => {
    setRejectReason(diff.daiki_reject_reason || '');
    setRejectNote(diff.daiki_reject_note || '');
    setRejecting(true);
  };
  const handleConfirmReject = () => {
    onJudge(diff.id, {
      judgment: 'rejected',
      reject_reason: rejectReason || null,
      reject_note: rejectNote || null,
    });
    setRejecting(false);
  };
  const handleStartEdit = () => {
    setEditContent(effectiveAfter);
    setEditing(true);
  };
  const handleConfirmEdit = () => {
    // 編集内容で承認 (空なら edit_content を送らず通常承認)
    onJudge(diff.id, {
      judgment: 'approved',
      edit_content: editContent.trim() ? editContent : null,
    });
    setEditing(false);
  };
  const handleResetPending = () => onJudge(diff.id, { judgment: 'pending' });

  return (
    <div className="result-row">
      <div className="result-row-header">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#888', fontSize: 12 }}>#{diff.diff_order}</span>
          <span className="result-heading">{diff.target_section}</span>
          <span className="status-badge applied">{diff.change_type}</span>
          <span style={{ fontSize: 11, color: '#888' }}>{diff.change_category}</span>
          {diff.risk_flag && diff.risk_flag !== 'none' && (
            <span className="status-badge rejected">risk: {diff.risk_flag}</span>
          )}
          <span style={{ fontSize: 11, color: '#888' }}>conf: {diff.llm_confidence}</span>
          <span className={`status-badge ${badgeClass}`}>{diff.daiki_judgment}</span>
          {diff.judged_at && (
            <span style={{ fontSize: 11, color: '#888' }}>判定: {fmtDate(diff.judged_at)}</span>
          )}
        </div>
      </div>

      {diff.rationale && <RationaleNote rationale={diff.rationale} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>BEFORE</div>
          <pre style={{
            background: '#fafafa', border: '1px solid #eee', borderRadius: 6,
            padding: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 240, overflow: 'auto', margin: 0,
          }}>{diff.content_before || '(なし)'}</pre>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
            AFTER (ブロックマークアップ・WP 適用形){diff.daiki_edit_content ? ' / Daiki 編集済' : ''}
          </div>
          <pre style={{
            background: diff.daiki_edit_content ? '#e3f2fd' : '#f1f8e9',
            border: `1px solid ${diff.daiki_edit_content ? '#bbdefb' : '#dcedc8'}`, borderRadius: 6,
            padding: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 240, overflow: 'auto', margin: 0,
          }}>{effectiveAfter || '(なし)'}</pre>
        </div>
      </div>

      <ViolationsList rationale={diff.rationale} />

      {diff.daiki_judgment === 'rejected' && (diff.daiki_reject_reason || diff.daiki_reject_note) && (
        <div style={{ marginTop: 8, padding: 8, background: '#ffebee', borderRadius: 6, fontSize: 12 }}>
          <strong>却下理由:</strong> {diff.daiki_reject_reason || '—'}
          {diff.daiki_reject_note && <div style={{ marginTop: 4, color: '#666' }}>{diff.daiki_reject_note}</div>}
        </div>
      )}

      {rejecting && (
        <div style={{ marginTop: 8, padding: 10, background: '#fff3e0', borderRadius: 6 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>却下理由 (必須):</div>
          <select
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            style={{ marginBottom: 6, width: '100%' }}
          >
            <option value="">— 理由を選択 —</option>
            {REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <textarea
            rows={2}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="詳細メモ (任意): どの記述が問題か / 望ましい修正方針"
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn-reject btn-small" onClick={handleConfirmReject} disabled={isBusy || !rejectReason}>却下確定</button>
            <button className="btn-secondary btn-small" onClick={() => setRejecting(false)} disabled={isBusy}>キャンセル</button>
          </div>
        </div>
      )}

      {editing && (
        <div style={{ marginTop: 8, padding: 10, background: '#e3f2fd', borderRadius: 6 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            AFTER を編集して承認 (Gutenberg ブロックマークアップ。このまま WP に適用される。空にすると LLM 原案で承認):
          </div>
          <textarea
            rows={8}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn-approve btn-small" onClick={handleConfirmEdit} disabled={isBusy}>編集を承認</button>
            <button className="btn-secondary btn-small" onClick={() => setEditing(false)} disabled={isBusy}>キャンセル</button>
          </div>
        </div>
      )}

      <div className="result-actions" style={{ marginTop: 10 }}>
        {diff.daiki_judgment !== 'approved' && (
          <button className="btn-approve btn-small" onClick={handleApprove} disabled={isBusy || rejecting || editing}>承認</button>
        )}
        {!rejecting && !editing && (
          <button className="btn-secondary btn-small" onClick={handleStartEdit} disabled={isBusy}>編集して承認</button>
        )}
        {diff.daiki_judgment !== 'rejected' && !rejecting && !editing && (
          <button className="btn-reject btn-small" onClick={handleStartReject} disabled={isBusy}>却下</button>
        )}
        {diff.daiki_judgment !== 'pending' && !rejecting && !editing && (
          <button className="btn-secondary btn-small" onClick={handleResetPending} disabled={isBusy}>未判定に戻す</button>
        )}
      </div>
    </div>
  );
}

function EvidenceSection({ title, children }) {
  return (
    <details open style={{ marginBottom: 8 }}>
      <summary style={{ cursor: 'pointer', color: '#37474f', fontWeight: 600 }}>{title}</summary>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>{children}</ul>
    </details>
  );
}

// 情報ゲイン根拠データ (投入した事実・競合・IG) を UI から確認する折りたたみパネル。
function EvidencePanel({ sessionId }) {
  const [open, setOpen] = useState(false);
  const [ev, setEv] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setOpen(false); setEv(null); }, [sessionId]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !ev && sessionId) {
      setLoading(true);
      try { setEv(await api.getSessionEvidence(sessionId)); }
      catch (e) { setEv({ error: e.message }); }
      setLoading(false);
    }
  };

  const ra = ev?.bundle?.required_additions || [];
  return (
    <div style={{ margin: '10px 0', border: '1px solid #cfd8dc', borderRadius: 8, background: 'white' }}>
      <div onClick={toggle} style={{ padding: '8px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#eceff1', borderRadius: open ? '8px 8px 0 0' : 8 }}>
        {open ? '▼' : '▶'} 情報ゲイン根拠データ（投入した事実・競合・IG）
      </div>
      {open && (
        <div style={{ padding: 12, fontSize: 12 }}>
          {loading && <div className="loading"><div className="spinner" /> 読み込み中...</div>}
          {ev?.error && <div style={{ color: '#c62828' }}>{ev.error}</div>}
          {ev && !ev.error && (
            <>
              <div style={{ marginBottom: 8 }}><strong>target_query:</strong> {ev.target_query || '—'}</div>
              {ev.ig && (
                <div style={{ marginBottom: 10, padding: 8, background: '#fff8e1', borderRadius: 4 }}>
                  <strong>情報ゲイン:</strong> 競合にあり自記事に無い = エンティティ {ev.ig.layer1_gap_count}件 / 事実 {ev.ig.layer2_gap_count}件
                  （競合 {ev.ig.competitor_url_count}サイト比較）
                </div>
              )}
              <EvidenceSection title={`注入した追加候補 required_additions (${ra.length}件) — これが diff の根拠`}>
                {ra.length === 0 ? <li style={{ color: '#999' }}>なし（薄 bundle）</li>
                  : ra.map((x, i) => <li key={i}>{x.layer ? `[L${x.layer}] ` : ''}{x.text || (typeof x === 'string' ? x : JSON.stringify(x))}</li>)}
              </EvidenceSection>
              <EvidenceSection title={`競合コーパス (${ev.competitors?.length || 0}サイト)`}>
                {(ev.competitors || []).map((c, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, marginRight: 6, color: 'white',
                      background: c.site_type === 'gov' ? '#00695c' : c.site_type === 'official' ? '#9e9e9e' : '#1565c0' }}>
                      {c.site_type === 'gov' ? '政府/出典' : c.site_type === 'official' ? '企業公式' : 'メディア'}
                    </span>
                    <a href={c.competitor_url} target="_blank" rel="noreferrer">#{c.rank_position} {c.competitor_url}</a>
                    <div style={{ color: '#666' }}>エンティティ: {c.layer1.join('、') || '—'}</div>
                    <div style={{ color: '#666' }}>事実: {c.layer2.slice(0, 8).join(' / ') || '—'}{c.layer2.length > 8 ? ` …他${c.layer2.length - 8}件` : ''}</div>
                  </li>
                ))}
              </EvidenceSection>
              <EvidenceSection title={`自記事の抽出 fact (${ev.self_facts?.length || 0}件)`}>
                {(ev.self_facts || []).slice(0, 40).map((f, i) => <li key={i}>[L{f.layer}] {f.content}</li>)}
              </EvidenceSection>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SessionDetail({ sessionId, showToast, onJudged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyDiffId, setBusyDiffId] = useState(null);
  const [complianceJob, setComplianceJob] = useState(null);
  const [applyPlan, setApplyPlan] = useState(null);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const d = await api.getJudgmentSession(sessionId);
      setDetail(d);
    } catch (e) {
      showToast(e.message, 'error');
    }
    setLoading(false);
  }, [sessionId, showToast]);

  // セッション切替時に compliance job 状態もリセット & 取得
  useEffect(() => {
    setComplianceJob(null);
    if (!sessionId) return;
    api.getComplianceJob(sessionId)
      .then((job) => setComplianceJob(job))
      .catch(() => {}); // job 未存在は無視 (404)
  }, [sessionId]);

  // compliance job が running 中の polling
  useEffect(() => {
    if (!complianceJob || complianceJob.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        const j = await api.getComplianceJob(sessionId);
        setComplianceJob(j);
        if (j.status !== 'running') {
          clearInterval(t);
          load(); // 違反が rationale に反映されたので detail を再ロード
          if (j.status === 'completed') {
            showToast(`compliance 完了: ${j.result?.diffs_with_violations || 0} / ${j.result?.diffs_scanned || 0} diff で違反 (total ${j.result?.total_violations || 0})`);
          } else {
            showToast(`compliance 失敗: ${j.error || 'unknown'}`, 'error');
          }
        }
      } catch (_) {} // 一時的なエラーは無視 (次回 tick で再試行)
    }, 3000);
    return () => clearInterval(t);
  }, [complianceJob, sessionId, load, showToast]);

  const handleDryRun = async () => {
    setApplying(true); setApplyPlan(null);
    try {
      const r = await api.applySession(sessionId, { dryRun: true });
      setApplyPlan(r);
      showToast(`dry-run: planned=${r.planned.length} skipped=${r.skipped.length}`);
    } catch (e) { showToast(e.message, 'error'); }
    setApplying(false);
  };

  const handleApply = async () => {
    if (!confirm('approved diff を WP に反映します。ロールバック可能ですが本番記事を書き換えます。続行?')) return;
    setApplying(true);
    try {
      const r = await api.applySession(sessionId, { dryRun: false });
      setApplyPlan(r);
      showToast(r.applied ? `WP 反映完了: ${r.applied_count} 件適用` : 'WP 反映なし');
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setApplying(false);
  };

  const handleRollback = async () => {
    if (!confirm('適用前の状態に WP を戻します。続行?')) return;
    setApplying(true);
    try {
      await api.rollbackSession(sessionId);
      setApplyPlan(null);
      showToast('ロールバック完了');
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setApplying(false);
  };

  const handleRunCompliance = async () => {
    try {
      const j = await api.startComplianceJob(sessionId, { enableLayer2: true });
      setComplianceJob(j);
      showToast('compliance 実行開始 (約 60-90 秒)');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  useEffect(() => { load(); }, [load]);

  const handleJudge = async (diffId, body) => {
    setBusyDiffId(diffId);
    try {
      const updated = await api.updateDiffJudgment(diffId, body);
      setDetail((prev) => prev ? {
        ...prev,
        diffs: prev.diffs.map((d) => d.id === diffId ? { ...d, ...updated } : d),
      } : prev);
      showToast(`#${diffId} → ${body.judgment}`);
      onJudged?.();
    } catch (e) {
      showToast(e.message, 'error');
    }
    setBusyDiffId(null);
  };

  if (!sessionId) return <div className="loading">左の一覧からセッションを選択してください</div>;
  if (loading && !detail) return <div className="loading"><div className="spinner" /> 読み込み中...</div>;
  if (!detail) return null;

  const counts = detail.diffs.reduce((acc, d) => {
    acc[d.daiki_judgment] = (acc[d.daiki_judgment] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="article-group" style={{ marginTop: 16 }}>
      <div className="article-header">
        <div>
          <div className="article-title">
            session #{detail.id} · post_id={detail.post_id}
            <span className={`status-badge ${detail.status === 'awaiting_diff_judgment' ? 'pending'
                           : detail.status === 'completed' ? 'approved' : 'applied'}`}
                  style={{ marginLeft: 8 }}>
              {detail.status}
            </span>
          </div>
          <div className="article-meta" style={{ marginTop: 4 }}>
            {detail.model_analysis} → {detail.model_generation} · cost {fmtCost(detail.cost_total_usd)} · {fmtDate(detail.started_at)}
          </div>
          <div className="article-meta" style={{ marginTop: 2 }}>
            diffs: total {detail.diffs.length} · pending {counts.pending || 0} · approved {counts.approved || 0} · rejected {counts.rejected || 0}
          </div>
          {detail.high_risk_categories && (
            <div className="article-meta" style={{ marginTop: 2, color: '#c62828' }}>
              high_risk: {detail.high_risk_categories}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {complianceJob && complianceJob.status === 'completed' && complianceJob.result && (
            <span style={{ fontSize: 11, color: '#666', alignSelf: 'center' }}>
              compliance: {complianceJob.result.diffs_with_violations}/{complianceJob.result.diffs_scanned} diff 違反
              (L2 calls={complianceJob.result.layer2_llm_calls})
            </span>
          )}
          <button
            className={complianceJob?.status === 'running' ? 'btn-secondary btn-small' : 'btn-apply btn-small'}
            onClick={handleRunCompliance}
            disabled={complianceJob?.status === 'running'}
            title="master_rules verified を全 diff に適用 (Layer 1+2)"
          >
            {complianceJob?.status === 'running' ? 'compliance 実行中...' : 'compliance 実行'}
          </button>
          <button
            className="btn-apply btn-small"
            onClick={handleDryRun}
            disabled={applying}
            title="approved diff を WP に適用したらどうなるか確認 (実 WP は触らない)"
          >
            {applying ? '...' : 'プレビュー'}
          </button>
          {!detail.wp_apply_completed_at ? (
            <button
              className="btn-approve btn-small"
              onClick={handleApply}
              disabled={applying || !(counts.approved > 0)}
              title="approved diff を WP に反映"
            >
              {applying ? '適用中...' : 'WP に適用'}
            </button>
          ) : (
            <button
              className="btn-reject btn-small"
              onClick={handleRollback}
              disabled={applying}
              title="適用前の WP HTML に戻す"
            >
              {applying ? '...' : 'ロールバック'}
            </button>
          )}
          <button className="btn-secondary btn-small" onClick={load} disabled={loading}>
            {loading ? '更新中...' : '再読込'}
          </button>
        </div>
      </div>

      {applyPlan && (
        <div style={{ padding: 12, background: '#e8f5e9', borderBottom: '1px solid #c8e6c9', fontSize: 12 }}>
          <strong>{applyPlan.dry_run ? 'dry-run プレビュー' : applyPlan.applied ? 'WP 反映済' : '反映なし'}</strong>
          {' '}post_id={applyPlan.post_id} · planned={applyPlan.planned.length} · skipped={applyPlan.skipped.length}
          {applyPlan.planned.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: '#2e7d32', fontWeight: 600 }}>planned:</div>
              {applyPlan.planned.map((p, i) => (
                <div key={i} style={{ marginLeft: 12 }}>
                  diff #{p.diff_id} · {p.target_section} · before {p.before_len}c → after {p.after_len}c
                </div>
              ))}
            </div>
          )}
          {applyPlan.skipped.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: '#c62828', fontWeight: 600 }}>skipped:</div>
              {applyPlan.skipped.map((s, i) => (
                <div key={i} style={{ marginLeft: 12 }}>
                  diff #{s.diff_id}: {s.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <EvidencePanel sessionId={sessionId} />

      {detail.diffs.length === 0 ? (
        <div className="loading">このセッションには diff がありません</div>
      ) : (
        detail.diffs.map((d) => (
          <DiffCard key={d.id} diff={d} onJudge={handleJudge} busyId={busyDiffId} />
        ))
      )}
    </div>
  );
}

// バッチ item ステータス → 表示ラベル/バッジ色
const BATCH_ITEM_LABEL = {
  queued:     { label: '待機',          badge: 'pending' },
  preparing:  { label: 'クエリ準備中',   badge: 'pending' },
  generating: { label: '生成中',        badge: 'pending' },
  judging:    { label: '自動承認中',     badge: 'pending' },
  applying:   { label: 'WP適用中',      badge: 'pending' },
  done:       { label: '完了',          badge: 'approved' },
  held:       { label: '伺い (判定待ち)', badge: 'applied' },
  failed:     { label: '失敗',          badge: 'rejected' },
  skipped:    { label: '中断スキップ',    badge: 'rejected' },
};

function BatchPanel({ job }) {
  if (!job) return null;
  const doneCount = job.items.filter((it) => ['done', 'held', 'failed'].includes(it.status)).length;
  return (
    <div style={{ padding: '10px 12px', background: 'white', borderTop: '1px solid #fbc02d', fontSize: 12 }}>
      <div style={{ marginBottom: 6 }}>
        <strong>一括リライト</strong>
        <span className={`status-badge ${job.status === 'completed' ? 'approved' : job.status === 'failed' ? 'rejected' : 'pending'}`} style={{ marginLeft: 8 }}>
          {job.status === 'running' ? `実行中 ${doneCount}/${job.total}` : job.status}
        </span>
        <span style={{ marginLeft: 8, color: '#888' }}>
          自動承認基準: violationsなし × riskなし × confidence high / 基準外は「伺い」として判定待ちに残る
        </span>
      </div>
      {job.items.map((it) => {
        const st = BATCH_ITEM_LABEL[it.status] || { label: it.status, badge: 'pending' };
        return (
          <div key={it.post_id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #f5f5f5' }}>
            <span style={{ width: 56, color: '#888' }}>#{it.post_id}</span>
            <span className={`status-badge ${st.badge}`}>{st.label}</span>
            {it.session_id && <span style={{ color: '#888' }}>session #{it.session_id}</span>}
            {it.diff_count != null && <span style={{ color: '#666' }}>diffs {it.diff_count}</span>}
            {it.auto_approved != null && <span style={{ color: '#2e7d32' }}>承認 {it.auto_approved}</span>}
            {it.held > 0 && <span style={{ color: '#f57f17' }}>伺い {it.held}</span>}
            {it.applied && <span style={{ color: '#1565c0' }}>WP適用 {it.applied_count}件</span>}
            {it.error && <span style={{ color: '#c62828', flex: 1 }}>{it.error}</span>}
          </div>
        );
      })}
    </div>
  );
}

function GenerationPanel({ showToast, onSessionCreated, genre, setGenre }) {
  const [postId, setPostId] = useState('');
  const [queryFanouts, setQueryFanouts] = useState([]);
  const [queryFanoutId, setQueryFanoutId] = useState('');
  const [enableCompliance, setEnableCompliance] = useState(true);
  const [job, setJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [candLoading, setCandLoading] = useState(false);
  const [preparingId, setPreparingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [autoApply, setAutoApply] = useState(true);
  const [batchJob, setBatchJob] = useState(null);

  const refreshFanouts = async (selectId) => {
    const r = await api.getQueryFanouts();
    setQueryFanouts(r.items || []);
    if (selectId != null) setQueryFanoutId(String(selectId));
    else if (r.items && r.items.length > 0 && !queryFanoutId) setQueryFanoutId(String(r.items[0].id));
  };

  useEffect(() => {
    refreshFanouts().catch(() => {});
    api.getGenerationJob().then(setJob).catch(() => {});
    api.getBatchRewrite().then(setBatchJob).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCandidates = useCallback(() => {
    if (!genre || genre === 'all') { setCandidates([]); setCandLoading(false); return; }
    setCandLoading(true);
    api.getAutoPickCandidates(genre, 20)
      .then((r) => setCandidates(r.items || []))
      .catch(() => setCandidates([]))
      .finally(() => setCandLoading(false));
  }, [genre]);

  // 自動ピック候補をカテゴリ変更時にロード (順位モニタリング由来)。全カテゴリ時は出さない。
  useEffect(() => {
    setSelectedIds(new Set());
    loadCandidates();
  }, [loadCandidates]);

  // 候補を選んで生成準備 (top query → query_fanout 自動生成 → フォームにセット)
  const pickCandidate = async (c) => {
    setPreparingId(c.post_id);
    try {
      const r = await api.prepareCandidate(c.post_id, genre);
      setPostId(String(r.post_id));
      await refreshFanouts(r.query_fanout_id);
      showToast(`候補セット: post ${r.post_id} / 「${r.target_query}」`);
    } catch (e) {
      showToast(`準備失敗: ${e.message}`, 'error');
    }
    setPreparingId(null);
  };

  // polling
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        const j = await api.getGenerationJob(job.job_id);
        setJob(j);
        if (j.status !== 'running') {
          clearInterval(t);
          if (j.status === 'completed') {
            showToast(`session #${j.session_id} 生成完了 (diffs=${j.diff?.diffs_inserted || 0}${j.compliance ? ', violations=' + j.compliance.total_violations : ''})`);
            onSessionCreated?.(j.session_id);
          } else {
            showToast(`生成失敗: ${j.error}`, 'error');
          }
        }
      } catch (_) {}
    }, 4000);
    return () => clearInterval(t);
  }, [job, showToast, onSessionCreated]);

  // batch polling
  useEffect(() => {
    if (!batchJob || batchJob.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        const j = await api.getBatchRewrite();
        setBatchJob(j);
        if (j.status !== 'running') {
          clearInterval(t);
          const applied = j.items.filter((it) => it.applied).length;
          const held = j.items.filter((it) => it.status === 'held').length;
          const failed = j.items.filter((it) => it.status === 'failed').length;
          showToast(`一括リライト完了: WP適用 ${applied} / 伺い ${held} / 失敗 ${failed} (全${j.total}件)`);
          loadCandidates(); // リライト済みになった記事が候補から消える
          onSessionCreated?.();
        }
      } catch (_) {}
    }, 5000);
    return () => clearInterval(t);
  }, [batchJob, showToast, onSessionCreated, loadCandidates]);

  const toggleSelect = (pid) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  };

  const handleStartBatch = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return showToast('候補をチェックで選択してください', 'error');
    const ok = confirm(
      `${ids.length} 記事を一括リライトします (直列実行)。\n` +
      `自動承認: violationsなし × riskなし × confidence high のみ。基準外 diff は判定待ちに残ります。\n` +
      `WP自動適用: ${autoApply ? 'ON (全 diff クリーンな記事のみ即適用)' : 'OFF (承認まで)'}\n` +
      `推定: 約 $0.6 × ${ids.length} = $${(0.6 * ids.length).toFixed(1)} / 約 ${ids.length * 3} 分。続行?`
    );
    if (!ok) return;
    try {
      const j = await api.startBatchRewrite({ post_ids: ids, genre, autoApply, enableCompliance: true });
      setBatchJob(j);
      setSelectedIds(new Set());
      showToast(`一括リライト開始 (${ids.length}件)`);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleStart = async () => {
    const pid = Number(postId);
    const qfid = Number(queryFanoutId);
    if (!Number.isInteger(pid) || pid <= 0) return showToast('post_id を入力してください', 'error');
    if (!Number.isInteger(qfid) || qfid <= 0) return showToast('query_fanout を選択してください', 'error');
    const ok = confirm(`post_id=${pid} query_fanout=${qfid} で生成します。\n推定: Opus + Sonnet${enableCompliance ? ' + Layer 2 compliance' : ''} = 約 $0.6 / 3 分。続行?`);
    if (!ok) return;
    try {
      const j = await api.startGenerationJob({ post_id: pid, query_fanout_id: qfid, enableCompliance, genre });
      setJob(j);
      showToast('生成開始');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const stepLabel = {
    init: '初期化中', session_init: 'セッション作成',
    competitor_corpus: '競合コーパス取得中 (SerpApi)', fact_extraction: '競合fact抽出中 (情報ゲイン)',
    analyzing: '分析中 (Opus)',
    generating: '差分生成中 (Sonnet)', compliance: 'compliance 検査中', done: '完了',
  };

  const running = job?.status === 'running' || batchJob?.status === 'running';

  return (
    <div className="article-group" style={{ marginBottom: 16, background: '#fffde7' }}>
      <div className="article-header" style={{ background: '#fff9c4', borderBottom: '1px solid #fbc02d' }}>
        <div className="article-title">新規セッション生成 (一気通貫: analysis → diff → compliance)</div>
      </div>
      <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 12, color: '#666' }}>カテゴリ</label>
        <select value={genre} onChange={(e) => setGenre(e.target.value)} disabled={running} style={{ width: 'auto' }}>
          <option value="cardloan">カードローン</option>
          <option value="securities">証券</option>
          <option value="cryptocurrency">仮想通貨</option>
          <option value="fx">FX</option>
          <option value="realestate">不動産</option>
        </select>
        <label style={{ fontSize: 12, color: '#666' }}>post_id</label>
        <input
          type="number"
          value={postId}
          onChange={(e) => setPostId(e.target.value)}
          placeholder="例: 11077"
          style={{ width: 120 }}
          disabled={running}
        />
        <label style={{ fontSize: 12, color: '#666' }}>query_fanout</label>
        <select value={queryFanoutId} onChange={(e) => setQueryFanoutId(e.target.value)} disabled={running} style={{ width: 'auto', minWidth: 280, maxWidth: 480 }}>
          {queryFanouts.map((q) => (
            <option key={q.id} value={q.id}>#{q.id} {q.sub_query} (seed: {q.seed_query})</option>
          ))}
        </select>
        <label style={{ fontSize: 12, color: '#666' }}>
          <input type="checkbox" checked={enableCompliance} onChange={(e) => setEnableCompliance(e.target.checked)} disabled={running} style={{ marginRight: 4, width: 'auto' }} />
          compliance 実行
        </label>
        <button className="btn-apply btn-small" onClick={handleStart} disabled={running}>
          {running ? '生成中...' : '生成'}
        </button>
      </div>

      {/* 自動ピック候補 (順位モニタリング: 平均順位11-20 = 伸びしろ)。リライト済み・進行中の記事は除外。 */}
      <div style={{ padding: '4px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#666', marginBottom: 4, flexWrap: 'wrap' }}>
          <span>
            リライト候補 (順位11-20 / impression 降順 / リライト済みは除外)
            {candLoading ? ' — 読込中...' : ` — ${candidates.length}件`}
          </span>
          <button className="btn-secondary btn-small" onClick={loadCandidates} disabled={candLoading}>候補を更新</button>
          {candidates.length > 0 && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} disabled={running} style={{ width: 'auto' }} />
                クリーンな記事は WP 自動適用
              </label>
              <button className="btn-apply btn-small" onClick={handleStartBatch} disabled={running || selectedIds.size === 0}>
                選択 {selectedIds.size} 件を一括リライト
              </button>
            </span>
          )}
        </div>
        {candidates.length > 0 && (
          <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #fbc02d', borderRadius: 6, background: 'white' }}>
            {candidates.map((c) => (
              <div key={c.post_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.post_id)}
                  onChange={() => toggleSelect(c.post_id)}
                  disabled={running}
                  style={{ width: 'auto' }}
                />
                <span style={{ color: '#888', width: 56 }}>#{c.post_id}</span>
                <span style={{ width: 70, color: c.avg_rank <= 13 ? '#e65100' : '#888' }}>順位 {c.avg_rank}</span>
                <span style={{ width: 90, color: '#555' }}>impr {c.impressions}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.title}>{c.title || c.url}</span>
                <button className="btn-secondary btn-small" disabled={running || preparingId === c.post_id} onClick={() => pickCandidate(c)}>
                  {preparingId === c.post_id ? '準備中...' : 'この記事を生成'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <BatchPanel job={batchJob} />
      {job && (
        <div style={{ padding: '10px 12px', background: 'white', borderTop: '1px solid #fbc02d', fontSize: 12 }}>
          <span style={{ marginRight: 8, color: '#666' }}>job: {job.job_id}</span>
          <span className={`status-badge ${job.status === 'completed' ? 'approved' : job.status === 'failed' ? 'rejected' : 'pending'}`}>
            {job.status === 'running' ? (stepLabel[job.step] || job.step) : job.status}
          </span>
          {job.session_id && <span style={{ marginLeft: 8 }}>→ session #{job.session_id}</span>}
          {job.diff && <span style={{ marginLeft: 8, color: '#666' }}>diffs={job.diff.diffs_inserted}</span>}
          {job.compliance && <span style={{ marginLeft: 8, color: '#666' }}>violations={job.compliance.total_violations}</span>}
          {job.error && <div style={{ color: '#c62828', marginTop: 4 }}>{job.error}</div>}
        </div>
      )}
    </div>
  );
}

export default function RewriteJudgmentView({ showToast }) {
  const [status, setStatus] = useState('awaiting_diff_judgment');
  const [genre, setGenre] = useState('cardloan');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getJudgmentSessions({ status: status || undefined, genre: genre || undefined, limit: 100 });
      setItems(r.items || []);
      if (selectedId == null && r.items && r.items.length > 0) {
        setSelectedId(r.items[0].id);
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
    setLoading(false);
  }, [status, genre, selectedId, showToast]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, genre]);

  return (
    <div>
      <GenerationPanel
        showToast={showToast}
        genre={genre}
        setGenre={setGenre}
        onSessionCreated={(sid) => { load(); setSelectedId(sid); }}
      />

      <div className="filters">
        <label style={{ fontSize: 12, color: '#888' }}>カテゴリ</label>
        <select value={genre} onChange={(e) => { setGenre(e.target.value); setSelectedId(null); }}>
          {GENRE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <label style={{ fontSize: 12, color: '#888' }}>ステータス</label>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setSelectedId(null); }}>
          {STATUS_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button className="btn-secondary btn-small" onClick={load} disabled={loading}>
          {loading ? '読込中...' : '再読込'}
        </button>
        <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>{items.length}件</span>
      </div>

      {loading && items.length === 0 && <div className="loading"><div className="spinner" /> 読み込み中...</div>}
      {!loading && items.length === 0 && <div className="loading">対象セッションがありません</div>}

      {items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse', background: 'white',
            borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', fontSize: 13,
          }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>id</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>post_id</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>カテゴリ</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>status</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>diffs</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>pending / appr / rej</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>cost</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>開始</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <SessionRow key={s.id} s={s} selected={selectedId === s.id} onSelect={setSelectedId} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SessionDetail sessionId={selectedId} showToast={showToast} onJudged={load} />
    </div>
  );
}
