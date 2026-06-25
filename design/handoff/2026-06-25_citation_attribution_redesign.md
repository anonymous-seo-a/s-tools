# ハンドオフ: 出典付与ロジックの調査と再設計（楽天の内容に三井住友の出典が付く）

最終更新: 2026-06-25 / 次セッション継続用
状態: **実装・本番デプロイ完了（commit edc3028）**。当初は設計のみの予定だったが、稼働中リライト完了の連絡を受け実装→デプロイまで実施。詳細は §10。

---

## 0. 最初にやること
1. このファイルを読む。
2. メモリ [[rewrite_house_style_readability]] [[rewrite_batch_autoapprove]] [[rewrite_ig_driven_securities]] [[rewrite_apply_gutenberg_raw_constraint]] を把握。
3. 下記「調査の足がかり」のファイルを読んでから設計に入る。**この段階で実装・本番変更はしない。**

---

## 1. 問題（Daiki 報告）

直近のリライト案で、**楽天の内容なのに出典が三井住友カードになっている**。実物:

```html
<!-- wp:paragraph -->
<p>一般的に、ゴールドカードやブラックカードは一般カードに比べてポイント還元率が高く設定される場合があります。上位グレードへステップアップするかどうかは、年会費と還元率のバランスや、コンシェルジュ・ラウンジといった付帯サービスを使う頻度を踏まえて判断するとよいでしょう。</p>
<!-- /wp:paragraph -->

<!-- wp:quote -->
<blockquote class="wp-block-quote"><!-- wp:paragraph -->
<p><a href="https://www.smbc-card.com/nyukai/magazine/status-card/goldcard-invitation.jsp" target="_blank" rel="noopener">出典: 三井住友カード</a></p>
<!-- /wp:paragraph --></blockquote>
<!-- /wp:quote -->
```

→ 本文の主語（楽天）と出典（三井住友 smbc-card.com）が不一致。**出典の誤紐付け（C クラス）**。

Daiki の要望: 「出典に疑問を感じることが多い。出典付与部分のロジックを見直したい。」

---

## 2. 目的

**出典付与ロジックを、本文の主題と出典源が一致するよう再設計する**（実装は次々セッション以降。今回は設計を詰める）。

ゴール:
- なぜ主語と出典がズレるのかを**コードで特定**（推測で設計しない＝当セッションの方針）。
- 出典が本文内容を実際に裏付けているかを保証する仕組みを設計（決定論ゲート + 必要なら意味検証）。

---

## 3. 調査の足がかり（コード経路）

出典 `<blockquote>出典: …</blockquote>` は diff 生成（insert_evidence 等）で付与される。確認すべき所:

- `rewrite/llm-execution/case-c-diff-prompt.js` … diff 生成プロンプト。出典/source/引用の指示、fact の渡し方、insert_evidence の生成ルール。**「出典: 会社名 + URL」をどう選ばせているか**が核心。
- `rewrite/llm-execution/diff-runner.js` … fact_set とその source_url を LLM にどう供給し、出力をどう diff 化するか。
- `rewrite/fact-set/extract.js` … fact に source_url を付ける箇所。**fact 自体が mis-source されている可能性**（competitor ページ由来の事実に、別社の URL が紐づく）。
- `rewrite/competitor-corpus/collect.js` … 競合コーパス収集。fact_set_snapshot に competitor_url が入る。楽天記事のリライトで三井住友 competitor が混ざる経路を疑う。
- `master_fact_set` テーブル（schema.sql）… content と source_url の対応。本番DBで該当記事の facts を引いて、source_url が主題とズレた fact が実在するか確認する。

### 有力仮説（要検証・片側照射に注意）
1. **fact の source_url 汚染**: competitor corpus に三井住友ページが混入し、「ゴールドカードは還元率が高い」という一般論 fact に smbc-card.com が source として付く。LLM はその fact を楽天文脈で使い、source をそのまま出典化 → 誤紐付け。
2. **LLM が source を取り違える**: 複数 fact を渡すと、本文に使った fact と別の fact の URL を出典に付ける（プロンプトが fact↔source の対応を強制していない）。
3. **一般論に出典は不要なのに付与**: 上記本文は「一般的に〜」の一般論で、特定企業の一次情報を要しない。出典付与の発火条件が過剰。

→ 本番DBで該当セッション/記事の master_rewrite_diff（insert_evidence）と master_fact_set を引き、1/2/3 のどれかを実データで確定すること。

---

## 4. 設計時の観点（既存パターンの再利用）

- 当セッションで空BOX補完に **数値 grounding ゲート**（`number-grounding.js`）と **意味的 polarity 検証**（`verifyPolarity`）を入れた。出典でも同型が使える:
  - 決定論: 出典 URL のドメイン/会社名が、本文の主題企業と一致するか照合（不一致なら出典を外す or held）。
  - 意味検証: 「この出典は本文の主張を裏付けるか」を安価 LLM で確認（C クラスは意味検証でしか落ちない、と当セッションで確認済み）。
- 一般論には出典を付けない（発火条件の最小化）。一次情報が要る主張（数値・制度・各社固有仕様）のみ出典付与。
- 出典の正は **fact の source_url**。fact 抽出時点で source が正しいかが上流の鍵（汚染なら上流で断つ）。

---

## 5. 制約・注意

- **本番でリライト進行中**。今回は設計のみ。実装・デプロイ・本番DB書込はしない（読み取り調査は可）。
- 本番DB読み取り: `ssh -i ~/.ssh/s_tools_deploy root@133.88.118.55` → `/opt/s-tools/node` で `node -e "require('./rewrite/db')..."`（sqlite3 CLI は無い、better-sqlite3 経由）。
- デプロイは push で自動（reset --hard origin/main → pm2 restart）。今回は push しない。
- WP編集の確立手順・キャッシュパージは [[reference_soico_no1_redirect_cf_purge]]（今回は不要）。

---

## 6. 当セッションで完了済み（背景・このバグとは別件）

本番 HEAD `080545c`。直近コミット:
- `889cef9` ハウススタイル可読性 Phase 1
- `550519b` 空BOX補完の詰め切り（数値grounding/極性検証/recall拡張）
- `d7b970b` 改行リズム是正（最大2文/段落・空ブロック廃止）
- `5341386` 空BOX検出が末尾配置を拾えない不具合修正（前方文脈も文脈源に）
- `080545c` 空BOX残存の検知 + 学習型auto承認（held自己縮小, 承認率≥95%×n≥20）

これらは安定稼働中。**出典バグは未着手の新規論点**。

---

## 7. 調査結果（コード + 本番DBで確定。2026-06-25 セッション）

**推測ではなく実データで確定**。対象は session=166 / post_id=4776 / diff_id=822（報告された smbc-card.com の現物）。

### 7-1. 出典生成の単一経路
出典 `<blockquote>出典: …</blockquote>` を emit するのは **1経路のみ**: `diff-runner.js` → `case-c-diff-prompt.js`（Sonnet が content_after 内に直接生成）。
`empty-box-filler.js` は `master_fact_set` の source_url を読むが出典 blockquote は emit しない。→ 対策は1経路に局所化できる。

### 7-2. 出典プールの作り方（[diff-runner.js:167-171](../../node/rewrite/llm-execution/diff-runner.js#L167-L171)）
```js
citationSources = master_competitor_corpus WHERE query_fanout_id=?   // 競合コーパス全件
  .map(url, classifyDomain(url)).sort(gov→official→media)            // フラットなURL束
```
→ LLM には **「fact とは無関係な URL のフラット束」** が渡る。fact↔source の対応情報は一切無い。

### 7-3. fact は source を運んでいない（主因。[case-c-bundle.js:169](../../node/rewrite/embedding-poc/case-c-bundle.js#L169)）
- 競合 fact は `fact_set_snapshot`（JSON, layer1/2/3 の**文字列のみ**）に保存。per-fact の source は無く、source は corpus 行の `competitor_url`（snapshot 内に再掲されない）。
- IG 集約で `gap_fact_samples` に**テキストだけ**抽出 → `bundle.required_additions = { layer, text }`（source_url が消える）。
- **本番確認**: `required_additions` 全14件の keys は `layer,text` のみ。source 欄が構造的に存在しない。

### 7-4. 実データによる確定（diff 822 / session 166）
- target_query = **「楽天カード ゴールド 招待」**（楽天記事で正しい）。
- LLM が使った fact = `required_additions[9]` =「ゴールドカード・ブラックカードは一般カードに比べてポイントの還元率が高くなる場合がある」（**source欄なし**）。
- diff の `evidence_refs` = `smbc-card.com/.../goldcard-invitation.jsp`、conf=medium。
- **その fact の真の出自は rakuten-card.co.jp（プール rank#1）**。プールには正解URLが rank#1 で存在したのに、LLM は smbc-card.com（rank#2）を選んだ。

```
プール(fanout 237, 5件):
  [media]    rakuten-card.co.jp/minna-money/...article_2308_80297   ← この fact の真の出自(rank#1)
  [media]    smbc-card.com/.../goldcard-invitation.jsp              ← LLM が誤って選んだ(rank#2)
  [official] plaza.rakuten.co.jp/rocca1/diary/...                   ← 個人ブログを official 誤分類
  [media]    rakuten-card.co.jp/campaign/...
  [media]    rakuten-card.co.jp/card/rakuten-gold-card
```

### 7-5. 3仮説の判定
| 仮説 | 判定 | 根拠 |
|---|---|---|
| ① fact の source 汚染 | **却下（そもそも source を運んでいない）** | required_additions は text のみ。汚染以前に対応が存在しない |
| ② LLM が source 取り違え | **確定（ただし症状であり根本ではない）** | 正解(rakuten-card)がプール rank#1 にあったのに smbc を選択。fact↔source の強制が無いため取り違えは構造的に不可避 |
| ③ 一般論に過剰付与 | **確定** | 当該本文は「場合がある」の一般傾向＝一次情報不要。発火条件に一般論除外が無い |

### 7-6. 根本原因（確定）
- **RC1（主因・構造）**: fact が pipeline を通じて source を運ばない。diff 生成時に「正しく結びつける対象」が存在しないため、LLM の取り違えは不可避。
- **RC2（発火条件過剰）**: 一次情報を要しない一般論にも出典を付けてよい設計になっている。
- **RC3（プール汚染・副次）**: 主題外競合（smbc-card.com）が楽天記事のプールに混入。加えて `classifyDomain` が個人ブログ(plaza.rakuten)を official 誤分類、本家(rakuten-card.co.jp)を media 分類というノイズ。

---

## 8. 再設計（空BOXと同型: 上流修復 + 決定論ゲート + 意味検証 + 発火条件最小化）

出典生成は単一経路なので、後処理ゲートを diff-runner に集約できる（空BOX補完と同じ「生成後に決定論+意味でゲート」構造）。

### Layer 0 — source を fact に運ぶ（RC1 直撃・主因対策）★必然
fact↔source を 1:1 で確定させ、**LLM に URL を「選ばせる」のをやめる**。
1. `extract.js`: 競合 fact 抽出時、`fact_set_snapshot` の各 fact に出自 `competitor_url` を保持（現状は corpus 行に1個だけ）。
2. IG 集約 (`gap_fact_samples`) → `case-c-bundle.js`: `required_additions` を `{ layer, text, source_url }` に拡張（source を捨てない）。
3. `case-c-diff-prompt.js`: 出典は **使った fact の source_url に固定**。フラットプールから選ばせる現仕様を廃止。
→ これだけで「正解がプールにあるのに別を選ぶ」現象（7-4）は消える。

### Layer 1 — 決定論ゲート: 主題一致照合（RC3・出力検証）★保険
diff 後処理で、出典URLのドメイン/会社名が **本文の主題エンティティ**（target_query / セクション見出し / 記事の主体企業）と一致するか照合。
- 不一致（例: 楽天記事に smbc-card.com）→ **出典だけ drop、本文は残す**（held にしない）。
- `number-grounding.js` と同じ決定論前段。Layer 0 が効けば理論上不要だが、LLM が source_url 指示を無視して別URLを書く余地への決定論ガードとして残す（空BOXでも決定論を意味検証の前に置いた）。
- 副次: `classifyDomain` の誤分類（個人ブログ→official 等）も是正対象。

### Layer 2 — 発火条件ゲート: 一般論には付けない（RC2 直撃）★必然
- 一般論判定（ヘッジ表現「場合がある/一般的に/とされる」＋ 数値・制度・固有仕様を含まない）→ **一次情報不要 → 出典を付けない**。
- 出典付与は一次情報を要する主張のみ: 具体数値（金利・限度額・還元率の実値）・制度・各社固有仕様。`number-grounding.js` と同型の発火判定。

### Layer 3 — 意味検証（安価LLM、段階導入）△コスト次第
「この出典は本文の主張を実際に裏付けるか」を確認。C クラス（主題は合うが裏付けない）はここでしか落ちない（空BOXの `verifyPolarity` と同型）。
- URL 再取得は高コスト → まず `fact_set_snapshot` の抽出済み fact と主張を突き合わせる（再fetch 不要）案を優先。

### 最小性の評価（真=美）
- **Layer 0 + Layer 2 が必然**（RC1・RC2 を直撃、これだけで報告バグは二重に防げる）。
- Layer 1 は Layer 0 の出力検証＝決定論ガード（安価・副作用なし、残す価値あり）。
- Layer 3 は C クラス専用、コスト見合いで後段導入。

### 反証
- 「Layer 0 だけで十分では?」→ LLM が source_url 指示を無視して創作/取り違える余地が残る（現にプール rank#1 の正解を外した）。Layer 1 の決定論ガードで担保。
- 「プールを主題一致で絞れば(RC3)済む?」→ fact↔source が無ければ残URL内で取り違えは起きる。RC3 単独では不十分、RC1 が主因。
- 「一般論にも出典がある方が信頼?」→ 一般論に一次情報源は構造的に不要。主題外URLは E-E-A-T を毀損（今回そのもの）。Google一次情報主義に反する → 除外が正。

### 実装スコープ（次々セッション、本番リライト停止後）
- 上流3点: `extract.js` / IG集約 / `case-c-bundle.js`（source を運ぶ）。
- 後処理1点: `diff-runner.js` に出典ゲート（Layer 1/2、Layer 3 は段階）。
- `case-c-diff-prompt.js`: 出典を fact 固定に変更、一般論除外を明記。
- すべて単一経路に集約（複雑性の局所化）。

---

## 9. 確定設計 — Layer 3 込み「人間以上の精度」（2026-06-25 Daiki 承認: layer3まで組込・出典は最重要）

§8 を**置き換える**確定版。出典は最重要のため、検証で潰すのではなく**構造的に誤れない**設計にする。

### 9-1. 核心の再構造（真=美の必然）
現設計の病理 = 「**どの fact が主張を裏付けるか**（文脈判断＝LLM が得意）」と「**どの URL/社名を出力するか**（出自からの決定＝LLM が構造的に苦手）」を 1 操作に混ぜていること。分離する:

> **出典を LLM に書かせない。** LLM は「この主張は fact F[i] に依拠する」と**参照ID（evidence_fact_ids）を付けるだけ**。URL と社名は、全ゲート通過後に**サーバが F[i].source_url から決定論的にレンダリング**する。

→ RC1（取り違え）は検証で潰すのではなく **構造的に発生不可能** になる（LLM が URL を選ばない＝選び間違えられない）。
→ diff スキーマ変更: `content_after` 内に blockquote を書かせる現仕様を廃止。diff に `evidence_fact_ids: number[]` を持たせ、出典 blockquote は適用前にサーバが生成・挿入。

### 9-2. 失敗モードの完全分割（人間以上の精度の根拠）
出典 `(主張C, 社名N, URL U)` が正しい ⟺ 7条件すべて。各条件に**ゲート1対1**（過不足ゼロ＝閉合性）:

| # | 正しさの条件 | 担保 | 種別 |
|---|---|---|---|
| P1 | U が生存（404でない） | G6 liveness | 決定論 |
| P2 | 社名 N が U の運営者と一致 | **再構造**（N を U から導出） | 構造的成立 |
| P3 | U の主題 == C の主題企業 | G3 主題照合（Layer 1） | 決定論 |
| P4a | C が fact F の範囲内（リライト逸脱なし） | G4 claim↔fact（Layer 3a） | 安価LLM |
| P4b | F が U の内容に実在 | G5 fact↔source（Layer 3b） | fetch+LLM |
| P5 | C が一次情報を要する主張 | G1 発火適格（Layer 2） | 決定論 |
| P6 | U が C に対し権威適格 | G2 権威（classifyDomain是正） | 決定論 |
| P7 | U が fact の真の出自 | **再構造**（F.source_url が出自） | 構造的成立 |

**人間編集者は P1・P3 を目視、P5・P6 を勘、P4（実際に出典を読み主張を裏付けるか）をコスト理由で省く。** 機械は P4a を全件・P4b をキャッシュ付きで回す = **人間が原理的に払えないコストを払う**。これが「人間以上」の正体。

### 9-3. ゲート実行順（空BOXと同型: 決定論→意味→fetch）
```
候補 (C, F, F.source_url) ごとに:
  G1 発火適格   一般論なら出典なし(主張は残す)             [決定論・最安]
  G2 権威適格   gov/official優先, 個人ブログ(plaza)棄却      [決定論]
  G3 主題照合   Uドメイン企業 == C主題企業, 不一致は棄却      [決定論]
  G6 liveness   U解決 + 社名導出                          [決定論・ドメイン単位キャッシュ]
  ── 通過分のみ意味検証へ ──
  G4 claim↔fact  C が F の範囲内か(ドリフト/過度な一般化検出) [安価LLM・候補まとめて1バッチ]
  G5 fact↔source F が U に実在するか                       [fetch+LLM・fact_id単位キャッシュ]
```
- G5 は Layer 0 により「F は U から抽出した fact そのもの」→ **通常は再fetch不要**。G4 が境界（リライトで主張ドリフト）した時 + 抽出品質の定期監査時のみ発火。コストは **fact 単位で1回償却**、出典使用ごとには増えない。
- `classifyDomain` 是正（P6/G2）: 個人ブログ（plaza.rakuten.co.jp 等の blog/diary パス）を official 誤分類しない。本家 rakuten-card.co.jp を official 昇格。一次情報主張は gov/official のみ採用、media-only は降格/棄却。

### 9-4. ゲート失敗時の分岐（YMYL critical）
| C の種別 | 有効な出典が付かない場合 |
|---|---|
| 一般論（P5不成立） | 出典 drop・**主張は残す**（無出典で正常） |
| 一次情報主張（数値・制度・固有仕様） | **held**（無出典では出荷しない）。裏付け無しの数値主張は YMYL 違反リスク |

→ smbc 例（一般論＋誤出典）は G1 で出典が落ちる。仮に数値主張なら held。**二重の安全**。

### 9-5. 最小性・反証
- 7プロパティ × ゲート1対1で**過不足なし**（必然性: どれを外しても1つの失敗モードが無防備に）。
- 反証「再構造（参照ID化）まで要るか?」→ LLM が URL を書く限り P2/P7 は検証でしか担保できず、検証は漏れる（現に rank#1 の正解を外した）。構造的成立に勝る担保は無い → 再構造は必然。
- 反証「Layer 3 はコスト過大では?」→ G4 はバッチ1回、G5 は fact 単位キャッシュ＋発火限定で償却ゼロ近傍。出典が最重要という前提で費用対効果は正。
- 反証「held が増えて自動承認率が落ちる?」→ 落ちるのは「裏付けの取れない数値主張」だけで、これは本来出してはいけないもの。[[rewrite_batch_autoapprove]] の自動承認は健全化方向。

### 9-6. 実装スコープ（次々セッション、本番リライト停止後。本セッションは設計のみ）
1. 上流（source を運ぶ・RC1）: `extract.js`（snapshot fact に competitor_url 付与）/ IG集約 `gap_fact_samples` / `case-c-bundle.js`（required_additions に source_url）。
2. スキーマ（再構造）: diff に `evidence_fact_ids`、出典 blockquote の LLM 生成を廃止 → サーバレンダリングへ。`case-c-diff-prompt.js` を「URL を選ばせない／一般論に出典禁止」へ改訂。
3. 出典ゲート（新規 1 モジュール, 例 `citation-gate.js`）: G1〜G6 を空BOX（`number-grounding.js` + `verifyPolarity`）と同型で実装、`diff-runner.js` 後処理から呼ぶ。
4. `classifyDomain` 是正（個人ブログ判定・official 昇格）。
5. 適用層（`gutenberg-apply.js`）: evidence_fact_ids → blockquote レンダリング + held 分岐。
- すべて単一経路に集約（複雑性の局所化）。

---

## 10. 実装・デプロイ完了 (2026-06-25, commit edc3028)

§9 設計を実装し本番 (`/opt/s-tools` → pm2 rewrite-app) に反映済。

### 変更ファイル
- `fact-set/ig-score.js` — Layer0: gap fact に出自 source_url を伝搬 (`gap_fact_samples` を `{text,source_url}` 化)。
- `embedding-poc/case-c-bundle.js` — `required_additions` が source_url を運ぶ (旧文字列形式も互換読み)。
- `competitor-corpus/collect.js` — `classifyDomain` に `blog` 種別追加 + `isPersonalBlog` (plaza.rakuten等を official 誤分類しない)。
- `llm-execution/citation-gate.js` (新) — G1〜G5 + inline出典除去 + 出典blockquoteのサーバレンダリング + Haiku entailment(fail-safe)。
- `llm-execution/diff-runner.js` — フラットURLプール廃止 → ゲート後処理。G5用 factSourceIndex 構築。一次情報主張の不通過は held(conf=low)。
- `llm-execution/case-c-diff-prompt.js` — 出典/URL記述を全面禁止、依拠factは `rationale.bundle_refs.required_additions` のindex申告に一本化。
- `scripts/smoke-citation-gate.js` (新) — diff822再現の決定論テスト17件 (本番でも通過確認済)。

### 設計との差分 (実装上の判断)
- **G4/G5 の役割整理**: G5(出自整合)は Layer0 により「source_url = factを持つ競合」なので、`factSourceIndex` への決定論メンバシップ照合で実装 (再フェッチ不要)。フェッチ版(抽出品質監査)は別途サンプリングで実施する想定 (未実装)。
- **G2 権威**: 「media降格」は出自固定(Layer0)と両立しないため、個人ブログ/フォーラムの棄却のみに留めた (media は G4 に委譲)。recall を保つ判断。
- **G1 発火条件**: 「具体数値 or 固有名の制度/法令」のみ発火。一般語(ポイント還元率/手数料/金利 単独)では発火させない → diff822本文(一般論)は出典drop。
- **held 表現**: 専用カラムを足さず confidence='low' + rationale.citation で表現 (empty-box と同型、既存 auto承認ゲートがそのまま除外)。

### 検証
- 決定論17件 smoke 通過 (ローカル+本番)。
- diff822 シナリオ orchestration: smbc出典は除去・一般論なので無出典・held無し(本文残る)・LLM呼び出しゼロ。

### 残課題 (次セッション候補)
- G5 フェッチ版(抽出品質の定期監査・サンプリング)。
- BRANDS 辞書の拡充 (新ジャンル追加時)。
- 効果測定: 本番リライトで citation_held / citation_cited (session.notes) を観測し、held率・誤出典再発ゼロを確認。
