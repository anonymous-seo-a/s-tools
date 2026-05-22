# 2026-05-22 段階C C-B 完了 (Layer 2 規制レイヤー確立)

## セッション要旨

Phase 2 完成 (2026-05-22 午前) 直後、Daiki が E2E 出力検査で具体規制違反 2 件を指摘。
段階C B (データ整備) 内の最優先タスクとして C-B-1〜5 を一気通し実装。
Layer 2 (LLM パターン検出) を追加し、リアル違反検出を確認。

最終更新: 2026-05-22 (夜)
コミット: 728e854 / 6bb2288 / d3fca60

---

## I. C-B 5 ステップ

| ステップ | 内容 | コミット |
|---|---|---|
| C-B-1 | master_rules schema v2 (CHECK 緩和 + 3 列追加) | 728e854 |
| C-B-2 | Daiki 指摘 2 件投入 + 既存 21 件 verified 昇格 | 6bb2288 |
| C-B-3 | Compliance Layer 2 設計確定 (個別判定、Daiki 承認) | (C-B-4 と統合) |
| C-B-4 | Layer 2 実装 + Layer 1/2 統合 runner | d3fca60 |
| C-B-5 | smoke-compliance-layer2 新規 + smoke-compliance-runner 更新 | d3fca60 |

## II. 設計判断 (Daiki 承認の系譜)

```
[2026-05-22 午前] Phase 2 完成
   ↓
[Daiki E2E 検査] 「内容良さそう / レギュレーション周りは、できてから調整で OK」
   ↓
[判定 Q1] 段階C 着手 (推奨採用)
[判定 Q2] B データ整備 (推奨採用)
[判定 Q3 ×3] 規制文言 + verified 一括昇格 (全 Claude 推奨採用)
   ↓
C-B-1 schema 設計 (CHECK 緩和、3 列追加) → 「OK」
   ↓
C-B-3 Layer 2 アーキ提示 → 「個別判定で進めよう!」(精度優先選択)
   ↓
C-B-4/5 実装 + smoke pass
```

## III. 実装サマリ

### 新規ファイル
```
node/rewrite/compliance/
  migration-master-rules-v2.js   schema v2 migration (idempotent)
  seed-layer2-regulations.js     Layer 2 規制 LAYER2_REGULATIONS 定数 + seed 関数
  compliance-checker-layer2.js   Layer 2 純粋関数 (prefilter + sonnet + parse)

node/rewrite/scripts/
  apply-master-rules-v2.js       schema v2 適用 CLI
  seed-layer2-and-promote.js     Layer 2 投入 + verified 昇格 CLI
  smoke-compliance-layer2.js     Layer 1+2 統合 smoke
```

### 修正ファイル
```
node/rewrite/schema.sql                    schema v2 反映
node/rewrite/llm-execution/
  compliance-checker.js                    Layer 1 violations に detection_layer:1
  compliance-runner.js                     loadLayer1/2 分離 + 統合フロー
node/rewrite/scripts/
  smoke-compliance-runner.js               enableLayer2=false 明示
```

## IV. 重要発見

### Layer 2 がリアル違反を検出 (inject なし)

post 11077 / qf 11 の Layer 1+2 統合 smoke で、inject していない LLM 生成物に
Layer 2 rule 22 (比較構造禁止) がリアルヒット:

```
diff[3] target=h3#消費者金融と銀行カードローンの違い
  evidence: "消費者金融：年18.0%程度、銀行：年14.5%程度...大手消費者金融の下限金利は
            年2.4%〜3.0%程度..."
  reason  : 上限金利同士の比較後に下限金利を追加提示しており、各社の金利範囲全体を
            統一的に並べず片側抽出の混在構造に該当する
```

→ Daiki が直接指摘した「上限・下限ピック比較 NG」が LLM 生成物に実際に混入。
→ Layer 1 indexOf では絶対検出できない構造パターン、Layer 2 LLM 判定の存在意義を立証。

## V. コスト実測

| pass | 工程 | input/output | cost |
|---|---|---|---|
| - | Opus (analysis) | 8568/2129 | $0.05 |
| - | Sonnet (diff gen) | 12677/11092 | $0.13 |
| - | Layer 2 (21 calls) | 24937/1755 | $0.10 |
| **total** | | | **$0.28/session** |

pre-filter 動作:
- 規則 22 (target_partner=null): 全 15 diff で LLM 呼出 = 15 calls
- 規則 23 (target_partner=acom): アコム言及 diff のみ = 6 calls (9 件スキップ)
- 合計 21 calls / 30 combinations (30% スキップ率)

## VI. 警戒バイアス対チェック

| バイアス | 適用 |
|---|---|
| [8] schema 変更の判断委任境界 | Daiki に schema 設計を明示提示し承認後実行 |
| [9] LLM プロンプト過剰精緻化 | SYSTEM 80 行程度、pattern_hint をそのまま LLM 渡し |
| [10] JSON Schema 過剰汎用化 | CHECK 緩和、ajv なし、必須フィールド存在のみ |
| [11] Adapter 過剰抽象化 | 純粋関数 + sonnet 直接呼出、不要層なし |
| [12] スケルトン隠れたコスト | Layer 2 rules 0 件で LLM 呼出ゼロ短絡 |
| [16] YMYL 上流フィルタ怠惰 | Layer 1+2 二重ガード確立 |
| [17] (応用) コスト浪費 | pre-filter で acom 不在 diff は LLM スキップ、E2E 再実行も $1 節約のため skip |

新規バイアス確立なし。

## VII. 残タスク (段階C 内、優先度順)

### A. コスト圧縮
- Sonnet diff output 揺れ抑制 + prompt 簡素化 ($0.5/pass → $0.2/pass 目標)
- Layer 2 prompt size 圧縮 ($0.10/session → $0.05/session 目標)
- diffs_rejected 削減

### B. データ整備 (残)
- master_post_target_query 全 cardloan 434 件拡張 (現状 2 件)
- master_query_fanout seed_query 多様化 (現状 1 seed)

### C. 検証経路の精緻化
- C-D 照合の `.text()` 抽出ベース格上げ
- 必須表現 / 正式表記 への対応拡張
- bundle 構造の重み付け

### D. 上流統合
- protected_regions の CSS class set 動的取得
- WordPress raw context 取得権限整備
- 多 post smoke 実施 (B 完了後)

## VIII. 累計コミット (2026-05-22)

```
1a0b6fe (午前) docs: 案C C-F 完了 + Phase 2 MVP 7/7 完成宣言
c7b6d87 (午前) docs(rewrite): 段階C B 章に Daiki 指摘の規制パターン 2 件追加
728e854 (夜)   feat(rewrite): 段階C C-B-1 完了 - master_rules schema v2
6bb2288 (夜)   feat(rewrite): 段階C C-B-2 完了 - Layer 2 規制 2 件 + verified 昇格
d3fca60 (夜)   feat(rewrite): 段階C C-B-3〜C-B-5 完了 - Compliance Layer 2 実装
(本コミット)   docs: 段階C C-B 完了サマリ + knowledge/05 V-A-3-14 反映
```
