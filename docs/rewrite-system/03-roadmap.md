# SEO リライトシステム — 全体ロードマップ

最終更新: 2026-04-28

## 5 週間計画

| Week | フェーズ | 担当 | 成果物 | 状態 |
|------|---------|-----|--------|------|
| 1 | A: 設計確定 | Daiki | 設計仕様書 + 発注書 | ✅ 完了 |
| 1-2 | E: 実装 | Claude Code | マスター管理画面 | 🔧 進行中 |
| 2-3 | B/C: 収集・抽出 | ゆかちゃん | マスターデータ初期投入 | ⏳ 未着手 |
| 4 | D: 真=美検証 | Daiki | verified データ | ⏳ 未着手 |
| 5 | F: 統合テスト | Daiki + Claude Code | カードローン完璧化完了 | ⏳ 未着手 |

## Phase E スコープ（マスター管理画面）

想定工数: 3-5 営業日

### 成果物

1. SQLite に 4 マスターテーブル追加（既存スキーマ無改変）
2. 初期データ 92 件投入（注釈 15 + ルール 21 + チェックリスト 56）
3. Backend API: `/api/masters/*` 一式 + audit_log 自動記録
4. Frontend: `/masters/` 配下のダッシュボード + CRUD 画面
5. CSV インポート/エクスポート（UTF-8 BOM 対応）
6. ドキュメント群配置

### 完了定義

- [ ] feature/rewrite-master-ui ブランチが main にマージされる
- [ ] https://rewrite.anonymous-seo.jp/masters/ で管理画面が動作
- [ ] 初期データ 92 件が投入済み
- [ ] docs/rewrite-system/ にドキュメント群が配置される
- [ ] Daiki レビューで「Week 1 Phase E 完了」と判定される

詳細は [04-phase-a-design.md](04-phase-a-design.md) を参照。

## Phase E 実装ステップ（Claude Code 内部分割）

| ステップ | 内容 | 状態 |
|---------|------|------|
| E-1 | ブランチ作成 + ドキュメント配置 + legacy/gas/ 持ち込み | 🔧 進行中 |
| E-2 | `master-db.js`（4 テーブル init + 初期データ投入） | ⏳ |
| E-3 | `masters-routes.js`（API 一式 + audit_log ラッパ） | ⏳ |
| E-4 | Frontend（react-router-dom 導入 + masters 画面群 + CSV I/O） | ⏳ |
| E-5 | 動作確認 + PR 作成 | ⏳ |

## 後続フェーズで実装予定（Phase E スコープ外）

Phase F 以降で `rewrite_instructions` / `rewrite_drafts` テーブルを中心に実装:

- リライト対象選定（s-tools SQLite から `daily_metrics` 等を参照）
- SERP 分析（Ahrefs CSV アップロード）
- 検索意図 3 層分解（LLM）
- 真=美判定（必然性 / 閉合性 / 最小性を 1 呼び出しで 3 観点評価）
- E-E-A-T 充足度
- AI Overview 適性
- リライト指示書生成（マスター参照を含む）
- AI リライト実行（`claude-opus-4-7`）
- レビュー UI（Before/After diff + HumanFlag 入力）
- WordPress 書き込み（既存 `gap-fill.js updateWpPost()` 流用）

## 依存関係

```
Phase A (設計)
   ↓
Phase E (マスター管理画面実装)
   ├─→ Phase B/C (ゆかちゃんがマスター投入) ← UI が動かないと開始不可
   │      ↓
   │   Phase D (Daiki が verified 昇格)
   │      ↓
   └─→ Phase F (統合テスト + リライト本体実装)
```

Phase E が遅れるとゆかちゃんの作業が始められないため、優先度最高。
