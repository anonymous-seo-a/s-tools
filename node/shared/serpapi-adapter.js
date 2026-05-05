'use strict';
/**
 * SerpApi Adapter (shared/ layer)
 *
 * google.co.jp / 日本語ロケールで SERP 取得し、organic / PAA / related searches /
 * AI Overview citations を構造化レスポンスで返す。
 *
 * 前提:
 *   SERPAPI_API_KEY は呼び出し側 (entry point) の dotenv で読み込み済。
 *   require('dotenv').config() を本モジュールでは呼ばない (層構造の独立性)。
 *
 * Plan / Cost:
 *   SerpApi Starter $25/月 (5,000 search/月) からの開始想定。
 *   smoke は最小限 (1 クエリ) で運用、本格運用は Phase 2 後半。
 *   警戒 [i] SerpApi コスト浪費バイアスに対処。
 */
const { getJson } = require('serpapi');

if (!process.env.SERPAPI_API_KEY) {
  throw new Error(
    'SERPAPI_API_KEY not set. Add to node/.env and ensure entry point calls require("dotenv").config()'
  );
}

const DEFAULT_PARAMS = {
  engine: 'google',
  google_domain: 'google.co.jp',
  hl: 'ja',
  gl: 'jp',
  location: 'Japan',
  num: 10,
};

/**
 * 構造化された SERP レスポンス
 * @typedef {object} StructuredSerpResult
 * @property {string} query
 * @property {Array<{position: number, title: string, link: string, snippet: string|null}>} organic
 * @property {Array<{question: string, snippet: string|null, link: string|null}>} paa
 * @property {Array<{query: string, link: string|null}>} related_searches
 * @property {Array<{title: string|null, link: string|null}>} ai_overview_citations
 * @property {object} raw
 */

function extractOrganic(json) {
  const arr = json.organic_results || [];
  return arr.map((r) => ({
    position: r.position ?? null,
    title: r.title || '',
    link: r.link || '',
    snippet: r.snippet || null,
  }));
}

function extractPaa(json) {
  const arr = json.related_questions || [];
  return arr.map((r) => ({
    question: r.question || '',
    snippet: r.snippet || null,
    link: r.link || null,
  }));
}

function extractRelatedSearches(json) {
  const arr = json.related_searches || [];
  return arr.map((r) => ({
    query: r.query || '',
    link: r.link || null,
  }));
}

function extractAiOverviewCitations(json) {
  const ai = json.ai_overview;
  if (!ai) return [];
  const refs = ai.references || ai.citations || [];
  return refs.map((r) => ({
    title: r.title || null,
    link: r.link || null,
  }));
}

async function searchSerp(query, overrides = {}) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('query must be a non-empty string');
  }
  const params = {
    ...DEFAULT_PARAMS,
    ...overrides,
    q: query,
    api_key: process.env.SERPAPI_API_KEY,
  };

  const json = await getJson(params);

  return {
    query,
    organic: extractOrganic(json),
    paa: extractPaa(json),
    related_searches: extractRelatedSearches(json),
    ai_overview_citations: extractAiOverviewCitations(json),
    raw: json,
  };
}

module.exports = {
  searchSerp,
  DEFAULT_PARAMS,
};
