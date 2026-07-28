#!/usr/bin/env python3
"""制度知識ストア — 関連法規の原文を e-Gov 法令API(v2) から取得して条文単位でナレッジ化する。
fact-keeper ingest_law.py のカードローン移植版。

方針: LLMに法知識を生成させず、一次条文の原文を取得してそれをベースに構築する。

出典: e-Gov法令検索 法令API v2  https://laws.e-gov.go.jp/api/2/law_data/{lawId}
      条文の公式URL          https://laws.e-gov.go.jp/law/{lawId}
ライセンス: e-Gov法令データは出典明示で自由利用可（政府標準利用規約）。

クレカ版からの変更点（カードローン規制の法体系）:
  - 追加: 利息制限法・出資法・銀行法（銀行カードローンの規制主体）
  - 継続: 貸金業法（消金・信販の中核）・景表法・消費者契約法
  - bnpl向けに継続: 割賦販売法・資金決済法

出力: data/regstore/institutional/<slug>.json
実行: ./.venv/bin/python scripts/ingest_law.py
"""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "regstore" / "institutional"
JST = timezone(timedelta(hours=9))
API = "https://laws.e-gov.go.jp/api/2/law_data/{}"
LAW_URL = "https://laws.e-gov.go.jp/law/{}"

# 対象法令（カードローン表現規制に効く順）。law_id は e-Gov 法令ID。
# 議員立法は AC1、閣法は AC0（貸金業法=AC1 が既知の落とし穴）。
# law_id が不確かなものは candidates で AC0/AC1 の両方を試す。
LAWS = [
    ("keihyoho", "不当景品類及び不当表示防止法（景品表示法）", ["337AC0000000134"]),
    ("kashikin", "貸金業法", ["358AC1000000032"]),
    ("risoku_seigen", "利息制限法", ["329AC0000000100", "329AC1000000100"]),
    ("shusshi", "出資の受入れ、預り金及び金利等の取締りに関する法律（出資法）", ["329AC1000000195", "329AC0000000195"]),
    ("ginko", "銀行法", ["356AC0000000059", "356AC1000000059"]),
    ("shohisha_keiyaku", "消費者契約法", ["412AC0000000061"]),
    ("kappan", "割賦販売法", ["336AC0000000159"]),
    ("shikin_kessai", "資金決済に関する法律（資金決済法）", ["421AC0000000059"]),
]

# カードローン表現規制に効く語（ad_relevant フラグ用。網羅でなく目印）
AD_WORDS = ["広告", "表示", "勧誘", "景品", "誇大", "著しく", "優良", "有利",
            "誤認", "断定的", "虚偽", "不当", "情報提供", "書面", "説明",
            "利息", "金利", "貸付", "取立", "過剰", "返済能力"]


def node_tag(n):
    return n.get("tag") if isinstance(n, dict) else None


def sentences(node):
    """配下の全 Sentence の文字列(children内のstr)を順に連結。原文をそのまま保持。"""
    out = []
    stack = [node]
    while stack:
        n = stack.pop(0)
        if not isinstance(n, dict):
            continue
        if n.get("tag") == "Sentence":
            for c in n.get("children", []) or []:
                if isinstance(c, str):
                    out.append(c.strip())
        else:
            stack = (n.get("children", []) or []) + stack
    return "".join(out)


def first_text(node, tag_name):
    """指定タグの直下テキスト（ArticleCaption/ArticleTitle 用）。"""
    for c in node.get("children", []) or []:
        if isinstance(c, dict) and c.get("tag") == tag_name:
            for x in c.get("children", []) or []:
                if isinstance(x, str):
                    return x.strip()
    return ""


def parse_articles(root):
    arts = []
    stack = [root]
    while stack:
        n = stack.pop(0)
        if not isinstance(n, dict):
            continue
        if n.get("tag") == "Article":
            num = (n.get("attr") or {}).get("Num", "")
            cap = first_text(n, "ArticleCaption")
            title = first_text(n, "ArticleTitle")
            parts = []
            for c in n.get("children", []) or []:
                if isinstance(c, dict) and c.get("tag") in ("ArticleCaption", "ArticleTitle"):
                    continue
                parts.append(sentences(c))
            text = "".join(parts).strip()
            blob = cap + title + text
            arts.append({"num": num, "caption": cap, "title": title, "text": text,
                         "ad_relevant": any(w in blob for w in AD_WORDS)})
            continue  # Article はネストしない前提
        stack = (n.get("children", []) or []) + stack
    return arts


def fetch(law_id):
    req = urllib.request.Request(API.format(law_id),
                                 headers={"User-Agent": "cardloan-keeper/regstore"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read())


def fetch_first(candidates):
    """law_id 候補を順に試し、最初に law_full_text が取れたものを返す。"""
    last_err = None
    for law_id in candidates:
        try:
            d = fetch(law_id)
            if d.get("law_full_text"):
                return law_id, d
        except Exception as e:
            last_err = e
    if last_err:
        raise last_err
    return None, None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    summary = []
    for slug, name, candidates in LAWS:
        try:
            law_id, d = fetch_first(candidates)
            if not d:
                print(f"✗ {slug}: law_full_text 無し（候補{candidates}）")
                summary.append((slug, "本文無し", 0))
                continue
            lf = d["law_full_text"]
            law_num = (d.get("law_info") or {}).get("law_num", "")
            title_official = (d.get("revision_info") or {}).get("law_title", name)
            arts = parse_articles(lf)
            ad_n = sum(1 for a in arts if a["ad_relevant"])
            doc = {"law_name": name, "law_title_official": title_official,
                   "law_id": law_id, "law_num": law_num,
                   "source_url": LAW_URL.format(law_id),
                   "source": "e-Gov法令検索 法令API v2（政府標準利用規約）",
                   "fetched_at": datetime.now(JST).isoformat(),
                   "article_count": len(arts), "ad_relevant_count": ad_n,
                   "articles": arts}
            (OUT / f"{slug}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1),
                                              encoding="utf-8")
            print(f"✓ {slug:18} {name[:24]:24} 全{len(arts):3}条 / 表現規制関連{ad_n:3}条")
            summary.append((slug, "ok", len(arts)))
        except Exception as e:
            print(f"✗ {slug}: {type(e).__name__} {str(e)[:80]}")
            summary.append((slug, "例外", 0))
    ok = sum(1 for _, s, _ in summary if s == "ok")
    print(f"\n制度知識ストア: {ok}/{len(LAWS)}法令取得 → {OUT}")


if __name__ == "__main__":
    main()
