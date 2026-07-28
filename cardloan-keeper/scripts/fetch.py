#!/usr/bin/env python3
"""段階的フェッチャ — curl優先、ブロックサイトのみ実ブラウザにフォールバック

design/04 の収集層の下回り。ページ取得の唯一の入口。

段階:
  1. curl（ブラウザUA）: 高速・軽量。大半のサイト（smbc/jcb/rakuten/aeon/saison等170枚超）はこれで200
  2. Playwright フルChromium・ヘッド有り: Akamai等のbot検知で403/000になるサイト用
     （jaccs/diners/jreast/ヨドバシ等）。データセンターIPでも実画面なら通ることを2026-07-08実証。
     サーバー（DISPLAY無し）では `xvfb-run` 配下で実行すること。

返り値: FetchResult(status:int, html:str, method:str)
  status = HTTPステータス（curl/playwrightの実測）。取得不能は 0
  method = "curl" | "playwright" | "none"

Playwright未導入環境ではcurlのみで動作（フォールバックをスキップ）。
"""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36")
# curl成功とみなす最小ボディ長（JSシェルの空ページを弾く）
MIN_BODY = 800
# Playwrightワーカーの壁時計上限（超過でChromiumごとkillpg）。worker goto 35s + 余裕
PW_HARD_TIMEOUT = 70
_WORKER = str(Path(__file__).resolve().parent / "_pw_worker.py")


@dataclass
class FetchResult:
    status: int
    html: str
    method: str

    @property
    def ok(self) -> bool:
        return self.status == 200 and len(self.html) >= MIN_BODY


import re as _re

_CHARSET_META = _re.compile(rb'charset=["\']?\s*([\w\-]+)', _re.I)
_ENC_ALIAS = {"shift_jis": "cp932", "shift-jis": "cp932", "sjis": "cp932",
              "x-sjis": "cp932", "windows-31j": "cp932", "ms932": "cp932"}


def _decode(raw: bytes, ctype: str = "") -> str:
    """日本語サイトの文字化け対策: HTTP charset→HTMLメタcharset→utf-8/cp932/euc-jp を strict で順に試す。
    Shift_JISページをUTF-8で読んで化ける事故（epos等）を根治する。"""
    if not raw:
        return ""
    encs = []
    m = _re.search(r"charset=([\w\-]+)", ctype or "", _re.I)
    if m:
        encs.append(m.group(1))
    mm = _CHARSET_META.search(raw[:3072])
    if mm:
        encs.append(mm.group(1).decode("ascii", "ignore"))
    encs += ["utf-8", "cp932", "euc-jp"]
    for enc in encs:
        if not enc:
            continue
        try:
            return raw.decode(_ENC_ALIAS.get(enc.lower().strip(), enc), errors="strict")
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", errors="replace")


def _curl(url: str, timeout: int = 25) -> FetchResult:
    try:
        # バイトで取得し、charsetを自前検出（text=Trueだと常にUTF-8扱いで化ける）
        r = subprocess.run(
            ["curl", "-sS", "-L", "--compressed", "--max-time", str(timeout),
             "-A", UA, "-H", "Accept-Language: ja,en;q=0.8",
             "-w", "\n%{http_code}\n%{content_type}", url],
            capture_output=True, timeout=timeout + 5)
        out = r.stdout
        # 末尾2行 = http_code, content_type（-w 指定）を分離、残りが本文バイト
        parts = out.rsplit(b"\n", 2)
        if len(parts) == 3:
            body_b, code_b, ctype_b = parts
            code = int(code_b or b"0")
            ctype = ctype_b.decode("ascii", "ignore")
        else:
            body_b, code, ctype = out, 0, ""
        return FetchResult(code, _decode(body_b, ctype), "curl")
    except Exception:
        return FetchResult(0, "", "curl")


def _playwright(url: str) -> FetchResult:
    """隔離サブプロセスでPlaywright取得。ハングしてもプロセスグループごと確実にkill。

    Chromium起動コストを毎回払う代わりに、1URLのハングが全体を止めない堅牢性を取る
    （日次cron無人運用のため。goto timeoutが効かずChromiumがハングする実例あり）。
    """
    if not Path(_WORKER).exists():
        return FetchResult(0, "", "none")
    tmp = tempfile.NamedTemporaryFile(suffix=".html", delete=False)
    tmp.close()
    proc = None
    try:
        proc = subprocess.Popen(
            [sys.executable, _WORKER, url, tmp.name],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, start_new_session=True)  # 別プロセスグループ＝killpg対象
        try:
            out, _ = proc.communicate(timeout=PW_HARD_TIMEOUT)
        except subprocess.TimeoutExpired:
            # ハング: Chromium含むプロセスグループを丸ごと強制終了
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except Exception:
                pass
            proc.wait(timeout=5)
            return FetchResult(0, "", "playwright")
        status = 0
        for line in (out or "").splitlines():
            if line.startswith("STATUS "):
                status = int(line.split()[1])
        html = Path(tmp.name).read_text(encoding="utf-8", errors="replace")
        return FetchResult(status, html, "playwright")
    except Exception:
        if proc and proc.poll() is None:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except Exception:
                pass
        return FetchResult(0, "", "playwright")
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


def _curl_cffi(url: str, timeout: int = 30) -> FetchResult:
    """TLS指紋偽装（curl_cffi・Chrome impersonation）。

    Akamai系はTLS(JA4)層でcurlを弾く（HTMLが返る前に403/切断）。curl_cffiは実Chromeの
    ClientHelloを再現するため、この層だけで落とされるサイトを追加コストゼロで通す。
    IPレピュテーション層で弾かれるサイトには効かない（それはproxyの領域＝今回は不採用）。
    """
    try:
        from curl_cffi import requests as cffi_requests
        resp = cffi_requests.get(url, impersonate="chrome", timeout=timeout,
                                 headers={"Accept-Language": "ja,en;q=0.8"})
        # .text は charset 誤判定で化けるため content(bytes)+自前検出でデコード
        return FetchResult(resp.status_code,
                           _decode(resp.content, resp.headers.get("content-type", "")),
                           "curl_cffi")
    except Exception:
        return FetchResult(0, "", "curl_cffi")


def fetch(url: str, allow_browser: bool = True) -> FetchResult:
    """URLを取得。curl → curl_cffi(TLS偽装) → ブラウザ の三段フォールバック。

    重いJSページはブラウザ取得が不安定なため、status=0（取得失敗）時に限り1回だけ再試行する。
    """
    r = _curl(url)
    if r.ok:
        return r
    c = _curl_cffi(url)                 # TLS層で弾かれるサイト（Akamai等）の救済
    if c.ok:
        return c
    if allow_browser:
        b = _playwright(url)
        if not b.status:                # 取得失敗（ハング隔離含む）→ 1回だけ再試行
            b = _playwright(url)
        if b.status:
            return b
    return c if c.status else r  # 最も情報のある失敗結果を返す


def close():
    """後方互換用のno-op（ワーカー方式では常駐ブラウザを持たない）。"""
    return


if __name__ == "__main__":
    import sys
    for u in sys.argv[1:]:
        res = fetch(u)
        print(f"{res.status:<4} {res.method:<11} {len(res.html):>7}B  {u}")
    close()
