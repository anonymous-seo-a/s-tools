#!/usr/bin/env python3
"""Playwright 単一URL取得ワーカー（fetch.py がサブプロセスとして起動する）

親（fetch.py）から `python _pw_worker.py <url> <out_html_path>` で呼ばれる。
1回の取得だけを行い、HTMLをout_htmlに書き、最終行に `STATUS <code>` を出力して終了する。

このプロセスを丸ごと別プロセスグループで起動し、ハング時は親が killpg で
Chromiumごと確実に殺せるようにするのが目的（Playwrightのgotoタイムアウトが
効かずハングする実例を2026-07-08に確認したための隔離設計）。
"""
import sys

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36")


def main() -> int:
    url, out_path = sys.argv[1], sys.argv[2]
    status, html = 0, ""
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                args=["--no-sandbox", "--disable-blink-features=AutomationControlled",
                      "--disable-dev-shm-usage"])
            ctx = browser.new_context(user_agent=UA, locale="ja-JP",
                                      viewport={"width": 1366, "height": 900})
            page = ctx.new_page()
            page.set_default_timeout(35000)
            try:
                resp = page.goto(url, timeout=35000, wait_until="domcontentloaded")
                page.wait_for_timeout(2500)  # 重いJSページのレンダリング待ち
                html = page.content()
                status = resp.status if resp else 0
            finally:
                browser.close()
    except Exception as e:
        print(f"WORKER_ERR {type(e).__name__}", file=sys.stderr)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"STATUS {status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
