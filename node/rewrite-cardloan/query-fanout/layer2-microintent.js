'use strict';
/**
 * Step A-2 Layer2: micro-intent 展開 + JTBD intent_dimension 拡張
 *
 * Layer1 で分解された sub_query を入力として、Sonnet 4.6 で
 * 検索者の認知構造を細分化した micro-intent + JTBD 5 次元 (intent_dimension) を生成。
 * master_query_fanout に layer=2 / parent_sub_query_id=Layer1 ID で投入。
 *
 * intent_dimension は Layer2 の必須出力 (Z-3 設計):
 *   - layer=2 レコードは常に intent_dimension 付き
 *   - layer=1 レコードのみ intent_dimension=NULL
 *   - 各次元は推測困難な場合 null 許容 (警戒 [g] 対処)
 *
 * 警戒バイアス対チェック:
 *   [b] JSON Schema 過剰汎用化 → ajv 設定は最小限、カスタム formats なし
 *   [e] Google fan-out 正解探求    → 「Google 内部 fan-out との一致は不要」明示
 *   [f] 細分化暴走                 → 上限 7 件、過度な細分化禁止指示
 *   [g] intent_dimension 自動生成期待 → 各次元 null 許容、無理に埋めない指示
 *   [h] YMYL 上流フィルタ怠惰      → Layer1 と同等の禁止表現リストを継承
 */
const path = require('path');
const Ajv = require('ajv');
const db = require('../db');
const { sonnet } = require('../../shared/llm-adapters/anthropic-adapter');

const intentSchema = require('../../shared/schemas/intent_dimension.schema.json');
const ajv = new Ajv({ allErrors: true });
const validateIntentDimension = ajv.compile(intentSchema);

const SYSTEM_PROMPT = `あなたは消費者金融カードローン領域の SEO 専門家です。
Layer1 で分解された検討トピック (sub_query) を入力として、その検索者が次に知りたい / 詳しく知りたい micro-intent を細分化し、各 micro-intent に JTBD 5 次元 (intent_dimension) を付加してください。

# Layer2 micro-intent の定義
- 検索者がその sub_query で検索した直後に、関連して知りたくなる具体的な疑問・関心事
- 「seed_query → sub_query (主題分解) → micro-intent (検索者認知の細分化)」の関係
- Google が内部で生成する fan-out と一致させる必要はない
- 「検索者が実際に次に検索する可能性のある micro-intent」レベルで OK

# 出力ルール
- JSON 配列形式のみ。前置きや説明文は一切含めない。
- 各要素は次の形式:
  {
    "sub_query": "<micro-intent (検索クエリ風の短い表現)>",
    "intent_dimension": {
      "purpose": "<目的> または null",
      "barrier": "<障壁> または null",
      "constraint": "<制約> または null",
      "comparison_axis": "<比較軸> または null",
      "expected_format": "<期待形式> または null"
    }
  }
- 3〜7 件まで。意味的に重複するものは統合。過度な細分化は避ける。
- カードローン / 消費者金融ドメインの自然な検索クエリとして妥当な表現を使用。

# intent_dimension 5 次元 (推測困難な場合は null、無理に埋めない)
- purpose: ユーザーが解決したい上位目的 (例: "資金調達", "医療費の支払い", "債務整理")
- barrier: 解決を妨げる障壁 (例: "審査落ち", "信用情報", "在籍確認")
- constraint: 課されている制約 (例: "即時性", "土日対応", "金額上限")
- comparison_axis: 比較する軸 (例: "金利", "限度額", "審査時間", "無利息期間")
- expected_format: 期待する出力形式 (例: "比較表", "手順説明", "ランキング", "条件一覧")

# YMYL コンプライアンス制約 (貸金業法第16条 + 細則 II + ASP レギュレーション)
以下の禁止表現を含む sub_query は生成しないこと:
  - 「無審査」「審査なし」「審査が甘い」「無条件」
  - 「ブラックOK」「ブラックでも借りれる」「破産歴OK」
  - 「必ず貸します」「100%融資」「絶対借りれる」
  - 「多重債務一本化」(おまとめローンの中立表現は可)
  - 安易な借入を強調する表現、過度な借入意欲喚起表現

許容される中立表現:
  - 「審査時間」「審査の流れ」「審査基準」「審査通過のコツ」
  - 「即日融資」「最短〜分」(貸金業法表示義務に沿う事実情報)
  - 「金利比較」「限度額比較」「無利息期間」

# 出力例 (sub_query: "即日融資 審査時間 最短")
[
  {
    "sub_query": "即日融資 最短何分",
    "intent_dimension": {
      "purpose": "資金調達",
      "barrier": null,
      "constraint": "即時性",
      "comparison_axis": "審査時間",
      "expected_format": "数値"
    }
  },
  {
    "sub_query": "即日融資 審査時間 平均",
    "intent_dimension": {
      "purpose": null,
      "barrier": null,
      "constraint": "即時性",
      "comparison_axis": "審査時間",
      "expected_format": "比較表"
    }
  }
]`;

function buildUserMessage(sub_query) {
  return `sub_query: ${sub_query}`;
}

function parseLayer2Output(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Layer2 output JSON not found:\n${text}`);
  }
  const json = text.slice(start, end + 1);
  const arr = JSON.parse(json);
  if (!Array.isArray(arr)) throw new Error('Layer2 output is not an array');
  return arr.map((item, idx) => {
    if (!item || typeof item.sub_query !== 'string' || !item.sub_query.trim()) {
      throw new Error(`Invalid Layer2 item[${idx}]: ${JSON.stringify(item)}`);
    }
    if (!item.intent_dimension || typeof item.intent_dimension !== 'object') {
      throw new Error(`Layer2 item[${idx}] missing intent_dimension: ${JSON.stringify(item)}`);
    }
    if (!validateIntentDimension(item.intent_dimension)) {
      throw new Error(
        `Layer2 item[${idx}] intent_dimension schema invalid: ${JSON.stringify(item.intent_dimension)}\n` +
          `errors: ${JSON.stringify(validateIntentDimension.errors)}`
      );
    }
    return {
      sub_query: item.sub_query.trim(),
      intent_dimension: item.intent_dimension,
    };
  });
}

async function expandLayer2OneParent(parent, { maxTokens = 2048 } = {}) {
  const llmResult = await sonnet({
    system: SYSTEM_PROMPT,
    user: buildUserMessage(parent.sub_query),
    maxTokens,
  });
  const items = parseLayer2Output(llmResult.text);

  const conn = db.open();
  const insert = conn.prepare(
    `INSERT INTO master_query_fanout (seed_query, sub_query, layer, parent_sub_query_id, generation_method, intent_dimension)
     VALUES (?, ?, 2, ?, 'llm', ?)`
  );
  const inserted = [];
  const tx = conn.transaction((rows) => {
    for (const r of rows) {
      const info = insert.run(
        parent.seed_query,
        r.sub_query,
        parent.id,
        JSON.stringify(r.intent_dimension)
      );
      inserted.push({
        id: info.lastInsertRowid,
        sub_query: r.sub_query,
        intent_dimension: r.intent_dimension,
        parent_id: parent.id,
      });
    }
  });
  tx(items);

  return { parent, micro_intents: inserted, usage: llmResult.usage };
}

async function expandLayer2(seed_query) {
  const conn = db.open();
  const parents = conn
    .prepare(
      'SELECT id, seed_query, sub_query FROM master_query_fanout WHERE layer=1 AND seed_query=? ORDER BY id ASC'
    )
    .all(seed_query);
  if (parents.length === 0) {
    throw new Error(`No Layer1 sub_queries found for seed_query="${seed_query}"`);
  }

  const results = [];
  const totalUsage = { input_tokens: 0, output_tokens: 0 };
  for (const parent of parents) {
    const r = await expandLayer2OneParent(parent);
    results.push(r);
    totalUsage.input_tokens += r.usage.input_tokens;
    totalUsage.output_tokens += r.usage.output_tokens;
  }

  return {
    seed_query,
    parents_count: parents.length,
    results,
    total_micro_intents: results.reduce((sum, r) => sum + r.micro_intents.length, 0),
    total_usage: totalUsage,
  };
}

module.exports = {
  expandLayer2,
  expandLayer2OneParent,
  parseLayer2Output,
  validateIntentDimension,
  SYSTEM_PROMPT,
};
