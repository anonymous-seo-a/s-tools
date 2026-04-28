# s-tools — soico /no1/ 運用ツール群

本リポジトリは soico /no1/ 金融 YMYL アフィリエイトサイトの運用自動化ツール **s-tools** のコードベース。VPS 上では pm2 プロセス `rewrite-app` として稼働、公開 URL は https://rewrite.anonymous-seo.jp/。

## 構成

- **Server**: Node.js + Express（`server.js`）、SQLite（`better-sqlite3`、`data/monitor.db` + `data/apply-history.json`）
- **Client**: React + Vite（`client/`、ビルド成果物を `client/dist/` に出力、Express が静的配信）
- **デプロイ**: VPS `/var/www/rewrite/`、プロセスマネージャ pm2。rsync でコード反映 → `pm2 restart rewrite-app`
- **ポート**: 3001（`.env PORT=3001`）。nginx で 443 → 3001 にリバースプロキシ

## 既存モジュール群

### CTA / リンク張替
- `gap-fill.js` — 提携先 CTA の挿入ギャップを WP 記事から検出、一括挿入
- `tools/link-replacer.js` — 指定パートナーへのリンク張替
- `server.js` 内 `/api/apply`、`/api/audit/*`、`/api/link-replacer/*`
- 反映履歴は `data/apply-history.json`

### 順位モニタリング
- `monitor-collectors.js` — GSC / GA4 / WP REST から日次データ収集
- `monitor-jobs.js` — cron 起動のバッチ（日次取込 / KW スナップショット / WP メタ補完）
- `monitor-scraper.js` — Yahoo! 検索の HTML スクレイピング（Top 50 順位）
- `monitor-analysis.js` — Anthropic SDK で記事要因分析（`claude-opus-4-7`）
- `monitor-db.js` — SQLite スキーマと全クエリ。主要テーブル: `articles`, `daily_metrics`, `weekly_kw_snapshot`, `daily_affiliate_clicks`, `daily_scraped_rank`, `analysis_comments`, `kv_settings`, `jobs`

### React UI
- `client/src/MonitorView.jsx` — 順位モニタリング画面（一覧 / タイムラインモーダル / 分析 / KW 推移）
- `client/src/api.js` — API クライアント

## 運用ルール

- **デプロイ手順**: `cd client && npm run build` → `rsync -avz -e "ssh -i ~/.ssh/vps_mothership" ...` を `/var/www/rewrite/` へ → `pm2 restart rewrite-app`
- **pm2 プロセス名は `rewrite-app`**（`rewrite` ではない）
- **除外カテゴリ**: `monitor-collectors.parseUrl()` で本体サイト系カテゴリ（accounting, development, entrepreneur, funding, grants, hiring, incorporation, office, startup）を除外
- LLM 分析は `claude-opus-4-7` を使用（`monitor-analysis.js` の `ANALYSIS_MODEL` 定数）

---

# プロジェクト: SEO リライトツール（開発中）

2026-04-24 Phase 0 協議で、**s-tools 本リポジトリ内に新タブとして統合**する方針で合意。原案仕様書は `docs/seo-rewrite-tool-spec.md`。

**方針転換 (Phase 0)**: 原案は「リライト指示書出力」だったが、**AI が実リライトまで実行**する方針に変更。指示書は内部中間表現として保持し、UI で Before/After diff と併記する。

## 設計原理: 真=美フレームワーク

美しさは審美的好みではなく、構造的必然性である。3 つの判定テストを記事品質にも本ツールのコード設計にも適用する:

- **必然性テスト**: この要素を除いたら構造は崩壊するか
- **閉合性テスト**: 外部への依存を最小にできているか
- **最小性テスト**: より少ない要素で同じ機能を実現できないか

原案からの Phase 0 修正:
- 真=美テストを **1 モジュール 3 観点評価** に統合（原案は 3 モジュール分割）
- 悪化パターン別ルーティング廃止、**全モジュール並列実行**
- Ahrefs は **CSV アップロード運用** から開始（API 契約待ち）

## 9 モジュール構成（修正後）

```
[0] リライト対象選定      ← s-tools SQLite
[1] SERP 分析            ← Ahrefs CSV アップロード
[2] 検索意図 3 層分解    ← LLM
[3] 真=美判定            ← LLM（必然性/閉合性/最小性を 1 呼び出しで評価）
[4] E-E-A-T 充足度       ← LLM + WP メタ
[5] AI Overview 適性     ← LLM
[6] テクニカル要素       ← HTML 解析
[7] リライト指示書生成   ← 集約 + 優先度スコアリング
[8] ファクトチェック     ← e-Gov API（Phase 後半）
```

## 16 必須要素（品質判定対象）

| # | カテゴリ | 要素 |
|---|---------|------|
| 1-4 | 検索意図の閉合 | 顕在/潜在/安心ニーズ応答、AI 引用適性 |
| 5-8 | E-E-A-T | 一次情報、著者、監修者、鮮度 |
| 9-11 | 構造的要素 | 結論先行、見出し階層、内部リンク |
| 12-14 | テクニカル | Core Web Vitals、構造化データ、モバイル |
| 15-16 | 差別化 | 実務詳細、独自構造化（比較表/マトリクス/決定木/スコア診断） |

## データソース

| データソース | 役割 | 方式 |
|------------|------|------|
| s-tools SQLite | 記事一覧・順位・PV・アフィ・GSC・apply_history | 同 DB 直読 |
| Ahrefs | SERP / 競合 / 被リンク | CSV アップロード（API は後発） |
| Microsoft Clarity | UX（スクロール、離脱） | 初期は手動 CSV、将来 API |
| e-Gov | 法令条文照合 | API（Phase 後半） |
| WordPress REST | 記事本文 | 既存 `monitor-collectors.fetchWpContent` 流用 |

## 出力仕様

指示書 3 層（内部表現）:
- **戦略層**: なぜこの構成か（SERP 分析、差別化軸、コア戦略）
- **構成層**: H2/H3 一覧、セクション別 Keep/Update/Add/Remove
- **実行層**: 書くこと/書かないこと/必要データ/出典 URL + HumanFlag

内部 DB は `rewrite_instructions` に正規化し `layer` 列で分類。

AI が指示書をもとに実本文をリライトし `rewrite_drafts` に保存。レビュー UI で Before/After diff + 指示書併記 → 承認 → WP 反映。

## WordPress 書き込み

既存 `gap-fill.js updateWpPost()`（WP REST API + Application Password）を流用。`save_post` フックで AIOSEO サイトマップ再生成 / lastmod 更新 / Search Console ping が自動実行。PHP 直呼び経路は作らない。

## HumanFlag

人間のみ判断可能な箇所（一次情報投入、実体験記述等）は AI リライト時にプレースホルダ `{{HUMANFLAG: ...}}` で残す。レビュー UI の赤枠入力欄で人間が埋める。低信頼度 LLM 判定も同じ仕組みで保留。

## 運用スペック

- スループット: 100 本以上/月（3-4 本/日）
- 利用者: Daiki + soico 編集部（数名）
- 成功指標: リライト後の順位 + PV、翌日 + 1 週間後で観測
- 埋め込み: Voyage AI 無料枠（200M tokens/月）+ sqlite-vec 優先検討

## 運用モード

- 各 Phase 開始時に Daiki の承認を得る（対話的進行）
- モジュール単位で実装 → 動作検証 → 次へ
- 反証プロトコル: Daiki が「これは違う」と言った場合、直感を正とみなし前提から再構築
- 自動公開は実装しない（必ず人間の最終承認）

---

# 協業ガイド

- **文字コード**: 日本語ファイル・コメントは UTF-8
- **既存資産を尊重**: 新ツール側で SQLite スキーマを拡張する時、既存 `daily_metrics` 等の破壊的変更は避ける。新テーブルを足す
- **LLM 呼び出し**: 既存 `monitor-analysis.js` のパターンに揃える（`claude-opus-4-7`、`saveAnalysisComment` 類似の永続化）
- **UI**: 既存 `MonitorView.jsx` のスタイル規約（`monitor-*` クラス、`client/src/index.css`）を踏襲
- **コミット**: 明示要求があった時のみ
- **破壊的操作**: 確認取ってから（force push / hard reset / DB 破壊は禁止）
