# SEO リライトシステム — ドキュメント

soico /no1/ の SEO 記事を真=美フレームワークに基づき AI と人間の役割分担で自動リライトするシステム。

## ドキュメント一覧

| ファイル | 内容 |
|---------|------|
| [00-philosophy.md](00-philosophy.md) | 真=美フレームワーク、設計原理、役割分担 |
| [03-roadmap.md](03-roadmap.md) | 5週間ロードマップ + Phase 進捗 |
| [04-phase-a-design.md](04-phase-a-design.md) | Phase A 設計仕様書（Phase E 実装の正本） |
| [decisions/](decisions/) | 意思決定ログ |

## システム位置づけ

- リポジトリ: https://github.com/anonymous-seo-a/s-tools
- 統合先: VPS `/var/www/rewrite/`、pm2 `rewrite-app`、URL https://rewrite.anonymous-seo.jp/
- スタック: Node.js + Express + better-sqlite3 + React/Vite

## 設計の核

```
誤った設計: LLM にリライトさせる
正しい設計: マスターデータを主役にし、LLM は検出+組立+生成を担当
```

LLM の強み（生成）と弱み（判定）を踏まえ、判定基準は外部マスター化して属人性を排除する。
真=美テスト（必然性 / 閉合性 / 最小性）が全判断の基盤。

## 関連ディレクトリ

- 既存 GAS 実装の参考コード: [`legacy/gas/`](../../legacy/gas/)
- マスター管理機能: `node/master-db.js`、`node/masters-routes.js`、`node/client/src/masters/`

## 運用ルール

**ドキュメント無しに次フェーズに進まない**。
新しい設計判断・方針転換は `decisions/` 配下に日付付きで記録する。
