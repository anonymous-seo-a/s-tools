#!/usr/bin/env python3
"""ページ役割の自動発見 — top ページの内部リンクから spec/product/campaign/faq を LLM 選定
（fact-keeper discover_pages.py の lean 移植）

top しか登録の無い商材は金利・限度額等の一次情報が取れない（マーケLP問題）。
top の内部リンクを収集し、Claude に「この商材のスペック情報がありそうなURL」を
役割付きで最大3本選ばせ、registry の pages に追記する。

規律: LLMはURLの選定のみ（新URLの創作は不可 = 候補リスト内から選ぶ）。
実行: ./.venv/bin/python scripts/discover_pages.py <product_id> | --all [--limit N]
      registry/products.yaml を直接更新する（pages 追記のみ・冪等）。
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from util import ROOT, load_env  # noqa: E402
from fetch import fetch  # noqa: E402

REG = ROOT / "registry" / "products.yaml"
MODEL = os.environ.get("CARDLOAN_KEEPER_MODEL", "claude-opus-4-8")
ROLES = ["product", "spec", "campaign", "faq"]

PICK_TOOL = {
    "name": "pick_pages",
    "description": "商材のスペック一次情報がありそうなURLを候補リストから選ぶ（最大3本、無ければ空）",
    "input_schema": {
        "type": "object",
        "properties": {
            "picks": {
                "type": "array", "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "候補リストにあるURLをそのまま"},
                        "role": {"type": "string", "enum": ROLES,
                                 "description": "product=商品詳細/spec=貸付条件・商品概要/campaign=キャンペーン/faq=よくある質問"},
                        "why": {"type": "string"},
                    },
                    "required": ["url", "role", "why"],
                },
            }
        },
        "required": ["picks"],
    },
}

# 貸付条件・商品概要らしいURLやアンカーテキストの手がかり
HINT_RE = re.compile(
    r"loan|cardloan|kariru|karire|cashing|kashitsuke|shohin|shouhin|gaiyou|outline|"
    r"spec|jouken|joken|riritsu|kinri|rate|faq|campaign|guide|first|beginner", re.I)


def collect_links(top_url, html):
    base = urlparse(top_url)
    seen = {}
    for m in re.finditer(r'<a[^>]+href="([^"#]+)"[^>]*>(.*?)</a>', html, re.S | re.I):
        href, anchor = m.group(1), re.sub(r"<[^>]+>|\s+", " ", m.group(2)).strip()[:40]
        url = urljoin(top_url, href)
        p = urlparse(url)
        if p.netloc != base.netloc or not p.scheme.startswith("http"):
            continue
        if re.search(r"\.(pdf|jpg|png|gif|svg|css|js|ico)([?#]|$)", p.path, re.I):
            continue
        if url.rstrip("/") == top_url.rstrip("/"):
            continue
        key = url.split("#")[0]
        if key not in seen:
            seen[key] = anchor
    scored = sorted(seen.items(),
                    key=lambda kv: (0 if (HINT_RE.search(kv[0]) or
                                          re.search(r"金利|貸付|商品|概要|条件|よくある|キャンペーン|申込", kv[1])) else 1,
                                    len(kv[0])))
    return scored[:60]


def pick_llm(product, links):
    import anthropic
    client = anthropic.Anthropic()
    listing = "\n".join(f"- {u}  （アンカー: {a}）" for u, a in links)
    prompt = (
        f"カードローン商材「{product['name']}」（{product.get('company', '')}）の公式サイト内リンク一覧。\n"
        "この商材の**貸付条件・金利・限度額・無利息・在籍確認**等の一次情報が本文に書かれていそうな"
        "ページを最大3本、pick_pages で選んで。\n"
        "- 商品概要説明書・貸付条件ページ（spec）を最優先。次に商品詳細（product）、FAQ、キャンペーン。\n"
        "- リストに無いURLを作らない。別商品（住宅ローン・ビジネス・クレカ等）のページは選ばない。\n"
        "- 適切な候補が無ければ picks は空でよい。\n\n" + listing)
    resp = client.messages.create(
        model=MODEL, max_tokens=1200, tools=[PICK_TOOL],
        tool_choice={"type": "tool", "name": "pick_pages"},
        messages=[{"role": "user", "content": prompt}])
    out = next(b.input for b in resp.content if b.type == "tool_use")
    valid_urls = {u for u, _ in links}
    return [p for p in out.get("picks", []) if p.get("url") in valid_urls and p.get("role") in ROLES]


def run_one(product):
    pid = product["product_id"]
    pages = product.setdefault("pages", {})
    top = pages.get("top")
    if not top:
        print(f"{pid}: top なし skip")
        return False
    if any(r in pages for r in ("product", "spec")):
        print(f"{pid}: 既に展開済み skip")
        return False
    r = fetch(top)
    if r.status != 200 or not r.html:
        print(f"{pid}: top 取得失敗 ({r.status})")
        return False
    links = collect_links(top, r.html)
    if not links:
        print(f"{pid}: 内部リンクなし")
        return False
    picks = pick_llm(product, links)
    added = 0
    for p in picks:
        role = p["role"]
        if role in pages:
            continue
        pages[role] = p["url"]
        added += 1
        print(f"{pid}: +{role} {p['url']}  ({p['why'][:40]})")
    if not picks:
        print(f"{pid}: 候補なし（LLM判定）")
    return added > 0


def main():
    load_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY 未設定", file=sys.stderr)
        return 3
    products = yaml.safe_load(REG.read_text(encoding="utf-8"))
    by_id = {p["product_id"]: p for p in products}
    args = sys.argv[1:]
    limit = None
    if "--limit" in args:
        limit = int(args[args.index("--limit") + 1])
    changed = 0
    if args and args[0] == "--all":
        targets = [p for p in products if p.get("status") == "active"]
        if limit:
            targets = targets[:limit]
        for p in targets:
            try:
                changed += 1 if run_one(p) else 0
            except Exception as e:  # noqa: BLE001
                print(f"{p['product_id']}: 失敗 {type(e).__name__}: {str(e)[:100]}", file=sys.stderr)
    elif args:
        changed += 1 if run_one(by_id[args[0]]) else 0
    else:
        print("usage: discover_pages.py <product_id> | --all [--limit N]", file=sys.stderr)
        return 2
    if changed:
        REG.write_text(
            "# 商材レジストリ — A-1センサス + discover_pages によるページ役割展開\n"
            + yaml.safe_dump(products, allow_unicode=True, sort_keys=False),
            encoding="utf-8")
        print(f"registry 更新: {changed}商材にページ役割を追加")
    return 0


if __name__ == "__main__":
    sys.exit(main())
