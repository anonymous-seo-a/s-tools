'use strict';
/**
 * Step A-2 Layer1: 主題分解
 *
 * seed_query を入力として、Sonnet 4.6 で主要な検討トピック (sub_query[]) を分解。
 * master_query_fanout に layer=1 / generation_method='llm' で投入。
 *
 * 警戒バイアス対チェック:
 *   [a] LLM プロンプト過剰精緻化 → プロンプトは「動く」レベル、最適化は後段
 *   [e] Google fan-out 正解探求    → プロンプトに「Google fan-out 再現」表現を入れない
 *   [f] 件数細分化暴走             → 上限 10 件をプロンプトに明示
 *   [g] intent_dimension 自動生成期待 → Layer1 では intent_dimension 付加しない (Layer2 範囲)
 *
 * 入力: seed_query (string)
 * 出力: { seed_query, sub_queries: [{ id, sub_query }], usage }
 */
const db = require('../db');
const { sonnet } = require('../../shared/llm-adapters/anthropic-adapter');

const SYSTEM_PROMPT = `あなたは消費者金融カードローン領域の SEO 専門家です。
ユーザーの検索クエリ (seed_query) を入力として、その検索意図の背後にある主要な検討トピックを分解してください。

# 出力ルール
- JSON 配列形式のみ。前置きや説明文は一切含めない。
- 各要素は { "sub_query": "<分解された検討トピック (検索クエリ風の短い表現)>" } の形式。
- 最大 10 件まで。意味的に重複するものは統合。
- カードローン / 消費者金融ドメインの自然な検索クエリとして妥当な表現を使用。
- 「主要な検討トピック」とは、ユーザーが seed_query で最終的に解決したい問題を構成する小問題のこと。

# 出力例 (seed_query: "おまとめローン 比較")
[
  {"sub_query": "おまとめローン 金利 比較"},
  {"sub_query": "おまとめローン 審査 通りやすい"},
  {"sub_query": "おまとめローン 銀行 消費者金融 違い"}
]`;

function buildUserMessage(seed_query) {
  return `seed_query: ${seed_query}`;
}

function parseLayer1Output(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Layer1 output JSON not found:\n${text}`);
  }
  const json = text.slice(start, end + 1);
  const arr = JSON.parse(json);
  if (!Array.isArray(arr)) throw new Error('Layer1 output is not an array');
  return arr.map((item) => {
    if (!item || typeof item.sub_query !== 'string' || !item.sub_query.trim()) {
      throw new Error(`Invalid Layer1 item: ${JSON.stringify(item)}`);
    }
    return { sub_query: item.sub_query.trim() };
  });
}

async function decomposeLayer1(seed_query, { maxTokens = 1024 } = {}) {
  if (typeof seed_query !== 'string' || !seed_query.trim()) {
    throw new Error('seed_query must be a non-empty string');
  }

  const llmResult = await sonnet({
    system: SYSTEM_PROMPT,
    user: buildUserMessage(seed_query),
    maxTokens,
  });

  const items = parseLayer1Output(llmResult.text);

  const conn = db.open();
  const insert = conn.prepare(
    `INSERT INTO master_query_fanout (seed_query, sub_query, layer, generation_method)
     VALUES (?, ?, 1, 'llm')`
  );
  const insertedIds = [];
  const tx = conn.transaction((rows) => {
    for (const r of rows) {
      const info = insert.run(seed_query, r.sub_query);
      insertedIds.push({ id: info.lastInsertRowid, sub_query: r.sub_query });
    }
  });
  tx(items);

  return {
    seed_query,
    sub_queries: insertedIds,
    usage: llmResult.usage,
  };
}

module.exports = {
  decomposeLayer1,
  parseLayer1Output,
  SYSTEM_PROMPT,
};
