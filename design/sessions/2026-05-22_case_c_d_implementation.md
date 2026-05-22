# 2026-05-22 案C C-D 実装完了 (工程6'-C Compliance Checker)

## セッション要旨

C-C 完了状態を起点に、C-D (工程6'-C Compliance Checker) を実装 + smoke pass。
Phase 2 残タスクは C-E (E2E smoke) / C-F (非破壊確認) の 1.5 日。

最終更新: 2026-05-22
コミット: (本コミット、feat)

---

## I. 実装ファイル

```
node/rewrite/llm-execution/
  compliance-checker.js          ← 純粋関数 (checkDiffCompliance)
  compliance-runner.js           ← runComplianceCheck (DB 読み + UPDATE 集約)

node/rewrite/scripts/
  smoke-compliance-runner.js     ← E2E smoke (analysis → diff → compliance)
```

## II. 設計判断 (Claude 推奨、V-A-3 C-4 準拠)

| 論点 | 採用 | 根拠 |
|---|---|---|
| 照合方式 | 単純 `String.indexOf` (case-sensitive、HTML 生文字列) | 正規表現は段階C再評価 [10][14] |
| 対象 rule_type | `禁止表現` のみ | 必須表現 / 正式表記 は商材言及条件あり、LLM 委譲が必要 |
| 対象 condition | `condition='常に'` のみ | 自然言語条件判定は C-D 外、最小性原則 |
| status フィルタ | `status='verified'` (運用)、smoke は一時昇格 + revert | 実運用整合性 |
| 走査列 | `content_after` のみ | content_before = 元記事 = 改変対象外 |
| violations 累積 | `rule_id` で uniq、既存 + 新規マージ | 重複 INSERT 防止 |
| risk_flag 上書き | 既存 null 時のみ 'regulation_citation' セット | TEXT 単一列、既存情報優先、違反は violations[] で表現 |
| session.status 遷移 | C-D 単独では遷移なし | C-E E2E 通しで判定 |
| 純粋関数分離 | checker (DB 非依存) + runner (DB) | テスト容易性、警戒バイアス [11] |

## III. smoke 結果 (post 11077 / qf 11、master_rules 21 件 verified 昇格)

```
=== 7. runComplianceCheck ===
  rules_loaded=21
  diffs_scanned=10
  diffs_with_violations=1
  total_violations=1
  risk_flag_set_count=0

=== 8. 検証 (全 9 assertions ✓) ===
  ✓ rules_loaded > 0 (got 21)
  ✓ diffs_scanned (10) === diffs_inserted (10)
  ✓ total_violations >= 1 (inject 1 件)
  ✓ diffs_with_violations >= 1
  ✓ diff[0].rationale.compliance.violations.length >= 1
  ✓ violations に "審査が甘い" が含まれる
  ✓ violation.rule_id 数値
  ✓ violation.position 数値
  ✓ risk_flag 既存値保持 ('rate_update' → 'rate_update')

=== 9. per_diff プレビュー (違反検出のみ) ===
  diff[1] target=h3#即日融資可能なカードローン一覧
    risk: rate_update → rate_update
    violation: rule_id=1 ng="審査が甘い" pos=1161

master_rules revert: 21 rules → draft
session_id=17 削除 (diff + session)
```

違反 mock の inject方法: smoke 内で diff[0].content_after に "審査が甘い" を末尾追記。
risk_flag が既に 'rate_update' のため、'regulation_citation' で上書きせず保持する挙動を検証。

## IV. 警戒バイアス [1]〜[23] C-D 適用結果

| バイアス | 適用例 |
|---|---|
| [10] JSON Schema 過剰汎用化 | violations は { rule_id, ng_text, legal_basis, position } の 4 フィールド最小 |
| [11] Adapter 過剰抽象化 | checker = 純粋関数、runner = DB 直接、不要な層なし |
| [12] スケルトン隠れたコスト | rule cache なし (1 セッション 1 SELECT、21 件) |
| [14] 細分化暴走 | 1 ng_text/rule につき violations 1 件、uniq 化 |
| [16] YMYL 上流フィルタ怠惰 | ここで最終フィルタ、上流 LLM 漏れを補完 |

新規バイアス確立なし。

## V. 残タスク (Phase 2 残 1.5 日)

| ステップ | 内容 | 工数 |
|---|---|---|
| C-E | E2E smoke (post 11077 / qf 11、6'-A → 6'-B → 6'-C 通し) | 1 日 |
| C-F | 既存 smoke 非破壊確認 + 段階C 申し送り | 0.5 日 |

注: C-D smoke (本セッション) は実質 6'-A → 6'-B → 6'-C 通しを実行しており、C-E と統合余地あり。
次セッションで C-E 着手前に判定:
  (a) 別 post + 違反 inject なしのリアル違反検出率を測定する 1 日コース
  (b) C-D smoke を E2E 公認版に格上げ + non-destructive check に集約する 0.5 日コース

## VI. 累計コミット (2026-05-22 単日、本コミット含めて)

```
d89e38a feat: 案C C-C 完了 - 工程6'-B Sonnet 4.6 差分生成
(本コミット) feat: 案C C-D 完了 - 工程6'-C Compliance Checker
```
