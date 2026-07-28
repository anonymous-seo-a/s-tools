#!/usr/bin/env python3
"""記事チェック — 記事ドラフトを、保持している表記規制（クライアント公式規約＋推定ルール＋法令原文）に
照らして違反候補を洗い出す。成功基準「パトロール指摘ゼロ」を適用前に自走化する。
fact-keeper check_article.py のカードローン移植版。

構成:
  1. regstore（クライアント公式規制CSV＋措置命令ベースの推定ルール）を記事文で検索
  2. 制度知識（貸金業法・景表法等の条文原文）から表現規制関連の条文を関連語で検索
  3. LLM が「ドラフト中の具体的表現 × 取得したルール」を突合し、違反候補のみ返す（ルート無き指摘はしない）

出力: {violations:[{excerpt, rule, source, tier, severity, why, suggested_fix}], rules_checked, ...}

CLI: ./.venv/bin/python scripts/check_article.py <product_id[,id2]> <<< "記事本文"
     ./.venv/bin/python scripts/check_article.py acom --json <<< "本文"   # JSON出力（rewrite側L3ゲート用）
importable: from check_article import check
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import regstore  # noqa: E402
from util import load_env  # noqa: E402

MODEL = "claude-opus-4-8"
INST = ROOT / "data" / "regstore" / "institutional"

# カードローン記事に頻出する高リスク表現 → 制度知識で引く条文キーワード
RISK_TERMS = ["誇大", "優良", "有利", "誤認", "断定", "必ず", "確実", "無料",
              "金利", "無利息", "審査", "在籍確認", "即日", "最短", "総量規制",
              "甘い", "ゆるい", "ブラック", "無審査", "バレ", "内緒", "No.1", "限定", "先着"]


def gather_client_rules(product_ids, text, k=10):
    chunks = regstore.query(product_ids, text, k=k)
    out = []
    for c in chunks:
        out.append({"rule": c["text"][:600], "context": c.get("context", ""),
                    "source": c.get("source", ""), "tier": c.get("source_tier", "")})
    return out


def gather_law_articles(text, limit=8):
    """制度知識から、記事に出た高リスク語を含む表現規制関連条を寄せる。"""
    if not INST.is_dir():
        return []
    present = [t for t in RISK_TERMS if t in text]
    hits, seen = [], set()
    for p in sorted(INST.glob("*.json")):
        doc = json.loads(p.read_text(encoding="utf-8"))
        for a in doc["articles"]:
            if not a["ad_relevant"]:
                continue
            blob = a["caption"] + a["text"]
            if any(t in blob for t in present) or any(t in a["text"] for t in ("表示", "広告", "誇大")):
                key = (doc["law_name"], a["num"])
                if key in seen:
                    continue
                seen.add(key)
                hits.append({"law": doc["law_name"], "article": f"第{a['num']}条",
                             "caption": a["caption"], "text": a["text"][:400],
                             "source_url": f"{doc['source_url']}#Mp-At_{a['num']}"})
    # リスク語一致を優先
    hits.sort(key=lambda h: not any(t in (h["caption"] + h["text"]) for t in present))
    return hits[:limit]


TOOL = {
    "name": "report_violations",
    "description": "記事ドラフトの表記規制違反候補を報告する。取得ルールに紐づかない指摘はしない。",
    "input_schema": {
        "type": "object",
        "properties": {
            "violations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "excerpt": {"type": "string", "description": "ドラフト中の該当表現（原文のまま抜粋）"},
                        "rule_cited": {"type": "string", "description": "根拠にした規約/条文の要点"},
                        "source": {"type": "string", "description": "出所（例: アコム公式規制 / 貸金業法第16条 / 措置命令）"},
                        "tier": {"type": "string", "enum": ["client_official", "law", "inferred"],
                                 "description": "根拠の格。client_official=クライアント公式 / law=法令原文 / inferred=措置命令等からの推定"},
                        "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                        "why": {"type": "string", "description": "なぜ違反か（優良誤認/有利誤認/注記漏れ/指定表記違反等）"},
                        "suggested_fix": {"type": "string", "description": "どう直すか（具体的な修正案・注記文言）"}
                    },
                    "required": ["excerpt", "rule_cited", "source", "tier", "severity", "why", "suggested_fix"]
                }
            },
            "overall": {"type": "string", "description": "総評（大きな問題の有無）"}
        }, "required": ["violations", "overall"]
    }
}

SYS = """あなたはカードローン（消費者金融・銀行）アフィリエイト記事の適用前チェック担当。与えられた記事ドラフトを、
提示された『表記規制ルール』（クライアント公式規制・法令条文・措置命令ベースの推定ルール）だけに照らして、
違反候補を洗い出す。

厳守:
- 提示ルールに紐づく指摘のみ。ルート無き一般論・記憶の法知識で指摘しない。紐づかない懸念は挙げない。
- excerpt はドラフト本文から原文のまま抜粋する（言い換えない）。該当が無ければ violations は空配列。
- クライアント公式規制(client_official)の違反を最優先。次に法令、次に推定。
- YMYL領域で特に厳しく見る点: 金利表記（上限/下限のみのピック比較・実質年率の欠落）、
  無利息期間（起算日・条件の欠落）、審査/融資speed（「最短」の条件注記漏れ）、
  在籍確認（「なし」断定 — 「原則電話による在籍確認なし」等の指定表記）、
  審査難易度の示唆（甘い/ゆるい/ブラックOK/無審査は完全NG）、貸付条件の断定、No.1表記の根拠。
- 会社別の指定表記・パートナー個別規制（例: アコムの返済シミュレーション禁止）は該当社の言及箇所全てで確認。
- suggested_fix は具体的に（指定表記の正文、注記の文言案、打消し表示の位置、断定回避の言い換え）。"""


def check(product_ids, text):
    if isinstance(product_ids, str):
        product_ids = [c.strip() for c in product_ids.split(",") if c.strip()]
    load_env()
    import anthropic
    client_rules = gather_client_rules(product_ids, text)
    laws = gather_law_articles(text)
    rules_block = "## クライアント公式規制・推定ルール\n"
    for r in client_rules:
        rules_block += f"- [{r['tier']}] {r['context']}: {r['rule'][:300]}\n"
    rules_block += "\n## 関連法令（原文）\n"
    for l in laws:
        rules_block += f"- {l['law']} {l['article']}（{l['caption']}）: {l['text'][:200]}\n"

    cl = anthropic.Anthropic()
    resp = cl.messages.create(
        model=MODEL, max_tokens=3000, system=SYS, tools=[TOOL],
        tool_choice={"type": "tool", "name": "report_violations"},
        messages=[{"role": "user", "content":
                   f"対象商材: {product_ids}\n\n{rules_block}\n\n"
                   f"=== 記事ドラフト ===\n{text[:12000]}\n\n"
                   f"上のルールに照らして違反候補を report_violations で報告して。"}])
    out = next(b.input for b in resp.content if b.type == "tool_use")
    return {"product_ids": product_ids, "violations": out.get("violations", []),
            "overall": out.get("overall", ""),
            "rules_checked": len(client_rules) + len(laws),
            "client_rules": len(client_rules), "law_articles": len(laws)}


def main():
    args = [a for a in sys.argv[1:] if a != "--json"]
    as_json = "--json" in sys.argv
    if not args:
        print("usage: check_article.py <product_id[,id2]> [--json]  (本文はstdin)", file=sys.stderr)
        return 1
    text = sys.stdin.read()
    if not text.strip():
        print("記事本文を stdin で渡すこと", file=sys.stderr)
        return 1
    res = check(args[0], text)
    if as_json:
        # rewrite-cardloan の L3 最終ゲートが child_process で消費する機械可読出力
        print(json.dumps(res, ensure_ascii=False))
        return 0
    print(f"チェック: {res['rules_checked']}ルール照合 "
          f"(公式/推定{res['client_rules']} + 法令{res['law_articles']})")
    print(f"総評: {res['overall']}\n")
    for v in res["violations"]:
        print(f"[{v['severity'].upper()}] 「{v['excerpt'][:50]}」")
        print(f"    抵触: {v['source']} — {v['why'][:70]}")
        print(f"    修正: {v['suggested_fix'][:90]}\n")
    if not res["violations"]:
        print("違反候補なし")
    return 0


if __name__ == "__main__":
    sys.exit(main())
