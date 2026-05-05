'use strict';
/**
 * 案B (#5) HCU 38 項目チェックリスト LLM 評価。
 *
 * 設計 (Daiki 確定):
 *   - 1 コール 38 項目同時評価 (Sonnet 4.6)
 *   - pass = Yes/No 判定 (極性中立)
 *       positive 極性: pass=true → compliance (good)
 *       negative 極性: pass=true → non-compliance (bad)
 *     compliance 計算 (polarity 補正) は insert.js 側で実施。
 *   - 入力: WP REST → shared/wp-structured.extractSelfArticle → plain_text 30K 切詰
 *
 * fetchWpContent は fact-set/extract.js と同型の inline 複製。
 * 3 モジュール目で必要時に shared/wp-rest.js 昇格 (lazy 構築方針 γ)。
 *
 * 警戒バイアス対チェック:
 *   [9]  LLM プロンプト過剰精緻化  → 「動く」レベル、最適化は smoke 後
 *   [11] Adapter 過剰抽象化         → fetchWpContent 複製、shared 昇格は 3 件目で
 *   [12] スケルトン隠れたコスト    → ajv validation 不要、最小性
 *   [14] 細分化暴走                 → 1 コール 38 項目、section/polarity 別分割せず
 *   [20] 網羅性追求                 → 38 件固定 (items.json)、追加禁止
 *   [21] LLM 出力構造化保証         → 欠損許容、JSON パース失敗 warn 継続
 *   [23] 候補 (本セッション初発見): 極性ヘテロ性
 *        → pass を Yes/No 判定で統一、compliance はコード側計算
 */
const { sonnet } = require('../../shared/llm-adapters/anthropic-adapter');
const { extractSelfArticle } = require('../../shared/wp-structured');
const items = require('../../shared/schemas/hcu-checklist-items.json');

const MAX_INPUT_CHARS = 30000;
const MAX_OUTPUT_TOKENS = 8192;

async function fetchWpContent(postId) {
  const raw = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  const username = process.env.WP_API_USERNAME;
  const appPassword = process.env.WP_API_APP_PASSWORD;
  if (!raw || !username || !appPassword) {
    throw new Error('WP_API_BASE_URL / WP_API_USERNAME / WP_API_APP_PASSWORD not set');
  }
  const apiRoot = /\/wp-json\/wp\/v\d+/.test(raw) ? raw : `${raw}/wp-json/wp/v2`;
  const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const url = `${apiRoot}/posts/${postId}?_fields=id,title,content,link`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WP REST ${res.status} for post ${postId}: ${body.slice(0, 200)}`);
  }
  const p = await res.json();
  return {
    post_id: p.id,
    title: p.title?.rendered || '',
    content_html: p.content?.rendered || '',
    url: p.link,
  };
}

const SYSTEM_PROMPT =
  'あなたは Google Search Quality Rater Guidelines の評価者。出力は JSON のみ、説明文・コードフェンス一切不要。';

function buildUserPrompt({ title, body }) {
  const itemsBlock = items.items
    .map((it) => `  ${it.id}. [${it.polarity}] ${it.question}`)
    .join('\n');

  return `以下の記事を、Google 公式 Helpful Content セルフアセスメント ${items.total_count} 項目で評価してください。

# 評価項目 (id [polarity] question)

${itemsBlock}

# 評価ルール

各項目について次の JSON を生成:
  { "id": <番号>, "pass": <boolean>, "comment": "<理由 50 字以内>" }

pass の意味 (極性中立、質問への Yes/No 判定):
  - 質問への答えが Yes (記事がその性質を満たす / 持つ) → pass=true
  - 質問への答えが No                                  → pass=false

  ※ polarity は参考情報。LLM 側で polarity 補正は不要。
  ※ コード側で「準拠 (compliance)」を計算する。
     positive 極性 + pass=true  → compliant
     negative 極性 + pass=false → compliant
     その他                     → non-compliant

comment は短く要点のみ (50 字以内、日本語可)。判断根拠は記事内容に基づく。

# 出力形式 (JSON のみ)

{
  "evaluations": [
    { "id": 1, "pass": true,  "comment": "..." },
    { "id": 2, "pass": false, "comment": "..." },
    ...
    { "id": ${items.total_count}, "pass": ..., "comment": "..." }
  ]
}

# 記事

タイトル: ${title}

本文:
${body}`;
}

function parseLlmJson(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    return JSON.parse(stripped);
  } catch (e) {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
    throw new Error(`LLM JSON parse failed: ${e.message}`);
  }
}

function truncate(s, max) {
  return s.length <= max ? s : s.slice(0, max);
}

function normalizeEvaluations(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e.id === 'number' && typeof e.pass === 'boolean')
    .map((e) => ({
      id: e.id,
      pass: e.pass,
      comment: typeof e.comment === 'string' ? e.comment : '',
    }));
}

async function evaluateHcuFromText({ title, body }) {
  const safeBody = truncate(body, MAX_INPUT_CHARS);
  const { text, usage } = await sonnet({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt({ title, body: safeBody }),
    maxTokens: MAX_OUTPUT_TOKENS,
  });
  const parsed = parseLlmJson(text);
  const evaluations = normalizeEvaluations(parsed.evaluations);
  return {
    checklist_version: items.version,
    total_count: items.total_count,
    evaluations,
    body_chars: safeBody.length,
    usage,
  };
}

async function evaluateHcuForPost(postId) {
  const wp = await fetchWpContent(postId);
  const struct = extractSelfArticle(wp.content_html);
  const result = await evaluateHcuFromText({ title: wp.title, body: struct.plain_text });
  return {
    post_id: wp.post_id,
    title: wp.title,
    source_url: wp.url,
    struct_chars: struct.char_count,
    ...result,
  };
}

module.exports = {
  evaluateHcuForPost,
  evaluateHcuFromText,
  items,
};
