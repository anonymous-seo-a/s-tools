'use strict';

const express = require('express');
const cheerio = require('cheerio');
const { open } = require('../db');
const { runComplianceCheck } = require('../llm-execution/compliance-runner');
const { runAnalysis } = require('../llm-execution/analysis-runner');
const { runDiffGeneration } = require('../llm-execution/diff-runner');

// in-memory job ストア (server プロセス再起動で消失、明示再実行で再投入)
//   key: session_id (number) → compliance job
//   key: job_id (string)     → generation job
const complianceJobs = new Map();
const generationJobs = new Map(); // job_id → { ... }
let activeGenerationJobId = null;

// β-1A: smoke-e2e.js の一気通貫フローを単独関数化。
// embedding-poc が未完成領域なので mock gap データを INSERT する (現状の Phase 2 と同質)。
async function runGenerationPipeline(job, conn) {
  const { post_id, query_fanout_id, enableCompliance } = job.options;

  // 1. session INSERT
  job.step = 'session_init';
  const info = conn.prepare(
    `INSERT INTO master_rewrite_session
       (post_id, model_analysis, model_generation, triggered_by, status)
     VALUES (?, 'claude-opus-4-7', 'claude-sonnet-4-6', 'ui-generation', 'planned')`
  ).run(post_id);
  const session_id = info.lastInsertRowid;
  job.session_id = session_id;

  // 2. mock gap データ (smoke-e2e と同パターン、本物 passage_gap は段階C-B 領域)
  const fanout = conn.prepare('SELECT sub_query FROM master_query_fanout WHERE id=?').get(query_fanout_id);
  if (!fanout) throw new Error(`query_fanout_id=${query_fanout_id} not found`);

  const insertGap = conn.prepare(
    `INSERT INTO master_passage_gap
       (session_id, post_id, query_fanout_id, target_text, target_kind, fact_layer,
        self_max_cosine, competitor_max_cosine, delta, gap_flag, judge_type, model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertGap.run(session_id, post_id, query_fanout_id, fanout.sub_query, 'query', null, 0.55, 0.65, 0.05, 1, 'embedding', 'voyage-3-large');
  insertGap.run(session_id, post_id, query_fanout_id, fanout.sub_query, 'query', null, null, null, null, 1, 'factset', null);
  for (const f of [
    { text: 'アコム', layer: 1, self: 0.45, comp: 0.58 },
    { text: 'プロミス', layer: 1, self: 0.40, comp: 0.55 },
  ]) {
    insertGap.run(session_id, post_id, query_fanout_id, f.text, 'fact', f.layer, f.self, f.comp, -0.05, 1, 'embedding', 'voyage-3-large');
    insertGap.run(session_id, post_id, query_fanout_id, f.text, 'fact', f.layer, null, null, null, 0, 'factset', null);
  }

  // 3. runAnalysis (Opus 4.7)
  job.step = 'analyzing';
  const analysisRes = await runAnalysis({ session_id, post_id, query_fanout_id });
  job.analysis = {
    usage: analysisRes.usage,
    status: analysisRes.status,
    high_risk_categories: analysisRes.high_risk_categories,
  };

  // 4. policy_judgment 自動 approved (UI 生成は smoke と同じく強制承認)
  if (analysisRes.status === 'awaiting_policy_judgment') {
    conn.prepare(
      `UPDATE master_rewrite_session SET policy_judgment='approved', policy_judgment_at=CURRENT_TIMESTAMP, status='generating' WHERE id=?`
    ).run(session_id);
  }

  // 5. runDiffGeneration (Sonnet 4.6)
  job.step = 'generating';
  const diffRes = await runDiffGeneration({ session_id });
  job.diff = {
    usage: diffRes.usage,
    diffs_inserted: diffRes.diffs_inserted,
    diffs_rejected: diffRes.diffs_rejected,
    content_before_server_resolved: diffRes.content_before_server_resolved,
  };

  // 6. (optional) runComplianceCheck
  if (enableCompliance) {
    job.step = 'compliance';
    const complianceRes = await runComplianceCheck({ session_id, enableLayer2: true });
    job.compliance = {
      diffs_scanned: complianceRes.diffs_scanned,
      diffs_with_violations: complianceRes.diffs_with_violations,
      total_violations: complianceRes.total_violations,
      layer2_llm_calls: complianceRes.layer2_llm_calls,
      layer2_usage: complianceRes.layer2_usage,
    };
  }

  job.step = 'done';
  return { session_id };
}

// ─────────────────────────────────────────────────────────────────────
// Step β-2: WP 適用 (apply step)
//   - approved diff を 1 件ずつ WP content 内で content_before を search → content_after に置換
//   - 全件成功で WP PUT (atomically)
//   - 1 件でも失敗すれば dry-run 結果としてエラー返し、WP は触らない
//   - 適用前 WP HTML を wp_snapshot_before_apply に保存 (ロールバック用)
//   - hallucination 旧 diff (content_before 短すぎ) は事前に排除
// ─────────────────────────────────────────────────────────────────────

const APPLY_MIN_CONTENT_BEFORE_LEN = 50; // これ未満は LLM hallucination 推定で拒否

async function fetchWpPost(postId) {
  const raw = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  if (!raw) throw new Error('WP_API_BASE_URL not set');
  const base = raw.endsWith('/wp-json/wp/v2') ? raw : `${raw}/wp-json/wp/v2`;
  const url = `${base}/posts/${postId}`;
  const auth = Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WP fetch ${postId}: HTTP ${res.status}`);
  const p = await res.json();
  return { title: p.title?.rendered || '', content_rendered: p.content?.rendered || '' };
}

const HEADINGS = 'h1,h2,h3,h4';

// 差分生成時 (diff-runner) は content.rendered を extractSelfArticle に通し、h*# diff の
// content_before を section の raw_html_block (= 見出しタグ + 次見出し直前までの兄弟要素を
// $.html(node) で連結、要素間テキストノードは nextUntil が除外) で上書きしている。
// apply step は同じ cheerio パイプラインで WP content.rendered を読み、各見出しから
// raw_html_block を再構築して content_before と完全一致する section だけを置換対象にする。
// 文字列 substring 照合は不可 ($('body').html() は要素間 \n を含むため raw_html_block と不一致)。
//
// 注意: extractSelfArticle は script/style/noscript を *除去してから* section を組むため
// raw_html_block にはそれらが含まれない。一方 apply は最終的に $('body').html() を WP へ
// push するので、ここで script/style を除去すると記事本文のインライン script/style が
// 適用時に永久消失する (YMYL 記事でデータ損失)。よって DOM 上は残し、照合ブロックの
// 再構築時のみ script/style/noscript を除外して content_before とのパリティを保つ。
const SKIP_TAGS = new Set(['script', 'style', 'noscript']);

function buildDom(contentRendered) {
  return cheerio.load(contentRendered || '', { decodeEntities: true });
}

function reconstructBlock($, $h) {
  // 置換対象 span は次見出し直前までの全兄弟 (script/style 含む = remove 対象)。
  const $body = $h.nextUntil(HEADINGS);
  // 照合用 html は extractSelfArticle と同様 script/style/noscript を除外して連結。
  const compareNodes = $body.toArray().filter((n) => !SKIP_TAGS.has(n.tagName?.toLowerCase()));
  const html = $.html($h) + compareNodes.map((n) => $.html(n)).join('');
  return { html, $body };
}

// planApply: 現 DOM に対し置換対象を確定。DOM は変更しない (node 参照のみ ops に退避)。
//   planned[] は JSON 返却用 (plain field のみ)、ops は server side で apply 時に使う。
function planApply($, diffs) {
  const planned = [];
  const skipped = [];
  const ops = new Map();
  for (const d of diffs) {
    if (d.daiki_judgment !== 'approved') {
      skipped.push({ diff_id: d.id, reason: `not approved (${d.daiki_judgment})` });
      continue;
    }
    const before = (d.content_before || '').trim();
    const after = d.daiki_edit_content || d.content_after || '';
    if (before.length < APPLY_MIN_CONTENT_BEFORE_LEN) {
      skipped.push({ diff_id: d.id, reason: `content_before too short (${before.length}c, hallucination?)` });
      continue;
    }
    if (!after) {
      skipped.push({ diff_id: d.id, reason: 'content_after empty' });
      continue;
    }
    if (!/^h[1-4]#.+/.test((d.target_section || '').trim())) {
      // meta:* / p#… / outline:* は本文 section 置換の対象外 (別経路で解決)。
      skipped.push({ diff_id: d.id, reason: `target_section not a body heading (${d.target_section})` });
      continue;
    }
    // 現 HTML の見出しから raw_html_block を再構築し、content_before と完全一致する section を探す。
    let matched = null;
    $(HEADINGS).each((_, el) => {
      if (matched) return;
      const $h = $(el);
      const { html, $body } = reconstructBlock($, $h);
      if (html === before) matched = { $h, $body };
    });
    if (!matched) {
      skipped.push({ diff_id: d.id, reason: 'section not found / drifted (content_before mismatch)' });
      continue;
    }
    planned.push({ diff_id: d.id, target_section: d.target_section, before_len: before.length, after_len: after.length });
    ops.set(d.id, { $h: matched.$h, $body: matched.$body, after });
  }
  return { planned, skipped, ops };
}

// applyOps: planApply で確定した node を置換。$body 兄弟は plan 時点で捕捉済のため、
//   他 section の置換による兄弟構成変化の影響を受けない。返り値は更新後の body inner。
function applyOps($, planned, ops) {
  for (const p of planned) {
    const op = ops.get(p.diff_id);
    if (!op) throw new Error(`apply: missing op for diff #${p.diff_id}`);
    op.$body.remove();
    op.$h.replaceWith(op.after);
  }
  return $('body').html() || '';
}

async function updateWpPost(postId, contentHtml) {
  const raw = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  const base = raw.endsWith('/wp-json/wp/v2') ? raw : `${raw}/wp-json/wp/v2`;
  const url = `${base}/posts/${postId}`;
  const auth = Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST', // WP REST は POST で update (PUT も可)
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: contentHtml }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`WP update ${postId}: HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json();
}

const VALID_SESSION_STATUSES = new Set([
  'planned',
  'analyzing',
  'awaiting_policy_judgment',
  'generating',
  'awaiting_diff_judgment',
  'completed',
  'failed',
  'cancelled',
]);

const VALID_JUDGMENTS = new Set(['pending', 'approved', 'rejected']);

function fetchSessions({ status, limit }) {
  const conn = open();
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE s.status = ?';
    params.push(status);
  }
  const sql = `
    SELECT
      s.id,
      s.post_id,
      s.status,
      s.model_analysis,
      s.model_generation,
      s.cost_total_usd,
      s.policy_judgment,
      s.high_risk_categories,
      s.started_at,
      s.analysis_completed_at,
      s.generation_completed_at,
      s.triggered_by,
      COUNT(d.id) AS diff_count,
      SUM(CASE WHEN d.daiki_judgment = 'pending'  THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN d.daiki_judgment = 'approved' THEN 1 ELSE 0 END) AS approved_count,
      SUM(CASE WHEN d.daiki_judgment = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
    FROM master_rewrite_session s
    LEFT JOIN master_rewrite_diff d ON d.session_id = s.id
    ${where}
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT ?
  `;
  params.push(limit);
  return conn.prepare(sql).all(...params);
}

function fetchSessionDetail(id) {
  const conn = open();
  const session = conn.prepare(`
    SELECT
      id, post_id, status, model_analysis, model_generation,
      input_tokens_analysis, output_tokens_analysis,
      input_tokens_generation, output_tokens_generation,
      cost_total_usd, analysis_output, high_risk_categories,
      policy_summary, policy_judgment, policy_judgment_at,
      policy_reject_reason, policy_reject_note,
      started_at, analysis_completed_at, generation_completed_at, completed_at,
      triggered_by, notes
    FROM master_rewrite_session
    WHERE id = ?
  `).get(id);
  if (!session) return null;
  const diffs = conn.prepare(`
    SELECT
      id, session_id, diff_order, target_section, change_type, change_category,
      content_before, content_after, rationale, estimated_impact,
      llm_confidence, risk_flag, evidence_id,
      daiki_judgment, daiki_edit_content, daiki_reject_reason, daiki_reject_note,
      judged_at, applied_to_wp, applied_at, ab_test_id, created_at
    FROM master_rewrite_diff
    WHERE session_id = ?
    ORDER BY diff_order, id
  `).all(id);
  return { ...session, diffs };
}

function updateDiffJudgment(id, { judgment, reject_reason, reject_note, edit_content }) {
  const conn = open();
  const existing = conn.prepare(`SELECT * FROM master_rewrite_diff WHERE id = ?`).get(id);
  if (!existing) return null;

  const sets = ['daiki_judgment = ?', 'judged_at = CURRENT_TIMESTAMP'];
  const params = [judgment];

  if (judgment === 'rejected') {
    sets.push('daiki_reject_reason = ?');
    params.push(reject_reason ?? null);
    sets.push('daiki_reject_note = ?');
    params.push(reject_note ?? null);
  } else {
    sets.push('daiki_reject_reason = NULL');
    sets.push('daiki_reject_note = NULL');
  }

  if (edit_content !== undefined) {
    sets.push('daiki_edit_content = ?');
    params.push(edit_content);
  }

  params.push(id);
  conn.prepare(`UPDATE master_rewrite_diff SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return conn.prepare(`SELECT * FROM master_rewrite_diff WHERE id = ?`).get(id);
}

function buildRouter() {
  const router = express.Router();

  // GET /api/rewrite/judgment/sessions?status=awaiting_diff_judgment&limit=N
  router.get('/sessions', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
      let status = req.query.status;
      if (status === '' || status === 'all') status = undefined;
      if (status !== undefined && !VALID_SESSION_STATUSES.has(status)) {
        return res.status(400).json({ error: 'invalid status', allowed: [...VALID_SESSION_STATUSES] });
      }
      const items = fetchSessions({ status, limit });
      return res.json({
        limit,
        status: status || null,
        count: items.length,
        items,
      });
    } catch (e) {
      console.error('[GET /judgment/sessions]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rewrite/judgment/sessions/:id  → session + diffs[]
  router.get('/sessions/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'invalid id' });
      }
      const detail = fetchSessionDetail(id);
      if (!detail) return res.status(404).json({ error: 'session not found', id });
      return res.json(detail);
    } catch (e) {
      console.error('[GET /judgment/sessions/:id]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/judgment/sessions
  //   body: { post_id, query_fanout_id, enableCompliance: true }
  //   非同期: smoke-e2e.js の一気通貫フローを実行 (analysis → diff → compliance)
  //   同時実行 1 件まで (排他)
  router.post('/sessions', (req, res) => {
    try {
      if (activeGenerationJobId) {
        const cur = generationJobs.get(activeGenerationJobId);
        if (cur && cur.status === 'running') {
          return res.status(409).json({ error: 'another generation in progress', job: cur });
        }
      }
      const body = req.body || {};
      const post_id = Number(body.post_id);
      const query_fanout_id = Number(body.query_fanout_id);
      if (!Number.isInteger(post_id) || post_id <= 0) {
        return res.status(400).json({ error: 'post_id (positive integer) required' });
      }
      if (!Number.isInteger(query_fanout_id) || query_fanout_id <= 0) {
        return res.status(400).json({ error: 'query_fanout_id (positive integer) required' });
      }
      const enableCompliance = body.enableCompliance !== false;

      const job_id = `gen-${Date.now()}`;
      const job = {
        job_id,
        status: 'running',
        step: 'init',
        options: { post_id, query_fanout_id, enableCompliance },
        session_id: null,
        analysis: null,
        diff: null,
        compliance: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        error: null,
      };
      generationJobs.set(job_id, job);
      activeGenerationJobId = job_id;

      (async () => {
        try {
          await runGenerationPipeline(job, open());
          job.status = 'completed';
        } catch (e) {
          job.status = 'failed';
          job.error = e.message || String(e);
          console.error(`[generation job ${job_id}]`, e);
          // DB セッションを failed に落とす (これをしないと analyzing/generating で永久ストール、
          // UI から復旧不能になる)。session INSERT 前の失敗時は session_id=null なので skip。
          if (job.session_id) {
            try {
              open().prepare(
                `UPDATE master_rewrite_session
                 SET status='failed', notes=json_set(COALESCE(NULLIF(notes,''),'{}'), '$.pipeline_error', ?)
                 WHERE id=?`
              ).run(job.error, job.session_id);
            } catch (e2) {
              console.error(`[generation job ${job_id}] failed to mark session failed:`, e2.message);
            }
          }
        } finally {
          job.completed_at = new Date().toISOString();
        }
      })();

      return res.status(202).json(job);
    } catch (e) {
      console.error('[POST /judgment/sessions]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rewrite/judgment/generation/:job_id  → job 状態
  router.get('/generation/:job_id', (req, res) => {
    const job = generationJobs.get(req.params.job_id);
    if (!job) return res.status(404).json({ error: 'generation job not found', job_id: req.params.job_id });
    return res.json(job);
  });

  // GET /api/rewrite/judgment/generation  → 最新 job (job_id 不明な時用)
  router.get('/generation', (_req, res) => {
    if (!activeGenerationJobId) return res.status(404).json({ error: 'no generation job' });
    const job = generationJobs.get(activeGenerationJobId);
    if (!job) return res.status(404).json({ error: 'no generation job' });
    return res.json(job);
  });

  // GET /api/rewrite/judgment/query-fanouts  → 候補リスト
  router.get('/query-fanouts', (_req, res) => {
    try {
      const rows = open().prepare(
        `SELECT id, seed_query, sub_query, intent_dimension, layer, priority
         FROM master_query_fanout
         ORDER BY id DESC LIMIT 200`
      ).all();
      return res.json({ count: rows.length, items: rows });
    } catch (e) {
      console.error('[GET /judgment/query-fanouts]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/judgment/sessions/:id/apply
  //   body: { dry_run?: boolean }
  //   approved diff を 1 件ずつ WP content に適用 (string match)、全件成功で PUT。
  //   dry_run=true なら計画 (planned / skipped) を返すだけで WP は触らない。
  router.post('/sessions/:id/apply', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
      const dryRun = !!(req.body && req.body.dry_run);
      const conn = open();
      const session = conn.prepare(`SELECT id, post_id, status, wp_apply_completed_at FROM master_rewrite_session WHERE id=?`).get(id);
      if (!session) return res.status(404).json({ error: 'session not found', id });
      if (!dryRun && session.wp_apply_completed_at) {
        return res.status(409).json({ error: 'already applied', wp_apply_completed_at: session.wp_apply_completed_at });
      }
      const diffs = conn.prepare(
        `SELECT id, diff_order, target_section, change_type, daiki_judgment, daiki_edit_content,
                content_before, content_after
         FROM master_rewrite_diff WHERE session_id=? ORDER BY diff_order`
      ).all(id);
      const wp = await fetchWpPost(session.post_id);
      const $ = buildDom(wp.content_rendered);
      const plan = planApply($, diffs);

      if (plan.planned.length === 0) {
        return res.json({
          dry_run: dryRun, post_id: session.post_id, applied: false,
          planned: plan.planned, skipped: plan.skipped,
          reason: 'no diffs to apply',
        });
      }

      if (dryRun) {
        return res.json({
          dry_run: true, post_id: session.post_id, applied: false,
          planned: plan.planned, skipped: plan.skipped,
        });
      }

      // 実適用。snapshot は WP から取得した raw content.rendered をそのまま保存する。
      // (cheerio 再直列化後の body inner ではなく原本を保存 → rollback で完全復元)
      conn.prepare(
        `UPDATE master_rewrite_session
         SET wp_snapshot_before_apply=?, wp_apply_started_at=CURRENT_TIMESTAMP
         WHERE id=?`
      ).run(wp.content_rendered || '', id);

      const newHtml = applyOps($, plan.planned, plan.ops);
      await updateWpPost(session.post_id, newHtml);

      conn.prepare(
        `UPDATE master_rewrite_session
         SET wp_apply_completed_at=CURRENT_TIMESTAMP, status='completed', completed_at=CURRENT_TIMESTAMP
         WHERE id=?`
      ).run(id);

      const applyMark = conn.prepare(`UPDATE master_rewrite_diff SET applied_to_wp=1, applied_at=CURRENT_TIMESTAMP WHERE id=?`);
      for (const p of plan.planned) applyMark.run(p.diff_id);

      return res.json({
        dry_run: false, post_id: session.post_id, applied: true,
        planned: plan.planned, skipped: plan.skipped,
        applied_count: plan.planned.length,
      });
    } catch (e) {
      console.error('[POST /judgment/sessions/:id/apply]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/judgment/sessions/:id/rollback
  //   wp_snapshot_before_apply で WP を上書き、status を awaiting_diff_judgment に戻す
  router.post('/sessions/:id/rollback', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
      const conn = open();
      const session = conn.prepare(
        `SELECT id, post_id, wp_snapshot_before_apply, wp_apply_completed_at
         FROM master_rewrite_session WHERE id=?`
      ).get(id);
      if (!session) return res.status(404).json({ error: 'session not found', id });
      if (!session.wp_apply_completed_at) return res.status(409).json({ error: 'not applied yet' });
      if (!session.wp_snapshot_before_apply) return res.status(409).json({ error: 'no snapshot saved' });

      await updateWpPost(session.post_id, session.wp_snapshot_before_apply);

      conn.prepare(
        `UPDATE master_rewrite_session
         SET wp_apply_completed_at=NULL, completed_at=NULL, status='awaiting_diff_judgment'
         WHERE id=?`
      ).run(id);
      conn.prepare(`UPDATE master_rewrite_diff SET applied_to_wp=0, applied_at=NULL WHERE session_id=?`).run(id);

      return res.json({ rolled_back: true, post_id: session.post_id });
    } catch (e) {
      console.error('[POST /judgment/sessions/:id/rollback]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rewrite/judgment/sessions/:id/compliance
  //   body: { enableLayer2?: true }
  //   非同期: 即座に { job_id, status: 'running' } を返し、裏で compliance-runner を実行。
  //   進捗確認は GET /sessions/:id/compliance で取得。
  router.post('/sessions/:id/compliance', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'invalid id' });
      }
      const session = open().prepare(`SELECT id FROM master_rewrite_session WHERE id=?`).get(id);
      if (!session) return res.status(404).json({ error: 'session not found', id });

      const existing = complianceJobs.get(id);
      if (existing && existing.status === 'running') {
        return res.status(409).json({ error: 'compliance already running for this session', job: existing });
      }

      const enableLayer2 = req.body?.enableLayer2 !== false; // default true
      const job = {
        session_id: id,
        status: 'running',
        started_at: new Date().toISOString(),
        completed_at: null,
        result: null,
        error: null,
        options: { enableLayer2 },
      };
      complianceJobs.set(id, job);

      // 非同期実行
      (async () => {
        try {
          const r = await runComplianceCheck({ session_id: id, enableLayer2 });
          job.status = 'completed';
          job.result = r;
        } catch (e) {
          job.status = 'failed';
          job.error = e.message || String(e);
          console.error(`[compliance job session=${id}]`, e);
        } finally {
          job.completed_at = new Date().toISOString();
        }
      })();

      return res.status(202).json({ session_id: id, status: 'running', started_at: job.started_at, options: job.options });
    } catch (e) {
      console.error('[POST /judgment/sessions/:id/compliance]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rewrite/judgment/sessions/:id/compliance
  router.get('/sessions/:id/compliance', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'invalid id' });
      }
      const job = complianceJobs.get(id);
      if (!job) return res.status(404).json({ error: 'no compliance job for this session', id });
      return res.json(job);
    } catch (e) {
      console.error('[GET /judgment/sessions/:id/compliance]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/rewrite/judgment/diffs/:id
  //   body: { judgment, reject_reason?, reject_note?, edit_content? }
  router.patch('/diffs/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'invalid id' });
      }
      const body = req.body || {};
      const judgment = body.judgment;
      if (!VALID_JUDGMENTS.has(judgment)) {
        return res.status(400).json({ error: 'invalid judgment', allowed: [...VALID_JUDGMENTS] });
      }
      const updated = updateDiffJudgment(id, {
        judgment,
        reject_reason: body.reject_reason,
        reject_note: body.reject_note,
        edit_content: body.edit_content,
      });
      if (!updated) return res.status(404).json({ error: 'diff not found', id });
      return res.json(updated);
    } catch (e) {
      console.error('[PATCH /judgment/diffs/:id]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = {
  VALID_SESSION_STATUSES,
  VALID_JUDGMENTS,
  buildRouter,
  fetchSessions,
  fetchSessionDetail,
  updateDiffJudgment,
  // test 用に apply engine を公開 (HTTP 経路を介さず純粋ロジックを検証可能にする)
  _applyEngine: { buildDom, planApply, applyOps },
};
