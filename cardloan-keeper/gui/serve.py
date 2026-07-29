#!/usr/bin/env python3
"""cardloan-keeper 管制盤 — stdlib のみの薄いビュー層（fact-keeper GUI の思想を踏襲）

file-based の正典（registry / regstore / snapshots）をそのまま映す。DB化しない。
起動: ./.venv/bin/python gui/serve.py  (port 3003, localhost)
本番: pm2 start gui/serve.py --name cardloan-keeper-gui --interpreter .venv/bin/python
閲覧: ssh -f -N -L 3003:localhost:3003 s-tools-vps → http://localhost:3003/
"""
from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import yaml  # noqa: E402
import regstore  # noqa: E402

PORT = 3003


def load_products():
    return yaml.safe_load((ROOT / "registry" / "products.yaml").read_text(encoding="utf-8")) or []


def load_chunks():
    return json.loads((ROOT / "data" / "regstore" / "chunks.json").read_text(encoding="utf-8"))


def api_products():
    return load_products()


def api_sources():
    data = load_chunks()
    agg = {}
    for c in data["chunks"]:
        key = c["source"]
        a = agg.setdefault(key, {"source": key, "tier": c["source_tier"], "chunks": 0})
        a["chunks"] += 1
    return sorted(agg.values(), key=lambda x: (x["tier"], -x["chunks"]))


def api_regstore(params):
    q = (params.get("q") or [""])[0]
    pid = (params.get("product") or [""])[0]
    src = (params.get("source") or [""])[0]
    if q and pid:
        res = regstore.query([p.strip() for p in pid.split(",")], q, k=12)
        return [{"context": c["context"], "text": c["text"], "tier": c["source_tier"],
                 "source": c["source"]} for c in res]
    data = load_chunks()
    rows = [c for c in data["chunks"]
            if (not src or c["source"] == src) and (not q or q in c["text"] or q in c["context"])]
    return [{"context": c["context"], "text": c["text"], "tier": c["source_tier"],
             "source": c["source"]} for c in rows[:80]]


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
    return out


def api_check(body):
    from check_article import check
    pids = body.get("products") or []
    text = body.get("text") or ""
    if not text.strip():
        return {"error": "text required"}
    if not pids:
        # 商材未指定なら自動検出 (export/products.json の aliases)
        exp = json.loads((ROOT / "data" / "export" / "products.json").read_text(encoding="utf-8"))
        pids = [p["product_id"] for p in exp if any(a in text for a in p.get("aliases", []))] or ["acom"]
    return check(pids, text)


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
            if u.path == "/" or u.path == "/index.html":
                html = (ROOT / "gui" / "index.html").read_bytes()
                return self._send(200, html, "text/html; charset=utf-8")
            if u.path == "/api/products":
                return self._send(200, api_products())
            if u.path == "/api/sources":
                return self._send(200, api_sources())
            if u.path == "/api/regstore":
                return self._send(200, api_regstore(params))
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
            return self._send(404, {"error": "not found"})
        except Exception as e:  # noqa: BLE001
            return self._send(500, {"error": f"{type(e).__name__}: {e}"})


if __name__ == "__main__":
    print(f"[cardloan-keeper-gui] http://localhost:{PORT}/")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
