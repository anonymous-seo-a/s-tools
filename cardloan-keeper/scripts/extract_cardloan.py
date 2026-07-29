#!/usr/bin/env python3
"""スペック抽出 — snapshot本文 → 4点セット付きfactレコード（fact-keeper extract.py の規律を移植）

工程: registry と最新snapshotを読む → Claude に tool-use で構造化抽出を強制
（値をLLMに"作らせない"、本文から"読み取らせる"）→ サーバ側で4点セット付与
（出典URL・確認日時・条件注記・変更履歴 append-only）→ data/facts/<product_id>.json

カードローン固有の規律:
  - 金利は実質年率の下限〜上限。貸付額別の固定率（エイワ型）は brackets に。%は転記のみ
  - 「最短◯分」等のスピード表記は必須注記（※審査により〜）と不可分に記録
  - 在籍確認は公式文言を verbatim で保持（言い換えない — 指定表記の源泉になる）
  - 無利息・在籍確認は記載が無いこと自体が比較事実 → UNSTATED昇格
  - 憶測ゼロ: 読み取れない/矛盾する値は記録せず extraction_notes に理由を書く

実行: ./.venv/bin/python scripts/extract_cardloan.py <product_id>
      ./.venv/bin/python scripts/extract_cardloan.py --all   (snapshot保有の全商材)
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from util import ROOT, load_env  # noqa: E402

SNAP = ROOT / "data" / "snapshots"
FACTS = ROOT / "data" / "facts"
DEFAULT_MODEL = os.environ.get("CARDLOAN_KEEPER_MODEL", "claude-opus-4-8")
MAX_TOTAL_CHARS = 48000
MAX_ROLE_CHARS = 16000

NOTE = {"type": "string", "description": "原文表現をそのまま（言い換えない）"}
CONDS = {"type": "array", "items": {"type": "string"},
         "description": "値に付随する条件・注記（※文言含む）を原文のまま"}

EXTRACT_TOOL = {
    "name": "record_loan_facts",
    "description": "カードローン/キャッシング商品のスペックを、本文に明記された事実だけ構造化して記録する。"
                   "本文に無い値は推測せず null。条件・注記（※）は値と不可分に保持する。",
    "input_schema": {
        "type": "object",
        "properties": {
            "official_name": {
                "type": ["object", "null"],
                "description": "商品の正式名称（本文の表記そのまま）と運営会社の正式表記",
                "properties": {"product_name": NOTE, "company_name": NOTE},
                "required": ["product_name", "company_name"],
            },
            "interest_rate": {
                "type": ["object", "null"],
                "description": "貸付利率。実質年率のレンジが本文明記ならmin/max。"
                               "貸付額別の固定率（例 10万円未満19.9436%）は brackets に。%は本文の転記のみ",
                "properties": {
                    "min_pct": {"type": ["number", "null"], "description": "下限（例 3.0）。本文明記のみ"},
                    "max_pct": {"type": ["number", "null"], "description": "上限（例 18.0）。本文明記のみ"},
                    "brackets": {"type": "array", "description": "貸付額別固定率。無ければ空配列",
                                 "items": {"type": "object",
                                           "properties": {"label": {"type": "string"},
                                                          "rate_pct": {"type": "number"}},
                                           "required": ["label", "rate_pct"]}},
                    "note": NOTE, "conditions": CONDS,
                },
                "required": ["min_pct", "max_pct", "brackets", "note", "conditions"],
            },
            "interest_free": {
                "type": ["object", "null"],
                "description": "無利息サービス。日数・起算日・適用条件は不可分（条件欠落表記はレギュ違反の源）。"
                               "本文に記載が無ければ null（サーバがUNSTATED昇格する）",
                "properties": {
                    "days": {"type": ["integer", "null"], "description": "無利息日数（例 30）"},
                    "trigger_note": {"type": "string",
                                     "description": "起算日の原文（例 契約日の翌日から / 初回借入の翌日から）"},
                    "note": NOTE, "conditions": CONDS,
                },
                "required": ["days", "trigger_note", "note", "conditions"],
            },
            "limit_amount": {
                "type": ["object", "null"],
                "properties": {
                    "min_yen": {"type": ["integer", "null"], "description": "下限（円）。1万円→10000"},
                    "max_yen": {"type": ["integer", "null"], "description": "上限（円）。800万円→8000000"},
                    "note": NOTE,
                },
                "required": ["min_yen", "max_yen", "note"],
            },
            "examination_time": {
                "type": ["object", "null"],
                "description": "審査時間。「最短◯分」は必ず付随注記（※申込状況により〜等）とセットで",
                "properties": {"note": NOTE, "conditions": CONDS},
                "required": ["note", "conditions"],
            },
            "funding_speed": {
                "type": ["object", "null"],
                "description": "融資までの時間。「最短◯分融資」「即日融資」等の本文表現と注記",
                "properties": {"note": NOTE, "conditions": CONDS},
                "required": ["note", "conditions"],
            },
            "employment_check": {
                "type": ["object", "null"],
                "description": "在籍確認。**公式の文言を一字一句そのまま**（例「原則、電話での在籍確認なし」）。"
                               "記載が無ければ null（サーバがUNSTATED昇格）",
                "properties": {
                    "phone": {"type": ["string", "null"], "enum": ["原則なし", "あり", "条件付き", None],
                              "description": "電話確認の扱い。本文から判定できる場合のみ"},
                    "note": NOTE, "conditions": CONDS,
                },
                "required": ["phone", "note", "conditions"],
            },
            "application_conditions": {
                "type": ["object", "null"],
                "description": "申込条件（年齢・収入）。専業主婦(夫)可否・学生可否が明記なら conditions へ",
                "properties": {
                    "age_min": {"type": ["integer", "null"]},
                    "age_max": {"type": ["integer", "null"],
                                "description": "上限年齢。「69歳以下」→69。本文明記のみ（記載なしは null、勝手に補わない）"},
                    "income_note": {"type": "string", "description": "収入条件の原文"},
                    "note": NOTE, "conditions": CONDS,
                },
                "required": ["age_min", "age_max", "income_note", "note", "conditions"],
            },
            "income_proof": {
                "type": ["object", "null"],
                "description": "収入証明書の要否・閾値（例 50万円超は必要）",
                "properties": {"note": NOTE, "conditions": CONDS},
                "required": ["note", "conditions"],
            },
            "repayment": {
                "type": ["object", "null"],
                "description": "返済方式・最低返済額",
                "properties": {"method_note": {"type": "string"}, "monthly_min_note": {"type": "string"},
                               "conditions": CONDS},
                "required": ["method_note", "monthly_min_note", "conditions"],
            },
            "atm": {
                "type": ["object", "null"],
                "description": "利用可能ATM・手数料。提携ATM名は本文の列挙どおり",
                "properties": {"note": NOTE, "fee_note": {"type": "string"}},
                "required": ["note", "fee_note"],
            },
            "web_completion": {
                "type": ["object", "null"],
                "description": "WEB完結・来店不要・郵送物なし等の可否。条件（口座指定等）は conditions に必ず",
                "properties": {"available": {"type": ["boolean", "null"]}, "note": NOTE, "conditions": CONDS},
                "required": ["available", "note", "conditions"],
            },
            "card_less": {
                "type": ["object", "null"],
                "properties": {"available": {"type": ["boolean", "null"]}, "note": NOTE},
                "required": ["available", "note"],
            },
            "guarantee_company": {
                "type": ["object", "null"],
                "description": "保証会社（銀行カードローンの比較事実）。本文明記のみ",
                "properties": {"name": {"type": "string"}, "note": NOTE},
                "required": ["name", "note"],
            },
            "license_number": {
                "type": ["object", "null"],
                "description": "貸金業登録番号（消金・信販）または銀行の免許表記。verbatim",
                "properties": {"note": NOTE},
                "required": ["note"],
            },
            "total_quantity_regulation": {
                "type": ["object", "null"],
                "description": "総量規制への言及が本文にある場合のみ（対象/対象外/例外貸付）。無ければnull",
                "properties": {"subject": {"type": ["string", "null"], "enum": ["対象", "対象外", "例外あり", None]},
                               "note": NOTE},
                "required": ["subject", "note"],
            },
            "campaigns": {
                "type": "array",
                "description": "期間性のあるキャンペーン（恒常サービスは含めない）。無ければ空配列",
                "items": {"type": "object",
                          "properties": {"name": {"type": "string"}, "description": {"type": "string"},
                                         "valid_until": {"type": ["string", "null"],
                                                         "description": "終了日 YYYY-MM-DD。本文に無ければnull"}},
                          "required": ["name", "description", "valid_until"]},
            },
            "extraction_notes": {
                "type": "string",
                "description": "省略した項目とその理由・矛盾・グレード/商品バリアントの混在等を正直に記す",
            },
        },
        "required": ["official_name", "interest_rate", "interest_free", "limit_amount",
                     "examination_time", "funding_speed", "employment_check",
                     "application_conditions", "income_proof", "repayment", "atm",
                     "web_completion", "card_less", "guarantee_company", "license_number",
                     "total_quantity_regulation", "campaigns", "extraction_notes"],
    },
}

ROLE_ORDER = ["product", "spec", "campaign", "faq", "top", "lp"]

# 記載が無いこと自体が比較事実になる項目（UNSTATED昇格・fact-keeper 2026-07-11方式）
UNSTATED_KEYS = ["interest_free", "employment_check", "web_completion", "guarantee_company"]


def latest_snapshot(pid, role):
    d = SNAP / pid / role
    if not d.is_dir():
        return None, None
    txts = sorted(d.glob("*.txt"))
    if not txts:
        return None, None
    meta_p = txts[-1].with_suffix(".meta.json")
    meta = json.loads(meta_p.read_text()) if meta_p.exists() else {}
    return txts[-1].read_text(encoding="utf-8"), meta


def gather_snapshots(pid, product):
    roles = list((product.get("pages") or {}).keys())
    roles = [r for r in ROLE_ORDER if r in roles] + [r for r in roles if r not in ROLE_ORDER]
    sections, rep_meta, total = [], None, 0
    for role in roles:
        text, meta = latest_snapshot(pid, role)
        if not text:
            continue
        if rep_meta is None:
            rep_meta = meta
        chunk = text[:MAX_ROLE_CHARS]
        if total + len(chunk) > MAX_TOTAL_CHARS:
            chunk = chunk[: max(0, MAX_TOTAL_CHARS - total)]
        if chunk:
            sections.append(f"===== ページ役割: {role}（出典: {meta.get('url', '')}）=====\n{chunk}")
            total += len(chunk)
    return ("\n\n".join(sections) if sections else None), (rep_meta or {})


def extract_llm(product, text):
    import anthropic
    client = anthropic.Anthropic()
    is_bank = str(product.get("type", "")).startswith("bank")
    prompt = (
        f"以下はカードローン/キャッシング商品「{product['name']}」（{product.get('company', '')}"
        f" / 種別: {product.get('type', '')}）の公式ページ本文（正規化済み）。\n"
        "本文に明記された事実だけを record_loan_facts で構造化して。\n\n"
        "【値の抽出・厳守】\n"
        "- 本文に無い数値・固有名詞は絶対に推測しない（null / 空配列）。憶測は誤情報になる。\n"
        "- %・日数・金額は本文の転記のみ。自分で計算・丸め・補完しない。\n"
        "- 「最短◯分」「即日」等のスピード表記は、付随する注記（※お申込み時間や審査により〜等）を"
        " conditions に必ずセットで記録する（注記と切り離した値は使えない）。\n"
        "- 在籍確認 employment_check.note は公式の文言を一字一句そのまま。言い換え・要約は禁止"
        "（この文言が記事の指定表記の源泉になる）。\n"
        "- 無利息 interest_free は日数・起算日（契約翌日/借入翌日）・初回限定等の条件を不可分に。\n"
        "- 複数商品（通常型/口座レス型/レディース/ビジネス等）が同一ページにある場合、"
        "**この商材の主商品に該当する値だけ**を記録し、バリアントの存在は extraction_notes に記す。\n"
        + ("- 銀行カードローン: 保証会社・口座要否・即日融資の可否表現に注意。総量規制の記述があれば記録。\n"
           if is_bank else
           "- 貸金業登録番号（○○財務局長(◯)第◯号 / ○○県知事(◯)第◯号）が本文にあれば verbatim で記録。\n")
        + "\n【記録の規律 — 人間確認なしで公開できる品質にする】\n"
        "- 記録するのは本文に明記されている値だけ。条件が付いていても conditions に記録できるなら記録してよい。\n"
        "- 値が読み取れない／複数記述が矛盾する場合はその項目を記録せず（null）、"
        "何を・なぜ省略したかを extraction_notes に必ず書く（欠落は正直に、憶測はゼロ）。\n"
        "- 記載が無い項目は素直に null にする（無利息・在籍確認の「記載なし」は重要な比較事実として扱われる）。\n\n"
        f"=== 本文 ===\n{text}"
    )
    resp = client.messages.create(
        model=DEFAULT_MODEL, max_tokens=6000,
        tools=[EXTRACT_TOOL], tool_choice={"type": "tool", "name": "record_loan_facts"},
        messages=[{"role": "user", "content": prompt}])
    return next(b.input for b in resp.content if b.type == "tool_use")


def to_fact_records(pid, source_url, extracted, now_iso):
    facts = []

    def rec(key, value, conditions, confidence="high"):
        return {"fact_id": f"{pid}.{key}", "fact_key": key, "value": value,
                "conditions": [c for c in (conditions or []) if c],
                "source_url": source_url, "verified_at": now_iso,
                "confidence": confidence, "status": "verified", "history": []}

    for key in ["official_name", "interest_rate", "limit_amount", "examination_time",
                "funding_speed", "application_conditions", "income_proof", "repayment",
                "atm", "card_less", "license_number", "total_quantity_regulation"]:
        v = extracted.get(key)
        if not v:
            continue
        conds = v.pop("conditions", []) if isinstance(v, dict) else []
        # 空値だけのレコードは残さない
        if isinstance(v, dict) and not any(x not in (None, "", []) for x in v.values()):
            continue
        facts.append(rec(key, v, conds))

    for key in UNSTATED_KEYS:
        v = extracted.get(key)
        if not v:
            facts.append(rec(key, {"unstated": True, "note": "確認した公式ページ群に記載なし"},
                             ["evidence: unstated_checked（記載が無いことの確認。断定ではない）"]))
            continue
        conds = v.pop("conditions", []) if isinstance(v, dict) else []
        facts.append(rec(key, v, conds))

    camps = [c for c in (extracted.get("campaigns") or []) if c.get("name")]
    if camps:
        facts.append(rec("campaigns", {"items": camps[:8]}, []))
    return facts


def merge_history(old_facts, new_facts, now_iso):
    old_by = {f["fact_id"]: f for f in old_facts}
    new_ids = {f["fact_id"] for f in new_facts}
    for nf in new_facts:
        of = old_by.get(nf["fact_id"])
        if of:
            nf["history"] = of.get("history", [])
            if of["value"] != nf["value"]:
                nf["history"] = nf["history"] + [{
                    "changed_at": now_iso, "old_value": of["value"], "new_value": nf["value"],
                    "source_url": nf["source_url"], "trigger": "diff"}]
    for of in old_facts:
        if of["fact_id"] in new_ids:
            continue
        kept = dict(of)
        if kept.get("status") != "absent_in_latest":
            kept["history"] = kept.get("history", []) + [{
                "changed_at": now_iso, "old_value": of["value"], "new_value": None,
                "source_url": of["source_url"], "trigger": "diff"}]
            kept["status"] = "absent_in_latest"
        new_facts.append(kept)
    return new_facts


def run_one(pid, products):
    product = products.get(pid)
    if not product:
        print(f"未登録: {pid}", file=sys.stderr)
        return False
    pages = product.get("pages") or {}
    source_url = next(iter(pages.values()), "") if pages else ""
    text, meta = gather_snapshots(pid, product)
    if not text:
        print(f"{pid}: snapshotなし（先に snapshot.py）", file=sys.stderr)
        return False
    now_iso = datetime.now(timezone.utc).astimezone().isoformat()
    extracted = extract_llm(product, text)
    facts = to_fact_records(pid, source_url, extracted, now_iso)
    FACTS.mkdir(parents=True, exist_ok=True)
    out = FACTS / f"{pid}.json"
    old = json.loads(out.read_text())["facts"] if out.exists() else []
    facts = merge_history(old, facts, now_iso)
    out.write_text(json.dumps(
        {"product_id": pid, "extracted_at": now_iso, "model": DEFAULT_MODEL,
         "source_url": source_url, "snapshot_sha256": meta.get("sha256"),
         "extraction_notes": extracted.get("extraction_notes", ""), "facts": facts},
        ensure_ascii=False, indent=2), encoding="utf-8")
    live = [f for f in facts if f.get("status") != "absent_in_latest"]
    unst = sum(1 for f in live if isinstance(f["value"], dict) and f["value"].get("unstated"))
    print(f"{pid}: {len(live)} facts（うちUNSTATED {unst}・引退 {len(facts) - len(live)}）")
    return True


def main():
    load_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY 未設定", file=sys.stderr)
        return 3
    products = {p["product_id"]: p
                for p in yaml.safe_load((ROOT / "registry" / "products.yaml").read_text(encoding="utf-8"))}
    if len(sys.argv) >= 2 and sys.argv[1] == "--all":
        targets = [pid for pid in products if (SNAP / pid).is_dir()]
        print(f"抽出対象: {len(targets)}商材（snapshot保有）")
        ok = fail = 0
        for pid in targets:
            try:
                ok += 1 if run_one(pid, products) else 0
            except Exception as e:  # noqa: BLE001
                fail += 1
                print(f"{pid}: 失敗 {type(e).__name__}: {str(e)[:120]}", file=sys.stderr)
        print(f"完了: 成功{ok} / 失敗{fail}")
        return 0
    if len(sys.argv) < 2:
        print("usage: extract_cardloan.py <product_id> | --all", file=sys.stderr)
        return 2
    return 0 if run_one(sys.argv[1], products) else 1


if __name__ == "__main__":
    sys.exit(main())
