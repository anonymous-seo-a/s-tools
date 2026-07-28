#!/bin/bash
# cardloan-keeper 日次スナップショット（cron 04:30 JST）
# 全148商材のページ役割を巡回し、差分を data/logs/ に記録する。
# STRUCT?/minor/stopped の検知は当面ログ確認ベース（第2段の自動ルーティングは後続フェーズ）。
set -u
cd "$(dirname "$0")"
mkdir -p data/logs
LOG="data/logs/snapshot_$(date +%Y%m%d).log"
{
  echo "=== snapshot start $(date -Iseconds) ==="
  timeout 45m ./.venv/bin/python scripts/snapshot.py
  rc=$?
  echo "=== snapshot end rc=$rc $(date -Iseconds) ==="
  # 変更・失敗のダイジェスト（毎朝これだけ見れば良い行）
  grep -E "STRUCT\?|minor|FETCH_FAIL|PDF_FAIL" "$LOG" | tail -50 > "data/logs/digest_$(date +%Y%m%d).txt" || true
} >> "$LOG" 2>&1
