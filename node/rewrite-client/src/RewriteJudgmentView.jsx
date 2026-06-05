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
  // 適用される実コンテンツ: Daiki 編集があればそれ、なければ LLM の content_after
  const effectiveAfter = diff.daiki_edit_content || diff.content_after || '';

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

      {diff.rationale && (
        <div className="result-reason" style={{ marginTop: 6 }}>{diff.rationale}</div>
      )}

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
            AFTER{diff.daiki_edit_content ? ' (Daiki 編集済 — これが適用される)' : ''}
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
            AFTER を編集して承認 (この HTML がそのまま WP に適用される。空にすると LLM 原案で承認):
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

function GenerationPanel({ showToast, onSessionCreated }) {
  const [postId, setPostId] = useState('');
  const [queryFanouts, setQueryFanouts] = useState([]);
  const [queryFanoutId, setQueryFanoutId] = useState('');
  const [enableCompliance, setEnableCompliance] = useState(true);
  const [job, setJob] = useState(null);

  useEffect(() => {
    api.getQueryFanouts().then((r) => {
      setQueryFanouts(r.items || []);
      if (r.items && r.items.length > 0) setQueryFanoutId(String(r.items[0].id));
    }).catch(() => {});
    api.getGenerationJob().then(setJob).catch(() => {});
  }, []);

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

  const handleStart = async () => {
    const pid = Number(postId);
    const qfid = Number(queryFanoutId);
    if (!Number.isInteger(pid) || pid <= 0) return showToast('post_id を入力してください', 'error');
    if (!Number.isInteger(qfid) || qfid <= 0) return showToast('query_fanout を選択してください', 'error');
    const ok = confirm(`post_id=${pid} query_fanout=${qfid} で生成します。\n推定: Opus + Sonnet${enableCompliance ? ' + Layer 2 compliance' : ''} = 約 $0.6 / 3 分。続行?`);
    if (!ok) return;
    try {
      const j = await api.startGenerationJob({ post_id: pid, query_fanout_id: qfid, enableCompliance });
      setJob(j);
      showToast('生成開始');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const stepLabel = {
    init: '初期化中', session_init: 'セッション作成', analyzing: '分析中 (Opus)',
    generating: '差分生成中 (Sonnet)', compliance: 'compliance 検査中', done: '完了',
  };

  const running = job?.status === 'running';

  return (
    <div className="article-group" style={{ marginBottom: 16, background: '#fffde7' }}>
      <div className="article-header" style={{ background: '#fff9c4', borderBottom: '1px solid #fbc02d' }}>
        <div className="article-title">新規セッション生成 (一気通貫: analysis → diff → compliance)</div>
      </div>
      <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
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
        <select value={queryFanoutId} onChange={(e) => setQueryFanoutId(e.target.value)} disabled={running} style={{ minWidth: 280 }}>
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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getJudgmentSessions({ status: status || undefined, limit: 100 });
      setItems(r.items || []);
      if (selectedId == null && r.items && r.items.length > 0) {
        setSelectedId(r.items[0].id);
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
    setLoading(false);
  }, [status, selectedId, showToast]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  return (
    <div>
      <GenerationPanel
        showToast={showToast}
        onSessionCreated={(sid) => { load(); setSelectedId(sid); }}
      />

      <div className="filters">
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
