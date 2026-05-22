# 2026-05-22 案C C-C 実装完了 (工程6'-B Sonnet 4.6 差分生成)

## セッション要旨

C-B (工程6'-A Opus 4.7) 完了状態を起点に、C-C (工程6'-B Sonnet 4.6 差分生成) を一気通しで実装 + smoke pass。
Phase 2 残タスクは C-D (Compliance Checker) / C-E (E2E smoke) / C-F (非破壊確認) の 2.5 日。

最終更新: 2026-05-22
コミット: (本コミット、feat)

---

## I. 実装ファイル

```
node/rewrite/llm-execution/
  case-c-diff-prompt.js          ← SYSTEM_PROMPT + buildDiffUserPrompt + enum 定数
  diff-runner.js                 ← runDiffGeneration (Sonnet 呼出 + 検証 + INSERT)

node/rewrite/scripts/
  smoke-diff-runner.js           ← E2E smoke (analysis → 強制承認 → diff)
```

## II. V-A-3-3 仕様の C-C 具体化 (knowledge/05 V-A-3-10 に反映)

| 論点 | C-C 確定 |
|---|---|
| LLM 出力ラッパ | `{ "diffs": [...] }` 単一 root object |
| 1 policy → diff 数 | 1〜3 件 / 全体 15 件上限 (プロンプト + クライアント slice) |
| Sonnet maxTokens | 16384 (smoke 実測 output=5886、8192 では truncation 多発) |
| truncation 耐性 parser | 完全に閉じた diff object のみ抽出 (depth + 文字列エスケープ管理) |
| 不正 diff 処理 | validateDiff で skip、有効分のみ INSERT、errors[] に蓄積 |
| cheerio パース | content_before / content_after 都度 `cheerio.load`、null 許容 |
| target_section | LLM 委譲 (meta:* / h2#text / p#section-para / outline:* 規約のみ記述) |
| risk_flag | LLM 自己申告 (analysis_output.high_risk_categories から継承) |
| status 遷移 | 'generating' → 'awaiting_diff_judgment' (INSERT 成功時) |

## III. smoke 結果 (post 11077 / qf 11)

```
=== 3. runAnalysis (Opus 4.7) ===
  elapsed=31.4s usage={input=6993 output=1699}
  status=awaiting_policy_judgment high_risk=["rate_update"]

=== 4. policy_judgment=approved → status=generating (smoke 強制遷移) ===

=== 5. runDiffGeneration (Sonnet 4.6) ===
  elapsed=81.7s usage={input=11220 output=5886}
  diffs_inserted=7 rejected=0

=== 6. master_rewrite_diff レコード検証 ===  全 enum + cheerio パス
=== 7. session 更新確認 ===  status=awaiting_diff_judgment, token usage 保存
```

生成された diff サンプル:
- [1] `h3#即日融資可能なカードローン一覧` / insert_after / evidence_insertion / risk=rate_update
- [2] `h2#即日融資が必要なら消費者金融を選ぼう` / rewrite_paragraph / paragraph_rewrite
- [3] `h3#1位：プロミス｜金利2.5%~18.0%・最短3分融資` / insert_after / paragraph_rewrite

推定コスト ~$0.18 / セッション (Opus $0.05 + Sonnet $0.13)。

## IV. 警戒バイアス [1]〜[23] C-C 適用結果

| バイアス | 適用例 |
|---|---|
| [9] LLM プロンプト過剰精緻化 | case-c-diff-prompt.js 単一ファイル、最適化は段階C |
| [10] JSON Schema 過剰汎用化 | ajv なし、enum + cheerio + 必須フィールド存在のみ |
| [11] Adapter 過剰抽象化 | anthropic-adapter.sonnet 直接利用 |
| [12] スケルトン隠れたコスト | truncation parser は失敗時 throw、recovery 副作用なし |
| [14] 細分化暴走 | 1 policy 1〜3 件 + 全体 15 件上限 (二重ガード) |
| [16] YMYL 上流フィルタ怠惰 | master_rules 違反禁止表現をプロンプト明示 + C-D に委譲 |
| [21] LLM 出力構造化保証 | cheerio パース必須 + 不正 skip 設計 |

新規バイアス確立なし。

## V. 残タスク (Phase 2 残 2.5 日)

| ステップ | 内容 | 工数 |
|---|---|---|
| C-D | 工程6'-C Compliance Checker (master_rules 正規表現) | 1 日 |
| C-E | E2E smoke (6'-A → 6'-B → 6'-C 通し) | 1 日 |
| C-F | 既存 smoke 非破壊確認 + 段階C 申し送り | 0.5 日 |

## VI. C-D 着手前の論点 (次セッション判定)

- master_rules 21 件の正規表現マッチング戦略 (条件文の解釈)
- regulation_citation risk_flag の自動追加判定
- diff.rationale.compliance フィールド更新ロジック
- C-D smoke は C-C の diff 群を input とするか、独立 mock データか

---

## 累計コミット (2026-05-22 単日、本コミット)

```
524aa0c feat: 案C C-B 完了 - 工程6'-A Opus 4.7 (前日 2026-05-21)
(本コミット) feat: 案C C-C 完了 - 工程6'-B Sonnet 4.6 差分生成 (post 11077 smoke pass)
```
