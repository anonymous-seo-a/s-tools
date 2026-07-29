# rewrite/batch — 日次バッチ運用ガイド

リライトシステムの日次バッチ群（Phase 1）。
本番（VPS）では crontab で起動、ローカル環境では手動実行のみ。

---

## daily-target-selection.js

毎日 1 回、4軸のリライト対象スコアを再計算して `master_rewrite_target_score` に投入する。

### 起動例

```bash
node /path/to/s-tools/node/rewrite/batch/daily-target-selection.js
```

### 主な動作

1. `master_rewrite_target_score.MAX(calculated_at)` を参照
2. 直近 24 時間以内の実行があれば skip（exit 0）
3. `monitor.db` 不在環境では warn ログ + exit 0（cron 環境の正常終了扱い）
4. 軸1（placeholder）/ 軸2 / 軸3 / 軸4 を順に計算 → 永続化
5. 統計サマリ（処理件数 / エラー軸数 / 経過 ms）を出力 → 適切な exit code

### Options

| Option | 用途 |
|---|---|
| `--force` | 冪等性チェックをバイパス（24h 以内でも実行） |
| `--as-of YYYY-MM-DD` | 計算基準日を指定（デフォルト: now） |
| `--dry-run` | 計算は実行、DB 永続化はスキップ |

### Exit code

| Code | 状態 |
|---|---|
| 0 | 正常完了（全軸成功）または冪等スキップ |
| 1 | 部分失敗（一部の軸で計算失敗、残りは成功） |
| 2 | 致命的失敗（DB 接続不可、想定外例外） |

### 冪等性設計（Phase 1）

- スキーマ変更なしのアプリケーションレベル実装
- 二重起動（cron + 手動 / cron 多重設定）を吸収
- `--force` で明示的に上書き可能
- Phase 2 以降で軸別個別冪等性が必要になれば再設計

---

## crontab 設定（本番 VPS）

```cron
# 毎日 03:00 JST (= 18:00 UTC) に実行
0 3 * * * cd /path/to/s-tools/node && node rewrite/batch/daily-target-selection.js >> /var/log/rewrite-batch.log 2>&1

# 失敗通知用 (cron MAILTO で exit != 0 の標準動作)
MAILTO=daiki.nozawa@fundit.jp
```

設定手順:

```bash
# crontab を編集
crontab -e

# 反映確認
crontab -l

# 手動実行 (動作確認)
node /path/to/s-tools/node/rewrite/batch/daily-target-selection.js --dry-run
```

---

## ログローテーション

`/etc/logrotate.d/rewrite-batch`:

```
/var/log/rewrite-batch.log {
  daily
  rotate 30
  compress
  missingok
  notifempty
  copytruncate
}
```

---

## 失敗検知

Phase 1 では最小限の仕組みのみ。Phase 4 中盤以降で要望に応じて拡充。

| 検知方法 | 仕組み |
|---|---|
| Cron MAILTO | exit != 0 でメール通知（標準機能） |
| ログ grep | `[FATAL]` / `[error]` 文字列で監視 |
| 累積失敗 | rewrite.db で「最後に成功した calculated_at」を確認 |

---

## Phase 2 以降の拡張余地（参考）

本書および本実装は Phase 1 範囲のみ。以下は将来タスク:

- 関連度テーブル月次バッチ（Phase 2 末、`master_article_similarity` 再計算）
- HCU チェックリスト評価バッチ（Phase 2、`master_hcu_checklist`）
- A/B テスト集約バッチ（Phase 3、`master_ab_test_result`）
- 月次バッチ未実行検知（論点2-4、`applied_to_wp=1 AND ab_test_id IS NULL` 14日経過）
