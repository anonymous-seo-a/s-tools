# Legacy GAS コード（参考実装）

soico CVR 改善・SEO リライト自動化システムの旧 Google Apps Script 実装。
2026 年から s-tools (Node.js + Express + SQLite) に統合中。
**本ディレクトリのコードは参考目的のみ**で、s-tools の動作には関与しない。

## 元リポジトリ

- https://github.com/anonymous-seo-a/cta — `feature/cta-plugin-update` ブランチの `clasp/` および `prompts/` を持ち込んだもの
- 参照スナップショット日: 2026-04-28

## ディレクトリ構成

```
legacy/gas/
├── clasp/                    # GAS 本体コード（clasp 運用、.js 拡張子）
│   ├── main.js               # 機能1: CVR 診断
│   ├── cta_insertion.js      # 機能2: CTA 自動挿入
│   ├── cta_diagnosis_master.js  # 商材マスター
│   ├── cta_gap_fill.js       # CTA 挿入ギャップ補完
│   ├── gsc_master.js         # 共通: GSC データ一元管理
│   ├── seo_rewrite.js        # 機能3: SEO リライト Step 1-2
│   ├── seo_rewrite_markup.js # 機能3: SEO リライト Step 3-4（Gutenberg マークアップ）
│   ├── annotation_master.js  # 機能3: 注釈マスター + 注釈処理ロジック
│   ├── appsscript.json       # GAS プロジェクト設定
│   └── .clasp.json           # clasp デプロイ設定
└── prompts/
    ├── buildSystemPrompt_latest.gs  # リライト用システムプロンプト
    ├── cvr_diagnosis_prompt_v1.md   # CVR 診断プロンプト
    └── gap_fill_prompt.md           # ギャップ補完プロンプト
```

## Phase E（マスター管理画面）で参照すべき箇所

### `clasp/annotation_master.js`

注釈マスターのデータ構造と注釈処理ロジック。Phase E のスキーマ設計と整合する必要あり。

- L9-15: `ANNOTATION_CONFIG` — プレースホルダ書式（Claude API が `%%` を壊すため `[KEEP_ANNOTATION_xxx]` に変更した経緯）
- L20-104: `initMasterAnnotationsSheet()` — `master_annotations` / `master_rules` の初期データ。**Phase E の SQL 初期投入のソース**
- L109-147: `loadAnnotations()` / `loadRules()` — Spreadsheet からの読み込み。Phase E の API レスポンス整形の参考に
- L158-212: `extractAnnotationsToPlaceholders()` — 既存注釈の退避（Phase F でリライト本体実装時に必須）
- L220-233: `restoreAnnotationsFromPlaceholders()` — 復元
- L244-302: `analyzeArticleAnnotationContext()` + `fetchWpBlock()` — 再利用ブロックから記号定義抽出
- L307-344: `buildAnnotationPromptText()` — Claude プロンプトへの注入
- L358-494: `postProcessAnnotations()` — マスター参照による注釈の決定論的挿入（記号/番号/インラインの 3 形式出し分け）

### `clasp/seo_rewrite.js` / `clasp/seo_rewrite_markup.js`

リライト本体のフロー。Phase F 以降で参照。

### `prompts/buildSystemPrompt_latest.gs`

Claude API へのシステムプロンプト構築。Phase F のリライト指示書生成で参照。

## GAS 実装の制約（s-tools 移植時に外す対象）

- 5 分実行制限（progress シートで再開していた）
- セル 50K 文字制限（Google Drive に退避していた）
- Spreadsheet ベースの承認 UI（Before/After diff が見にくい）
- 競合スクレイプの時間分散（GAS タイマー制約由来）
- 1 記事/実行制限

## GAS 実装から引き継ぐべき資産

- Yahoo 検索スクレイプの SKIP_DOMAINS（Bot 対策、bitflyer 等 16 ドメイン）
- 競合フォールバック（5 件から 2 件成功するまで試行）
- Gutenberg マークアップ生成プロンプト
- 注釈マスターの `[KEEP_ANNOTATION_xxx]` プレースホルダ運用

## 注意

`clasp/.clasp.json` には GAS プロジェクト ID が含まれる。
**この legacy/ 配下のコードを編集して clasp push してはならない**。
編集が必要な場合は元リポジトリ (anonymous-seo-a/cta) で行うこと。
