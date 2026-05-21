'use strict';
/**
 * 案B (#9) α: master_article_similarity.text_similarity 計算
 *
 * 設計 (knowledge/05 V-A + sessions/2026-05-01_phase3_doten4):
 *   α = text_similarity (文章類似 = 文体・語彙の重なり)
 *   β query_overlap / γ entity_overlap は Phase 3
 *
 * トークナイザ:
 *   日本語 → 文字 bigram (2-gram)。kuromoji 等の形態素解析器は採用しない。
 *   ASCII 英数字は連続塊で 1 トークン (例: "アコム3.0%" → アコ, コム, 3.0%)。
 *   制御文字・空白・記号類は区切りとして扱う。
 *
 * 類似度:
 *   TF-IDF + cosine。
 *   IDF は smoke 入力集合 (= 同 category 全記事) 内で計算 (corpus 依存)。
 *
 * 警戒バイアス対チェック:
 *   [4]  機能を盛りたくなる: β/γ 列は NULL、Top-K 以外の機能を作らない
 *   [11] Adapter 過剰抽象化: tokenize を shared に切り出さない (汎用性 unclear)
 *   [12] スケルトン隠れたコスト: 形態素解析依存を避け純 JS
 *   [20] 抽出網羅性追求: 表記揺れ吸収は α では行わない (β/γ で別概念)
 */

const CALCULATION_METHOD = 'tfidf_bigram';

const ASCII_TOKEN_RE = /[a-zA-Z0-9][a-zA-Z0-9._%-]*/g;
// 日本語の連続塊として扱う範囲 (CJK + ひらがな + カタカナ + 全角英数)。
const CJK_RUN_RE = /[぀-ヿ㐀-鿿Ａ-Ｚａ-ｚ０-９々ヶ]+/g;

function tokenize(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const tokens = [];

  for (const m of lower.matchAll(ASCII_TOKEN_RE)) {
    tokens.push(m[0]);
  }
  for (const m of lower.matchAll(CJK_RUN_RE)) {
    const run = m[0];
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) {
      tokens.push(run.slice(i, i + 2));
    }
  }
  return tokens;
}

function termFrequency(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

function buildIdf(docTokens) {
  const df = new Map();
  for (const tokens of docTokens) {
    const seen = new Set(tokens);
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = docTokens.length;
  const idf = new Map();
  for (const [t, n] of df) {
    idf.set(t, Math.log((N + 1) / (n + 1)) + 1);
  }
  return idf;
}

function tfidfVector(tf, idf) {
  const vec = new Map();
  let norm2 = 0;
  for (const [t, f] of tf) {
    const w = idf.get(t);
    if (!w) continue;
    const v = f * w;
    vec.set(t, v);
    norm2 += v * v;
  }
  return { vec, norm: Math.sqrt(norm2) };
}

function cosine(a, b) {
  if (a.norm === 0 || b.norm === 0) return 0;
  const small = a.vec.size <= b.vec.size ? a.vec : b.vec;
  const large = a.vec.size <= b.vec.size ? b.vec : a.vec;
  let dot = 0;
  for (const [t, v] of small) {
    const u = large.get(t);
    if (u) dot += v * u;
  }
  return dot / (a.norm * b.norm);
}

/**
 * @param {Array<{post_id: number, text: string}>} docs
 * @param {number} topK
 * @returns {Array<{source_post_id: number, pairs: Array<{target_post_id: number, text_similarity: number, rank_in_source: number}>, token_count: number}>}
 */
function computeSimilarities(docs, topK = 30) {
  const docTokens = docs.map((d) => tokenize(d.text));
  const idf = buildIdf(docTokens);
  const vectors = docTokens.map(termFrequency).map((tf) => tfidfVector(tf, idf));

  const results = [];
  for (let i = 0; i < docs.length; i++) {
    const sims = [];
    for (let j = 0; j < docs.length; j++) {
      if (i === j) continue;
      const sim = cosine(vectors[i], vectors[j]);
      sims.push({ target_post_id: docs[j].post_id, text_similarity: sim });
    }
    sims.sort((a, b) => b.text_similarity - a.text_similarity);
    const top = sims.slice(0, topK).map((p, idx) => ({
      target_post_id: p.target_post_id,
      text_similarity: p.text_similarity,
      rank_in_source: idx + 1,
    }));
    results.push({
      source_post_id: docs[i].post_id,
      pairs: top,
      token_count: docTokens[i].length,
    });
  }
  return results;
}

module.exports = {
  CALCULATION_METHOD,
  tokenize,
  buildIdf,
  tfidfVector,
  cosine,
  computeSimilarities,
};
