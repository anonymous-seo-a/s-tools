#!/usr/bin/env python3
"""rewrite-cardloan (keeper-bridge) 向けエクスポート

registry/products.yaml → data/export/products.json
  Node 側に YAML パーサ依存を持ち込まないための JSON 供給（疎結合・file-based）。
  aliases = 記事本文から商材言及を検出するための短い表記（名前の主要トークン）。

実行: ./.venv/bin/python scripts/export_bridge.py  （run_snapshot.sh の後段にも接続）
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "export"


def aliases_for(p):
    """商材検出用の別名。名前の先頭トークン＋愛称（「」内）＋会社名の核。"""
    out = set()
    name = p.get("name", "")
    # 先頭トークン（区切り: 空白・｜・（・「）
    head = re.split(r"[ 　｜|（(「]", name)[0].strip()
    if len(head) >= 2:
        out.add(head)
    # 愛称（「」内）
    for m in re.findall(r"「([^」]{2,20})」", name):
        out.add(m)
    # 会社名の核（株式会社等を除去）
    comp = re.sub(r"株式会社|（.*?）", "", p.get("company", "")).strip()
    if 2 <= len(comp) <= 14:
        out.add(comp)
    # ノイズになる汎用語は除外
    return sorted(a for a in out if a not in ("カードローン", "銀行", "キャッシング", "ローン"))


def main():
    products = yaml.safe_load((ROOT / "registry" / "products.yaml").read_text(encoding="utf-8")) or []
    rows = []
    for p in products:
        rows.append({
            "product_id": p["product_id"],
            "name": p.get("name", ""),
            "company": p.get("company", ""),
            "type": p.get("type", ""),
            "status": p.get("status", ""),
            "aliases": aliases_for(p),
        })
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "products.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"products.json: {len(rows)}商材 → {OUT / 'products.json'}")


if __name__ == "__main__":
    main()
