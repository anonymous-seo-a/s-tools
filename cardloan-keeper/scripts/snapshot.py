#!/usr/bin/env python3
"""ページスナップショット収集 — 差分駆動パイプラインの収集層（fact-keeper design/04 第1段の移植）

registry/products.yaml のページ役割レジストリを巡回し、HTMLと正規化テキストを保存、
前回スナップショットとの変更率を報告する。LLM不要（機械的diff）。

実行:
  ./.venv/bin/python scripts/snapshot.py         # 全商材全役割
  ./.venv/bin/python scripts/snapshot.py acom    # 1商材のみ

保存先: data/snapshots/<product_id>/<role>/<UTC時刻>.html / .txt / .meta.json（gitignore対象）
出力(1行/ページ): product_id role status 変更率 判定(unchanged/minor/STRUCT?)

判定の閾値（初期値は保守的に疑い側へ倒す）:
  変更率 > 0.35 → STRUCT?（構造変更の疑い。第2段=LLM値照合の対象）
  変更率 > 0    → minor（通常処理: 変わった箇所のみLLM抽出の対象）
取得失敗（タイムアウト・5xx）はリトライ対象として報告のみ。事実にもスナップショット履歴にも触れない。
"""
import difflib
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch import fetch as fetch_url, close as fetch_close  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SNAP = ROOT / "data" / "snapshots"
STRUCT_THRESHOLD = 0.35


class TextExtractor(HTMLParser):
    """script/style/noscript を除いた可視テキストを抽出（DOM正規化の初版）"""
    SKIP = {"script", "style", "noscript", "template"}

    def __init__(self):
        super().__init__()
        self._skip_depth = 0
        self.chunks = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip_depth += 1

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data):
        if not self._skip_depth:
            t = data.strip()
            if t:
                self.chunks.append(t)


def normalize(html: str) -> str:
    p = TextExtractor()
    p.feed(html)
    text = "\n".join(p.chunks)
    return re.sub(r"[ \t　]+", " ", text)


def latest_txt(dir_: Path):
    if not dir_.is_dir():
        return None
    txts = sorted(dir_.glob("*.txt"))
    return txts[-1] if txts else None


def change_ratio(old: str, new: str) -> float:
    sm = difflib.SequenceMatcher(None, old.splitlines(), new.splitlines(), autojunk=False)
    return round(1.0 - sm.ratio(), 4)


def load_registry():
    return yaml.safe_load((ROOT / "registry" / "products.yaml").read_text(encoding="utf-8")) or []


def main() -> int:
    only = sys.argv[1] if len(sys.argv) > 1 else None
    products = load_registry()
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    failures = 0

    for product in products:
        pid = product["product_id"]
        if only and pid != only:
            continue
        for role, page in (product.get("pages") or {}).items():
            url = page["url"] if isinstance(page, dict) else page
            dest = SNAP / pid / role
            prev = latest_txt(dest)
            raw = b""
            if url.lower().endswith(".pdf"):
                # 規約・商品概要説明書はPDF配布が多い。pypdfでテキスト化してHTML経路と同形に流す
                try:
                    import io
                    import urllib.request
                    from pypdf import PdfReader
                    with urllib.request.urlopen(urllib.request.Request(
                            url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as r:
                        raw = r.read()
                    pdf_text = "\n".join((pg.extract_text() or "") for pg in PdfReader(io.BytesIO(raw)).pages)
                    # 日本語埋込フォントでpypdfが化ける場合は pdftotext(poppler) に切替
                    jp = sum(1 for ch in pdf_text[:4000] if "぀" <= ch <= "ヿ" or "一" <= ch <= "鿿")
                    if jp < 50:
                        import subprocess
                        import tempfile
                        with tempfile.NamedTemporaryFile(suffix=".pdf") as tf:
                            tf.write(raw)
                            tf.flush()
                            alt = subprocess.run(["pdftotext", "-enc", "UTF-8", tf.name, "-"],
                                                 capture_output=True, timeout=60)
                            if alt.returncode == 0 and len(alt.stdout) > len(pdf_text.encode()) // 2:
                                pdf_text = alt.stdout.decode("utf-8", "ignore")
                    pdf_text = pdf_text[:30000]  # 長大規約の抽出入力保護

                    class _PdfRes:  # FetchResult互換
                        status, html, method = 200, pdf_text, "pdf"
                    res = _PdfRes()
                except Exception as e:
                    print(f"{pid:<24} {role:<10} PDF_FAIL    -       {str(e)[:40]}")
                    failures += 1
                    continue
            else:
                res = fetch_url(url)
            status, html = res.status, res.html
            if status != 200 or not html:
                print(f"{pid:<24} {role:<10} FETCH_FAIL  -       retry対象 (via {res.method}, status={status})")
                failures += 1
                continue  # 取得失敗は履歴に残さない

            text = normalize(html)
            # JSシェル対策: curlが200でもscript除去後のテキストが極小なら実描画で再取得
            if len(text) < 200 and res.method == "curl":
                from fetch import _playwright
                res2 = _playwright(url)
                if res2.status == 200:
                    text2 = normalize(res2.html)
                    if len(text2) > len(text):
                        res, html, text = res2, res2.html, text2
            dest.mkdir(parents=True, exist_ok=True)
            if res.method == "pdf" and raw:
                # 原本PDFも保存（テキスト化が化けた場合のnative ingestion用）
                (dest / f"{stamp}.pdf").write_bytes(raw)
            (dest / f"{stamp}.html").write_text(html, encoding="utf-8")
            (dest / f"{stamp}.txt").write_text(text, encoding="utf-8")
            meta = {
                "url": url, "fetched_at": now.isoformat(), "http_status": status,
                "fetch_method": res.method,
                "sha256": hashlib.sha256(text.encode()).hexdigest(), "chars": len(text),
            }
            (dest / f"{stamp}.meta.json").write_text(
                json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

            if prev is None:
                verdict, ratio_s = "baseline", "-"
            else:
                ratio = change_ratio(prev.read_text(encoding="utf-8"), text)
                ratio_s = f"{ratio:.2%}"
                verdict = ("unchanged" if ratio == 0
                           else "STRUCT?" if ratio > STRUCT_THRESHOLD else "minor")
            print(f"{pid:<24} {role:<10} {status} {res.method:<10} {ratio_s:<7} {verdict}")
    fetch_close()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
