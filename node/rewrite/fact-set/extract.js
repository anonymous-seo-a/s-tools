'use strict';
/**
 * Step A-1 後半: master_fact_set 投入 + master_competitor_corpus.fact_set_snapshot UPDATE
 *
 * 設計:
 *   自記事 fact   → master_fact_set INSERT (post_id NOT NULL)
 *   競合 fact     → master_competitor_corpus.fact_set_snapshot UPDATE (JSON)
 *
 *   knowledge/05 の SQL 設計に従う:
 *     master_fact_set は自記事専用 (post_id 必須)
 *     競合は corpus.fact_set_snapshot に JSON で保持
 *
 * LLM 戦略:
 *   1 コール / 記事で Layer 1〜3 同時抽出 (Sonnet 4.6)
 *   入力: タイトル + plain_text、上限 30K 文字 (冒頭切り捨て)
 *   出力: { layer1_entities, layer2_claims, layer3_experiences }
 *
 * 警戒バイアス対チェック:
 *   [a] LLM プロンプト過剰精緻化  → 「動く」レベル、後段最適化
 *   [c] Adapter 過剰抽象化         → WP REST/HTTP fetch を inline、shared 切出しなし
 *   [d] スケルトン作成隠れたコスト → entity dedup 等は Phase 2 後半に保留
 *   [h] YMYL 上流フィルタ怠惰      → プロンプトで違反主張除外を明示
 *   [l] fact 抽出の網羅性追求      → 上限 N=10/15/10 を LLM とコード両方で固定
 *   [m] LLM 出力の構造化保証       → null/空配列許容、JSON パース失敗は warn 継続
 */
const db = require('../db');
const { sonnet } = require('../../shared/llm-adapters/anthropic-adapter');
const { extractSelfArticle, extractCompetitorContent } = require('../../shared/wp-structured');

const MAX_INPUT_CHARS = 30000;
const LAYER_LIMITS = { layer1: 10, layer2: 15, layer3: 10 };

async function fetchWpContent(postId) {
  const raw = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  const username = process.env.WP_API_USERNAME;
  const appPassword = process.env.WP_API_APP_PASSWORD;
  if (!raw || !username || !appPassword) {
    throw new Error('WP_API_BASE_URL / WP_API_USERNAME / WP_API_APP_PASSWORD not set');
  }
  // WP_API_BASE_URL が /wp-json/wp/v2 まで含むフル URL の場合と、サイトルートの場合の両対応。
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

async function fetchCompetitorHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FundIt-RewriteBot/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

const SYSTEM_PROMPT =
  'あなたは記事から fact を抽出する分析者。出力は JSON のみ、説明文・コードフェンス一切不要。';

function buildUserPrompt({ title, body }) {
  return `以下の記事から、3 レイヤーの fact を JSON で抽出してください。

# 抽出ルール

Layer 1 (entities, 上位 ${LAYER_LIMITS.layer1} 件):
  記事に登場する固有名詞・概念・用語。
  例: ブランド名 / 法令名 / 数値指標 / 専門用語。
  記述がない場合は空配列。

Layer 2 (claims, 上位 ${LAYER_LIMITS.layer2} 件):
  記事が主張する事実 (検証可能なもの)。
  例: 「アコムの実質年率は 3.0〜18.0%」。

  YMYL 違反主張は除外する:
    - 「無審査」「審査が甘い」「審査なし」
    - 「ブラックでも借りられる」「100% 借りられる」「絶対に通る」
    - 「即日確実」「誰でも借りられる」
  記述がない場合は空配列。

Layer 3 (experiences, 上位 ${LAYER_LIMITS.layer3} 件):
  First-hand experience markers (E-E-A-T Experience 観点)。
  例: 「実際に申込み、振込まで XX 分」「コールセンターの対応実体験」。
  経験記述がない場合は空配列。

# 出力形式 (JSON のみ)

{
  "layer1_entities": [string, ...],
  "layer2_claims": [string, ...],
  "layer3_experiences": [string, ...]
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

async function extractFactsFromText({ title, body }) {
  const safeBody = truncate(body, MAX_INPUT_CHARS);
  const { text, usage } = await sonnet({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt({ title, body: safeBody }),
    maxTokens: 4096,
  });
  const json = parseLlmJson(text);
  return {
    layer1: Array.isArray(json.layer1_entities)
      ? json.layer1_entities.slice(0, LAYER_LIMITS.layer1).filter((s) => typeof s === 'string')
      : [],
    layer2: Array.isArray(json.layer2_claims)
      ? json.layer2_claims.slice(0, LAYER_LIMITS.layer2).filter((s) => typeof s === 'string')
      : [],
    layer3: Array.isArray(json.layer3_experiences)
      ? json.layer3_experiences.slice(0, LAYER_LIMITS.layer3).filter((s) => typeof s === 'string')
      : [],
    usage,
    body_chars: safeBody.length,
  };
}

async function extractSelfFacts(postId) {
  const wp = await fetchWpContent(postId);
  const struct = extractSelfArticle(wp.content_html);
  const facts = await extractFactsFromText({ title: wp.title, body: struct.plain_text });
  return {
    post_id: postId,
    source_url: wp.url,
    title: wp.title,
    struct_chars: struct.char_count,
    facts,
  };
}

async function extractCompetitorFacts(corpusRow) {
  const html = await fetchCompetitorHtml(corpusRow.competitor_url);
  const struct = extractCompetitorContent(html);
  const facts = await extractFactsFromText({
    title: struct.title || corpusRow.competitor_url,
    body: struct.plain_text,
  });
  return {
    corpus_id: corpusRow.id,
    competitor_url: corpusRow.competitor_url,
    title: struct.title,
    struct_chars: struct.char_count,
    facts,
  };
}

function persistAll(conn, { selfResult, competitorResults }) {
  const insertFact = conn.prepare(
    `INSERT INTO master_fact_set (post_id, layer, content, source_url, extraction_method)
     VALUES (?, ?, ?, ?, 'llm')`
  );
  const updateCorpus = conn.prepare(
    `UPDATE master_competitor_corpus SET fact_set_snapshot=? WHERE id=?`
  );

  const tx = conn.transaction(() => {
    let selfInserted = 0;
    if (selfResult) {
      const layers = [
        [1, selfResult.facts.layer1],
        [2, selfResult.facts.layer2],
        [3, selfResult.facts.layer3],
      ];
      for (const [layer, items] of layers) {
        for (const c of items) {
          insertFact.run(selfResult.post_id, layer, c, selfResult.source_url);
          selfInserted++;
        }
      }
    }
    let compUpdated = 0;
    let compFactsTotal = 0;
    for (const r of competitorResults) {
      const snapshot = JSON.stringify({
        layer1: r.facts.layer1,
        layer2: r.facts.layer2,
        layer3: r.facts.layer3,
        extracted_at: new Date().toISOString(),
      });
      updateCorpus.run(snapshot, r.corpus_id);
      compUpdated++;
      compFactsTotal += r.facts.layer1.length + r.facts.layer2.length + r.facts.layer3.length;
    }
    return { selfInserted, compUpdated, compFactsTotal };
  });

  return tx();
}

async function extractForQueryFanout({ post_id, query_fanout_id }) {
  const conn = db.open();
  const corpus = conn
    .prepare(
      `SELECT id, competitor_url FROM master_competitor_corpus
       WHERE query_fanout_id=? ORDER BY rank_position ASC`
    )
    .all(query_fanout_id);

  const selfResult = await extractSelfFacts(post_id);

  const competitorResults = [];
  for (const c of corpus) {
    try {
      const r = await extractCompetitorFacts(c);
      competitorResults.push(r);
    } catch (e) {
      console.warn(`[warn] competitor extract failed: ${c.competitor_url}: ${e.message}`);
    }
  }

  const persisted = persistAll(conn, { selfResult, competitorResults });

  return { post_id, query_fanout_id, selfResult, competitorResults, persisted };
}

module.exports = {
  extractForQueryFanout,
  extractFactsFromText,
  extractSelfFacts,
  extractCompetitorFacts,
};
