# カードローン専用リライトシステム + 一次情報管理者 設計（ドラフト v1）

日付: 2026-07-28
状態: Daiki 3決定確定済み。詳細設計進行中。

---

## 0. Daiki 確定事項（2026-07-28）

1. **一次情報管理者は s-tools 内に独立実装**（fact-keeper とリポジトリ・コード・DB非共有。設計と実証済みコードの移植のみ）
2. **商材スコープは銀行カードローンまで含める**。母集団 = 自社記事で言及している商材 ∪ 競合メディアが取り上げている商材
3. **リライトシステムは完全フォーク**でカードローン専用化（既存 node/rewrite は securities 用にそのまま存続）

---

## 1. 全体配置

```
s-tools/
├── cardloan-keeper/                 ← 新規: 一次情報管理者（Python、fact-keeper 設計移植）
│   ├── registry/products.yaml       ← 商材レジストリ（ページ役割マップ）
│   ├── regulations/
│   │   ├── raw/                     ← client_official 原本CSV（gitignore、fact-keeper からコピー）
│   │   ├── inferred/                ← 推定レギュ（_common / _by_type / by_company）
│   │   └── coverage.yaml
│   ├── config/
│   ├── scripts/                     ← fetch / snapshot / extract_cardloan / regstore / check_article / ingest_law
│   ├── data/                        ← facts / snapshots / export（gitignore）
│   └── export/ → node 側が読む JSON（facts + 注記 + regstore chunks + notation rules）
└── node/
    ├── rewrite/                     ← 既存（securities、現状維持）
    └── rewrite-cardloan/            ← 完全フォーク（cardloan 専用）
        └── data: rewrite-cardloan.db（独立DB。master_rules 23件を移設）
```

## 2. cardloan-keeper 設計

### 移植（実証済み・商材非依存 — fact-keeper からコピー移植し独立進化）
- fetch 二段（curl→Playwright 隔離ワーカー）/ snapshot 差分駆動（二段階差分 第1段）
- regstore（日本語 bigram BM25 + advertiser/card_id スコープ + source_tier）
- check_article（記事全文 × 規約 + 法令原文 + 措置命令類型 → 出典付き違反検出）
- ingest_law（e-Gov 法令API。景表法・消費者契約法に加え **貸金業法・利息制限法・出資法** を追加）
- enrich 出典階梯（tierA公式逐語引用→tierC隔離→terminal）、4点セット + append-only history
- dreaming（後段フェーズ）

### 新設（cardloan 専用 — クレカ語彙を流用しない。専用関数並列配置）
- `extract_cardloan.py` + fact_key スキーマ（ドラフト）:
  - interest_rate {min,max}（実質年率）/ interest_free_period（無利息: 起算日・日数・条件）
  - limit_amount / examination_time（最短表記+条件注記）/ funding_speed
  - employment_check（在籍確認の**公式文言そのまま**）/ application_conditions / income_proof 閾値
  - repayment_system / atm / web_completion / card_less
  - guarantee_company（銀行系）/ total_quantity_regulation（総量規制対象/対象外）
  - official_notation（会社別指定表記・正式サービス名）
- **値と必須注記のアトミック供給**: 「最短◯分」等の規制対象値は、レギュ上の併記義務注記（※審査により〜等）と結合した単位で export。rewrite 側が値だけ拾って注記を落とせない構造にする（cardloan 固有の核心設計）
- キャンペーン揮発性管理（無利息条件・金利優遇の valid_until）

### 不要（クレカ固有を持ち込まない）
条件ツリー還元率評価器 / ペルソナ・simulate / 経済圏グラフ / 券面画像パイプライン / reward blocks

### レギュレーションストア
- client_official: アコム67・プロミス32・モビット30論点（CSV原本を fact-keeper から移設コピー）
- inferred: アイフル・レイク・銀行系各社（クレカ21社で確立した手法 = 公式サイト逆算 + アドバーサリアル検証。ASP資料入手で official 昇格）
- **_by_type 分離が必須**: 消金 = 貸金業法系 / 銀行 = 銀行法・保証会社構造（規制の型が異なる）
- 過去パトロール指摘（アコム在籍確認100％なし・モビット表記7項目・レイク表記規則・掲載基準表20260714 等）を feedback_history 化 → regstore エントリ兼回帰テストコーパス

## 3. rewrite-cardloan フォーク設計

- genre 層を cardloan 固定に畳む（compliance-runner の cardloan ハードコードが仕様になる）。辞書（BRANDS / EXCLUDE_DOMAIN / PARTNER_KEYWORDS）から証券系を削除し、銀行カードローン各社を追加
- DB 分離: rewrite-cardloan.db。master_rules 23件（全件 cardloan 資産）を CSV export/import で移設
- **keeper-bridge 新設**（4層防御の接続点）:
  - L0 生成前: 該当社レギュ論点 + 検証済み公式値をプロンプト注入
  - L1 決定論: regstore の「完全NG/指定表記」→ master_rules Layer1 を自動同期生成
  - L2 LLM個別: 既存 Layer2（比較構造禁止・パートナー個別）を銀行系へ拡張
  - L3 最終ゲート: WP適用前に check_article を Python CLI（child_process）で実行、違反=held
  - 数値サーバレンダリング: 金利・無利息・正式表記は LLM に書かせずプレースホルダ→keeper 値+必須注記を決定論置換（citation-gate 思想の数値拡張）
- 自動承認の厳格化: safe-cell 学習緩和は**無効**で開始 / auto-batch 対象外で開始（誤起動再発防止）/ 違反・注記欠落・keeper値不一致は全て held
- INSTITUTION_RE に利息制限法・出資法・全銀協自主規制等を追加 / VOLATILE_FACT_RE を無利息キャンペーン・金利優遇向けに再設計
- フォーク時に既知バグ（audit 0626: 空BOX残存・重複段落）の修正状況を確認してから分岐

## 4. フェーズ

- **A-1 商材センサス**: 自社WP（soico-cta company属性・比較表 companies・cardloan カテゴリ記事）∪ 競合SERP（主要KW top10 のブランド抽出）→ registry 母集団確定（推定 40〜60 商材）
- **A-2 keeper 稼働**: 移植 + registry + extract_cardloan + 収集
- **A-3 レギュ整備**: official 3社移設 + inferred 生成 + 法令取込 + 過去指摘 feedback_history 化
- **B フォーク + bridge**: rewrite-cardloan 分岐、4層防御接続
- **C 回帰検証**: 過去指摘コーパスを流し L1+L3 が全件検出することをゲートに（成功基準 = パトロール指摘ゼロ、fact-keeper 原典成功基準①と同型）
- **D 運用開始**: C 合格後に DISABLED_REWRITE_GENRES とは無関係に新系で稼働開始。後段で二段階差分の変更検知→リライト候補自動化（master_regulation_event の空き地に収まる）

## 5. 反証（記録）

- **独立実装**: fact-keeper と二重保守になる（fetch/regstore のバグ修正が2箇所）。移植時点で凍結し独立進化を受け入れる。Daiki の「修正経路の独立性」選好と整合
- **銀行系まで拡大**: inferred の信頼度が薄く広がる。銀行は ASP 案件でないものが多く official 資料が原理的に取れない場合あり → _by_type と source_tier で信頼度を明示し、断定表現は official のみに許す
- **完全フォーク**: 既存 rewrite への改善が自動反映されない。境界明確性を優先した Daiki 判断として受諾
- **check_article は確率的**: 完璧の構造保証は L1 決定論 + 数値サーバレンダリングまで。文脈依存違反は L2/L3 + held→Daiki 判定が最終防衛線

## 6. 進捗（2026-07-28 追記）

- keeper 実装言語: **Python 移植で確定**（Daiki）
- **Phase A-1 完了**: センサス結果 = `2026-07-28_cardloan_census_a1_result.md`。レジストリ全量凍結（bnpl収載・Tier3初期収集、Daiki決定）
- **Phase A-2 完了**: `s-tools/cardloan-keeper/` 稼働
  - registry/products.yaml = 148商材（全件公式URL実確認、active132/stopped5/unverified11）。出自JSON = registry/parts/
  - 移植: fetch三段 / snapshot差分 / regstore（129チャンク稼働）/ check_article（--json出力=L3ゲート接続点）/ ingest_law（8法令、利息制限法・出資法・銀行法を追加）
  - センサス副産物: 停止5商材・商号/運営会社変更・URL移転など鮮度案件を多数検出（詳細はメモリ project-cardloan-keeper-rewrite）

## 6.5 Phase B/C 完了（2026-07-29 追記）

- **Phase B**: node/rewrite-cardloan = 完全フォーク本番稼働（pm2 rewrite-cardloan :3002・rewrite-cardloan.db・本家不可触）。keeper-bridge 4層防御結線（L0プロンプト注入/L1 draft同期73件/L2継承/L3 fail-closedゲート）。safe-cell学習無効・auto-batch無効・cardloan専用ガード
- **Phase C 合格**: 回帰コーパス16ケース → **16/16検出**（tests/regression-corpus.json）。実運用可能状態
- 運用注意: push自動デプロイは本家のみ再起動 → フォーク更新時は `pm2 restart rewrite-cardloan` 手動

## 7. 未決

- keeper 本番配置先: promise.co.jp TCP遮断・みずほ/レイク等403のため日本IP VPS + Playwright 必須。fact-keeper VPS 相乗り vs s-tools 本番VPS(133.88.118.55) vs 新規
- アコム規制CSV（7/13付）と掲載基準表（7/14付・100％なし）の新旧関係 → ASP に最新版確認
- UI: rewrite-client フォーク vs 共用クライアントに新 API base → Phase B で決定
- 次工程: 自社記事×停止商材の突合 / A-3 inferred レギュ生成 / B フォーク着手
