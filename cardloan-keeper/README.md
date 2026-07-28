# cardloan-keeper — カードローン一次情報管理者

soico.jp/no1 カードローン記事群のための一次情報・レギュレーション管理システム。
fact-keeper（クレカ版、~/Projects/fact-keeper）の設計・実証済みコードを移植した **s-tools 内の独立実装**（コード・DB非共有、2026-07-28 Daiki 決定）。

設計正典: `../design/sessions/2026-07-28_cardloan_keeper_fork_design.md`
商材センサス: `../design/sessions/2026-07-28_cardloan_census_a1_result.md`

## 構成

```
registry/products.yaml    商材レジストリ（約149商材・ページ役割マップ）
regulations/
  raw/<slug>/             client_official 原本CSV（gitignore・機密）: acom / promise / smbc-mobit
  inferred/               推定レギュ（_common / _by_type / by_company）← Phase A-3
scripts/
  fetch.py + _pw_worker.py  三段フェッチ（curl → curl_cffi → Playwright隔離ワーカー）[fact-keeper原本のまま]
  snapshot.py               差分駆動スナップショット（二段階差分 第1段）
  regstore.py               レギュレーションRAG（bigram BM25 + 商材スコープ + source_tier）
  check_article.py          記事チェック（規制CSV+法令原文 → 出典付き違反検出）--json でL3ゲート出力
  ingest_law.py             e-Gov法令API → 8法令の条文原文（貸金業法/利息制限法/出資法/銀行法/景表法/消契法/割販法/資金決済法）
  util.py                   load_env 等
data/                     facts / snapshots / regstore（gitignore）
```

## クレカ版との differences

- 商材種別は registry の `type` から決定論導出（名前の正規表現推定を廃止）:
  `consumer_major / consumer_small / bank_mega / bank_net / bank_regional / shinpan / bnpl / omatome`
- 集約種別: 消金・信販 → `consumer_finance`（貸金業法系）/ 銀行3種 → `bank`（銀行法・保証会社系）
- 条件ツリー還元率・ペルソナ試算・経済圏・券面画像は持ち込まない（クレカ固有）
- ingest_law に利息制限法・出資法・銀行法を追加（law_id は AC0/AC1 候補フォールバック方式）
- check_article は `--json` で機械可読出力（node/rewrite-cardloan の L3 最終ゲートが child_process で消費）

## 実行

```bash
uv venv .venv && uv pip install --python .venv/bin/python pyyaml anthropic pypdf
./.venv/bin/python scripts/regstore.py build          # レギュストア構築
./.venv/bin/python scripts/regstore.py query acom "在籍確認"
./.venv/bin/python scripts/ingest_law.py              # 法令原文取得
./.venv/bin/python scripts/snapshot.py [product_id]   # スナップショット収集
./.venv/bin/python scripts/check_article.py acom --json <<< "記事本文"   # 要 ANTHROPIC_API_KEY(.env)
```

## 既知の環境制約（2026-07-28 スモークテストで確認）

- promise.co.jp はローカルMacからTCP接続遮断 → 本番収集は日本IP VPS + Playwright 実機（fact-keeper で実証済みの類型）。肥後銀行・北陸銀行等も403（同型）
- アコム規制CSV（2026-07-13付）の在籍確認指定表記「一切なし」は、翌日の掲載基準表（2026-07-14）で「100％なし」に変更された可能性 → **原本更新の要否をASPに確認すること**
- ローカルに ANTHROPIC_API_KEY なし（check_article の LLM 層は本番/キー配置後に検証）
