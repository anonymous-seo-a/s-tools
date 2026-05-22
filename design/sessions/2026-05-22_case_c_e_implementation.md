# 2026-05-22 案C C-E 実装完了 (E2E smoke)

## セッション要旨

C-D 完了状態を起点に、C-E (E2E smoke 公認版) を実装 + 2 pass 実測完了。
Phase 2 残タスクは C-F (既存 smoke 非破壊確認 + 段階C 申し送り) 0.5 日のみ。

最終更新: 2026-05-22
コミット: (本コミット、feat)

---

## I. 実装ファイル

```
node/rewrite/scripts/
  smoke-e2e.js              ← 2 pass (inject なし / あり) + 集計レポート
```

C-B/C-C/C-D smoke は維持 (各工程単独テスト用)。

## II. 設計判断 (Claude 推奨、handoff 論点 3 件)

| 論点 | 採用 | 根拠 |
|---|---|---|
| smoke 形態 | 独立 `smoke-e2e.js` 新規 | C-D smoke は compliance 単独用、E2E は通し公認版で役割分離 |
| シナリオ数 | 2 pass (A=inject なし / B=inject あり) | リアル違反検出率測定 + 検証経路確認 |
| 多 post smoke | 段階C 送り | 実データ不足 (target_query 2 件 / qf 1 seed) |
| status 遷移 | 'awaiting_diff_judgment' 停止維持 | V-A-3-5 仕様、Daiki UI 判定待ち |
| 集計レポート | session_id / elapsed / tokens / diffs / violations / risk / cost 1 表 | 段階C 移行判定の基礎データ |

## III. 実測結果

```
                      Pass A (inject=false)   Pass B (inject=true)
session_id            18                      19
Opus  elapsed         43.2s                   48.1s
Sonnet elapsed        116.2s                  180.5s
Opus  in/out          8569/2080               8569/2420
Sonnet in/out         12998/7883              13354/13047
diffs_inserted        5                       15
diffs_rejected        2                       0
violations (real)     0                       1 (inject)
risk_flag_set         0                       1
risk_distribution     {major_restructure:1,   {regulation_citation:2,
                       regulation_citation:1,  null:9,
                       rate_update:3}          rate_update:4}
high_risk(analysis)   ["rate_update"]         []
cost (USD)            $0.4418                 $0.5458   total $0.9876
```

全 7 assertions ✓:
  diffs_inserted > 0 (A,B)、compliance scanned all diffs (A,B)、
  Pass B inject 検出、final status='awaiting_diff_judgment' (A,B)

## IV. 重要観察 + 段階C 申し送り

1. **リアル違反検出ゼロ (Pass A)**:
   LLM 上流の YMYL 制約注入が機能、6'-C は安全網として動作。
   → C-D の存在意義は「上流フィルタ漏れの最終ガード」、ヒット率の絶対値は低くて正解。

2. **rejected=2 (Pass A)**:
   cheerio パース失敗 or enum エラーで 7 中 2 件 skip。検証経路は正しく機能。
   → 段階C で典型パターン分析 + プロンプト改善候補。

3. **Sonnet output token 揺れ** (7883 vs 13047):
   maxTokens=16384 でも安着、上限到達なし。
   → 揺れ自体はリライト範囲の判断結果で許容、cost に影響。

4. **コスト超過** ($0.5/pass vs 見積 $0.18):
   - Opus 揺れ (analysis_output サイズ 2080→2420)
   - Sonnet output 倍増 (7883→13047)
   → 段階C で prompt 簡素化、$0.2/pass 目標に圧縮検討。

5. **多 post 実測は不可** (データ不足):
   - master_post_target_query: 2 件 (post 7170 のみ)
   - master_query_fanout: 72 件すべて seed="即日融資 比較"
   → 段階C で target_query / qf 整備後に多 post smoke 実施。

## V. 警戒バイアス [1]〜[23] C-E 適用結果

| バイアス | 適用例 |
|---|---|
| [4] 機能を盛りたくなる | 多 post smoke を強行せず段階C 送り、最小性原則 |
| [10] JSON Schema 過剰汎用化 | 集計レポートは plain object、JSON 出力なし |
| [12] スケルトン隠れたコスト | master_rules verified 昇格 + revert を tx 化せず単純 UPDATE (smoke 限定) |
| [14] 細分化暴走 | 2 pass のみ、シナリオ拡張は段階C |
| [22] 環境変数値構造仮定 | コスト概算は client 側で固定値、価格更新は手動同期 |

新規バイアス確立なし。

## VI. 残タスク (Phase 2 残 0.5 日)

| ステップ | 内容 |
|---|---|
| C-F | 既存 smoke 非破壊確認 (smoke-* 全 15 件) + 段階C 申し送りまとめ |

C-F 完了で Phase 2 7/7 完成 (案C 全 6 ステップ完了)、Phase 3 学習ループ稼働フェーズへ移行。

## VII. 累計コミット (2026-05-22 単日、本コミット含めて)

```
d89e38a feat: 案C C-C 完了 - 工程6'-B Sonnet 4.6 差分生成
ba076a7 feat: 案C C-D 完了 - 工程6'-C Compliance Checker
(本コミット) feat: 案C C-E 完了 - E2E smoke 2 pass 公認版 (post 11077 / qf 11)
```
