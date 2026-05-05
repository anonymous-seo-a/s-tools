# Phase 4 MVP Phase 2 - Step A-1 完成セッション (Part 5)

日付: 2026-05-05 (Part 5、本日 5 セッション目)
ステータス: 完了 (Step A-1 完成 = 3 実装コミット + 1 締めコミット)
反映先:
  - knowledge/05_rewrite_system_design.md (V-A / XIV / XV 章 + 新規「Phase 2 実装で発見した構造的事実」セクション)
  - handoff_prompt_for_next_session.md (Phase 2 残 2.5 タスク + 次セッション着手候補 encode)

---

## 0. セッション経緯

Part 4 (Step A-1 着手分 + 案A 統合) からの継続。
本セッション戦略: Step A-1 後半 (Phase 2 最大の山場) を完走、Phase 2 主要進捗 2.5/7 → 4.5/7。

shared/ lazy 構築 4 件目として shared/wp-structured.js を中間案で実装。
LLM 1 コール / 記事で Layer 1〜3 同時抽出パターンを確立 (Sonnet 4.6)。
完全一致差集合 + raw deltas notes JSON 保存パターンを Step A-1 に適用 (axis4 同型保険)。

---

## 1. 完了した作業 (3 実装コミット)

| # | コミット | 内容 |
|---|---|---|
| 1 | 9a30a04 | feat(rewrite): shared/wp-structured.js 実装 (cheerio 構造化抽出 中間案) |
| 2 | 6f2bad1 | feat(rewrite): master_fact_set Layer 1〜3 投入 + competitor_corpus.fact_set_snapshot 更新 (Step A-1 着手3) |
| 3 | b102f2a | feat(rewrite): master_information_gain_score 計算実装 (Step A-1 完成) |

最終 DB 状態:
  master_fact_set: 25 件 (post_id=7170、layer1=10 / layer2=15 / layer3=0)
  master_competitor_corpus: 3 件 (fact_set_snapshot UPDATE 完了、JSON 972〜1504 bytes)
  master_information_gain_score: 1 件
    Layer 1: self=10 union=29 gap=23
    Layer 2: self=15 union=45 gap=45 (= 表現揺れ問題顕在化)
    Layer 3: self=0  union=14 gap=14 (= cardloan 監修者付き解説型の構造的特性)

---

## 2. 確立パターン

### 2-1. shared/ lazy 構築 4 件目 (wp-structured.js 中間案)

中間案スコープ:
  含む: cheerio + 自記事用 extractSelfArticle (h タグ階層 + 段落/li 連結 sections)
       + 競合用 extractCompetitorContent (text() フォールバック + nav/footer 除去)
       + script/style/noscript 除去
  含まない: 監修者ブロック除去 / ez-toc 除去 / CTA バナーマーカー化 / 82% 削減実測の最終形

設計: mode 引数による分岐ではなく **別関数** で吸収 (依存方向クリーン優先)
警戒バイアス対チェック [11] (旧 [d]): 案C 着手時拡張機能を本セッションで作らない

### 2-2. LLM 1 コール同時抽出パターン (Sonnet 4.6)

入力: タイトル + plain_text、上限 30K 文字 (冒頭切り捨て)
出力 JSON: { layer1_entities, layer2_claims, layer3_experiences }
上限: layer1=10 / layer2=15 / layer3=10 (LLM 指示 + コード両方で固定)

3 コール分離 (Layer 別最適化) と比較した利点:
  - コスト 1/3 (1 コール vs 3 コール)
  - 警戒バイアス [14] (旧 [f]) 細分化暴走を回避
  - Sonnet 4.6 で十分対応可、出力品質 smoke pass

警戒バイアス対チェック:
  [9] (旧 [a]) LLM プロンプト過剰精緻化 → 「動く」レベル、最適化は後段
  [16] (旧 [h]) YMYL 上流フィルタ怠惰 → 違反主張除外をプロンプト明示
  [20] (旧 [l]) 網羅性追求 → 上限 N 固定で LLM とコード両方
  [21] (旧 [m]) 構造化保証 → null/空配列許容、JSON パース失敗 warn 継続

### 2-3. 完全一致差集合 + raw deltas notes JSON 保存

実装:
  正規化: trim + lowercase の最小正規化のみ
  差集合: competitor_union (各 URL の union) - self
  IG Score = gap_count として実装 (knowledge/05 V-A schema に従う最小定義)

raw deltas notes JSON:
  {
    self_fact_count: { layer1, layer2, layer3 },
    competitor_union_count: { layer1, layer2, layer3 },
    gap_fact_samples: { layer1, layer2, layer3 } (各 5 件まで),
    layer3_gap_count,
    calculation_method: "exact_match_minimal_normalization"
  }

→ 本日 axis4 で確立した raw deltas 保存パターンと同型。
  将来の log/正規化版 / 意味的一致版に拡張する際、再計算可能 (保険)。

---

## 3. 戻し体験 (本セッション内発動 1 件)

### 3-1. WP_API_BASE_URL 値構造仮定問題

```
発動箇所: extract.js fetchWpContent() smoke 実行時 → WP REST 404 rest_no_route
発動内容: WP_API_BASE_URL=https://soico.jp/no1/wp-json/wp/v2 (フルパス) だったが、
         実装側は ${baseUrl}/wp-json/wp/v2/posts/... で /wp-json/wp/v2 二重付加

発動原因: 環境変数の値構造を fixed assumption (subdir のみ) で実装
         プローブで先確認しなかった

対処パターン:
  1. node -e で WP_API_BASE_URL 値を確認
  2. /wp-json/wp/v\d+/ 含有判定で吸収する 1 行修正
  3. www あり/なし両方 200、/posts/{id} と /posts?include={id} 両方 200 確認
  4. smoke 即 pass

教訓 → 警戒バイアス [22] 環境変数値構造仮定として登録:
  「環境変数の値構造はプローブで先確認すべき」
  既存 monitor 系の旧キー名 (WP_USERNAME / SITE_URL) と新キー名 (WP_API_*) の
  違いも構造仮定問題の派生
```

---

## 4. 観察事項 (構造的発見、knowledge/05 反映済)

### 4-1. cardloan アフィリ記事の Layer 3 限定性

```
post_id=7170 で Layer 3 (First-hand experience markers) = 0 件
原因: cardloan アフィリ記事は監修者付き解説型が主流
    案件選定の比較記事は実体験よりも客観的解説に依拠

→ 本セッションでは記録のみ、master_information_gain_score 計算は仕様通り
→ Phase 2 後半の案C LLM 実行レイヤー (工程6'-A 分析) で
  「実体験コンテンツ追加」を方針候補に組み込む根拠データ

→ knowledge/05 新規セクション「Phase 2 実装で発見した構造的事実」に記録
```

### 4-2. Layer 2 表現揺れ問題

```
post_id=7170 で Layer 2 gap=45 (= competitor_union 全数) = 自記事 15 件が
全て競合 union と完全一致しない構造

例:
  自記事 「アコムの実質年率は 2.4%〜17.9%（2026年1月6日より引き下げ）」
  競合   「アコムのカードローンの適用利率は年2.400%〜17.900%」
  → 意味的に同じ事実、完全一致正規化では別 fact

本セッション仕様 (完全一致 + trim + lowercase) では妥当な動作
本格運用時に意味的一致 (LLM 判定 or embedding 類似度) で吸収必要

→ 警戒バイアス [22] 派生として、本セッション内では意識継続
→ Phase 2 後半の拡張タスクとして次セッション以降に encode
```

### 4-3. 環境変数の値構造仮定問題 (構造化)

```
本セッション戻し体験から派生した一般原則:

shared/ 系の環境変数参照ロジックは「含有判定で吸収する設計」を推奨。
理由:
  - 既存 monitor 系 (旧キー名 SITE_URL / WP_USERNAME) と
    新規実装 (WP_API_BASE_URL / WP_API_USERNAME) の不整合
  - WP_API_BASE_URL がフルパス vs subdir で動作変わる
  - GSC_PROPERTY_URL の www あり/なし不整合 (Part 4)

→ 警戒バイアス [22] 環境変数値構造仮定として knowledge/05 XIV に登録
```

---

## 5. 警戒バイアス対チェック (本セッション)

### 5-1. 本セッション内発動

戻し体験 1 件 (WP_API_BASE_URL 値構造仮定) → 警戒バイアス [22] として新規登録。
これはバイアスではなく事実確認の問題だが、構造化 (プローブで先確認) で再発防止。

### 5-2. 事前警戒で回避

| バイアス番号 | 適用箇所 |
|---|---|
| [9] (旧 [a]) LLM プロンプト過剰精緻化 | fact 抽出プロンプト「動く」レベル、最適化は後段 |
| [11] (旧 [c]) Adapter 過剰抽象化 | WP REST/HTTP fetch を inline、shared/wp-rest-client.js 切出しなし |
| [12] (旧 [d]) スケルトン作成隠れたコスト | wp-structured.js 中間案、案C 拡張機能は実装しない |
| [16] (旧 [h]) YMYL 上流フィルタ怠惰 | 違反主張除外をプロンプト明示 |
| [20] (旧 [l]) fact 抽出網羅性追求 | 上限 N 固定 (LLM 指示 + コード両方) |
| [21] (旧 [m]) LLM 出力構造化保証 | null/空配列許容、JSON パース失敗 warn 継続 |

---

## 6. 反証プロトコル処理

### 反証 1: Layer 2 gap=45 (= union 全数) は実装の不具合か

→ 不具合ではない、表現揺れ吸収未実装の構造的事実。
   完全一致正規化 (trim + lowercase) では妥当な動作。
   raw deltas notes JSON にサンプル保存済、Phase 2 後半で意味的一致拡張時に活用。

### 反証 2: Layer 3 gap=14 で本当に「実体験コンテンツ追加」が方針として妥当か

→ 妥当性は方針承認段階 (案C 工程6'-A) で判断する。
   本セッションは「Layer 3 が gap として顕在化した事実の記録」が役割。
   実体験コンテンツ追加が真=美の必然性を満たすかは、案K 高リスク変更カテゴリ
   (major_restructure) との関係も含めて Daiki 承認を要する。

### 反証 3: shared/wp-structured.js 中間案で案C 着手時に再構築コストが発生しないか

→ 再構築ではなく **拡張**。
   現実装の extractSelfArticle / extractCompetitorContent は API 互換、
   案C 着手時に内部の前処理 (監修者除去 / ez-toc 除去 / CTA マーカー化) を
   追加するだけで API 不変。
   これは shared/ lazy 構築方針 (γ) の「必要時拡張」と整合。

### 反証 4: IG Score = gap_count の単純定義は spec 違反ではないか

→ knowledge/05 V-A schema は INTEGER NOT NULL のみ規定、計算式未定義。
   「gain_score = gap_count」が最小定義、raw deltas notes JSON で
   将来 log/正規化版に拡張可能。
   axis4 で確立した raw deltas 保存パターンと同型。

---

## 7. Phase 2 進捗状況

### 主要実装タスク 7 件中の進捗

```
1/7 ✓ Step A-2 Query Fan-out + intent_dimension (Part 3 完了、5 コミット)
2/7 ✓ master_post_target_query 構築 (Part 4 完了、1 コミット)
3/7 ✓ master_competitor_corpus + fact_set_snapshot (Part 4 着手 + Part 5 完成)
4/7 ✓ master_fact_set Layer 1〜3 (Part 5 完成)
5/7 ✓ master_information_gain_score (Part 5 完成)
6/7 ✗ master_hcu_checklist (案B # 5)
7/7 ✗ master_article_similarity α (案B # 9)

進捗: 4.5/7 → ※ 3/7 と 4/7 を Part 5 で完成、Part 4 末から +2 達成
```

実は知識上は 5/7 達成可能だが、Phase 2 残実装の本格運用基盤
(一括投入バッチ + 表現揺れ吸収) を考えると実質 4.5/7。

---

## 8. 本日 5 セッション全体の累計

```
Part 1 (朝):   Phase 4 MVP Phase 1 完了 (8 コミット + 1 締め)
Part 2 (午後): Phase 1 残課題消化 + Phase 2 着手準備 (2 コミット + 1 締め)
Part 3 (夕):   Step A-2 Query Fan-out 完了 (4 コミット + 1 締め)
Part 4 (夜):   Step A-1 着手分 + 案A 統合 (2 コミット + 1 締め)
Part 5 (深夜): Step A-1 完成 (3 コミット + 1 締め予定)

累計 24 コミット (実装 19 + ドキュメント 5、本締めコミット完了で 25)
main push 済 (Part 4 末まで)、Part 5 は本セッション末で push 予定

Phase 2 進捗 0/7 → 4.5/7 (本日中に 4.5 タスク完了)
```

---

## 9. 次セッション着手判断 (handoff に encode)

### 推奨優先順位

```
優先1: master_hcu_checklist (案B # 5、軽量・独立)
       依存: なし、LLM のみで完結
       工数: 1〜2 日
       本日確立 shared/llm-adapters/ パターン応用

優先2: master_article_similarity α (案B # 9、軽量・独立)
       依存: なし、TF-IDF/Embedding 独立
       工数: 1 日

優先3: 一括投入バッチ実装 (本格運用基盤)
       依存: GSC API レート制限考慮 + SerpApi クォータ管理
       工数: 2〜3 日
       全 cardloan 434 記事 + 全 Layer1 sub_query (10 件)

優先4: 表現揺れ吸収拡張 (Layer 2 gap=45 問題)
       依存: master_fact_set 既投入分
       工数: 1〜2 日
       意味的一致 (LLM 判定) または embedding 類似度

優先5: 案C LLM 実行レイヤー着手 (Phase 2 後半山場)
       依存: Phase 2 主要 7/7 完了 (現状 4.5/7、残 2.5/7)
       工数: 5〜8 日
       工程6'-A (Opus 4.7 分析) + 工程6'-B (Sonnet 4.6 生成)
```

---

## END OF SESSION RECORD

Step A-1 完成、Phase 2 進捗 4.5/7 達成。
shared/ lazy 構築 4 件目 (wp-structured.js 中間案) で案C 拡張余地確保。
LLM 1 コール同時抽出 + 完全一致差集合 + raw deltas 保存の 3 パターン確立。
本日 5 セッション連続で累計 24 コミット (実装 19 + ドキュメント 5)、
Phase 2 進捗 0/7 → 4.5/7 を 1 日で達成。
