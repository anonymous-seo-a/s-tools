#!/usr/bin/env python3
"""レギュレーションストア — RAG化（チャンク化＋スコープ付与＋ハイブリッド検索）
fact-keeper regstore.py のカードローン移植版。

構成（contextual retrieval lite）:
  - チャンク: 各ルールを 見出しパス（=文脈）付きで分割
  - スコープ: どの商材に適用されるか（client_official=当該商材 / common=全商材 / type=該当種別）
  - 検索: 日本語は文字bigram＋語トークンのBM25。商材で絞り込み→関連ルールを返す
  - source_tier: client_official（正式）/ inferred（推定・未確認）を保持し、検索結果で区別

クレカ版からの変更点:
  - 商材種別は名前の正規表現推定でなく registry の type フィールドから決定論で導出
    （consumer_major/consumer_small/bank_mega/bank_net/bank_regional/shinpan/bnpl/omatome）
  - JCB xlsx チャンカーは持ち込まない（クレカ固有）
  - client_official = アコム/プロミス/SMBCモビット のカードローン規制CSV

build:  ./.venv/bin/python scripts/regstore.py build   → data/regstore/chunks.json
query:  ./.venv/bin/python scripts/regstore.py query <product_id> "<検索文>"
"""
from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
REG = ROOT / "regulations"
STORE = ROOT / "data" / "regstore"


# ---- 商材種別（registry の type から決定論導出）----
def product_types(product):
    """商材の種別集合を返す（_by_type.md の種別キーに対応）。
    registry の type を正とし、集約種別（consumer_finance / bank）を併せて付す。"""
    t = set()
    ty = product.get("type", "")
    if ty:
        t.add(ty)
    if ty in ("consumer_major", "consumer_small"):
        t.add("consumer_finance")   # 貸金業法系
    if ty in ("bank_mega", "bank_net", "bank_regional"):
        t.add("bank")               # 銀行法・保証会社系
    if ty == "shinpan":
        t.add("consumer_finance")   # 信販・スマホローンも貸金業法系
    if not t:
        t.add("general")
    return t


TYPE_HEADING = {  # _by_type.md の見出し語 → 種別キー
    "消費者金融": "consumer_finance", "大手消費者金融": "consumer_major",
    "中小消費者金融": "consumer_small", "銀行": "bank",
    "信販・スマホローン": "shinpan", "後払い・チャージ": "bnpl", "おまとめ": "omatome",
}


# ---- チャンク化 ----
def chunk_markdown(md_text, source, source_tier, base_scope):
    """見出し（##/###）単位でチャンク化。見出しパスを文脈として付す。"""
    chunks = []
    h2, h3 = "", ""
    buf = []

    def flush():
        body = "\n".join(buf).strip()
        if body:
            path = " > ".join(x for x in (h2, h3) if x)
            scope = dict(base_scope)
            # _by_type は見出しから種別を判定してスコープを絞る
            if base_scope.get("kind") == "type":
                for k, tkey in TYPE_HEADING.items():
                    if k in h2:
                        scope = {"kind": "type", "type": tkey}
                        # より特異的な見出し語を優先（「中小消費者金融」>「消費者金融」）
            chunks.append({"context": path or source, "text": body,
                           "source": source, "source_tier": source_tier, "scope": scope})
    for line in md_text.splitlines():
        if line.startswith("## "):
            flush(); buf = []; h2 = line[3:].strip(); h3 = ""
        elif line.startswith("### "):
            flush(); buf = []; h3 = line[4:].strip()
        else:
            buf.append(line)
    flush()
    return chunks


def chunk_cardloan_csv(csv_path, company, source_name, scope):
    """カードローンのレギュレーションCSVをチャンク化（client_official）。
    形式が2種（項目|OK|グレー|完全NG|備考 ／ 項目|指定表記|過去指摘事項|備考）あるが、
    『項目』ヘッダ行を検出して以降の各行を1論点チャンクにする汎用パーサで両対応する。"""
    import csv as _csv
    with open(csv_path, encoding="utf-8") as f:
        rows = list(_csv.reader(f))
    # 項目列の検出: 「項目」または「チェック項目」（アイフル商品スペックリスト）
    KEY_NAMES = ("項目", "チェック項目")
    hi = next((i for i, r in enumerate(rows)
               if any((c or "").strip() in KEY_NAMES for c in r)), None)
    if hi is None:
        # ヘッダ無しシート（除外KW等）: 全体を ~1200字ブロックで機械分割
        lines = [" | ".join((c or "").strip() for c in r if (c or "").strip())
                 for r in rows]
        lines = [l for l in lines if l]
        blocks, block, size = [], [], 0
        for line in lines:
            block.append(line); size += len(line)
            if size > 1200:
                blocks.append("\n".join(block)); block, size = [], 0
        if block:
            blocks.append("\n".join(block))
        return [{"context": f"{company}（{bi}/{len(blocks)}）" if len(blocks) > 1 else company,
                 "text": text, "source": source_name,
                 "source_tier": "client_official", "scope": scope}
                for bi, text in enumerate(blocks, 1)]
    header = [(c or "").strip() for c in rows[hi]]
    ki = next(j for j, h in enumerate(header) if h in KEY_NAMES)
    # LLM推定ラベル（結合セルで消えた項目名を内容から補完したサイドカー）
    labels = {}
    lp = Path(csv_path).parent / "_labels.json"
    if lp.exists():
        labels = json.loads(lp.read_text(encoding="utf-8"))
    out = []
    seen_items = {}
    last_item = ""       # 結合セル対応: 項目(col0)が空の継続行は直前の項目に紐づける
    for ridx, r in enumerate(rows):
        if ridx <= hi:
            continue
        cells = [(c or "").strip() for c in r]
        if not any(cells):
            continue
        cur = cells[ki] if ki < len(cells) else ""
        if cur:
            last_item = cur
        item = cur or labels.get(str(ridx)) or last_item or "（無題）"
        # 同名の別行は連番で区別（内容は異なる）
        seen_items[item] = seen_items.get(item, 0) + 1
        if seen_items[item] > 1:
            item = f"{item}（{seen_items[item]}）"
        # 項目列以外の全ての非空セルを、ヘッダ名（あれば）付きで束ねる（区分/OK/NG/備考を取りこぼさない）
        parts = []
        for j, val in enumerate(cells):
            if j == ki or not val or val == cur:
                continue
            lbl = header[j] if j < len(header) and header[j] else ""
            parts.append((f"【{lbl}】" if lbl else "") + val)
        if parts:
            out.append({"context": f"{company} > {item}", "text": item + "\n" + "\n".join(parts),
                        "source": source_name, "source_tier": "client_official", "scope": scope})
    return out


# client_official の登録: (raw/配下slug, 表示名, scope)
_CARDLOAN_OFFICIAL = [
    ("acom", "アコム公式（カードローン規制）", {"kind": "advertiser", "match": ["アコム", "acom"]}),
    ("promise", "プロミス公式（カードローン規制）", {"kind": "advertiser", "match": ["プロミス", "promise"]}),
    ("smbc-mobit", "SMBCモビット公式（カードローン規制）", {"kind": "advertiser", "match": ["モビット", "mobit"]}),
    ("aiful", "アイフル公式（カードローン規制）", {"kind": "advertiser", "match": ["アイフル", "aiful"]}),
    # 案件複合 = 複数社混合記事のルール。消金系記事全般に適用
    ("fukugou", "案件複合（混合記事規制）", {"kind": "type", "type": "consumer_finance"}),
]


def chunk_cardloan_official():
    chunks = []
    for slug, company, scope in _CARDLOAN_OFFICIAL:
        d = REG / "raw" / slug
        if not d.is_dir():
            continue
        for csvf in sorted(d.glob("*.csv")):
            # シート名をコンテキストに含める（1社に規制/除外KW/スペック等の複数CSVがあるため）
            label = company
            stem = csvf.stem
            if stem.startswith("wb_"):
                label = f"{company} > {stem[3:]}"
            chunks += chunk_cardloan_csv(csvf, label, csvf.name, scope)
    return chunks


# ---- 日本語対応 BM25（文字bigram＋語トークン）----
def tokenize(text):
    text = text.lower()
    toks = re.findall(r"[a-z0-9]+|[ぁ-んァ-ヶ一-龠々]+", text)
    out = []
    for t in toks:
        if re.match(r"[a-z0-9]+", t):
            out.append(t)
        else:  # 日本語は文字bigram
            out += [t[i:i+2] for i in range(len(t) - 1)] if len(t) > 1 else [t]
    return out


def load_registry():
    return yaml.safe_load((ROOT / "registry" / "products.yaml").read_text(encoding="utf-8")) or []


def build():
    chunks = []
    # 推定・共通（全商材）
    common = (REG / "inferred" / "_common.md")
    if common.exists():
        chunks += chunk_markdown(common.read_text(encoding="utf-8"), "inferred/_common.md",
                                 "inferred", {"kind": "all"})
    # 推定・種別別
    bytype = (REG / "inferred" / "_by_type.md")
    if bytype.exists():
        chunks += chunk_markdown(bytype.read_text(encoding="utf-8"), "inferred/_by_type.md",
                                 "inferred", {"kind": "type"})
    # 推定・会社別: by_company/_index.yaml の company_match / product_ids でスコープ付与
    bc = REG / "inferred" / "by_company"
    idx = bc / "_index.yaml"
    if idx.exists():
        companies = yaml.safe_load(idx.read_text(encoding="utf-8")) or {}
        for slug, meta in companies.items():
            mdp = bc / f"{slug}.md"
            if not mdp.exists():
                continue
            if meta.get("product_ids"):
                scope = {"kind": "products", "products": meta["product_ids"]}
            else:
                scope = {"kind": "company", "match": meta.get("company_match", [])}
            chunks += chunk_markdown(mdp.read_text(encoding="utf-8"), f"inferred/by_company/{slug}.md",
                                     "inferred", scope)

    # クライアント公式（アコム/プロミス/モビット）
    try:
        chunks += chunk_cardloan_official()
    except Exception as e:
        print(f"  [warn] カードローン公式の取り込みskip: {e}", file=sys.stderr)

    # BM25用の転置データ
    for i, c in enumerate(chunks):
        c["id"] = i
        c["tokens"] = tokenize(c["context"] + "\n" + c["text"])
    df = Counter()
    for c in chunks:
        for t in set(c["tokens"]):
            df[t] += 1

    STORE.mkdir(parents=True, exist_ok=True)
    (STORE / "chunks.json").write_text(json.dumps(
        {"chunks": chunks, "df": df, "N": len(chunks)}, ensure_ascii=False), encoding="utf-8")
    kinds = Counter(c["source_tier"] for c in chunks)
    print(f"build完了: {len(chunks)}チャンク {dict(kinds)} → {(STORE/'chunks.json').relative_to(ROOT)}")


def _applies(scope, product, ptypes):
    k = scope.get("kind")
    if k == "all":
        return True
    if k == "products":
        return product["product_id"] in scope.get("products", [])
    if k == "type":
        return scope.get("type") in ptypes
    if k == "company":
        comp = product.get("company", "")
        return any(m in comp for m in scope.get("match", []))
    if k == "advertiser":
        blob = product.get("name", "") + product.get("company", "") + product.get("product_id", "")
        return any(m in blob for m in scope.get("match", []))
    return False


def query(product_ids, text, k=6):
    """product_ids は単一(str)でも複数(list)でも可。複数の場合は、いずれかの商材に適用される
    ルールを対象にBM25で順位付けする（記事に登場する全商材のルールを横断適用するため）。"""
    if isinstance(product_ids, str):
        product_ids = [product_ids]
    data = json.loads((STORE / "chunks.json").read_text())
    chunks, df, N = data["chunks"], data["df"], data["N"]
    reg = {p["product_id"]: p for p in load_registry()}
    targets = [(reg[pid], product_types(reg[pid])) for pid in product_ids if pid in reg]
    if not targets:
        print(f"未登録: {product_ids}", file=sys.stderr)
        return []
    q = tokenize(text)
    qtf = Counter(q)
    avgdl = sum(len(c["tokens"]) for c in chunks) / max(1, N)
    scored = []
    for c in chunks:
        if not any(_applies(c["scope"], product, pt) for product, pt in targets):
            continue
        tf = Counter(c["tokens"]); dl = len(c["tokens"]); s = 0.0
        for t, _ in qtf.items():
            if t not in tf:
                continue
            idf = math.log(1 + (N - df.get(t, 0) + 0.5) / (df.get(t, 0) + 0.5))
            s += idf * (tf[t] * 2.2) / (tf[t] + 1.2 * (0.25 + 0.75 * dl / avgdl))
        if s > 0:
            scored.append((s, c))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:k]]


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "build":
        return build()
    if len(sys.argv) >= 4 and sys.argv[1] == "query":
        products = {p["product_id"]: p for p in load_registry()}
        res = query(sys.argv[2], sys.argv[3])
        product = products.get(sys.argv[2], {})
        print(f"商材: {product.get('name', sys.argv[2])} / 適用種別: {sorted(product_types(product)) if product else '?'}\n")
        for c in res:
            tier = "公式" if c["source_tier"] == "client_official" else "推定"
            print(f"[{tier}] {c['context']}")
            print(f"    {c['text'][:100].replace(chr(10), ' ')}...\n")
        return 0
    print("usage: regstore.py build | query <product_id> <text>", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
