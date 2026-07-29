#!/usr/bin/env python3
"""cardloan-keeper 管制盤 v2 — stdlib のみの薄いビュー層（fact-keeper GUI と同等機能へ）

file-based の正典（registry / facts / regstore / institutional / snapshots）をそのまま映す。
パネル: 商材(一覧+詳細facts 4点セット+充足率) / 比較 / レギュレーション / 記事チェック /
        制度知識(法令) / 保持者チャット(ツールループ) / スナップショット

起動: ./.venv/bin/python gui/serve.py  (port 3003, localhost)
本番: pm2 cardloan-keeper-gui / 閲覧: ssh -f -N -L 3003:localhost:3003 s-tools-vps
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import yaml  # noqa: E402
import regstore  # noqa: E402
from util import load_env  # noqa: E402

PORT = int(os.environ.get("KEEPER_GUI_PORT", 3003))
FACTS = ROOT / "data" / "facts"
INST = ROOT / "data" / "regstore" / "institutional"

# 充足率の分母となる中核 fact_key（種別で保証会社/登録番号を切替）
CORE_KEYS = ["interest_rate", "interest_free", "limit_amount", "examination_time",
             "funding_speed", "employment_check", "application_conditions",
             "income_proof", "repayment", "atm", "web_completion", "card_less"]

FACT_LABEL = {
    "official_name": "正式名称", "interest_rate": "貸付利率(実質年率)", "interest_free": "無利息サービス",
    "limit_amount": "利用限度額", "examination_time": "審査時間", "funding_speed": "融資スピード",
    "employment_check": "在籍確認", "application_conditions": "申込条件", "income_proof": "収入証明書",
    "repayment": "返済方式", "atm": "利用ATM", "web_completion": "WEB完結",
    "card_less": "カードレス", "guarantee_company": "保証会社", "license_number": "貸金業登録番号",
    "total_quantity_regulation": "総量規制", "campaigns": "キャンペーン",
}


def _fixenc(s):
    """http.server はリクエスト行を latin-1 で読むため、生UTF-8のURLが化ける。復元可能なら復元。"""
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def load_products():
    return yaml.safe_load((ROOT / "registry" / "products.yaml").read_text(encoding="utf-8")) or []


def load_facts(pid):
    p = FACTS / f"{pid}.json"
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def load_chunks():
    return json.loads((ROOT / "data" / "regstore" / "chunks.json").read_text(encoding="utf-8"))


def core_keys_for(ptype):
    keys = list(CORE_KEYS)
    keys.append("guarantee_company" if str(ptype).startswith("bank") else "license_number")
    return keys


def coverage_of(product, facts_doc):
    keys = core_keys_for(product.get("type", ""))
    if not facts_doc:
        return {"pct": 0, "have": 0, "total": len(keys), "unstated": 0}
    live = {f["fact_key"]: f for f in facts_doc["facts"] if f.get("status") != "absent_in_latest"}
    have = unst = 0
    for k in keys:
        f = live.get(k)
        if not f:
            continue
        if isinstance(f["value"], dict) and f["value"].get("unstated"):
            unst += 1
        else:
            have += 1
    return {"pct": round(100 * (have + unst) / len(keys)), "have": have,
            "total": len(keys), "unstated": unst}


def humanize_fact(f):
    """factレコード → 人間可読の書き下し（値と条件の不可分表示）。"""
    v = f["value"]
    if isinstance(v, dict) and v.get("unstated"):
        return "公式に記載なし（確認済み）"
    if not isinstance(v, dict):
        return str(v)
    k = f["fact_key"]
    if k == "interest_rate":
        parts = []
        if v.get("min_pct") is not None and v.get("max_pct") is not None:
            parts.append(f"{v['min_pct']}%〜{v['max_pct']}%")
        for b in v.get("brackets") or []:
            parts.append(f"{b['label']}: {b['rate_pct']}%")
        if v.get("note"):
            parts.append(f"「{v['note']}」")
        return " / ".join(parts) or json.dumps(v, ensure_ascii=False)
    if k == "limit_amount":
        def yen(n):
            return f"{n // 10000}万円" if n and n >= 10000 else (f"{n}円" if n is not None else "?")
        rng = ""
        if v.get("max_yen"):
            rng = (yen(v.get("min_yen")) + "〜" if v.get("min_yen") else "最大") + yen(v["max_yen"])
        return (rng + ("　「" + v["note"] + "」" if v.get("note") else "")) or json.dumps(v, ensure_ascii=False)
    if k == "interest_free":
        parts = []
        if v.get("days"):
            parts.append(f"{v['days']}日間")
        if v.get("trigger_note"):
            parts.append(f"起算: {v['trigger_note']}")
        if v.get("note"):
            parts.append(f"「{v['note']}」")
        return " / ".join(parts)
    if k == "official_name":
        return f"{v.get('product_name', '')}（{v.get('company_name', '')}）"
    if k == "campaigns":
        return " / ".join(f"{c['name']}（〜{c.get('valid_until') or '終了日記載なし'}）"
                          for c in v.get("items", []))
    # 汎用: note を主、他の非空値を従
    note = v.get("note") or ""
    rest = {kk: x for kk, x in v.items() if kk != "note" and x not in (None, "", [])}
    s = note
    if rest:
        s += ("　" if s else "") + json.dumps(rest, ensure_ascii=False)
    return s or json.dumps(v, ensure_ascii=False)


# ---- API ----

def api_products():
    rows = []
    for p in load_products():
        fd = load_facts(p["product_id"])
        cov = coverage_of(p, fd)
        rows.append({**{k: p.get(k) for k in ("product_id", "name", "company", "type", "status", "note")},
                     "pages": p.get("pages") or {}, "coverage": cov,
                     "extracted_at": (fd or {}).get("extracted_at")})
    return rows


def api_product(pid):
    products = {p["product_id"]: p for p in load_products()}
    p = products.get(pid)
    if not p:
        return {"error": "not found"}
    fd = load_facts(pid)
    facts = []
    if fd:
        for f in fd["facts"]:
            facts.append({
                "fact_key": f["fact_key"], "label": FACT_LABEL.get(f["fact_key"], f["fact_key"]),
                "human": humanize_fact(f), "value": f["value"],
                "conditions": f.get("conditions", []), "source_url": f.get("source_url"),
                "verified_at": f.get("verified_at"), "confidence": f.get("confidence"),
                "status": f.get("status"), "history": f.get("history", []),
                "unstated": isinstance(f["value"], dict) and bool(f["value"].get("unstated")),
            })
    # 適用レギュレーション（この商材にスコープが当たるチャンク）
    try:
        prod = products[pid]
        ptypes = regstore.product_types(prod)
        chunks = load_chunks()["chunks"]
        reg = [{"context": c["context"], "text": c["text"][:400], "tier": c["source_tier"]}
               for c in chunks if regstore._applies(c["scope"], prod, ptypes)]
    except Exception:  # noqa: BLE001
        reg = []
    # snapshot 状況
    snaps = []
    sd = ROOT / "data" / "snapshots" / pid
    if sd.is_dir():
        for role_dir in sorted(sd.iterdir()):
            if role_dir.is_dir():
                metas = sorted(role_dir.glob("*.meta.json"))
                if metas:
                    m = json.loads(metas[-1].read_text())
                    snaps.append({"role": role_dir.name, "url": m.get("url"),
                                  "fetched_at": m.get("fetched_at"), "chars": m.get("chars")})
    return {"product": p, "coverage": coverage_of(p, fd), "facts": facts,
            "extraction_notes": (fd or {}).get("extraction_notes", ""),
            "extracted_at": (fd or {}).get("extracted_at"),
            "regulations": reg[:40], "snapshots": snaps}


def api_compare(params):
    ids = [x for x in (params.get("ids") or [""])[0].split(",") if x]
    products = {p["product_id"]: p for p in load_products()}
    keys = ["interest_rate", "interest_free", "limit_amount", "examination_time",
            "funding_speed", "employment_check", "application_conditions",
            "web_completion", "guarantee_company", "license_number"]
    cols = []
    for pid in ids[:6]:
        p = products.get(pid)
        if not p:
            continue
        fd = load_facts(pid)
        live = {f["fact_key"]: f for f in (fd or {}).get("facts", [])
                if f.get("status") != "absent_in_latest"}
        col = {"product_id": pid, "name": p["name"], "cells": {}}
        for k in keys:
            f = live.get(k)
            col["cells"][k] = {"human": humanize_fact(f) if f else "（未抽出）",
                               "conditions": (f or {}).get("conditions", [])[:3]}
        cols.append(col)
    return {"keys": [{"key": k, "label": FACT_LABEL.get(k, k)} for k in keys], "columns": cols}


def api_sources():
    agg = {}
    for c in load_chunks()["chunks"]:
        a = agg.setdefault(c["source"], {"source": c["source"], "tier": c["source_tier"], "chunks": 0})
        a["chunks"] += 1
    return sorted(agg.values(), key=lambda x: (x["tier"], -x["chunks"]))


def api_regstore(params):
    q = _fixenc((params.get("q") or [""])[0])
    pid = (params.get("product") or [""])[0]
    src = _fixenc((params.get("source") or [""])[0])
    if q and pid:
        res = regstore.query([p.strip() for p in pid.split(",")], q, k=12)
        return [{"context": c["context"], "text": c["text"], "tier": c["source_tier"],
                 "source": c["source"]} for c in res]
    rows = [c for c in load_chunks()["chunks"]
            if (not src or c["source"] == src) and (not q or q in c["text"] or q in c["context"])]
    return [{"context": c["context"], "text": c["text"], "tier": c["source_tier"],
             "source": c["source"]} for c in rows[:80]]


def api_laws(params):
    q = _fixenc((params.get("q") or [""])[0])
    if not q or not INST.is_dir():
        return []
    hits = []
    for p in sorted(INST.glob("*.json")):
        doc = json.loads(p.read_text(encoding="utf-8"))
        for a in doc["articles"]:
            blob = (a.get("caption") or "") + (a.get("title") or "") + a["text"]
            if q in blob:
                hits.append({"law": doc["law_name"], "num": a["num"], "caption": a.get("caption", ""),
                             "text": a["text"][:600], "source_url": doc["source_url"]})
            if len(hits) >= 40:
                return hits
    return hits


def api_snapshot():
    snap = ROOT / "data" / "snapshots"
    logs = ROOT / "data" / "logs"
    out = {"products_with_snapshots": 0, "pages": 0, "digest": "", "digest_file": ""}
    if snap.is_dir():
        dirs = [d for d in snap.iterdir() if d.is_dir()]
        out["products_with_snapshots"] = len(dirs)
        out["pages"] = sum(1 for d in dirs for r in d.iterdir() if r.is_dir())
    if logs.is_dir():
        digests = sorted(logs.glob("digest_*.txt"))
        if digests:
            out["digest_file"] = digests[-1].name
            out["digest"] = digests[-1].read_text(encoding="utf-8")[-8000:]
        pipes = sorted(logs.glob("facts_pipeline_*.log"))
        if pipes:
            out["pipeline_log"] = pipes[-1].name
            out["pipeline_tail"] = pipes[-1].read_text(encoding="utf-8", errors="ignore")[-3000:]
    return out


def api_check(body):
    from check_article import check
    pids = body.get("products") or []
    text = body.get("text") or ""
    if not text.strip():
        return {"error": "text required"}
    if not pids:
        exp = json.loads((ROOT / "data" / "export" / "products.json").read_text(encoding="utf-8"))
        pids = [p["product_id"] for p in exp if any(a in text for a in p.get("aliases", []))] or ["acom"]
    return check(pids, text)


# ---- 保持者チャット（ツールループ）----

CHAT_TOOLS = [
    {"name": "search_products", "description": "商材を名称・会社名・種別で検索する",
     "input_schema": {"type": "object", "properties": {
         "query": {"type": "string"}, "type": {"type": "string", "description": "種別で絞る場合 (bank_net等)"}},
         "required": ["query"]}},
    {"name": "get_product", "description": "商材の保持facts（4点セット付き一次情報）を取得する",
     "input_schema": {"type": "object", "properties": {"product_id": {"type": "string"}},
                      "required": ["product_id"]}},
    {"name": "compare", "description": "複数商材のスペックを並べて取得する",
     "input_schema": {"type": "object", "properties": {
         "product_ids": {"type": "array", "items": {"type": "string"}}}, "required": ["product_ids"]}},
    {"name": "search_regulation", "description": "レギュレーション（クライアント公式規制+推定）を商材スコープ付きで検索する",
     "input_schema": {"type": "object", "properties": {
         "product_ids": {"type": "array", "items": {"type": "string"}}, "query": {"type": "string"}},
         "required": ["product_ids", "query"]}},
    {"name": "search_law", "description": "法令原文（貸金業法・景表法等8法令）を検索する",
     "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
]

CHAT_SYS = """あなたは cardloan-keeper の保持者エージェント。カードローン商材の検証済み一次情報（facts）と
レギュレーション・法令原文を保持し、それだけを根拠に答える。

厳守:
- 事実は必ずツールで取得した保持データから。保持していない事実は「保持していない」と正直に言う。記憶で補完しない。
- 数値・文言を答えるときは出典URL・確認日を併記する。
- 表現規制の質問は search_regulation（クライアント規制）を最優先、次に search_law（法令原文）。
- 停止商材（status=stopped）を薦めない。
- 回答は結論先行・簡潔に。"""


def chat_tool_exec(name, args):
    if name == "search_products":
        q = args.get("query", "")
        t = args.get("type", "")
        rows = [p for p in load_products()
                if (not t or p.get("type") == t)
                and (q in p.get("name", "") or q in p.get("company", "") or q in p["product_id"])]
        return [{"product_id": p["product_id"], "name": p["name"], "company": p.get("company"),
                 "type": p.get("type"), "status": p.get("status")} for p in rows[:12]]
    if name == "get_product":
        d = api_product(args.get("product_id", ""))
        if "error" in d:
            return d
        return {"product": d["product"], "coverage": d["coverage"],
                "facts": [{"label": f["label"], "human": f["human"], "conditions": f["conditions"],
                           "source_url": f["source_url"], "verified_at": f["verified_at"]}
                          for f in d["facts"] if f["status"] != "absent_in_latest"]}
    if name == "compare":
        return api_compare({"ids": [",".join(args.get("product_ids", []))]})
    if name == "search_regulation":
        res = regstore.query(args.get("product_ids", []), args.get("query", ""), k=8)
        return [{"context": c["context"], "text": c["text"][:500], "tier": c["source_tier"]} for c in res]
    if name == "search_law":
        return api_laws({"q": [args.get("query", "")]})
    return {"error": f"unknown tool {name}"}


def api_chat(body):
    load_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return {"error": "ANTHROPIC_API_KEY 未設定（チャットはVPSのみ）"}
    import anthropic
    client = anthropic.Anthropic()
    messages = body.get("messages") or []
    model = os.environ.get("CARDLOAN_KEEPER_MODEL", "claude-opus-4-8")
    for _ in range(8):  # ツールループ上限
        resp = client.messages.create(model=model, max_tokens=2500, system=CHAT_SYS,
                                      tools=CHAT_TOOLS, messages=messages)
        if resp.stop_reason != "tool_use":
            text = "".join(b.text for b in resp.content if b.type == "text")
            return {"reply": text}
        messages = messages + [{"role": "assistant", "content": [b.model_dump() for b in resp.content]}]
        results = []
        for b in resp.content:
            if b.type == "tool_use":
                try:
                    out = chat_tool_exec(b.name, b.input)
                except Exception as e:  # noqa: BLE001
                    out = {"error": f"{type(e).__name__}: {e}"}
                results.append({"type": "tool_result", "tool_use_id": b.id,
                                "content": json.dumps(out, ensure_ascii=False)[:12000]})
        messages = messages + [{"role": "user", "content": results}]
    return {"reply": "（ツールループ上限に達しました）"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        raw = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        u = urlparse(self.path)
        params = parse_qs(u.query)
        try:
            if u.path in ("/", "/index.html"):
                return self._send(200, (ROOT / "gui" / "index.html").read_bytes(),
                                  "text/html; charset=utf-8")
            if u.path == "/api/products":
                return self._send(200, api_products())
            if u.path.startswith("/api/product/"):
                return self._send(200, api_product(u.path.rsplit("/", 1)[1]))
            if u.path == "/api/compare":
                return self._send(200, api_compare(params))
            if u.path == "/api/sources":
                return self._send(200, api_sources())
            if u.path == "/api/regstore":
                return self._send(200, api_regstore(params))
            if u.path == "/api/laws":
                return self._send(200, api_laws(params))
            if u.path == "/api/snapshot":
                return self._send(200, api_snapshot())
            return self._send(404, {"error": "not found"})
        except Exception as e:  # noqa: BLE001
            return self._send(500, {"error": f"{type(e).__name__}: {e}"})

    def do_POST(self):
        u = urlparse(self.path)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            if u.path == "/api/check":
                return self._send(200, api_check(body))
            if u.path == "/api/chat":
                return self._send(200, api_chat(body))
            return self._send(404, {"error": "not found"})
        except Exception as e:  # noqa: BLE001
            return self._send(500, {"error": f"{type(e).__name__}: {e}"})


if __name__ == "__main__":
    print(f"[cardloan-keeper-gui] http://localhost:{PORT}/")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
