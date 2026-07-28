#!/usr/bin/env python3
"""registry/products.yaml 生成 — A-1センサス確認結果(JSON断片)のマージ

入力: 確認エージェントの結果JSON群（--parts で指定するディレクトリの *.json）
  [{slug, name, company, type, official_domain, product_url, status, license?, note?}]
出力: registry/products.yaml
  - product_id / name / company / type / status / license / note
  - pages.top = product_url（無ければ official_domain のルート）
  - unverified は pages 空（snapshot が自然にスキップ）で収載し、後日確認の台帳を兼ねる

slug 重複は先勝ち（Tier1系ファイルを先に読ませる運用）。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent

TYPE_ORDER = ["consumer_major", "consumer_small", "bank_mega", "bank_net",
              "bank_regional", "shinpan", "omatome", "bnpl"]


def main():
    if len(sys.argv) < 2:
        print("usage: build_registry.py <parts_dir> [parts_dir2 ...]", file=sys.stderr)
        return 2
    products = {}
    for d in sys.argv[1:]:
        for p in sorted(Path(d).glob("*.json")):
            for row in json.loads(p.read_text(encoding="utf-8")):
                slug = row["slug"]
                if slug in products:
                    # 先勝ち。ただし既存が unverified で新規に確認済みURLがあれば昇格
                    cur = products[slug]
                    if cur.get("status") == "unverified" and row.get("product_url"):
                        pass  # 差し替えに進む
                    else:
                        continue
                url = (row.get("product_url") or "").strip()
                dom = (row.get("official_domain") or "").strip()
                if not url and dom:
                    url = f"https://{dom}/"
                entry = {
                    "product_id": slug,
                    "name": row["name"],
                    "company": row.get("company", ""),
                    "type": row.get("type", ""),
                    "status": row.get("status", "unverified"),
                }
                if row.get("license"):
                    entry["license"] = row["license"]
                if row.get("note"):
                    entry["note"] = row["note"]
                entry["pages"] = {"top": url} if url else {}
                products[slug] = entry
    rows = sorted(products.values(),
                  key=lambda r: (TYPE_ORDER.index(r["type"]) if r["type"] in TYPE_ORDER else 99,
                                 r["product_id"]))
    out = ROOT / "registry" / "products.yaml"
    header = ("# 商材レジストリ — A-1センサス(2026-07-28)の公式URL実確認結果から生成\n"
              "# 生成: scripts/build_registry.py（手編集する場合は再生成で消えるため注意）\n"
              "# pages: 役割別URL。top のみ初期登録、product/spec/campaign 等は discover で拡張\n")
    out.write_text(header + yaml.safe_dump(rows, allow_unicode=True, sort_keys=False),
                   encoding="utf-8")
    from collections import Counter
    ct = Counter(r["type"] for r in rows)
    st = Counter(r["status"] for r in rows)
    print(f"products.yaml: {len(rows)}商材 type={dict(ct)} status={dict(st)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
