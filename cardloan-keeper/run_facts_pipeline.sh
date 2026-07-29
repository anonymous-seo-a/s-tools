#!/bin/bash
# facts 全量パイプライン: discover(役割展開) → snapshot(新ページ取得) → extract(全商材)
set -u
cd "$(dirname "$0")"
mkdir -p data/logs
LOG="data/logs/facts_pipeline_$(date +%Y%m%d_%H%M).log"
{
  echo "=== discover start $(date -Iseconds) ==="
  ./.venv/bin/python scripts/discover_pages.py --all
  echo "=== snapshot start $(date -Iseconds) ==="
  timeout 90m ./.venv/bin/python scripts/snapshot.py
  echo "=== extract start $(date -Iseconds) ==="
  ./.venv/bin/python scripts/extract_cardloan.py --all
  echo "=== export/rebuild $(date -Iseconds) ==="
  ./.venv/bin/python scripts/export_bridge.py
  echo "=== done $(date -Iseconds) ==="
} >> "$LOG" 2>&1
