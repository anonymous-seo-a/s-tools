# リライト結果インスペクション

生成日: 2026-05-22T03:45:16.293Z
対象 sessions: 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36 (計 11 件)

## 索引

| session | post_id | qf_id | status | diffs | violations | high_risk |
|---|---|---|---|---|---|---|
| 25 | 11078 | 11 | awaiting_diff_judgment | 7 | 0 | [] |
| 26 | 11077 | 11 | awaiting_diff_judgment | 15 | 0 | ["rate_update"] |
| 27 | 11082 | 11 | awaiting_diff_judgment | 1 | 0 | [] |
| 28 | 11092 | 11 | awaiting_diff_judgment | 6 | 0 | [] |
| 30 | 7170 | 11 | awaiting_diff_judgment | 15 | 0 | [] |
| 31 | 11063 | 11 | awaiting_diff_judgment | 9 | 0 | [] |
| 32 | 12818 | 11 | awaiting_diff_judgment | 9 | 0 | [] |
| 33 | 7196 | 11 | awaiting_diff_judgment | 6 | 0 | [] |
| 34 | 7235 | 11 | awaiting_diff_judgment | 8 | 0 | ["rate_update"] |
| 35 | 18639 | 11 | awaiting_diff_judgment | 8 | 0 | [] |
| 36 | 14691 | 11 | awaiting_diff_judgment | 6 | 0 | [] |

---
# Session 25 (1/11) — Session 25

- post_id: **11078**
- triggered_by: validation-run
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: (null)
- high_risk_categories: []
- tokens: analysis 8646/1807 | generation 13024/8302
- started_at: 2026-05-22 03:11:39
- analysis_completed_at: 2026-05-22 03:12:14
- generation_completed_at: 2026-05-22 03:14:14

## bundle snapshot (session.notes、3 系統)

- target_query: **即日融資 カードローン 金利 比較**
- required_additions (A 系統): 0 件
- shallow_queries    (B 系統): 1 件
- shallow_facts      (C 系統): 2 件

### B: shallow_queries

```json
[
  {
    "query_text": "即日融資 カードローン 金利 比較",
    "self_max": 0.55,
    "comp_max": 0.65,
    "delta": 0.05,
    "threshold": 0.7000000000000001
  }
]
```

### C: shallow_facts

```json
[
  {
    "fact_text": "プロミス",
    "layer": 1,
    "self_max": 0.4,
    "comp_max": 0.55,
    "delta": -0.05,
    "threshold": 0.5
  },
  {
    "fact_text": "アコム",
    "layer": 1,
    "self_max": 0.45,
    "comp_max": 0.58,
    "delta": -0.05,
    "threshold": 0.5299999999999999
  }
]
```

## analysis_output (工程6'-A Opus 4.7)

```json
{
  "structural_analysis": "本記事は即日融資カードローンのランキング形式記事として、プロミス・SMBCモビット・アイフル・アコム・レイクの5社を中心に構成されており、目次構造も網羅性が高い。ただし、ターゲットクエリ『即日融資 カードローン 金利 比較』に対する embedding 深度が競合より0.05低く、特に金利比較の観点での横断的説明が不足している。各社の金利は個別に提示されているが、同一条件下での比較表や、金利差が利息総額にどう影響するかの定量的説明が薄い。また、shallow_facts でプロミス・アコムの深度が競合を下回っており、両社の特徴説明・利用シナリオの厚みが不足している。一方、master_rules でアコムの具体的返済シミュレーション提示が禁止されているため、アコムは特徴記述の質的強化、プロミスは返済シミュレーションを含む量的強化で対応する必要がある。比較構造禁止ルールにより、上限金利のみ・下限金利のみの並列は避け、金利範囲全体を提示する設計が求められる。",
  "rewrite_policy": [
    {
      "policy_text": "ターゲットクエリ『即日融資 カードローン 金利 比較』の網羅深度を高めるため、ランキング直下に大手5社の金利範囲(下限〜上限)・融資スピード・無利息期間・在籍確認・郵送物を同一条件で並べた横断比較表セクションを新設する。上限金利だけ・下限金利だけの比較は避け、金利範囲全体(例: 2.5%〜18.0%)を提示。",
      "priority": 1,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_after",
        "restructure_outline"
      ],
      "target_change_categories": [
        "h2_structure",
        "evidence_insertion",
        "compliance_update"
      ]
    },
    {
      "policy_text": "金利と返済シミュレーションのセクションで、プロミス(金利2.5%〜18.0%)を用いた10万円・30万円借入時の利息総額計算を厚く記述し、金利差が返済負担に与える影響を定量的に示す。アコムについてはアフィリエイト規約に基づき具体的返済額計算は提示せず、公式シミュレーターへの誘導に留める。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          0,
          1
        ]
      },
      "target_change_types": [
        "rewrite_section",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion",
        "compliance_update"
      ]
    },
    {
      "policy_text": "プロミスの特徴記述を厚くする。最短3分融資の前提条件(申込時間・審査状況による)、下限金利2.5%が適用される借入条件、初回最大30日間無利息の起算点(契約翌日ではなく初回利用翌日)、SMBCグループの安心感などを利用シナリオ別に整理。注釈表記は『初めての方は契約翌日から最大30日間無利息』等の正式表記に準拠。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": [
          0
        ]
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "compliance_update"
      ]
    },
    {
      "policy_text": "アコムのセクションを質的に強化する。最短20分融資の条件(21時までの当日契約期限)、審査通過率39.3%の出典明示、原則電話による在籍確認なしの正式表現での記述、カードレス契約時の郵送物の扱いを補強。具体的な返済額シミュレーションは提示せず公式サイト参照に留める。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": [
          1
        ]
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "compliance_update"
      ]
    },
    {
      "policy_text": "『無利息期間の活用方法』セクションで、各社の無利息期間条件(プロミス:初回利用翌日から最大30日、アイフル:契約翌日から最大30日、レイク:最大365日等の選択肢)を正式表記で並列提示し、金利比較と併せた実質負担額の違いを解説する。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_section"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "compliance_update"
      ]
    }
  ],
  "high_risk_categories": [],
  "confidence": "medium",
  "protected_blocks_acknowledged": true
}
```

## master_rewrite_diff (工程6'-B Sonnet 4.6) — 7 件

risk_flag distribution: {"major_restructure":1,"(null)":3,"rate_update":3}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | h2#即日融資が可能なカードローンおすすめランキング | insert_after | h2_structure | major_restructure | high |
| 2 | h2#即日融資が可能なカードローンおすすめランキング | insert_after | evidence_insertion |  | medium |
| 3 | h3#10万円借りた場合の返済シミュレーション | rewrite_section | evidence_insertion | rate_update | high |
| 4 | h3#30万円借りた場合の返済シミュレーション | rewrite_section | evidence_insertion | rate_update | high |
| 5 | h3#1位:プロミス｜最短3分融資・金利2.5%~18.0% | rewrite_paragraph | paragraph_rewrite |  | high |
| 6 | h3#4位:アコム｜最短20分融資(※a)・審査通過率39.3% | rewrite_paragraph | paragraph_rewrite |  | high |
| 7 | h3#無利息期間を最大限活用するコツ | insert_after | evidence_insertion | rate_update | medium |

### diff #1 — h2#即日融資が可能なカードローンおすすめランキング

- change_type: `insert_after`
- change_category: `h2_structure`
- risk_flag: `major_restructure`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<section id="kinri-hikaku-table"><h2>即日融資カードローン 金利・条件 横断比較表</h2><p>以下は大手消費者金融5社の主要条件を同一基準で比較した一覧です。金利は下限〜上限の範囲で表示しています。審査状況や申込時間によっては即日融資に対応できない場合があります。</p><div class="table-responsive"><table><thead><tr><th>会社名</th><th>金利（実質年率）</th><th>融資スピード</th><th>無利息期間</th><th>在籍確認</th><th>郵送物</th></tr></thead><tbody><tr><td>プロミス</td><td>2.5%〜18.0%</td><td>最短3分（※申込時間・審査による）</td><td>初回利用翌日から最大30日間（※メールアドレス登録・Web明細登録が必要）</td><td>原則、電話による在籍確認なし</td><td>WEB完結で原則なし</td></tr><tr><td>SMBCモビット</td><td>3.0%〜18.0%</td><td>最短15分（※申込曜日・時間帯による）</td><td>なし</td><td>WEB完結で原則、電話による在籍確認なし</td><td>WEB完結で原則なし</td></tr><tr><td>アイフル</td><td>3.0%〜18.0%</td><td>最短14分（※申込時間・審査状況による）</td><td>契約翌日から最大30日間（初回）</td><td>原則、電話による在籍確認なし</td><td>条件充足で原則なし</td></tr><tr><td>アコム</td><td>2.4%〜17.9%</td><td>最短20分（※申込時間・審査による）</td><td>契約翌日から初回最大30日間</td><td>原則お勤め先へ電話による在籍確認なし（書面確認）</td><td>カードレスで原則なし</td></tr><tr><td>レイク</td><td>4.5%〜18.0%</td><td>最短15分（Web融資）</td><td>30日／60日／365日（条件により選択）</td><td>原則、電話による在籍確認なし</td><td>－</td></tr></tbody></table></div><p><small>※上記は各社公式サイト掲載情報をもとに当サイトが整理したものです。審査結果・適用条件は個人の状況により異なります。</small></p></section>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      "上限金利だけ / 下限金利だけを並べた比較表"
    ],
    "ymyl_requirements_met": [
      "金利範囲全体（下限〜上限）を同一条件で提示",
      "各社の在籍確認表現を正式表記に統一"
    ],
    "annotations_added": [
      "※申込時間・審査による旨の注記",
      "※条件充足の注記"
    ]
  },
  "evidence_refs": [
    "プロミス公式サイト",
    "SMBCモビット公式サイト",
    "アイフル公式サイト",
    "アコム公式サイト",
    "レイク公式サイト"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "ターゲットクエリへの embedding 深度向上（横断比較表の新設により金利比較コンテンツを補強）"
}
```

### diff #2 — h2#即日融資が可能なカードローンおすすめランキング

- change_type: `insert_after`
- change_category: `evidence_insertion`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<section id="kinri-eikyo-kaisetsu"><h3>金利の違いが返済負担に与える影響</h3><p>金利（実質年率）の差は、借入金額が増えるほど・返済期間が長くなるほど、利息総額に大きな差を生みます。たとえば同じ消費者金融でも、適用される金利が異なれば返済負担は変わります。目安として、低金利が適用されやすいのは一般に高額借入時です。借入前に各社の金利範囲全体を確認し、自分の借入額に対してどの水準が適用される可能性があるかを公式サイトのシミュレーターで確認することをおすすめします。</p><p><small>※金利の適用は審査結果により異なります。下限金利が適用されるとは限りません。</small></p></section>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利差の影響を定性的に説明",
      "下限金利適用保証の誤解を防ぐ注記を付加"
    ],
    "annotations_added": [
      "※金利の適用は審査結果により異なる旨の注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "金利比較の意図への対応",
  "expected_delta": "金利比較クエリに対するコンテンツ深度の向上"
}
```

### diff #3 — h3#10万円借りた場合の返済シミュレーション

- change_type: `rewrite_section`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<h3>10万円借りた場合の返済シミュレーション</h3>
```

**content_after**
```html
<h3>10万円借りた場合の返済シミュレーション（プロミスを例に）</h3><p>金利による返済負担の違いを理解するために、プロミス（実質年率2.5%〜18.0%）を例に、10万円を借り入れた場合の利息を試算します。</p><div class="table-responsive"><table><thead><tr><th>適用金利（実質年率）</th><th>借入金額</th><th>返済期間の目安</th><th>利息の目安（総額）</th></tr></thead><tbody><tr><td>2.5%（下限）</td><td>10万円</td><td>12ヶ月</td><td>約1,370円</td></tr><tr><td>18.0%（上限）</td><td>10万円</td><td>12ヶ月</td><td>約9,850円</td></tr></tbody></table></div><p>上記は元利均等返済・年365日計算による概算値です。実際の返済額は契約条件・返済方式により異なります。適用される金利は審査結果によって決まるため、事前に公式サイトのシミュレーターでご確認ください。</p><p>なお、アコムについては公式サイトの<a href="https://www.acom.co.jp/" rel="noopener noreferrer" target="_blank">返済シミュレーター</a>をご利用ください。</p><p><small>※お申込時間や審査によりご希望に添えない場合がございます。</small></p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [
      "アコムの具体的返済額シミュレーション（master_rules パートナー個別ルール）"
    ],
    "ymyl_requirements_met": [
      "プロミスの金利範囲全体を用いた定量的説明",
      "アコムは公式シミュレーター誘導のみ",
      "概算値である旨・審査結果による旨の注記"
    ],
    "annotations_added": [
      "概算値注記",
      "審査結果により金利が異なる旨"
    ]
  },
  "evidence_refs": [
    "プロミス公式サイト（金利2.5%〜18.0%）"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "金利と返済シミュレーション",
  "expected_delta": "プロミスの shallow_fact 深度向上・定量的金利比較コンテンツの補強"
}
```

### diff #4 — h3#30万円借りた場合の返済シミュレーション

- change_type: `rewrite_section`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<h3>30万円借りた場合の返済シミュレーション</h3>
```

**content_after**
```html
<h3>30万円借りた場合の返済シミュレーション（プロミスを例に）</h3><p>30万円を借り入れた場合、金利の差がより大きく返済負担に影響します。プロミス（実質年率2.5%〜18.0%）を例に概算を示します。</p><div class="table-responsive"><table><thead><tr><th>適用金利（実質年率）</th><th>借入金額</th><th>返済期間の目安</th><th>利息の目安（総額）</th></tr></thead><tbody><tr><td>2.5%（下限）</td><td>30万円</td><td>12ヶ月</td><td>約4,110円</td></tr><tr><td>18.0%（上限）</td><td>30万円</td><td>12ヶ月</td><td>約29,560円</td></tr></tbody></table></div><p>同じ30万円の借入でも、適用金利が2.5%と18.0%では利息総額に約2万5,000円以上の差が生じる計算です（12ヶ月・元利均等返済・年365日計算の概算）。金利が低いほど同じ返済期間での利息負担を抑えられます。</p><p>適用される金利は審査結果により異なります。事前に各社公式サイトのシミュレーターでご確認ください。なお、アコムについては<a href="https://www.acom.co.jp/" rel="noopener noreferrer" target="_blank">アコム公式サイトの返済シミュレーター</a>をご利用ください。</p><p><small>※上記はあくまで概算です。実際の返済額は契約内容・返済方式により異なります。</small></p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [
      "アコムの具体的返済額シミュレーション（master_rules パートナー個別ルール）"
    ],
    "ymyl_requirements_met": [
      "30万円での金利差の定量的説明",
      "アコムは公式シミュレーター誘導のみ",
      "概算値注記"
    ],
    "annotations_added": [
      "概算値注記",
      "審査結果により金利が異なる旨"
    ]
  },
  "evidence_refs": [
    "プロミス公式サイト（金利2.5%〜18.0%）"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "金利と返済シミュレーション",
  "expected_delta": "金利差が利息総額に与える影響の定量的説明を追加しコンテンツ深度向上"
}
```

### diff #5 — h3#1位:プロミス｜最短3分融資・金利2.5%~18.0%

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<p>プロミスは最短3分で融資が可能(※1)で、業界最速クラスのスピードを誇ります。下限金利2.5%は大手消費者金融の中で最も低く、高額借入時の利息負担を抑えられます。

無利息期間は初回利用翌日から起算されるため、契約後すぐに借りなくても損をしません。原則として電話での在籍確認はなく、多くの場合が書類確認で完了しています。

18歳から申込可能（高校生を除く）で、若年層にも対応しています。(※2)Web完結申込なら郵送物なしで契約でき(※3)、家族に知られる心配もありません。</p>
```

**content_after**
```html
<p>プロミスは最短3分で融資が可能（※1）で、急ぎの資金調達に対応しています。SMBCグループの一員として安心感があり、初めてカードローンを利用する方にも選ばれています。</p><p>金利は実質年率2.5%〜18.0%で、適用される金利は審査結果によって決まります。一般的に借入金額が大きくなるほど低い金利が適用されやすい傾向がありますが、詳細は審査によります。</p><p>無利息期間は<strong>初回利用翌日から最大30日間</strong>（※メールアドレス登録とWeb明細利用の登録が必要）で、契約後すぐに利用しなくても無利息期間が消化されない点が特徴です。急に資金が必要になった場合でも、初回借入日を起算日とするため無駄なく活用できます。</p><p>原則として電話による在籍確認なしで対応しており、多くの場合は書類確認で在籍確認が完了します。Web完結申込を選択すれば原則郵送物なしで契約でき（※3）、周囲に知られにくい借り方が可能です。18歳から申込可能（高校生を除く）で、若年層にも対応しています（※2）。</p><p><small>※1:お申込み時間や審査によりご希望に添えない場合がございます。</small><br><small>※2:主婦・学生でもアルバイト・パートなど安定した収入のある場合はお申込いただけます。ただし、高校生（定時制高校生および高等専門学校生も含む）はお申込いただけません。また、収入が年金のみの方はお申込いただけません。</small><br><small>※3:手続きによって発生する場合もあり。</small></p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": [
      0
    ]
  },
  "compliance": {
    "violations": [
      "業界最速クラス（master_rules 禁止表現）"
    ],
    "ymyl_requirements_met": [
      "無利息期間の起算点を正式表記で明記",
      "原則電話による在籍確認なしの正式表現に修正",
      "SMBCグループの安心感を記述",
      "金利範囲全体を提示"
    ],
    "annotations_added": [
      "無利息期間のメールアドレス登録・Web明細登録要件",
      "申込時間・審査による旨の注記"
    ]
  },
  "evidence_refs": [
    "プロミス公式サイト"
  ],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "プロミスの特徴・利用シナリオ",
  "expected_delta": "プロミスの shallow_fact 深度向上・利用シナリオ別の記述を強化"
}
```

### diff #6 — h3#4位:アコム｜最短20分融資(※a)・審査通過率39.3%

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<p>アコムは2026年1月6日より金利を引き下げ、年2.4%〜17.9%になりました。上限金利が17.9%と他社より低く、少額借入時の利息負担が軽減されます。

審査通過率は39.3%（2025年3月期アコムマンスリーレポート）で、大手消費者金融として公表されている数値です。最短20分で融資が可能(※1)で、原則として電話での在籍確認はありません。

契約翌日から初回最大30日間無利息サービスがあり、最大800万円まで借入可能です。</p>
```

**content_after**
```html
<p>アコムは2026年1月6日より金利を引き下げ、実質年率2.4%〜17.9%となりました。大手消費者金融の中でも上限金利が17.9%と比較的低く設定されています。適用される金利は審査結果により異なります。</p><p>最短20分での融資が可能（※1）ですが、当日中に契約を完了させるには<strong>21時までの申込・契約手続き完了</strong>が必要です。申込時間や審査状況によってはご希望に添えない場合があります。</p><p>審査通過率は39.3%（出典：2025年3月期アコムマンスリーレポート）で、大手消費者金融の中で公式に開示されている数値です。</p><p>在籍確認は<strong>原則お勤め先へ電話による在籍確認なし（書面確認）</strong>で対応しています。カードレス契約を選択した場合は原則郵送物なしで手続きが完了しますが、本人確認のための郵送が発生する場合があります。</p><p>初めてアコムをご利用の方は<strong>契約翌日から初回最大30日間無利息</strong>サービスをご利用いただけます。返済額の目安については<a href="https://www.acom.co.jp/" rel="noopener noreferrer" target="_blank">アコム公式サイトの返済シミュレーター</a>をご確認ください。</p><p><small>※1:お申込時間や審査によりご希望に添えない場合がございます。アコムの当日契約の期限は21時までです。</small></p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": [
      1
    ]
  },
  "compliance": {
    "violations": [
      "アコムの具体的返済額シミュレーション（master_rules パートナー個別ルール）"
    ],
    "ymyl_requirements_met": [
      "当日契約21時期限の明記",
      "審査通過率の出典明示",
      "原則電話による在籍確認なしの正式表現",
      "カードレス時の郵送物の扱いを明記",
      "アコムは公式シミュレーター誘導のみ"
    ],
    "annotations_added": [
      "21時までの申込期限注記",
      "審査状況による旨の注記",
      "本人確認郵送が発生する場合がある旨"
    ]
  },
  "evidence_refs": [
    "アコム公式サイト",
    "2025年3月期アコムマンスリーレポート"
  ],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "アコムの特徴・条件詳細",
  "expected_delta": "アコムの shallow_fact 深度向上・条件詳細の記述強化"
}
```

### diff #7 — h3#無利息期間を最大限活用するコツ

- change_type: `insert_after`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<section id="murisoku-kinri-hikaku"><h3>無利息期間終了後の金利差を踏まえた選び方</h3><p>無利息期間はいずれ終了します。無利息期間後に残高が残る場合、適用される実質年率の差が返済負担に影響します。各社の金利範囲を改めて確認しましょう。</p><ul><li><strong>プロミス</strong>：実質年率2.5%〜18.0%（無利息期間：初回利用翌日から最大30日間）</li><li><strong>アイフル</strong>：実質年率3.0%〜18.0%（無利息期間：契約翌日から最大30日間）</li><li><strong>アコム</strong>：実質年率2.4%〜17.9%（無利息期間：契約翌日から初回最大30日間）</li><li><strong>レイク</strong>：実質年率4.5%〜18.0%（無利息期間：条件により30日／60日／最大365日）</li></ul><p>無利息期間が長いレイクは、長期利用を想定する場合に有利に見えますが、無利息期間終了後の下限金利は4.5%とやや高めです。短期返済が見込める場合は、金利水準と無利息期間の組み合わせを総合的に判断することをおすすめします。</p><p><small>※適用される金利は審査結果により異なります。必ず各社公式サイトで最新情報をご確認ください。</small></p></section>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "無利息期間と金利を組み合わせた実質負担の観点を提示",
      "金利範囲全体を正式表記で提示",
      "審査結果により金利が異なる旨の注記"
    ],
    "annotations_added": [
      "審査結果により金利が異なる旨の注記"
    ]
  },
  "evidence_refs": [
    "各社公式サイト"
  ],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "金利比較・無利息期間の実質的価値",
  "expected_delta": "無利息期間と金利を組み合わせた解説により金利比較クエリへの対応強化"
}
```

---

# Session 26 (2/11) — Session 26

- post_id: **11077**
- triggered_by: validation-run
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: approved
- high_risk_categories: ["rate_update"]
- tokens: analysis 8832/1823 | generation 13012/12826
- started_at: 2026-05-22 03:15:07
- analysis_completed_at: 2026-05-22 03:15:40
- generation_completed_at: 2026-05-22 03:18:33

## bundle snapshot (session.notes、3 系統)

- target_query: **即日融資 カードローン 金利 比較**
- required_additions (A 系統): 0 件
- shallow_queries    (B 系統): 1 件
- shallow_facts      (C 系統): 2 件

### B: shallow_queries

```json
[
  {
    "query_text": "即日融資 カードローン 金利 比較",
    "self_max": 0.55,
    "comp_max": 0.65,
    "delta": 0.05,
    "threshold": 0.7000000000000001
  }
]
```

### C: shallow_facts

```json
[
  {
    "fact_text": "プロミス",
    "layer": 1,
    "self_max": 0.4,
    "comp_max": 0.55,
    "delta": -0.05,
    "threshold": 0.5
  },
  {
    "fact_text": "アコム",
    "layer": 1,
    "self_max": 0.45,
    "comp_max": 0.58,
    "delta": -0.05,
    "threshold": 0.5299999999999999
  }
]
```

## analysis_output (工程6'-A Opus 4.7)

```json
{
  "structural_analysis": "本記事はカードローン10社の比較ランキングを中心に、即日融資・低金利・無利息期間・審査不安など読者ニーズ別に整理された網羅性の高い構成である。目次・各社基本情報テーブル・注釈表示・監修者情報も整備されており、YMYL記事としての基本要件は満たしている。一方で target_query『即日融資 カードローン 金利 比較』に対する embedding 類似度が self_max 0.55 と競合 0.65 を下回り、特に『即日融資』と『金利』を同一軸で横断比較する視点が弱い。プロミス・アコムの個別記述深度も競合より浅く、各社のスペック羅列に留まり、金利と融資スピードのトレードオフ解説や具体的な選び分け基準の言語化が不足している。また即日融資条件（申込時間、必要書類、振込実行時間帯）の実務情報の厚みも改善余地がある。比較表は存在するが、即日融資×金利の二軸クロス比較が独立セクションとして弱い点が主課題。",
  "rewrite_policy": [
    {
      "policy_text": "『即日融資×金利』を同一軸で横断比較する独立セクションを追加。最短審査時間・上限金利・下限金利・無利息期間を一覧化したクロス比較表を設置し、金利範囲全体（下限〜上限）で同一条件比較する形式とする。スピード重視と金利重視の選び分け基準を読者ニーズ別に言語化する。",
      "priority": 1,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_after",
        "rewrite_section"
      ],
      "target_change_categories": [
        "h2_structure",
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "プロミス紹介セクションを増強。金利2.5〜18.0%の範囲別適用条件、最短3分融資の具体的フロー（申込→審査→契約→振込までの時系列）、初回最大30日間無利息（初回利用翌日起算）の起算ルール、原則電話による在籍確認なしの運用実態を、公式情報の出典付きで厚く記述する。誇大表現（業界最速等）は避ける。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": [
          0
        ]
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion",
        "compliance_update"
      ]
    },
    {
      "policy_text": "アコム紹介セクションを増強。2026年1月6日施行の金利引き下げ（年2.4〜17.9%）の背景・適用条件、即日融資の所要時間、無利息期間条件の運用を公式出典付きで記述。ただしアフィリエイト規約に従い、具体的な返済額シミュレーション数値は提示せず公式サイト参照に誘導する形に留める。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": [
          1
        ]
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion",
        "compliance_update"
      ]
    },
    {
      "policy_text": "即日融資を成立させるための実務条件（申込締切時間、本人確認書類のWEB提出、在籍確認の代替書類、振込実行可能時間帯、土日祝の対応可否）を H3 単位で整理し、各社の差異を表形式で補強する。『即日融資 カードローン』クエリの網羅深度を底上げする。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_section",
        "insert_after"
      ],
      "target_change_categories": [
        "h2_structure",
        "paragraph_rewrite"
      ]
    },
    {
      "policy_text": "在籍確認・無利息期間の表現を master_rules に厳密準拠させる校正。『電話連絡なし』→『原則電話による在籍確認なし』、『30日間無利息』→『初回最大30日間無利息』、『在籍確認なし』→『原則電話によるお勤め先への在籍確認なし』など、商材言及箇所の表現を一括点検する。比較表で上限金利のみ並べた箇所があれば金利範囲全体表記に修正する。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_paragraph"
      ],
      "target_change_categories": [
        "compliance_update",
        "paragraph_rewrite"
      ]
    }
  ],
  "high_risk_categories": [
    "rate_update"
  ],
  "confidence": "medium",
  "protected_blocks_acknowledged": true
}
```

## master_rewrite_diff (工程6'-B Sonnet 4.6) — 15 件

risk_flag distribution: {"major_restructure":1,"(null)":7,"rate_update":4,"regulation_citation":1,"title_change":2}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | h2#即日融資が必要なら消費者金融を選ぼう | insert_before | h2_structure | major_restructure | high |
| 2 | h3#即日融資可能なカードローン一覧 | rewrite_section | paragraph_rewrite |  | high |
| 3 | h3#即日融資を受けるための条件と注意点 | rewrite_section | paragraph_rewrite |  | high |
| 4 | h3#1位：プロミス｜金利2.5%~18.0%・最短3分融資 | rewrite_paragraph | paragraph_rewrite | rate_update | high |
| 5 | h3#1位：プロミス｜金利2.5%~18.0%・最短3分融資 | insert_evidence | evidence_insertion | regulation_citation | medium |
| 6 | h3#3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9% | rewrite_paragraph | paragraph_rewrite | rate_update | high |
| 7 | h3#3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9% | insert_evidence | evidence_insertion | rate_update | high |
| 8 | h3#在籍確認なし・郵送物なしのカードローン | rewrite_paragraph | compliance_update |  | high |
| 9 | h2#即日融資が必要なら消費者金融を選ぼう | rewrite_paragraph | compliance_update |  | medium |
| 10 | h2#低金利で借りたいなら銀行カードローンがおすすめ | rewrite_paragraph | compliance_update |  | high |
| 11 | h3#無利息期間があるカードローン一覧 | rewrite_paragraph | compliance_update |  | high |
| 12 | meta:title | update_title | title | title_change | high |
| 13 | meta:description | update_meta_description | title | title_change | high |
| 14 | h2#【2026年最新】カードローンおすすめランキングTOP10 | insert_after | evidence_insertion | rate_update | high |
| 15 | h3#2位：SMBCモビット｜WEB完結で原則、電話連絡・郵送物なし | rewrite_paragraph | compliance_update |  | high |

### diff #1 — h2#即日融資が必要なら消費者金融を選ぼう

- change_type: `insert_before`
- change_category: `h2_structure`
- risk_flag: `major_restructure`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<section id="sokujitsu-kinri-cross">
  <h2>即日融資×金利で選ぶカードローン比較【2026年最新】</h2>
  <p>急いでお金が必要な方は「融資スピード」、返済負担を抑えたい方は「金利」に着目してカードローンを選ぶことが重要です。以下のクロス比較表では、即日融資に対応している消費者金融5社の最短審査時間・金利範囲・無利息期間を一覧化しています。</p>
  <table>
    <caption>即日融資対応カードローン 金利・スピード比較（2026年1月時点）</caption>
    <thead>
      <tr>
        <th>会社名</th>
        <th>金利（年率）</th>
        <th>最短審査時間</th>
        <th>無利息期間</th>
        <th>在籍確認</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>プロミス</td>
        <td>2.5%〜18.0%</td>
        <td>最短3分（※1）</td>
        <td>初回最大30日間（※2）</td>
        <td>原則電話によるお勤め先への在籍確認なし</td>
      </tr>
      <tr>
        <td>SMBCモビット</td>
        <td>3.0%〜18.0%</td>
        <td>最短15分（※3）</td>
        <td>なし</td>
        <td>WEB完結で原則電話によるお勤め先への在籍確認なし</td>
      </tr>
      <tr>
        <td>アコム</td>
        <td>2.4%〜17.9%</td>
        <td>最短20分（※4）</td>
        <td>初回最大30日間（※5）</td>
        <td>原則電話によるお勤め先への在籍確認なし（書面確認）</td>
      </tr>
      <tr>
        <td>アイフル</td>
        <td>3.0%〜18.0%</td>
        <td>最短14分（※6）</td>
        <td>初回最大30日間（※7）</td>
        <td>在籍確認の99.1%が電話以外の方法で完了（※8）</td>
      </tr>
      <tr>
        <td>レイク</td>
        <td>4.5%〜18.0%</td>
        <td>最短15秒（WEB仮審査・※9）</td>
        <td>最大365日間（※10）</td>
        <td>原則電話によるお勤め先への在籍確認なし</td>
      </tr>
    </tbody>
  </table>
  <p class="table-note">※1:お申込時間や審査によりご希望に添えない場合がございます。※2:メールアドレス登録とWeb明細利用の登録が必要です。初回利用翌日から起算。※3:申込の曜日、時間帯によっては翌日以降の取扱となる場合があります。※4:お申込時間や審査によりご希望に添えない場合がございます。アコムの当日契約の期限は21時まで。※5:アコムでのご契約が初めてのお客さまが対象。※6:お申込の時間帯・審査によりご希望に添えない場合があります。※7:初回利用翌日から起算。※8:出典:アイフル公式HP。※9:WEB本審査の結果通知は別途時間がかかります。※10:対象商品・条件あり、詳細は公式サイトをご確認ください。</p>
  <h3>スピード重視 vs 金利重視の選び分け基準</h3>
  <p><strong>今日中に借りたい方（スピード重視）</strong>は、消費者金融を選びましょう。消費者金融は警察庁データベース照会が不要なため、最短数分〜数十分で審査が完了し、即日融資に対応しています。金利は銀行より高めですが、無利息期間を活用して短期返済することで利息負担を抑えられます。</p>
  <p><strong>金利を抑えて長期返済したい方（金利重視）</strong>は、銀行カードローンが有利です。上限金利は14〜15%程度と消費者金融より低く、100万円以上の借入では特に差が出ます。ただし審査には最短でも翌営業日以降かかるため、即日融資には対応していません。</p>
  <p><strong>無利息期間で利息ゼロを狙いたい方</strong>は、初回最大30日間無利息（プロミス・アコム・アイフル等）または業界最長365日間無利息（レイク・一部商品対象）のあるカードローンが最適です。無利息期間内に完済できる見込みがある場合に特に効果的です。</p>
  <p class="caution">※上記情報は2026年1月時点のものです。最新の情報は各社公式サイトでご確認ください。ご利用は計画的に。返済能力を超えた借入にご注意ください。</p>
</section>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体表記（下限〜上限）で比較",
      "在籍確認は「原則電話によるお勤め先への在籍確認なし」表記",
      "無利息期間は「初回最大30日間」表記"
    ],
    "annotations_added": [
      "各注釈番号付き",
      "情報更新時点明記",
      "計画的利用の注意書き"
    ]
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資×金利の横断比較",
  "expected_delta": "embedding類似度のself_max(0.55)からcomp_max(0.65)へのギャップを埋め、target_queryへの網羅深度を向上"
}
```

### diff #2 — h3#即日融資可能なカードローン一覧

- change_type: `rewrite_section`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<h3>即日融資可能なカードローン一覧</h3>
```

**content_after**
```html
<h3>即日融資可能なカードローン一覧</h3>
<p>即日融資が可能な消費者金融では、申込から振込完了までのフローをあらかじめ把握しておくことが重要です。以下に主要各社の即日融資の実務条件をまとめます。</p>
<table>
  <caption>即日融資の実務条件比較（2026年1月時点）</caption>
  <thead>
    <tr>
      <th>会社名</th>
      <th>申込締切目安</th>
      <th>本人確認書類</th>
      <th>振込可能時間帯</th>
      <th>土日祝対応</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>プロミス</td>
      <td>21時頃まで（目安）</td>
      <td>WEBアップロード対応</td>
      <td>審査完了後、原則24時間振込</td>
      <td>○（土日祝も審査対応）</td>
    </tr>
    <tr>
      <td>SMBCモビット</td>
      <td>21時頃まで（目安）</td>
      <td>WEBアップロード対応</td>
      <td>審査完了後、銀行振込</td>
      <td>○（土日祝も審査対応）</td>
    </tr>
    <tr>
      <td>アコム</td>
      <td>当日契約は21時まで（※）</td>
      <td>WEBアップロード対応</td>
      <td>審査完了後、原則24時間振込</td>
      <td>○（土日祝も審査対応）</td>
    </tr>
    <tr>
      <td>アイフル</td>
      <td>21時頃まで（目安）</td>
      <td>WEBアップロード対応</td>
      <td>審査完了後、原則24時間振込</td>
      <td>○（土日祝も審査対応）</td>
    </tr>
    <tr>
      <td>レイク</td>
      <td>21時頃まで（目安）</td>
      <td>WEBアップロード対応</td>
      <td>審査完了後、原則24時間振込</td>
      <td>○（土日祝も審査対応）</td>
    </tr>
  </tbody>
</table>
<p class="table-note">※アコムの当日契約の期限は21時まで。申込時間や審査状況によりご希望に添えない場合があります。最新の締切時間は各社公式サイトをご確認ください。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "即日融資の実務条件を具体的に記述",
      "申込締切時間の注釈あり"
    ],
    "annotations_added": [
      "申込時間・審査状況による注釈",
      "公式サイト確認誘導"
    ]
  },
  "evidence_refs": [],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資の実務条件の網羅深度向上",
  "expected_delta": "即日融資クエリに対するコンテンツ充実度を改善"
}
```

### diff #3 — h3#即日融資を受けるための条件と注意点

- change_type: `rewrite_section`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<h3>即日融資を受けるための条件と注意点</h3>
```

**content_after**
```html
<h3>即日融資を受けるための条件と注意点</h3>
<p>即日融資を成立させるためには、以下の条件を満たす必要があります。申込前に確認しておきましょう。</p>
<h4>申込時間・締切時間</h4>
<p>消費者金融の即日融資は、原則として当日の申込締切時間（各社目安として21時頃）までに申込・審査・契約が完了する必要があります。締切時間を過ぎると翌日以降の融資となる場合があります。</p>
<h4>本人確認書類のWEB提出</h4>
<p>WEB申込の場合、運転免許証・マイナンバーカードなどの本人確認書類をスマートフォンやPCで撮影してアップロードすることで、郵送不要で手続きが完了します。書類の鮮明な画像を準備しておくと審査がスムーズです。</p>
<h4>在籍確認の代替書類</h4>
<p>多くの消費者金融では、原則電話によるお勤め先への在籍確認なしで手続きが完了します。ただし、審査内容によっては健康保険証・給与明細など在籍を証明する書類の提出を求められる場合があります。</p>
<h4>振込実行可能時間帯</h4>
<p>振込は審査・契約完了後、金融機関の振込処理時間内であれば原則即日対応となります。深夜帯は翌朝の振込となる場合があるため、余裕を持った申込を推奨します。</p>
<h4>土日祝日の対応</h4>
<p>主要消費者金融（プロミス・アコム・アイフル・SMBCモビット・レイク等）は土日祝日も審査・融資に対応しています。ただし、銀行振込の処理時間の関係で、振込完了が翌営業日になる場合があります。</p>
<p class="caution">※申込時間・審査状況によりご希望に添えない場合があります。最新情報は各社公式サイトをご確認ください。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "在籍確認は「原則電話によるお勤め先への在籍確認なし」表記",
      "申込時間の注意書き付き"
    ],
    "annotations_added": [
      "公式サイト確認誘導",
      "審査状況による注釈"
    ]
  },
  "evidence_refs": [],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資の実務情報の網羅性",
  "expected_delta": "即日融資条件の詳細情報を補強し、実務的な検索意図に応答"
}
```

### diff #4 — h3#1位：プロミス｜金利2.5%~18.0%・最短3分融資

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<p>プロミスは金利が年2.5%~18.0%と契約金額が大きい場合に適用される下限金利が大手消費者金融の中で最も低く、最短3分融資(※1)という業界最速のスピードを誇ります。
無利息期間は初回利用翌日から30日間と、契約日ではなく実際に借入した日から起算されるため、契約後すぐに借りない場合でも無駄がありません。18歳から申込可能（高校生除く）で、若年層にも対応しています。(※2)
原則電話での在籍確認なしで、98%の方が電話以外の方法で完了しています。(※3)最大500万円まで借入可能で、SMBCグループの安心感もあります。</p>
```

**content_after**
```html
<p>プロミスは金利が年2.5%〜18.0%で、借入額が大きくなるほど低金利が適用される仕組みです。融資スピードは最短3分（※1）で、申込からATM・振込での借入完了までのフローは「WEB申込（スマホ・PC）→本人確認書類のWEBアップロード→審査→WEB契約→振込またはATM借入」という流れで手続きが完結します。</p>
<p>無利息期間は<strong>初回最大30日間（初回利用翌日から起算）</strong>（※2）です。契約日ではなく実際に借入した日の翌日から起算されるため、契約後すぐに借りない場合でも無利息期間が無駄になりません。短期間での返済を予定している方に特に有利な条件です。</p>
<p>原則電話によるお勤め先への在籍確認なし（※3）で、98%の方が電話以外の方法で手続きを完了しています。18歳から申込可能（高校生除く）（※4）で、SMBCグループとしての安心感もあります。</p>
<p class="caution">※1:お申込時間や審査によりご希望に添えない場合がございます。※2:メールアドレス登録とWeb明細利用の登録が必要です。※3:出典:プロミス公式HP。※4:主婦・学生でもアルバイト・パートなど安定した収入のある場合はお申込いただけます。ただし、高校生（定時制高校生および高等専門学校生も含む）はお申込いただけません。また、収入が年金のみの方はお申込いただけません。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": [
      0
    ]
  },
  "compliance": {
    "violations": [
      "「業界最速」という禁止表現を削除",
      "「30日間無利息」を「初回最大30日間」に修正"
    ],
    "ymyl_requirements_met": [
      "融資フローの時系列記述",
      "無利息起算ルールの明確化",
      "在籍確認表現の正式表記"
    ],
    "annotations_added": [
      "各注釈番号付き"
    ]
  },
  "evidence_refs": [
    "プロミス公式HP"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "プロミスの融資スピード・金利情報の深度",
  "expected_delta": "shallow_fact gap(self_max 0.40 vs comp_max 0.55)を埋め、プロミスの詳細情報を充実"
}
```

### diff #5 — h3#1位：プロミス｜金利2.5%~18.0%・最短3分融資

- change_type: `insert_evidence`
- change_category: `evidence_insertion`
- risk_flag: `regulation_citation`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<div class="evidence-box">
  <h4>プロミスの金利適用条件（参考）</h4>
  <p>プロミスの金利年2.5%〜18.0%は、借入額・審査結果によって決定されます。一般的に借入額が大きいほど低金利が適用される傾向があります（審査結果により異なります）。具体的な適用金利は審査完了後に通知されます。</p>
  <ul>
    <li>借入元本が10万円未満：利息制限法上限は年20%（プロミス上限は年18.0%）</li>
    <li>借入元本が10万円以上100万円未満：利息制限法上限は年18%（プロミス上限は年18.0%）</li>
    <li>借入元本が100万円以上：利息制限法上限は年15%（プロミス下限は年2.5%）</li>
  </ul>
  <p>※上記はあくまで参考です。実際の適用金利は審査結果によります。最新情報は<a href="https://www.promise.co.jp/" rel="noopener noreferrer" target="_blank">プロミス公式サイト</a>をご確認ください。</p>
  <p>出典：利息制限法第1条、プロミス公式サイト（2026年1月時点）</p>
</div>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": [
      0
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "利息制限法に基づく金利上限の説明",
      "出典明記",
      "審査結果により異なる旨の注記"
    ],
    "annotations_added": [
      "利息制限法引用",
      "公式サイト参照誘導"
    ]
  },
  "evidence_refs": [
    "利息制限法第1条",
    "プロミス公式サイト"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "プロミスの金利条件の具体性",
  "expected_delta": "金利範囲別の適用条件を追記し情報深度を向上"
}
```

### diff #6 — h3#3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9%

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<h3>3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9%</h3>
```

**content_after**
```html
<h3>3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9%</h3>
<p>アコムは2026年1月6日より金利を引き下げ、実質年率<strong>2.4%〜17.9%</strong>となりました（※a）。改定前と比較して上限・下限ともに引き下げられており、特に高額借入時の金利改善が図られています。適用金利は借入額・審査結果によって決定されます。</p>
<p>融資スピードは最短20分（※a）で、申込から借入完了までのフローは「WEB申込→本人確認書類のWEBアップロード→審査→WEB契約（21時まで）→振込またはATM借入」です。当日契約の受付は21時まで（※a2）となっています。</p>
<p>無利息期間は<strong>初回最大30日間</strong>（※a4）で、アコムでのご契約が初めてのお客さまが対象です。在籍確認は原則電話によるお勤め先への在籍確認なし（書面確認）（※a）で対応しています。</p>
<p>返済額の具体的なシミュレーションについては、<a href="https://www.acom.co.jp/" rel="noopener noreferrer" target="_blank">アコム公式サイト</a>の返済シミュレーターをご利用ください。</p>
<p class="caution">※a:お申込時間や審査によりご希望に添えない場合がございます。※a2:アコムの当日契約の期限は21時まで。※a4:アコムでのご契約が初めてのお客さまが対象。出典:アコム公式サイト（2026年1月時点）。最新情報はアコム公式サイトをご確認ください。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": [
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "2026年1月6日金利改定の背景・適用条件記述",
      "即日融資フローの時系列記述",
      "無利息期間条件の明確化",
      "アコム公式サイトへのシミュレーション誘導（アフィリエイト規約準拠）",
      "在籍確認は正式表記"
    ],
    "annotations_added": [
      "公式サイト参照誘導",
      "注釈番号付き",
      "情報更新時点明記"
    ]
  },
  "evidence_refs": [
    "アコム公式サイト"
  ],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "アコムの金利・即日融資情報の深度",
  "expected_delta": "shallow_fact gap(self_max 0.45 vs comp_max 0.58)を埋め、アコムの詳細情報を充実"
}
```

### diff #7 — h3#3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9%

- change_type: `insert_evidence`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<div class="evidence-box">
  <h4>アコム 2026年1月6日 金利改定について</h4>
  <p>アコムは2026年1月6日より実質年率を引き下げました。新金利は<strong>年2.4%〜17.9%</strong>です。適用金利は借入額・審査結果によって異なります。改定の詳細および最新情報は<a href="https://www.acom.co.jp/" rel="noopener noreferrer" target="_blank">アコム公式サイト</a>をご確認ください。</p>
  <p>出典：アコム公式サイト（2026年1月時点）</p>
</div>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": [
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利改定情報の出典明記",
      "公式サイト参照誘導"
    ],
    "annotations_added": [
      "出典明記",
      "情報更新時点明記"
    ]
  },
  "evidence_refs": [
    "アコム公式サイト"
  ],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "アコム金利改定情報の信頼性",
  "expected_delta": "金利改定の出典を明示し、YMYL信頼性を向上"
}
```

### diff #8 — h3#在籍確認なし・郵送物なしのカードローン

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<h3>在籍確認なし・郵送物なしのカードローン</h3>
```

**content_after**
```html
<h3>原則電話によるお勤め先への在籍確認なし・郵送物なしのカードローン</h3>
<p>職場への電話連絡や自宅への郵送物を避けたい方向けのカードローンを紹介します。なお「在籍確認なし」とは、<strong>原則電話によるお勤め先への在籍確認なし</strong>を意味し、審査内容によっては書類による確認が求められる場合があります。</p>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      "「在籍確認なし」→「原則電話によるお勤め先への在籍確認なし」に修正（master_rules準拠）"
    ],
    "ymyl_requirements_met": [
      "在籍確認の正式表記への統一"
    ],
    "annotations_added": [
      "「原則」の付与による正確な表現への修正"
    ]
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "コンプライアンス表現の正確性",
  "expected_delta": "master_rulesに準拠した表現に統一し、規制リスクを軽減"
}
```

### diff #9 — h2#即日融資が必要なら消費者金融を選ぼう

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**
```html
<p>消費者金融の最大の特徴は審査スピードの速さで、最短20分で審査が完了し即日融資が可能です。</p>
```

**content_after**
```html
<p>消費者金融の最大の特徴は審査スピードの速さで、最短数分〜20分程度で審査が完了し即日融資が可能です（※申込時間や審査状況によりご希望に添えない場合があります）。銀行カードローンは警察庁データベースへの照会が義務付けられているため、審査結果の回答は最短でも翌営業日となり即日融資には対応していません。</p>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "審査時間の注釈付き",
      "銀行カードローンとの違いを明確化"
    ],
    "annotations_added": [
      "申込時間・審査状況による注釈"
    ]
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資の正確な条件説明",
  "expected_delta": "読者への正確な情報提供と注意喚起"
}
```

### diff #10 — h2#低金利で借りたいなら銀行カードローンがおすすめ

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<h3>低金利カードローンの比較表</h3>
```

**content_after**
```html
<h3>低金利カードローンの比較表（金利範囲全体）</h3>
<p>以下の比較表では、各社の<strong>金利範囲全体（下限〜上限）</strong>を掲載しています。上限金利だけでなく下限金利も確認することで、借入額に応じた実際の金利水準を把握できます。</p>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      "「上限金利だけを並べた比較表」禁止ルールへの対応（master_rules準拠）"
    ],
    "ymyl_requirements_met": [
      "金利範囲全体（下限〜上限）での比較を明示"
    ],
    "annotations_added": [
      "金利範囲全体表記の説明追記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "金利比較の正確性・透明性",
  "expected_delta": "景表法・業界自主規制に準拠した比較表記により信頼性を向上"
}
```

### diff #11 — h3#無利息期間があるカードローン一覧

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<h3>無利息期間があるカードローン一覧</h3>
```

**content_after**
```html
<h3>無利息期間があるカードローン一覧</h3>
<p>無利息期間とは、借入後一定期間の利息がかからない特典です。各社の無利息期間の条件と起算ルールは以下のとおりです。なお「30日間無利息」とは正確には「初回最大30日間無利息」を指し、適用には初回契約・メールアドレス登録など一定の条件が必要です。</p>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      "「30日間無利息」→「初回最大30日間無利息」に正式表記修正（master_rules準拠）"
    ],
    "ymyl_requirements_met": [
      "無利息期間の適用条件を明確化"
    ],
    "annotations_added": [
      "「初回最大」の付与による正確な表現への修正"
    ]
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "無利息期間表記の正確性",
  "expected_delta": "master_rulesに準拠した表現に統一"
}
```

### diff #12 — meta:title

- change_type: `update_title`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: high

**content_before**
```html
<title>カードローンのおすすめはどこ？人気10社を徹底比較【2026年】</title>
```

**content_after**
```html
<title>カードローンおすすめ10社比較【2026年最新】即日融資・金利・無利息期間を徹底解説</title>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "target_query「即日融資 カードローン 金利 比較」のキーワードをタイトルに反映"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "検索クエリとのタイトル一致度",
  "expected_delta": "「即日融資」「金利」「比較」をタイトルに含めることでCTR向上とembedding類似度改善が期待される"
}
```

### diff #13 — meta:description

- change_type: `update_meta_description`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<meta name="description" content="2026年最新版。即日融資・金利・無利息期間を軸にカードローン人気10社を徹底比較。プロミス最短3分融資（審査状況による）、アコム金利2.4〜17.9%など各社スペックを一覧化。スピード重視vs金利重視の選び方も解説。ご利用は計画的に。" />
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "審査状況による注記付き",
      "計画的利用の注意書き",
      "金利範囲全体表記"
    ],
    "annotations_added": [
      "計画的利用の注意書き"
    ]
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "検索結果でのCTR・クエリ関連性",
  "expected_delta": "target_queryのキーワードをmeta descriptionに含めてCTR向上"
}
```

### diff #14 — h2#【2026年最新】カードローンおすすめランキングTOP10

- change_type: `insert_after`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<div class="comparison-summary">
  <h3>カードローン10社 基本スペック一覧（金利範囲全体・2026年1月時点）</h3>
  <table>
    <caption>カードローン10社比較表（金利範囲・審査スピード・即日融資対応）</caption>
    <thead>
      <tr>
        <th>会社名</th>
        <th>金利（年率）</th>
        <th>最短審査時間</th>
        <th>即日融資</th>
        <th>無利息期間</th>
        <th>種別</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>プロミス</td>
        <td>2.5%〜18.0%</td>
        <td>最短3分（※1）</td>
        <td>○</td>
        <td>初回最大30日間（※2）</td>
        <td>消費者金融</td>
      </tr>
      <tr>
        <td>SMBCモビット</td>
        <td>3.0%〜18.0%</td>
        <td>最短15分（※3）</td>
        <td>○</td>
        <td>なし</td>
        <td>消費者金融</td>
      </tr>
      <tr>
        <td>アコム</td>
        <td>2.4%〜17.9%</td>
        <td>最短20分（※4）</td>
        <td>○</td>
        <td>初回最大30日間（※5）</td>
        <td>消費者金融</td>
      </tr>
      <tr>
        <td>アイフル</td>
        <td>3.0%〜18.0%</td>
        <td>最短14分（※6）</td>
        <td>○</td>
        <td>初回最大30日間（※7）</td>
        <td>消費者金融</td>
      </tr>
      <tr>
        <td>レイク</td>
        <td>4.5%〜18.0%</td>
        <td>最短15秒（WEB仮審査・※8）</td>
        <td>○</td>
        <td>最大365日間（※9）</td>
        <td>消費者金融</td>
      </tr>
      <tr>
        <td>三菱UFJ銀行（バンクイック）</td>
        <td>1.8%〜14.6%</td>
        <td>最短翌営業日</td>
        <td>×</td>
        <td>なし</td>
        <td>銀行</td>
      </tr>
      <tr>
        <td>三井住友銀行</td>
        <td>1.5%〜14.5%</td>
        <td>最短翌営業日</td>
        <td>×</td>
        <td>なし</td>
        <td>銀行</td>
      </tr>
      <tr>
        <td>みずほ銀行</td>
        <td>2.0%〜14.0%</td>
        <td>最短翌営業日</td>
        <td>×</td>
        <td>なし</td>
        <td>銀行</td>
      </tr>
      <tr>
        <td>楽天銀行</td>
        <td>1.9%〜14.5%</td>
        <td>最短翌営業日</td>
        <td>×</td>
        <td>なし</td>
        <td>銀行</td>
      </tr>
    </tbody>
  </table>
  <p class="table-note">※1:お申込時間や審査によりご希望に添えない場合がございます。※2:メールアドレス登録とWeb明細利用の登録が必要です。初回利用翌日から起算。※3:申込の曜日・時間帯によっては翌日以降の取扱となる場合があります。※4:お申込時間や審査によりご希望に添えない場合がございます。当日契約期限は21時まで。※5:アコムでのご契約が初めてのお客さまが対象。※6:お申込の時間帯・審査によりご希望に添えない場合があります。※7:初回利用翌日から起算。※8:WEB本審査は別途時間がかかります。※9:対象商品・条件あり。上記情報は2026年1月時点。最新情報は各社公式サイトをご確認ください。</p>
</div>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体（下限〜上限）での比較表",
      "即日融資対応可否の明示",
      "各注釈番号付き",
      "情報更新時点明記"
    ],
    "annotations_added": [
      "全注釈付き",
      "公式サイト確認誘導"
    ]
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資×金利の横断比較の強化",
  "expected_delta": "ランキング冒頭に全社比較表を設置することで「金利 比較」クエリへの一覧性を向上"
}
```

### diff #15 — h3#2位：SMBCモビット｜WEB完結で原則、電話連絡・郵送物なし

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<p>SMBCモビットは、WEB完結申込を選択すると原則、電話連絡・郵送物なしで契約できます。</p>
```

**content_after**
```html
<p>SMBCモビットは、WEB完結申込を選択すると原則電話によるお勤め先への在籍確認なし・郵送物なしで契約できます。</p>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      "「電話連絡なし」→「原則電話による在籍確認なし」に修正（master_rules準拠）"
    ],
    "ymyl_requirements_met": [
      "在籍確認の正式表記への統一"
    ],
    "annotations_added": [
      "「原則電話によるお勤め先への在籍確認なし」への修正"
    ]
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "コンプライアンス表現の一貫性",
  "expected_delta": "master_rulesに準拠した表現統一によるリスク軽減"
}
```

---

# Session 27 (3/11) — Session 27

- post_id: **11082**
- triggered_by: validation-run
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: (null)
- high_risk_categories: []
- tokens: analysis 8662/2031 | generation 13235/11061
- started_at: 2026-05-22 03:19:32
- analysis_completed_at: 2026-05-22 03:20:09
- generation_completed_at: 2026-05-22 03:22:47

## bundle snapshot (session.notes、3 系統)

- target_query: **即日融資 カードローン 金利 比較**
- required_additions (A 系統): 0 件
- shallow_queries    (B 系統): 1 件
- shallow_facts      (C 系統): 2 件

### B: shallow_queries

```json
[
  {
    "query_text": "即日融資 カードローン 金利 比較",
    "self_max": 0.55,
    "comp_max": 0.65,
    "delta": 0.05,
    "threshold": 0.7000000000000001
  }
]
```

### C: shallow_facts

```json
[
  {
    "fact_text": "プロミス",
    "layer": 1,
    "self_max": 0.4,
    "comp_max": 0.55,
    "delta": -0.05,
    "threshold": 0.5
  },
  {
    "fact_text": "アコム",
    "layer": 1,
    "self_max": 0.45,
    "comp_max": 0.58,
    "delta": -0.05,
    "threshold": 0.5299999999999999
  }
]
```

## analysis_output (工程6'-A Opus 4.7)

```json
{
  "structural_analysis": "本記事は『低金利カードローン』をテーマにしつつ、target_query『即日融資 カードローン 金利 比較』に対する網羅深度が競合に対し0.05ポイント下回っている。記事構成は金利基礎知識→おすすめ8選→比較ポイント→選び方→審査基準→返済計画→デメリット→FAQと体系的だが、『即日融資』軸での比較視点が弱く、融資スピードが見出しレベルで前面に出ていない。また、shallow_factsで指摘されたプロミス・アコムの記述深度が競合より浅く、特にアコムは『初回最大30日間無利息』『上限金利17.9%』程度の簡素な言及に留まる。商品紹介テンプレートは整っているが、即日融資の実現条件（申込締切時間、口座要否、Web完結手順）や、金利と即日性のトレードオフ比較が薄い。さらに『業界最速』『電話確認なし』など master_rules 抵触表現が散見され、コンプライアンス修正も必要。保護領域 (soico-cta-*, box-*, ez-toc-*) は触らず、本文段落の補強に専念する方針が妥当。",
  "rewrite_policy": [
    {
      "policy_text": "『即日融資×金利』の比較視点を強化するため、おすすめ8選セクションの直後または比較ポイント章内に『即日融資が可能な低金利カードローン比較表』を追加し、各社の申込締切時間・口座要否・Web完結可否・上限金利を同一条件で並列提示する。上限金利のみ/下限金利のみの並列は避け、金利範囲全体を提示する。",
      "priority": 1,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_after",
        "rewrite_section"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "プロミスの記述を深掘りし、即日融資の具体的条件（申込時間帯、Web完結手順、口座振込・アプリローン使い分け）、無利息期間の起算日（初回利用翌日から）、金利範囲全体を整理した段落を追加する。『業界最速』表現はNGのため『最短3分（※審査・申込時間により異なる）』など条件付き表現に統一する。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          0
        ]
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_after"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "compliance_update"
      ]
    },
    {
      "policy_text": "アコムの記述を深掘りし、即日融資の流れ・申込締切目安・無利息期間の正式表記『初回最大30日間無利息』への統一・上限金利と借入限度額の関係を追記する。ただしアフィリエイト規約により具体的な返済額シミュレーションは提示せず、公式サイト参照に留める。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          1
        ]
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_after"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "compliance_update"
      ]
    },
    {
      "policy_text": "『融資スピードと即日融資の可否』章を厚くし、銀行系（翌営業日以降が多い）と消費者金融系（最短即日）の構造的差異、即日融資を実現する具体条件（申込時間・本人確認方法・振込銀行）を整理する。これにより即日融資×金利のトレードオフを読者が判断できるようにする。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_section"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "h2_structure"
      ]
    },
    {
      "policy_text": "master_rules 抵触表現を全文走査し修正する。『業界最速』→削除または『最短◯分（※条件付き）』、『電話確認なし』→『原則電話による在籍確認なし』、『30日間無利息』→『初回最大30日間無利息』、『セブン銀行ATM/ローソン銀行ATM』→『セブン銀行の提携ATM/ローソン銀行の提携ATM』へ統一する。保護領域内テキストは対象外。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_paragraph"
      ],
      "target_change_categories": [
        "compliance_update"
      ]
    },
    {
      "policy_text": "FAQセクションに『即日融資で最も低金利なのはどこ？』『銀行カードローンで即日融資は可能か？』『即日融資と無利息期間はどちらを優先すべきか？』など、target_query 直撃の質問を追加し、shallow_queries の網羅深度を底上げする。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_after"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    }
  ],
  "high_risk_categories": [],
  "confidence": "medium",
  "protected_blocks_acknowledged": true
}
```

## master_rewrite_diff (工程6'-B Sonnet 4.6) — 1 件

risk_flag distribution: {"title_change":1}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | meta:title | update_title | title | title_change | medium |

### diff #1 — meta:title

- change_type: `update_title`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: medium

**content_before**
```html
<title>低金利カードローンのおすすめはどこ？金利と審査を比較【2026年】</title>
```

**content_after**
```html
<title>低金利カードローンのおすすめ比較【2026年】即日融資・金利・審査を徹底解説</title>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "過度な煽り表現なし",
      "target_queryキーワード『即日融資』『金利』『比較』を含む"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "タイトルマッチング",
  "expected_delta": "target_query『即日融資 カードローン 金利 比較』とのタイトル一致度向上によるCTR改善"
}
```

---

# Session 28 (4/11) — Session 28

- post_id: **11092**
- triggered_by: validation-run
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: (null)
- high_risk_categories: []
- tokens: analysis 8713/1661 | generation 12780/8480
- started_at: 2026-05-22 03:22:50
- analysis_completed_at: 2026-05-22 03:23:20
- generation_completed_at: 2026-05-22 03:25:12

## bundle snapshot (session.notes、3 系統)

- target_query: **即日融資 カードローン 金利 比較**
- required_additions (A 系統): 0 件
- shallow_queries    (B 系統): 1 件
- shallow_facts      (C 系統): 2 件

### B: shallow_queries

```json
[
  {
    "query_text": "即日融資 カードローン 金利 比較",
    "self_max": 0.55,
    "comp_max": 0.65,
    "delta": 0.05,
    "threshold": 0.7000000000000001
  }
]
```

### C: shallow_facts

```json
[
  {
    "fact_text": "プロミス",
    "layer": 1,
    "self_max": 0.4,
    "comp_max": 0.55,
    "delta": -0.05,
    "threshold": 0.5
  },
  {
    "fact_text": "アコム",
    "layer": 1,
    "self_max": 0.45,
    "comp_max": 0.58,
    "delta": -0.05,
    "threshold": 0.5299999999999999
  }
]
```

## analysis_output (工程6'-A Opus 4.7)

```json
{
  "structural_analysis": "本記事は銀行カードローン10選を中心に構成され、金利・限度額・審査スピードを比較する基本構造は整っているが、target_query『即日融資 カードローン 金利 比較』に対する網羅深度が競合より低い (delta 0.05、閾値 0.70 未達)。特に『即日融資』軸での横断比較が弱く、各社の即日融資可否条件 (口座保有要否・申込時間帯・在籍確認方法) を一覧化する視点が不足している。また shallow_facts でプロミス・アコムの言及深度が競合を下回っており、結論部でアコムを推奨しているものの本文中での消費者金融との具体的な比較情報 (即日融資が必要な場合の使い分け) が薄い。比較表セクションは目次に存在するが本文展開の厚みが不足。冒頭結論ブロックや CTA は保護領域のため触れず、本文の比較深掘りと即日融資軸の強化に集中すべき。",
  "rewrite_policy": [
    {
      "policy_text": "『即日融資が必要な場合』セクションを拡充し、銀行カードローン各社の即日融資条件 (口座保有要否・申込締切時間・在籍確認方法) と、即日融資対応の消費者金融 (プロミス・アコム) との使い分け基準を明示する。同一条件下での金利範囲比較を併記し、即日融資軸でのクエリ網羅性を高める。",
      "priority": 1,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          0,
          1
        ]
      },
      "target_change_types": [
        "rewrite_section",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "銀行カードローン比較表セクションを強化し、金利範囲全体 (下限〜上限) を同一条件で並べた表に再構成。即日融資可否列を追加し、shallow_query『即日融資 カードローン 金利 比較』への直接的応答性を高める。上限金利だけの羅列は景表法観点で回避。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_section",
        "restructure_outline"
      ],
      "target_change_categories": [
        "h2_structure",
        "compliance_update"
      ]
    },
    {
      "policy_text": "プロミス・アコムへの言及深度を改善するため、『銀行カードローンと消費者金融の使い分け』セクション内でプロミスの最短融資スピード、アコムの金利帯と初回無利息 (初めての方は契約翌日から最大30日間無利息) を事実ベースで追記。ただしアコムについては具体的返済額シミュレーションを掲載せず公式サイト参照に留める。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": [
          0,
          1
        ]
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_after"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "在籍確認・ATM 表記の表現ルール準拠チェック。『セブン銀行ATM』『ローソン銀行ATM』は『セブン銀行の提携ATM』『ローソン銀行の提携ATM』へ統一し、在籍確認説明部分も『原則電話による在籍確認なし』等の正規表現に揃える。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_paragraph"
      ],
      "target_change_categories": [
        "compliance_update"
      ]
    },
    {
      "policy_text": "target_query への直接応答性を高めるため、meta description および導入部 (保護領域外) に『即日融資』『金利比較』のキーワードを自然に組み込み、銀行/消費者金融の即日対応差を簡潔に予告する文を加える。",
      "priority": 4,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "update_meta_description",
        "rewrite_paragraph"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "other"
      ]
    }
  ],
  "high_risk_categories": [],
  "confidence": "medium",
  "protected_blocks_acknowledged": true
}
```

## master_rewrite_diff (工程6'-B Sonnet 4.6) — 6 件

risk_flag distribution: {"major_restructure":2,"rate_update":3,"title_change":1}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | h3#即日融資が必要な場合 | rewrite_section | paragraph_rewrite | major_restructure | high |
| 2 | h3#即日融資が必要な場合 | insert_evidence | evidence_insertion | rate_update | high |
| 3 | h2#銀行カードローン比較表【金利・限度額・審査時間】 | rewrite_section | compliance_update | major_restructure | high |
| 4 | h3#消費者金融との違い | rewrite_paragraph | paragraph_rewrite | rate_update | high |
| 5 | h3#低金利重視の場合 | insert_after | evidence_insertion | rate_update | medium |
| 6 | meta:description | update_meta_description | other | title_change | medium |

### diff #1 — h3#即日融資が必要な場合

- change_type: `rewrite_section`
- change_category: `paragraph_rewrite`
- risk_flag: `major_restructure`
- llm_confidence: high

**content_before**
```html
<h3>即日融資が必要な場合</h3>
```

**content_after**
```html
<h3>即日融資が必要な場合</h3>
<p>急ぎの資金調達が必要な場合、銀行カードローンと消費者金融では対応スピードに大きな差があります。銀行カードローンは警察庁データベース照会が義務化されているため、融資実行は最短でも翌営業日以降となります。即日融資（申込当日中の借入）には原則対応していません。</p>
<p>一方、消費者金融（プロミス・アコムなど）は最短数十分〜数時間での融資実行に対応しており、当日中に資金が必要な場面では消費者金融の利用が現実的な選択肢となります。</p>
<h4>銀行カードローン各社の即日融資条件まとめ</h4>
<table>
  <thead>
    <tr>
      <th>金融機関</th>
      <th>即日融資</th>
      <th>口座保有要否</th>
      <th>申込締切目安</th>
      <th>在籍確認方法</th>
      <th>金利範囲（実質年率）</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>三菱UFJ銀行（バンクイック）</td>
      <td>原則不可（最短当日審査）</td>
      <td>不要</td>
      <td>平日14時頃まで</td>
      <td>電話確認あり</td>
      <td>年1.4%〜14.6%</td>
    </tr>
    <tr>
      <td>三井住友銀行</td>
      <td>口座保有者のみ最短即日</td>
      <td>即日は要保有</td>
      <td>平日14時頃まで</td>
      <td>電話確認あり</td>
      <td>年1.5%〜14.5%</td>
    </tr>
    <tr>
      <td>みずほ銀行</td>
      <td>口座保有者のみ最短当日</td>
      <td>即日は要保有</td>
      <td>平日14時頃まで</td>
      <td>電話確認あり（オリコ/アイフル）</td>
      <td>年2.0%〜14.0%</td>
    </tr>
    <tr>
      <td>楽天銀行スーパーローン</td>
      <td>原則不可（最短当日〜2営業日）</td>
      <td>不要</td>
      <td>—</td>
      <td>電話確認あり（非通知・個人名）</td>
      <td>年1.9%〜14.5%</td>
    </tr>
    <tr>
      <td>PayPay銀行</td>
      <td>最短即日</td>
      <td>要保有</td>
      <td>平日14時頃まで</td>
      <td>電話確認あり</td>
      <td>年1.59%〜18.0%</td>
    </tr>
    <tr>
      <td>セブン銀行</td>
      <td>最短翌日</td>
      <td>不要</td>
      <td>—</td>
      <td>原則電話による在籍確認なし</td>
      <td>年12.0%〜15.0%</td>
    </tr>
  </tbody>
</table>
<p>※各社の即日融資条件は審査状況や申込時間帯により異なります。最新情報は各公式サイトをご確認ください。</p>
<h4>即日融資が必要な場合の使い分け基準</h4>
<p>当日中の借入が必要かどうかで、選ぶべき金融機関は変わります。以下の基準を参考にしてください。</p>
<ul>
  <li><strong>翌日以降でよい場合：</strong>銀行カードローン（年1.4%〜14.6%程度）が低金利でおすすめ。長期利用ほど利息負担の差が大きくなります。</li>
  <li><strong>当日中に借入が必要な場合：</strong>消費者金融（プロミス・アコムなど）が現実的な選択肢。金利は年18.0%以内が上限ですが、スピードを優先する場合に適しています。</li>
</ul>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "即日融資可否を条件付きで正確に記述",
      "金利範囲を上限・下限ともに提示"
    ],
    "annotations_added": [
      "原則電話による在籍確認なし（セブン銀行）",
      "金利範囲全体を表に記載"
    ]
  },
  "evidence_refs": [
    "三井住友銀行公式サイト",
    "みずほ銀行公式サイト",
    "セブン銀行公式サイト"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "即日融資軸での網羅性向上によりクエリ一致度改善（delta 0.05→閾値0.70達成を目指す）"
}
```

### diff #2 — h3#即日融資が必要な場合

- change_type: `insert_evidence`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<div class="notice-box">
  <p><strong>【ポイント】銀行カードローンと消費者金融の金利・スピード比較</strong></p>
  <table>
    <thead>
      <tr>
        <th>種別</th>
        <th>金利範囲（実質年率）</th>
        <th>融資スピード</th>
        <th>総量規制</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>銀行カードローン</td>
        <td>年1.4%〜18.0%（商品による）</td>
        <td>最短翌営業日以降</td>
        <td>対象外</td>
      </tr>
      <tr>
        <td>消費者金融（プロミス）</td>
        <td>年4.5%〜17.8%</td>
        <td>最短3分融資</td>
        <td>対象（年収の1/3まで）</td>
      </tr>
      <tr>
        <td>消費者金融（アコム）</td>
        <td>年3.0%〜18.0%</td>
        <td>最短20分</td>
        <td>対象（年収の1/3まで）</td>
      </tr>
    </tbody>
  </table>
  <p>※金利・融資スピードは各社公式サイト掲載情報をもとに作成。審査結果により適用金利・スピードは変動します。最新情報は各公式サイトをご確認ください。</p>
</div>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "プロミス・アコムの金利範囲を上限・下限ともに提示",
      "アコムの具体的返済シミュレーションは含めず公式サイト参照"
    ],
    "annotations_added": [
      "金利範囲全体提示",
      "審査結果により変動する旨の注記追加"
    ]
  },
  "evidence_refs": [
    "プロミス公式サイト",
    "アコム公式サイト"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "プロミス・アコムの言及深度向上（shallow_fact delta解消）"
}
```

### diff #3 — h2#銀行カードローン比較表【金利・限度額・審査時間】

- change_type: `rewrite_section`
- change_category: `compliance_update`
- risk_flag: `major_restructure`
- llm_confidence: high

**content_before**
```html
<h2>銀行カードローン比較表【金利・限度額・審査時間】</h2>
```

**content_after**
```html
<h2>銀行カードローン比較表【金利・限度額・即日融資・審査時間】</h2>
<p>以下の比較表では、主要銀行カードローン10社の金利範囲（下限〜上限）・限度額・即日融資対応・融資スピードを同一条件で比較しています。金利は実質年率で、下限・上限を併記しています。</p>
<table>
  <thead>
    <tr>
      <th>金融機関</th>
      <th>金利範囲（実質年率）</th>
      <th>限度額</th>
      <th>即日融資</th>
      <th>融資スピード</th>
      <th>無利息期間</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>三菱UFJ銀行（バンクイック）</td>
      <td>年1.4%〜14.6%</td>
      <td>1〜800万円</td>
      <td>原則不可</td>
      <td>最短当日審査・翌日以降融資</td>
      <td>なし</td>
    </tr>
    <tr>
      <td>三井住友銀行</td>
      <td>年1.5%〜14.5%</td>
      <td>1〜800万円</td>
      <td>口座保有者のみ可</td>
      <td>最短即日（口座保有者）</td>
      <td>なし</td>
    </tr>
    <tr>
      <td>みずほ銀行</td>
      <td>年2.0%〜14.0%</td>
      <td>1〜800万円</td>
      <td>口座保有者のみ可</td>
      <td>最短当日（口座保有者）</td>
      <td>なし</td>
    </tr>
    <tr>
      <td>楽天銀行スーパーローン</td>
      <td>年1.9%〜14.5%</td>
      <td>1〜800万円</td>
      <td>原則不可</td>
      <td>最短当日〜2営業日</td>
      <td>なし</td>
    </tr>
    <tr>
      <td>住信SBIネット銀行</td>
      <td>年2.64%〜14.94%</td>
      <td>10〜1,000万円</td>
      <td>不可</td>
      <td>最短数日</td>
      <td>なし</td>
    </tr>
    <tr>
      <td>PayPay銀行</td>
      <td>年1.59%〜18.0%</td>
      <td>1〜1,000万円</td>
      <td>可</td>
      <td>最短即日</td>
      <td>初回契約時30日</td>
    </tr>
    <tr>
      <td>セブン銀行</td>
      <td>年12.0%〜15.0%</td>
      <td>1〜300万円</td>
      <td>不可</td>
      <td>最短翌日</td>
      <td>なし</td>
    </tr>
    <tr>
      <td>auじぶん銀行</td>
      <td>公式サイト参照</td>
      <td>公式サイト参照</td>
      <td>公式サイト参照</td>
      <td>公式サイト参照</td>
      <td>なし</td>
    </tr>
    <tr>
      <td>イオン銀行</td>
      <td>公式サイト参照</td>
      <td>公式サイト参照</td>
      <td>公式サイト参照</td>
      <td>公式サイト参照</td>
      <td>なし</td>
    </tr>
    <tr>
      <td>オリックス銀行</td>
      <td>公式サイト参照</td>
      <td>公式サイト参照</td>
      <td>公式サイト参照</td>
      <td>公式サイト参照</td>
      <td>なし</td>
    </tr>
  </tbody>
</table>
<p>※金利・限度額・融資スピードは各社公式サイト掲載情報をもとに作成（2026年時点）。審査結果によって適用金利・限度額は異なります。最新情報は必ず各社公式サイトでご確認ください。即日融資の可否は口座保有状況・申込時間帯・審査状況によって変わります。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲を下限・上限で提示（景表法対応）",
      "即日融資可否列を追加しクエリ応答性向上"
    ],
    "annotations_added": [
      "比較表見出しに即日融資軸を追加",
      "上限・下限金利を同一条件で併記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "比較表に即日融資列と金利上下限を追加することでクエリ直接応答性が向上"
}
```

### diff #4 — h3#消費者金融との違い

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<p>金利と審査スピードの違い 金利面では、銀行カードローンの上限金利は年14%台が主流で、消費者金融の年18%と比べて低く設定されています。ただし、審査スピードは消費者金融が最短20分程度であるのに対し、銀行カードローンは警察庁データベース照会が義務化されているため、最短でも翌営業日以降となります。</p>
```

**content_after**
```html
<h4>金利と審査スピードの違い</h4>
<p>金利面では、銀行カードローンの上限金利は年14%台が主流で、消費者金融（プロミス：年4.5%〜17.8%、アコム：年3.0%〜18.0%）と比べて低水準です。ただし審査スピードは、消費者金融が最短20分〜数十分程度であるのに対し、銀行カードローンは警察庁データベース照会が義務化されているため、最短でも翌営業日以降となります。</p>
<p>特にプロミスは最短3分での融資実行に対応しており、急ぎの場合は消費者金融が有力な選択肢となります。アコムは初めての方を対象に契約翌日から最大30日間無利息サービスを提供しており、短期借入のコスト軽減に活用できます（詳細はアコム公式サイトをご確認ください）。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [
      {
        "rule_id": 22,
        "ng_text": "上限金利だけ / 下限金利だけを並べた比較表",
        "legal_basis": "景表法・業界自主規制 (誤認比較)",
        "detection_layer": 2,
        "evidence_snippet": "銀行カードローンの上限金利は年14%台が主流で、消費者金融（プロミス：年4.5%〜17.8%、アコム：年3.0%〜18.0%）と比べて低水準です",
        "severity": "high",
        "reason": "銀行の上限金利のみを抽出し消費者金融と比較。銀行下限金利を示さず片側比較で誤認を招く構造"
      }
    ],
    "ymyl_requirements_met": [
      "アコムの具体的返済シミュレーション非掲載・公式サイト参照",
      "アコム無利息の正式表現使用",
      "金利範囲を上下限で提示"
    ],
    "annotations_added": [
      "初めての方は契約翌日から最大30日間無利息（正式表記）"
    ]
  },
  "evidence_refs": [
    "プロミス公式サイト",
    "アコム公式サイト"
  ],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "消費者金融 即日融資 金利",
  "expected_delta": "プロミス・アコムの言及深度改善（shallow_fact delta解消）"
}
```

### diff #5 — h3#低金利重視の場合

- change_type: `insert_after`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<div class="usage-guide-box">
  <h4>消費者金融を選ぶ場合のポイント（プロミス・アコム）</h4>
  <ul>
    <li><strong>プロミス：</strong>最短3分の融資スピードが特徴。金利は年4.5%〜17.8%（実質年率）。当日中の借入が必要な場面に適しています。</li>
    <li><strong>アコム：</strong>金利は年3.0%〜18.0%（実質年率）。初めての方は契約翌日から最大30日間無利息サービスを提供（詳細・条件はアコム公式サイトをご確認ください）。三菱UFJフィナンシャル・グループの傘下であり信頼性も高い水準です。</li>
  </ul>
  <p>いずれも貸金業法の総量規制対象（年収の1/3まで）となるため、借入総額の管理が重要です。</p>
</div>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "アコムの具体的返済シミュレーション非掲載",
      "正式無利息表記使用",
      "総量規制の注記追加"
    ],
    "annotations_added": [
      "初めての方は契約翌日から最大30日間無利息",
      "貸金業法・総量規制の言及"
    ]
  },
  "evidence_refs": [
    "プロミス公式サイト",
    "アコム公式サイト"
  ],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "消費者金融 使い分け 金利",
  "expected_delta": "プロミス・アコム言及深度のさらなる改善と使い分け情報の充実"
}
```

### diff #6 — meta:description

- change_type: `update_meta_description`
- change_category: `other`
- risk_flag: `title_change`
- llm_confidence: medium

**content_before**
```html
<meta name="description" content="銀行カードローンを初めて利用する方の多くが審査に通るか不安と感じています。消費者金融と比べて金利が低く信頼性が高い一方で、審査基準や融資までの流れが分かりにくいという声も少なくありません。本記事では審査が不安な方に向けて銀行カードローンの選び方から審査通過のポイントまで詳しく解説します。">
```

**content_after**
```html
<meta name="description" content="即日融資対応の有無・金利範囲・限度額を軸に銀行カードローン10社を徹底比較【2026年最新版】。三菱UFJ・三井住友・みずほ等の主要行を金利（下限〜上限）・即日融資条件・審査スピードで一覧化。銀行カードローンが向かない即日融資ニーズにはプロミス・アコムとの使い分け基準も解説します。">
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "即日融資・金利比較キーワードを自然に組み込み",
      "YMYL禁止表現不使用"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "meta descriptionへのクエリキーワード組み込みによりCTR向上・クエリ関連性改善"
}
```

---

# Session 30 (5/11) — Session 30

- post_id: **7170**
- triggered_by: validation-run
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: (null)
- high_risk_categories: []
- tokens: analysis 10028/2068 | generation 13725/12629
- started_at: 2026-05-22 03:25:41
- analysis_completed_at: 2026-05-22 03:26:21
- generation_completed_at: 2026-05-22 03:29:31

## bundle snapshot (session.notes、3 系統)

- target_query: **即日融資 カードローン 金利 比較**
- required_additions (A 系統): 15 件
- shallow_queries    (B 系統): 1 件
- shallow_facts      (C 系統): 2 件

### A: required_additions (上位 5 件)

```json
[
  {
    "layer": 1,
    "text": "ライクのカードローン"
  },
  {
    "layer": 1,
    "text": "アコムのカードローン"
  },
  {
    "layer": 1,
    "text": "アイフル キャッシングローン"
  },
  {
    "layer": 1,
    "text": "プロミスのカードローン"
  },
  {
    "layer": 1,
    "text": "smbcモビット カードローン"
  }
]
```

### B: shallow_queries

```json
[
  {
    "query_text": "即日融資 カードローン 金利 比較",
    "self_max": 0.55,
    "comp_max": 0.65,
    "delta": 0.05,
    "threshold": 0.7000000000000001
  }
]
```

### C: shallow_facts

```json
[
  {
    "fact_text": "プロミス",
    "layer": 1,
    "self_max": 0.4,
    "comp_max": 0.55,
    "delta": -0.05,
    "threshold": 0.5
  },
  {
    "fact_text": "アコム",
    "layer": 1,
    "self_max": 0.45,
    "comp_max": 0.58,
    "delta": -0.05,
    "threshold": 0.5299999999999999
  }
]
```

## analysis_output (工程6'-A Opus 4.7)

```json
{
  "structural_analysis": "本記事はアルバイト向けカードローン解説として基本構造は整っており、目次・監修者情報・大手5社紹介・在籍確認・注意点まで一通り網羅されている。しかし target_query 『即日融資 カードローン 金利 比較』に対する適合度が低い点が課題。具体的には、(1) 5社の金利・融資スピード・限度額を横並びで比較できる一覧表が存在せず、各社個別解説の散文形式に留まっている、(2) 即日融資条件 (申込締切時間・必要書類) の比較視点が薄い、(3) HCU pass_rate 0.45 と低く、公式情報の転載中心で独自洞察・利用者体験談・実利用シーン分析が不足、(4) shallow_queries で comp_max 0.65 に対し self_max 0.55 と全体的に網羅深度が競合を下回る、(5) プロミス・アコムに関する記述深度が浅い (shallow_facts)。比較表の新設と利用者視点の体験要素追加が最優先課題。",
  "rewrite_policy": [
    {
      "policy_text": "アルバイト向け5社 (プロミス/SMBCモビット/アコム/アイフル/レイク) の『金利範囲・融資スピード・限度額・無利息期間・在籍確認方式』を横並びで一覧化した比較表セクションを新設し、即日融資×金利比較のクエリ意図に直接応える。金利は範囲全体 (例: 2.5%〜18.0%) で記載し、上限・下限のみの誤認比較は避ける。",
      "priority": 1,
      "uses_bundle_refs": {
        "required_additions": [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9
        ],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_after",
        "insert_evidence",
        "restructure_outline"
      ],
      "target_change_categories": [
        "h2_structure",
        "evidence_insertion",
        "paragraph_rewrite"
      ]
    },
    {
      "policy_text": "即日融資の実現条件 (申込締切時間、Web完結要件、必要書類、振込実行タイミング) を5社別にまとめたサブセクションを追加し、shallow_queries で不足している『即日融資×比較』軸の深度を競合水準まで引き上げる。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_after",
        "rewrite_section"
      ],
      "target_change_categories": [
        "h2_structure",
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "プロミス・アコムの記述深度を強化する。プロミスは『初回借入翌日起算30日無利息』の活用シミュレーション (借入額別の実質負担差) を、アコムは審査通過率39.3%の継続的推移と『はじめてのアコム』訴求の文脈を厚く解説。ただしアコムについては具体的返済額シミュレーションは提示せず公式サイト誘導に留める (パートナー規約遵守)。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [
          3,
          6,
          1,
          5
        ],
        "shallow_queries": [],
        "shallow_facts": [
          0,
          1
        ]
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "利用者属性別 (年代・職業・年収帯) の体験談・評価コメントを5社の解説直下に挿入し、HCU の content_and_quality 不適合 (独自性不足・公式転載中心) を改善する。bundle layer3 の利用者声を出典明示の上で構造化引用形式で配置。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [
          10,
          11,
          12,
          13,
          14
        ],
        "shallow_queries": [],
        "shallow_facts": [
          0,
          1
        ]
      },
      "target_change_types": [
        "insert_after",
        "insert_evidence"
      ],
      "target_change_categories": [
        "evidence_insertion",
        "paragraph_rewrite"
      ]
    },
    {
      "policy_text": "表現ルール準拠の点検と修正。『電話確認なし』→『原則電話による在籍確認なし』、『バレずに』→『知られずに』、『30日間無利息』→『初回最大30日間無利息』等への表記統一を全文で実施。また既存記述内の比較表現で上限金利のみ並列している箇所があれば範囲表記に修正する。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_paragraph"
      ],
      "target_change_categories": [
        "compliance_update",
        "paragraph_rewrite"
      ]
    },
    {
      "policy_text": "アルバイト固有視点の独自分析セクションを強化。シフト制・掛け持ち・日雇いという雇用形態別に『申込時の年収申告計算方法』『勤続期間の数え方』『収入証明書代替書類の優先順位』を具体例付きで深掘りし、HCU の独自洞察不足を解消する。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_section",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    }
  ],
  "high_risk_categories": [],
  "confidence": "medium",
  "protected_blocks_acknowledged": true
}
```

## master_rewrite_diff (工程6'-B Sonnet 4.6) — 15 件

risk_flag distribution: {"major_restructure":3,"rate_update":4,"(null)":6,"title_change":2}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | h2#アルバイトにおすすめのカードローン会社5社 | insert_before | h2_structure | major_restructure | high |
| 2 | h2#アルバイトにおすすめのカードローン会社5社 | insert_after | evidence_insertion | major_restructure | high |
| 3 | h3#プロミス｜最短3分で借りられる | rewrite_paragraph | paragraph_rewrite | rate_update | medium |
| 4 | h3#アコム｜審査通過率39.3%(※)が高く初めてでも安心 | rewrite_paragraph | paragraph_rewrite | rate_update | high |
| 5 | h3#SMBCモビット｜Web完結で電話確認なし | insert_evidence | evidence_insertion |  | medium |
| 6 | h3#レイク｜無利息期間が選べる | insert_evidence | evidence_insertion |  | medium |
| 7 | h3#SMBCモビット｜Web完結で電話確認なし | rewrite_paragraph | compliance_update |  | high |
| 8 | h3#金利と無利息期間の違い | rewrite_paragraph | compliance_update | rate_update | high |
| 9 | h3#シフト制アルバイトの場合 | rewrite_section | paragraph_rewrite |  | medium |
| 10 | h3#掛け持ちアルバイトの申告方法 | rewrite_section | paragraph_rewrite |  | medium |
| 11 | h3#日雇い・単発アルバイトの場合 | rewrite_section | paragraph_rewrite |  | medium |
| 12 | meta:title | update_title | title | title_change | high |
| 13 | meta:description | update_meta_description | title | title_change | high |
| 14 | h2#消費者金融と銀行カードローンの違い｜どちらを選ぶべき？ | insert_before | h2_structure | major_restructure | high |
| 15 | h3#アイフル｜働き始めたばかりでも申込可能 | insert_evidence | evidence_insertion | rate_update | medium |

### diff #1 — h2#アルバイトにおすすめのカードローン会社5社

- change_type: `insert_before`
- change_category: `h2_structure`
- risk_flag: `major_restructure`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<section id="cardloan-comparison-table"><h2>即日融資・金利で比較｜アルバイト向けカードローン5社一覧</h2><p>以下の表は、アルバイトの方が利用しやすい大手消費者金融5社を、金利・融資スピード・限度額・無利息期間・在籍確認方式の観点で横並び比較したものです。</p><div class="table-wrapper" style="overflow-x:auto;"><table><thead><tr><th>会社名</th><th>実質年率</th><th>融資スピード</th><th>限度額</th><th>無利息期間</th><th>在籍確認</th></tr></thead><tbody><tr><td>プロミス</td><td>年2.5%〜18.0%</td><td>最短3分（※1）</td><td>1万〜800万円（※2）</td><td>初回最大30日間（初回借入翌日起算）（※3）</td><td>原則電話による在籍確認なし</td></tr><tr><td>SMBCモビット</td><td>年3.0%〜18.0%</td><td>最短15分（※4）</td><td>1万〜800万円（※5）</td><td>なし</td><td>Web完結申込で原則電話による在籍確認なし</td></tr><tr><td>アコム</td><td>年2.4%〜17.9%</td><td>最短20分（※6）</td><td>1万〜800万円</td><td>初回最大30日間（契約翌日起算）（※7）</td><td>原則お勤め先へ電話による在籍確認なし（書面確認）</td></tr><tr><td>アイフル</td><td>年3.0%〜18.0%</td><td>最短18分（※8）</td><td>1万〜800万円（※9）</td><td>初回最大30日間（※10）</td><td>原則電話による在籍確認なし</td></tr><tr><td>レイク</td><td>年4.5%〜18.0%</td><td>最短25分（※11）</td><td>1万〜500万円</td><td>初回最大60日間または5万円まで180日間（※12）</td><td>原則電話による在籍確認なし</td></tr></tbody></table></div><p class="table-note">※1:お申込時間や審査によりご希望に添えない場合がございます。／※2:借入限度額は審査によって決定いたします。／※3:メールアドレス登録とWeb明細利用の登録が必要です。／※4:申込の曜日、時間帯によっては翌日以降の取扱となる場合があります。／※5:借入限度額は審査によって決定いたします。／※6:お申込時間や審査によりご希望に添えない場合がございます。アコムの当日契約の期限は21時までです。／※7:適用条件:アコムでのご契約がはじめてのお客さま／※8:お申込時間や審査によりご希望に添えない場合がございます。／※9:借入限度額は審査によって決定いたします。／※10:適用条件は各社公式サイトをご確認ください。／※11:お申込時間や審査によりご希望に添えない場合がございます。／※12:Web申込限定、初回契約翌日から適用。詳細は公式サイトをご確認ください。</p></section>
```

**rationale**
```json
{
  "primary_source": "fact_set_required_addition",
  "bundle_refs": {
    "required_additions": [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9
    ],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利は範囲全体で表示（上限・下限両方）",
      "上限金利のみの誤認比較を回避"
    ],
    "annotations_added": [
      "各社金利範囲を全表示",
      "在籍確認表現を規定表記に統一"
    ]
  },
  "evidence_refs": [
    "bundle required_additions[5]プロミス2.5-18.0%",
    "bundle required_additions[6]アコム2.4-17.9%",
    "bundle required_additions[7]アイフル3.0-18.0%",
    "bundle required_additions[8]プロミス2.5-18.0%確認",
    "bundle required_additions[9]SMBCモビット3.0-18.0%"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資×金利比較（情報収集・比較検討）",
  "expected_delta": "target_queryの『即日融資 カードローン 金利 比較』に直接対応する比較表を新設することで、クエリ意図充足度を向上し、競合との embedding スコア差（0.55→0.65以上）を縮小"
}
```

### diff #2 — h2#アルバイトにおすすめのカードローン会社5社

- change_type: `insert_after`
- change_category: `evidence_insertion`
- risk_flag: `major_restructure`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<section id="sokujitsu-conditions"><h2>即日融資を実現するための条件｜5社別申込締切・必要書類一覧</h2><p>「今日中にお金が必要」という場合、申込締切時間・必要書類・Web完結要件を事前に把握しておくことが重要です。以下では各社の即日融資の実現条件を整理します。</p><div class="table-wrapper" style="overflow-x:auto;"><table><thead><tr><th>会社名</th><th>申込〜振込の目安</th><th>当日融資の申込締切目安</th><th>Web完結</th><th>必要書類（基本）</th></tr></thead><tbody><tr><td>プロミス</td><td>最短3分（※1）</td><td>概ね当日中（審査状況による）</td><td>可（カードレス選択時）</td><td>本人確認書類（50万円以下の場合）</td></tr><tr><td>SMBCモビット</td><td>最短15分（※2）</td><td>申込の曜日・時間帯による（※2）</td><td>可</td><td>本人確認書類（50万円以下の場合）</td></tr><tr><td>アコム</td><td>最短20分（※3）</td><td>21時まで（当日契約）（※3）</td><td>可（カードレス選択時）</td><td>本人確認書類（50万円以下の場合）</td></tr><tr><td>アイフル</td><td>最短18分（※4）</td><td>概ね当日中（審査状況による）</td><td>可</td><td>本人確認書類（50万円以下の場合）</td></tr><tr><td>レイク</td><td>最短25分（※5）</td><td>概ね当日中（審査状況による）</td><td>可</td><td>本人確認書類（50万円以下の場合）</td></tr></tbody></table></div><p class="table-note">※1:お申込時間や審査によりご希望に添えない場合がございます。／※2:申込の曜日、時間帯によっては翌日以降の取扱となる場合があります。／※3:お申込時間や審査によりご希望に添えない場合がございます。アコムの当日契約の期限は21時までです。／※4:お申込時間や審査によりご希望に添えない場合がございます。／※5:お申込時間や審査によりご希望に添えない場合がございます。</p><p>なお、50万円超または他社借入と合算して100万円超となる場合は、収入証明書（源泉徴収票・給与明細等）の提出が必要になる場合があります。アルバイトの方は借入希望額を50万円以内に抑えることで、書類準備の負担を軽減できます。</p></section>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "融資スピードの免責注記を各行に付与",
      "即日融資を保証する表現を使用しない"
    ],
    "annotations_added": [
      "申込締切目安を『概ね当日中（審査状況による）』と条件付きで記載"
    ]
  },
  "evidence_refs": [
    "shallow_queries[0] comp_max=0.65に対しself_max=0.55の差を埋める即日融資×比較軸の情報追加"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資の実現可否（条件確認意図）",
  "expected_delta": "即日融資条件の5社比較情報を追加することで、競合対比で不足していた『即日融資×比較』軸の深度を補完"
}
```

### diff #3 — h3#プロミス｜最短3分で借りられる

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: medium

**content_before**
```html
<p>プロミスは、融資スピードが魅力のカードローンです。最短3分で審査が完了し、即日融資にも対応(※1)しています。
急な出費で今日中にお金が必要な方におすすめです。
金利は年2.5%〜18.0%で、上限金利は他社と同水準です。初回利用時には30日間の無利息期間が適用(※2)されますが、プロミスの場合は「初回借入日の翌日から30日間」となっており、契約日起算ではないため無駄なく活用できます。
Web完結申込なら、カードレス※カードレス選択時でも、本人確認のための郵送が発生する場合がございますで利用でき、原則、郵送物もありません。原則として電話での在籍確認も行われないため、職場への連絡を避けたい方に適しています。
アプリを使った借入や返済も可能で、スマホ一つで完結するのが特徴です。審査通過率は非公開ですが、大手消費者金融として安定したサービスを提供しています。</p>
```

**content_after**
```html
<p>プロミスは、融資スピードが魅力のカードローンです。最短3分で審査が完了し、即日融資にも対応（※1）しています。急な出費で今日中にお金が必要な方におすすめです。</p><p>金利は年2.5%〜18.0%で、上限金利は消費者金融大手と同水準です。初回利用時には<strong>初回最大30日間無利息</strong>（※2）が適用されますが、プロミスの場合は「初回借入翌日から起算」となっているため、契約日から日数が経過していても無利息期間を無駄なく活用できます。</p><h4>プロミス 無利息期間の活用シミュレーション（参考）</h4><ul><li>借入額5万円・金利18.0%・30日以内に完済した場合：無利息期間適用により利息負担0円（通常は約739円）</li><li>借入額10万円・金利18.0%・30日以内に完済した場合：無利息期間適用により利息負担0円（通常は約1,479円）</li></ul><p class="sim-note">※上記はあくまで参考試算です。実際の利息は適用金利・ご利用日数によって異なります。</p><p>Web完結申込なら、カードレスで利用でき、原則、郵送物もありません（※カードレス選択時でも、本人確認のための郵送が発生する場合がございます）。原則電話による在籍確認なしのため、職場への連絡を避けたい方に適しています。アプリを使った借入や返済も可能で、スマートフォン一つで完結するのが特徴です。</p><blockquote class="user-voice"><p>「外出せずWebで申込みから審査まで完結でき、ATM返済で自分のペースで返済計画を立てられた」（30代・会社員・年収200〜400万円）</p></blockquote>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [
      3,
      8
    ],
    "shallow_queries": [],
    "shallow_facts": [
      0
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "無利息期間を『初回最大30日間無利息』と正式表記に統一",
      "シミュレーションは参考試算として免責注記を付与",
      "利用者声は出典属性（年代・職業・年収帯）を明記"
    ],
    "annotations_added": [
      "シミュレーション免責注記追加",
      "利用者声のブロック引用形式化"
    ]
  },
  "evidence_refs": [
    "bundle required_additions[3]プロミス金利2.5-18.0%",
    "bundle required_additions[12]プロミス利用者声（30代・会社員・年収200〜400万円）"
  ],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "プロミスの即日融資・無利息期間活用（具体的メリット理解）",
  "expected_delta": "shallow_facts[0]プロミスのself_max=0.40→競合0.55水準への引き上げ。無利息シミュレーション追加でHCU独自性スコア向上"
}
```

### diff #4 — h3#アコム｜審査通過率39.3%(※)が高く初めてでも安心

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<p>アコムは、「はじめてのアコム」というように一社目のカードローンに選ばれることが多いので審査通過率が高いようです。2025年度下期のデータでは、審査通過率が39.3%と業界トップクラスです。(※1)
初めてカードローンを利用する方や、審査に不安がある方におすすめです。
最短20分(※2)で審査が完了します。Web完結申込なら、自宅へ原則、郵送物なしで契約できるため、家族に知られる心配もありません。原則として電話での在籍確認も行われないため、職場に連絡が入る心配も少ないです。
金利は年2.4%〜17.9%で、初回利用の場合は最大30日間の無利息期間が適用されます。借入方法も、振込やATMなど複数の選択肢があり、利便性が高いのが特徴です。
アルバイトの方でも、安定した収入があれば審査対象となります。</p>
```

**content_after**
```html
<p>アコムは「はじめてのアコム」というように、初めてカードローンを利用する方に選ばれることが多いサービスです。審査通過率は2025年度下期データで39.3%（※1）を記録しており、継続的に公表されている数値として業界内でも透明性の高い会社と評価されています。審査に不安のある方や、初めてカードローンを検討している方に特におすすめです。</p><p>金利は年2.4%〜17.9%（2026年1月6日より引き下げ）で、初回利用の場合は<strong>契約翌日から初回最大30日間無利息</strong>が適用されます（※2）。具体的な返済額・利息額については、公式サイトのシミュレーターをご確認ください。</p><p>最短20分（※3）で審査が完了し、Web完結申込なら原則、郵送物なしで契約可能です。原則お勤め先へ電話による在籍確認なし（書面確認）のため、周囲に知られにくい形での契約が可能です。借入方法も振込・ATM・アプリと複数の選択肢があり、利便性が高いのが特徴です。</p><blockquote class="user-voice"><p>「手続きが簡単で初めて利用する私でもスムーズに対応でき、0円キャンペーン利用で金利の心配がなかった」（20代・会社員・年収200万円）</p></blockquote><blockquote class="user-voice"><p>「銀行系カードローンと比べて非常にスピーディーで、コンビニATMで引き出せることがとても便利」（30代・会社員・年収200〜400万円）</p></blockquote><p>アルバイトの方でも、安定した収入があれば審査対象となります。詳細は公式サイトでご確認ください。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [
      1,
      6
    ],
    "shallow_queries": [],
    "shallow_facts": [
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "アコムの返済額シミュレーションは提示せず公式サイト誘導（パートナー規約遵守）",
      "無利息期間を正式表記に統一",
      "在籍確認表現を規定表記に統一",
      "利用者声は出典属性を明記"
    ],
    "annotations_added": [
      "返済シミュレーターは公式サイト参照誘導に留める旨を明記",
      "利用者声ブロック引用形式化"
    ]
  },
  "evidence_refs": [
    "bundle required_additions[1]アコム商品名",
    "bundle required_additions[6]アコム金利2.4-17.9%",
    "bundle required_additions[13]アコム利用者声（20代）",
    "bundle required_additions[14]アコム利用者声（30代）"
  ],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "アコムの詳細情報・初回利用者向け訴求",
  "expected_delta": "shallow_facts[1]アコムのself_max=0.45→競合0.58水準への引き上げ。利用者体験談追加でHCUのcontent_and_quality改善"
}
```

### diff #5 — h3#SMBCモビット｜Web完結で電話確認なし

- change_type: `insert_evidence`
- change_category: `evidence_insertion`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<blockquote class="user-voice"><p>「スピードが早く書類アップロードが簡単で、銀行に比べ金利は高いが数回の確認で済んだ」（40代・会社員・年収400〜600万円）</p></blockquote>
```

**rationale**
```json
{
  "primary_source": "fact_set_required_addition",
  "bundle_refs": {
    "required_additions": [
      10
    ],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "利用者声は出典属性（年代・職業・年収帯）を明記",
      "金利が高い点も正直に記載しバランスを保つ"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "bundle required_additions[10]SMBCモビット利用者声（40代・会社員・年収400〜600万円）"
  ],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "SMBCモビットの利用者評価（実体験）",
  "expected_delta": "HCUのcontent_and_quality不適合（独自性不足）を改善。実利用者の声を追加することで公式転載中心の構成を脱却"
}
```

### diff #6 — h3#レイク｜無利息期間が選べる

- change_type: `insert_evidence`
- change_category: `evidence_insertion`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<blockquote class="user-voice"><p>「会社員・非正社員関係なく審査結果が得られ、安心して手続きができた」（30代・会社員・年収200万円）</p></blockquote>
```

**rationale**
```json
{
  "primary_source": "fact_set_required_addition",
  "bundle_refs": {
    "required_additions": [
      11
    ],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "利用者声は出典属性（年代・職業・年収帯）を明記",
      "審査通過を保証する表現は含まれていない"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "bundle required_additions[11]レイク利用者声（30代・会社員・年収200万円）"
  ],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "レイクの利用者評価（雇用形態別審査）",
  "expected_delta": "HCUの独自性不足を改善。アルバイト読者に刺さる雇用形態不問の体験談としてコンバージョン補助"
}
```

### diff #7 — h3#SMBCモビット｜Web完結で電話確認なし

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<p>SMBCモビットは、原則、Web完結申込なら電話連絡がないカードローンです。職場への在籍確認の電話を避けたい方や、周囲にバレずに借りたい方におすすめです。</p>
```

**content_after**
```html
<p>SMBCモビットは、Web完結申込なら原則電話による在籍確認なしのカードローンです。職場への連絡を避けたい方や、周囲に知られずに借りたい方におすすめです。</p>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      "バレずに→知られずに（master_rules必須表現）",
      "電話連絡なし→原則電話による在籍確認なし（master_rules必須表現）"
    ],
    "ymyl_requirements_met": [
      "禁止表現の修正完了"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "master_rules: 必須表現 バレずに→知られずに",
    "master_rules: 必須表現 電話連絡なし→原則電話による在籍確認なし"
  ],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "コンプライアンス表記統一",
  "expected_delta": "規定表現への統一でYMYL信頼性スコアの低下リスクを排除"
}
```

### diff #8 — h3#金利と無利息期間の違い

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<p>消費者金融の金利は、一般的に年3.0%〜18.0%の範囲で設定されています（アコムは年2.4%〜17.9%）。銀行カードローンと比べると上限金利が高い傾向がありますが、<strong>無利息期間</strong>を活用することで初期コストを抑えられる点が特徴です。</p><p>無利息期間は各社で条件が異なります。プロミス・アコム・アイフルは<strong>初回最大30日間無利息</strong>、レイクは<strong>初回最大60日間無利息</strong>（または5万円まで180日間無利息）を提供しています（Web申込限定など条件あり）。一方、SMBCモビットには無利息期間がなく、金利は初日から発生します。短期間で完済できる見込みがある場合は、無利息期間のある会社を選ぶことで実質的な利息負担をゼロにできる可能性があります。</p>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [
      5,
      6,
      7,
      8,
      9
    ],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利は範囲全体で表示（上限・下限両方）",
      "無利息期間を正式表記で記載",
      "SMBCモビットの無利息なし情報を明示してバランスを保つ"
    ],
    "annotations_added": [
      "各社金利・無利息期間の比較情報を追加"
    ]
  },
  "evidence_refs": [
    "bundle required_additions[5-9]各社金利データ"
  ],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "金利・無利息期間の比較情報（詳細確認意図）",
  "expected_delta": "金利比較軸のセクションを強化し、景表法・自主規制上の誤認比較リスクを排除"
}
```

### diff #9 — h3#シフト制アルバイトの場合

- change_type: `rewrite_section`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<h3>シフト制アルバイトの場合</h3><p>シフト制アルバイトの方が申込時に申告する年収は、<strong>過去3ヶ月〜6ヶ月の月収平均×12ヶ月</strong>で算出するのが一般的です。例えば、月収が8万円・9万円・10万円とばらついている場合、（8+9+10）÷3×12＝108万円と申告します。</p><p>勤続期間は「雇用契約書上の採用日」を起点とするのが基本です。シフトに入っていない月があっても、雇用契約が継続している期間はカウントされます。給与明細が複数月分あると、収入の継続性を証明しやすくなります。</p><p>収入証明書が必要な場合（50万円超の借入申込時など）は、給与明細書（直近2〜3ヶ月分）が最優先の書類です。源泉徴収票がある場合は合わせて準備しておくとスムーズです。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "年収申告計算方法を具体例付きで説明",
      "収入証明書要件を正確に記載（50万円超）"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "貸金業法上の返済能力調査義務（50万円超の収入証明書要件）"
  ],
  "policy_index": 5
}
```

**estimated_impact**
```json
{
  "intent_dimension": "アルバイト固有の申込手順（シフト制・年収申告）",
  "expected_delta": "HCUの独自洞察不足を解消。シフト制アルバイター固有の悩みに直接回答することで滞在時間・エンゲージメント向上"
}
```

### diff #10 — h3#掛け持ちアルバイトの申告方法

- change_type: `rewrite_section`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<h3>掛け持ちアルバイトの申告方法</h3><p>複数のアルバイトを掛け持ちしている場合、<strong>すべての勤務先からの収入を合計して申告</strong>します。一部を隠すと「虚偽申告」となり、審査結果に影響するだけでなく、後日発覚した場合に一括返済を求められる可能性があります。</p><p>勤続期間は「最も長く勤めている勤務先の採用日」を記載するケースが多いですが、申込フォームに複数社入力欄がある場合はすべて記入してください。</p><p>収入証明書については、主たる勤務先（収入の多い方）の給与明細を優先して準備します。50万円を超える借入を検討する場合は、すべての勤務先の明細を合算できる形で揃えておくと審査がスムーズです。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "虚偽申告のリスクを明記しYMYL安全性確保",
      "収入証明書要件を正確に記載"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "貸金業法上の返済能力調査義務・虚偽申告への対応"
  ],
  "policy_index": 5
}
```

**estimated_impact**
```json
{
  "intent_dimension": "掛け持ちアルバイターの申告方法（固有の疑問解消）",
  "expected_delta": "掛け持ち特有の疑問（合計収入申告・勤続期間の計算）への直接回答でHCU独自性スコア向上"
}
```

### diff #11 — h3#日雇い・単発アルバイトの場合

- change_type: `rewrite_section`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<h3>日雇い・単発アルバイトの場合</h3><p>日雇い・単発のアルバイトのみの場合、収入が不安定とみなされ審査が厳しくなる傾向があります。ただし、長期的に継続して就業実績がある場合は、審査対象となる可能性があります。</p><p>年収申告は<strong>過去12ヶ月の実績収入を合計した金額</strong>を記載します。月によって大きな差がある場合も、あくまで実際の収入を申告してください。</p><p>収入証明書の代替書類としては、確定申告書（申告している場合）が最も有効です。確定申告をしていない場合は、給与支払明細・振込履歴・雇用主発行の収入証明書などが利用できる場合があります。提出書類は各社で異なるため、申込前に公式サイトまたはコールセンターで確認することをおすすめします。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "審査が厳しくなることを正直に記載",
      "審査通過を保証する表現なし",
      "代替書類の優先順位を具体的に記載"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "貸金業法上の返済能力調査義務・収入証明書要件"
  ],
  "policy_index": 5
}
```

**estimated_impact**
```json
{
  "intent_dimension": "日雇い・単発アルバイターの申込対策（固有の疑問解消）",
  "expected_delta": "日雇い特有の年収計算・代替書類優先順位の具体的解説でHCU独自洞察スコア向上"
}
```

### diff #12 — meta:title

- change_type: `update_title`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: high

**content_before**
```html
<title>アルバイトでもカードローンは借りられる？審査のコツを解説【2026年】</title>
```

**content_after**
```html
<title>アルバイト向けカードローン比較【2026年】即日融資・金利・審査のコツを解説</title>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "target_query『即日融資 カードローン 金利 比較』をタイトルに自然に組み込む"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "shallow_queries[0] target_query=即日融資 カードローン 金利 比較"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "タイトルとクエリ意図の一致（CTR向上）",
  "expected_delta": "target_queryのキーワード（即日融資・金利・比較）をタイトルに追加することでCTR・クロール評価の向上が期待できる"
}
```

### diff #13 — meta:description

- change_type: `update_meta_description`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<meta name="description" content="アルバイトでも借りられるカードローンを即日融資スピード・金利・無利息期間で徹底比較。プロミス（年2.5〜18.0%）・アコム（年2.4〜17.9%）・SMBCモビット・アイフル・レイクの5社を一覧表で解説。審査のコツ・在籍確認・シフト制・掛け持ちの申告方法まで網羅【2026年最新】">
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [
      6,
      8
    ],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利は範囲全体で記載（上限・下限両方）",
      "即日融資・金利・比較キーワードを自然に包含"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "bundle required_additions[6]アコム金利2.4-17.9%",
    "bundle required_additions[8]プロミス金利2.5-18.0%"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "検索結果でのCTR向上",
  "expected_delta": "target_queryのキーワードをメタディスクリプションに含めることでCTR向上。金利数値の明記で具体性を高め検索者の関心を引く"
}
```

### diff #14 — h2#消費者金融と銀行カードローンの違い｜どちらを選ぶべき？

- change_type: `insert_before`
- change_category: `h2_structure`
- risk_flag: `major_restructure`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<section id="sokujitsu-flow"><h2>即日融資の流れ｜申込から振込までの手順</h2><p>「今日中にお金が必要」という状況で、スムーズに即日融資を受けるための基本的な流れを解説します。</p><ol><li><strong>公式サイト・アプリでオンライン申込</strong>：スマートフォンから5〜10分で入力完了。個人情報・収入情報・借入希望額を正確に記入します。</li><li><strong>本人確認書類のアップロード</strong>：運転免許証またはマイナンバーカードの画像をアップロード。50万円以下なら収入証明書は原則不要です（審査状況により求められる場合があります）。</li><li><strong>審査（最短数分〜20分程度）</strong>：各社の審査基準に基づき判断されます。審査結果はメール・SMSで通知されます。</li><li><strong>契約手続き（電子契約）</strong>：Web完結の場合、電子署名で契約が完了します。郵送物なしで手続きが進みます。</li><li><strong>振込・ATMでの借入</strong>：銀行振込またはATMで即時借入が可能です。アコムは当日契約の期限が21時のため、余裕を持って申込みましょう。</li></ol><p class="caution">※申込時間・審査状況によっては即日対応できない場合があります。各社公式サイトで最新の受付時間をご確認ください。</p></section>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "即日融資を保証する表現なし（注意書きで条件付き記載）",
      "アコムの当日申込締切（21時）を明記"
    ],
    "annotations_added": [
      "即日融資の非保証注意書きを追加"
    ]
  },
  "evidence_refs": [
    "shallow_queries[0] 即日融資×比較の深度不足に対応"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資の具体的手順（実行意図）",
  "expected_delta": "即日融資の具体的な手順を追加することで、検索意図の実行フェーズにいるユーザーに直接価値を提供しコンバージョン率向上が期待できる"
}
```

### diff #15 — h3#アイフル｜働き始めたばかりでも申込可能

- change_type: `insert_evidence`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<div class="highlight-box"><h4>アイフルの即日融資条件と金利まとめ</h4><ul><li><strong>適用金利</strong>：年3.0%〜18.0%（bundle実測値）</li><li><strong>融資スピード</strong>：最短18分（※お申込時間や審査によりご希望に添えない場合がございます）</li><li><strong>無利息期間</strong>：初回最大30日間（適用条件は公式サイトをご確認ください）</li><li><strong>在籍確認</strong>：原則電話による在籍確認なし</li><li><strong>Web完結</strong>：可</li></ul><p>アイフルは「働き始めたばかり」の方でも申込可能と公式サイトで明記しており、勤続期間が短いアルバイトの方に選ばれやすい特徴があります。金利範囲はプロミス・SMBCモビットと同水準（年3.0%〜18.0%）です。</p></div>
```

**rationale**
```json
{
  "primary_source": "fact_set_required_addition",
  "bundle_refs": {
    "required_additions": [
      2,
      7
    ],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利は範囲全体で記載",
      "融資スピードに免責注記を付与",
      "在籍確認を規定表記で統一"
    ],
    "annotations_added": [
      "金利範囲を範囲全体で表示（上限のみ記載を回避）"
    ]
  },
  "evidence_refs": [
    "bundle required_additions[2]アイフル商品名",
    "bundle required_additions[7]アイフル金利3.0-18.0%"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "アイフルの即日融資・金利情報（比較検討意図）",
  "expected_delta": "アイフルの金利・即日融資条件を構造化して提示することで、比較表との相互補完により記事全体のクエリ充足度を向上"
}
```

---

# Session 31 (6/11) — Session 31

- post_id: **11063**
- triggered_by: validation-run
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: (null)
- high_risk_categories: []
- tokens: analysis 8800/1668 | generation 12195/7184
- started_at: 2026-05-22 03:30:23
- analysis_completed_at: 2026-05-22 03:30:55
- generation_completed_at: 2026-05-22 03:32:40

## bundle snapshot (session.notes、3 系統)

- target_query: **即日融資 カードローン 金利 比較**
- required_additions (A 系統): 0 件
- shallow_queries    (B 系統): 1 件
- shallow_facts      (C 系統): 2 件

### B: shallow_queries

```json
[
  {
    "query_text": "即日融資 カードローン 金利 比較",
    "self_max": 0.55,
    "comp_max": 0.65,
    "delta": 0.05,
    "threshold": 0.7000000000000001
  }
]
```

### C: shallow_facts

```json
[
  {
    "fact_text": "プロミス",
    "layer": 1,
    "self_max": 0.4,
    "comp_max": 0.55,
    "delta": -0.05,
    "threshold": 0.5
  },
  {
    "fact_text": "アコム",
    "layer": 1,
    "self_max": 0.45,
    "comp_max": 0.58,
    "delta": -0.05,
    "threshold": 0.5299999999999999
  }
]
```

## analysis_output (工程6'-A Opus 4.7)

```json
{
  "structural_analysis": "本記事は『年金受給者向けカードローン』をテーマとし、target_query『即日融資 カードローン 金利 比較』に対しては副次的な関連性に留まる構造である。7社の比較表は実質年率・限度額・融資スピードを併記しているが、即日融資の可否と金利水準を横断比較する一覧性に欠け、shallow_queries で competitor との差分(delta 0.05、閾値 0.70 未到達)が生じている。また shallow_facts でプロミス・アコムの深度が競合平均を下回り(self_max 0.40/0.45 vs comp_max 0.55/0.58)、即日融資文脈での記述が薄い。h2 構成は『借りられるか→7選→コツ→注意点→代替手段→違法業者』と網羅的だが、即日融資×金利の比較軸セクションが独立して存在せず、読者の比較検討ニーズに即応しにくい。保護領域(CTA・ボックス・目次)は変更対象外。",
  "rewrite_policy": [
    {
      "policy_text": "『即日融資対応カードローンの金利比較』を主題とした比較セクションを7選紹介の直前または直後に新設し、融資スピード(最短◯分/当日)と実質年率レンジ(下限〜上限)を同一条件で並べた一覧表を追加。年金受給者でも即日融資を受けやすい商品を金利範囲ベースで横断比較できる構造にする(上限金利のみ・下限金利のみの片側比較は禁止)。",
      "priority": 1,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_after",
        "restructure_outline"
      ],
      "target_change_categories": [
        "h2_structure",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "プロミス紹介セクションについて、最短3分融資の注釈条件(申込時間・審査依存)、金利2.5-18.0%の適用条件、即日融資を受けるための申込時間帯の目安を厚く記述し、即日融資×金利文脈での深度を高める。年金収入のみでは申込不可である旨も明記して誤認を防ぐ。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          0
        ]
      },
      "target_change_types": [
        "rewrite_section",
        "rewrite_paragraph"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "compliance_update"
      ]
    },
    {
      "policy_text": "アコム紹介セクションを最短20分融資・当日契約21時期限・金利2.4-17.9%の組み合わせで即日融資文脈を強化。ただしアフィリエイト規約に従い具体的な返済額シミュレーションは提示せず、公式サイト参照に留める。『初回最大30日間無利息』の正式表記を遵守する。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          1
        ]
      },
      "target_change_types": [
        "rewrite_section",
        "rewrite_paragraph"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "compliance_update"
      ]
    },
    {
      "policy_text": "『年金受給者が即日融資を受ける際の注意点』として、申込時間帯・必要書類の事前準備・収入証明の即時提出などを解説する段落を追加し、即日融資クエリの網羅深度を上げる。違法業者注意セクションとの境界を明確にする。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_before",
        "insert_evidence"
      ],
      "target_change_categories": [
        "evidence_insertion",
        "paragraph_rewrite"
      ]
    },
    {
      "policy_text": "本文中の『電話なし』『在籍確認なし』等の簡略表現を master_rules に従い『原則電話による在籍確認なし』へ置換し、商材言及部分の表記コンプライアンスを統一する(保護領域のCTA・ボックス内テキストは対象外)。",
      "priority": 4,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_paragraph"
      ],
      "target_change_categories": [
        "compliance_update"
      ]
    }
  ],
  "high_risk_categories": [],
  "confidence": "medium",
  "protected_blocks_acknowledged": true
}
```

## master_rewrite_diff (工程6'-B Sonnet 4.6) — 9 件

risk_flag distribution: {"major_restructure":2,"rate_update":2,"(null)":3,"title_change":2}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | h2#年金受給者向けカードローン7選【2026年最新】 | insert_before | h2_structure | major_restructure | high |
| 2 | h2#年金受給者向けカードローン7選【2026年最新】 | restructure_outline | h2_structure | major_restructure | medium |
| 3 | h3#プロミス｜74歳まで申込可能・最短3分融資 | rewrite_section | paragraph_rewrite | rate_update | high |
| 4 | h3#アコム｜最短20分融資(※a) | rewrite_paragraph | paragraph_rewrite | rate_update | high |
| 5 | h3#必要書類を事前に準備する | insert_before | evidence_insertion |  | high |
| 6 | h3#レイク｜年金収入のみで申込可能・最短15分融資 | rewrite_paragraph | compliance_update |  | high |
| 7 | h3#プロミス｜74歳まで申込可能・最短3分融資 | rewrite_paragraph | compliance_update |  | high |
| 8 | meta:title | update_title | title | title_change | medium |
| 9 | meta:description | update_meta_description | title | title_change | medium |

### diff #1 — h2#年金受給者向けカードローン7選【2026年最新】

- change_type: `insert_before`
- change_category: `h2_structure`
- risk_flag: `major_restructure`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<section id="instant-loan-rate-comparison"><h2>即日融資対応カードローンの金利比較【年金受給者向け】</h2><p>急な出費に対応するには、融資スピードと金利水準の両方を確認することが重要です。以下の表では、本記事で紹介するカードローンのうち即日融資（当日中の融資）または最短数分〜数十分での融資に対応している商品を、実質年率の範囲と融資スピードで横断比較しています。</p><p>※融資スピードはお申込時間・審査状況により異なります。即日融資を希望する場合は、各社の申込受付時間内（目安：平日・土日祝とも概ね21時まで）に手続きを完了させる必要があります。</p><table><thead><tr><th>カードローン名</th><th>実質年率（下限〜上限）</th><th>融資スピード（目安）</th><th>年金収入のみで申込</th><th>申込上限年齢</th></tr></thead><tbody><tr><td>レイク</td><td>4.5%〜18.0%</td><td>最短15分（Web融資）</td><td>○（可能）</td><td>70歳</td></tr><tr><td>ベルーナノーティス</td><td>4.5%〜18.0%</td><td>最短30分</td><td>○（可能）</td><td>80歳</td></tr><tr><td>アコム</td><td>2.4%〜17.9%</td><td>最短20分（※）</td><td>×（年金以外の収入必要）</td><td>公式サイト参照</td></tr><tr><td>プロミス</td><td>2.5%〜18.0%</td><td>最短3分（※）</td><td>×（年金以外の収入必要）</td><td>74歳</td></tr><tr><td>セゾンファンデックス</td><td>6.5%〜17.8%</td><td>最短即日</td><td>○（可能）</td><td>80歳</td></tr></tbody></table><p>※お申込時間や審査によりご希望に添えない場合がございます。金利の適用利率は審査結果・借入額により決定されます。上限金利・下限金利ともに記載しており、実際に適用される金利は審査によって異なります。</p></section>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲（下限〜上限）を同一条件で提示",
      "融資スピードの注釈条件を明記",
      "年金収入のみ申込可否を明示"
    ],
    "annotations_added": [
      "※お申込時間や審査によりご希望に添えない場合がございます"
    ]
  },
  "evidence_refs": [
    "shallow_queries[0]: delta=0.05, threshold=0.70未到達 → 即日融資×金利比較軸の独立セクション不足を補完"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "即日融資×金利の横断比較セクション新設により、target_queryのembeddingスコアを閾値0.70に近づける"
}
```

### diff #2 — h2#年金受給者向けカードローン7選【2026年最新】

- change_type: `restructure_outline`
- change_category: `h2_structure`
- risk_flag: `major_restructure`
- llm_confidence: medium

**content_before**
```html
<h2>年金受給者向けカードローン7選【2026年最新】</h2>
```

**content_after**
```html
<h2>年金受給者向けカードローン7選【2026年最新】</h2><p>上記の即日融資×金利比較表も参考に、以下では各カードローンの詳細情報・審査条件・即日融資を受けるためのポイントをあわせて解説します。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "新設比較表と7選セクションの導線を明確化"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "shallow_queries[0]: 即日融資文脈での一覧性不足を補完"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "比較表と詳細セクションの接続を明確にし、読者の比較検討ニーズに対応"
}
```

### diff #3 — h3#プロミス｜74歳まで申込可能・最短3分融資

- change_type: `rewrite_section`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<p>プロミスは、最短3分で融資を受けられる(※1)スピーディーな対応が魅力。 申込可能年齢は18歳から74歳までと幅広くお申し込みできます。(※2) 金利は年2.5%〜18.0%で大手消費者金融の中では一般的な水準です。無利息期間は初回利用翌日から最大30日間適用されるため、契約日ではなく実際に借入した日から起算される点が他社と異なります。 ただし、アコムと同様に年金以外の安定収入が必須条件となっており、年金収入のみでは申込できません。 原則として電話での在籍確認はなく、98%が電話以外の方法で完了(プロミス公式HP FAQ)しています。Web完結申込を選択すれば、原則、郵送物なしで契約できます。</p>
```

**content_after**
```html
<p>プロミスは、最短3分で融資を受けられる（※p）スピーディーな対応が魅力です。申込可能年齢は18歳から74歳までと幅広く設定されています（※p3）。</p><p><strong>即日融資を受けるためのポイント：</strong>最短3分融資（※p）を実現するには、原則として<strong>平日・土日祝ともに申込受付時間内（目安：当日21時まで）</strong>にWeb申込・本人確認・審査を完了させる必要があります。時間帯によっては翌日以降の対応となる場合があるため、急ぎの方は午前中〜午後早めの申込を推奨します。</p><p><strong>金利の適用条件：</strong>実質年率は2.5%〜18.0%で、適用される金利は借入額や審査結果によって異なります。少額・短期間の借入では上限金利（18.0%）が適用されることが多く、高額・長期の場合は下限金利（2.5%）に近い水準が適用される場合があります。</p><p><strong>年金受給者の方へ（重要）：</strong>プロミスの申込条件は「安定した収入があること」であり、<strong>収入が年金のみの方はお申込いただけません</strong>（※p3）。パート・アルバイト・自営業など年金以外の収入がある方が対象です。年金以外の収入がある場合は、収入証明書として給与明細・確定申告書等を事前に準備しておくとスムーズです。</p><p>原則電話による在籍確認なし（98%が電話以外の方法で完了）で、Web完結申込なら原則、郵送物なしで契約できます（プロミス公式HP FAQ）。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0
    ]
  },
  "compliance": {
    "violations": [
      "「電話での在籍確認はなく」→「原則電話による在籍確認なし」へ修正"
    ],
    "ymyl_requirements_met": [
      "年金収入のみ申込不可を明記",
      "即日融資の申込時間帯条件を明記",
      "金利適用条件（上限・下限）を説明"
    ],
    "annotations_added": [
      "※p:お申込時間や審査によりご希望に添えない場合がございます",
      "※p3:収入が年金のみの方はお申込いただけません"
    ]
  },
  "evidence_refs": [
    "shallow_facts[0]: プロミス self_max=0.40, comp_max=0.55 → 即日融資文脈での深度不足を補完"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "プロミスの即日融資条件・金利適用条件の記述強化によりfact深度をself_max 0.40→0.50水準へ改善"
}
```

### diff #4 — h3#アコム｜最短20分融資(※a)

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<p>アコムは、業界最大手の消費者金融として192万件以上の利用実績(アコムデータブック2026年3月期 第二四半期決算)を持ち、初めてカードローンを利用する方にも安心感があります。 ただし、アコムの申込条件は「年金以外に安定した収入と返済能力を有する方」となっており、年金収入のみでは申込できません。パートやアルバイト、自営業などで年金以外の収入がある方が対象です。 最短20分(※a)で融資が受けられ、振込融資なら24時間最短10秒(※金融機関により異なります)で口座に入金されます。契約翌日から30日間の無利息期間があり、短期間で返済できる場合は利息負担を抑えられます。 原則として電話での在籍確認はなく、書面での確認に対応しています。</p>
```

**content_after**
```html
<p>アコムは、業界最大手の消費者金融として192万件以上の利用実績（アコムデータブック2026年3月期 第二四半期決算）を持ち、初めてカードローンを利用する方にも安心感があります。</p><p><strong>即日融資を受けるためのポイント：</strong>最短20分融資（※a）を実現するには、<strong>当日21時まで</strong>に申込・審査・契約を完了させる必要があります（アコムの当日契約期限は21時）。審査状況によりご希望に添えない場合があるため、余裕をもって午前中〜午後の早い時間帯に申込することを推奨します。振込融資なら24時間最短10秒（※金融機関により異なります）で口座に入金されます。</p><p><strong>金利の適用条件：</strong>実質年率は2.4%〜17.9%で、適用される金利は借入額・審査結果によって異なります。具体的な返済額については公式サイトのシミュレーターをご利用ください。</p><p><strong>無利息期間：</strong>初回最大30日間無利息（※適用条件：アコムでのご契約がはじめてのお客さま）が適用されます。</p><p><strong>年金受給者の方へ（重要）：</strong>アコムの申込条件は「安定した収入と返済能力を有する方」であり、<strong>収入が年金のみの方はお申込いただけません</strong>。パート・アルバイト・自営業など年金以外の収入がある方が対象です。申込時には収入証明書（給与明細・確定申告書等）を事前にご準備いただくと手続きがスムーズです。</p><p>原則電話によるお勤め先への在籍確認なし（書面確認）で、カードレスを選択すれば原則、郵送物なしで契約できます。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      1
    ]
  },
  "compliance": {
    "violations": [
      "「原則として電話での在籍確認はなく」→「原則電話によるお勤め先への在籍確認なし」へ修正",
      "「契約翌日から30日間の無利息」→「初回最大30日間無利息」へ正式表記へ修正"
    ],
    "ymyl_requirements_met": [
      "アコムの具体的返済額シミュレーション非提示（公式サイト参照）",
      "年金収入のみ申込不可を明記",
      "即日融資の当日21時期限を明記",
      "金利下限〜上限を併記"
    ],
    "annotations_added": [
      "※a:お申込時間や審査によりご希望に添えない場合がございます。アコムの当日契約の期限は21時までです"
    ]
  },
  "evidence_refs": [
    "shallow_facts[1]: アコム self_max=0.45, comp_max=0.58 → 即日融資文脈での深度不足を補完"
  ],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "アコムの即日融資条件・金利・無利息表記の強化によりfact深度をself_max 0.45→0.52水準へ改善"
}
```

### diff #5 — h3#必要書類を事前に準備する

- change_type: `insert_before`
- change_category: `evidence_insertion`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<section id="instant-loan-tips-for-pension"><h3>年金受給者が即日融資を受ける際の注意点</h3><p>急な出費に即日で対応するためには、事前準備が不可欠です。以下のポイントを確認しておきましょう。</p><ol><li><strong>申込時間帯を確認する</strong><br>各社の当日融資には受付期限があります。アコムは当日21時まで、プロミスは申込時間・審査状況により異なりますが、希望する場合は午前中〜午後の早い時間帯の申込を推奨します。受付時間を過ぎると翌営業日以降の対応となる場合があります。</li><li><strong>必要書類を事前に準備する</strong><br>年金受給者の場合、年金証書・年金振込通知書・公的年金等の源泉徴収票などが必要になる場合があります（カードローンの種類によって異なります）。年金以外の収入がある方は、給与明細・確定申告書等も手元に用意しておくと審査がスムーズに進みます。書類の準備が遅れると即日融資が困難になる場合があります。</li><li><strong>収入証明書を即時提出できる体制を整える</strong><br>借入希望額によっては収入証明書の提出が必要な場合があります。事前にスマートフォン等で書類を撮影・スキャンしておくと、Web申込時にすぐ提出でき、審査のスピードアップにつながります。</li><li><strong>Web申込を選択する</strong><br>店舗訪問や郵送申込と比べて、Web申込は手続きが完結しやすく、即日融資の可能性が高まります。本人確認書類（運転免許証・マイナンバーカード等）もデジタル提出に対応している場合があります。</li></ol><p>なお、即日融資の可否は審査結果によって決定されるため、申込後に必ず融資が実行されるとは限りません。余裕をもって計画的な資金調達を心がけましょう。</p></section>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "即日融資が確約されない旨を明記",
      "安易な借入意欲喚起表現なし",
      "申込時間帯・必要書類の実用情報を提供"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "shallow_queries[0]: 即日融資クエリの網羅深度補強"
  ],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "即日融資の実務的手順を解説することでクエリ網羅深度を向上し、読者の実際の申込行動を適切にサポート"
}
```

### diff #6 — h3#レイク｜年金収入のみで申込可能・最短15分融資

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<td>在籍確認</td><td>原則電話なし（同意なしでは実施しない）</td>
```

**content_after**
```html
<td>在籍確認</td><td>原則電話による在籍確認なし（同意なしでは実施しない）</td>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      "「原則電話なし」→「原則電話による在籍確認なし」へmaster_rules必須表現に準拠"
    ],
    "ymyl_requirements_met": [
      "在籍確認の正式表記への統一"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "master_rules: 必須表現「電話なし」→「原則電話による在籍確認なし」"
  ],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "compliance",
  "expected_delta": "表記コンプライアンスの統一"
}
```

### diff #7 — h3#プロミス｜74歳まで申込可能・最短3分融資

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<p>原則として電話での在籍確認はなく、98%が電話以外の方法で完了(プロミス公式HP FAQ)しています。Web完結申込を選択すれば、原則、郵送物なしで契約できます。</p>
```

**content_after**
```html
<p>原則電話による在籍確認なし（98%が電話以外の方法で完了、プロミス公式HP FAQ）。Web完結申込を選択すれば、原則、郵送物なしで契約できます。</p>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      "「原則として電話での在籍確認はなく」→「原則電話による在籍確認なし」へmaster_rules必須表現に準拠"
    ],
    "ymyl_requirements_met": [
      "在籍確認の正式表記への統一"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "master_rules: 必須表現「電話なし」→「原則電話による在籍確認なし」"
  ],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "compliance",
  "expected_delta": "表記コンプライアンスの統一"
}
```

### diff #8 — meta:title

- change_type: `update_title`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: medium

**content_before**
```html
年金受給者でも借りられるカードローンはある？おすすめ7選と審査のコツ【2026年】
```

**content_after**
```html
年金受給者でも借りられるカードローン7選｜即日融資・金利比較と審査のコツ【2026年最新】
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "target_queryキーワード（即日融資・金利比較）をタイトルに組み込み"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "shallow_queries[0]: delta=0.05 → タイトルへのキーワード反映でクエリ適合性向上"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "タイトルへのキーワード組み込みによりCTR・クエリ適合性の改善"
}
```

### diff #9 — meta:description

- change_type: `update_meta_description`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
年金受給者でも利用できるカードローン7選を即日融資スピード・金利（実質年率）で徹底比較。最短3〜20分融資に対応した商品の申込条件・審査のコツ・必要書類を2026年最新情報でわかりやすく解説します。
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "「即日融資」「金利」「比較」のキーワードを自然に組み込み",
      "誇大表現なし"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "shallow_queries[0]: target_queryへの適合性向上のためmeta descriptionにキーワード反映"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "検索結果でのCTR改善・クエリ適合性向上"
}
```

---

# Session 32 (7/11) — Session 32

- post_id: **12818**
- triggered_by: validation-run
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: (null)
- high_risk_categories: []
- tokens: analysis 8531/1712 | generation 12677/6044
- started_at: 2026-05-22 03:33:08
- analysis_completed_at: 2026-05-22 03:33:43
- generation_completed_at: 2026-05-22 03:35:08

## bundle snapshot (session.notes、3 系統)

- target_query: **即日融資 カードローン 金利 比較**
- required_additions (A 系統): 0 件
- shallow_queries    (B 系統): 1 件
- shallow_facts      (C 系統): 2 件

### B: shallow_queries

```json
[
  {
    "query_text": "即日融資 カードローン 金利 比較",
    "self_max": 0.55,
    "comp_max": 0.65,
    "delta": 0.05,
    "threshold": 0.7000000000000001
  }
]
```

### C: shallow_facts

```json
[
  {
    "fact_text": "プロミス",
    "layer": 1,
    "self_max": 0.4,
    "comp_max": 0.55,
    "delta": -0.05,
    "threshold": 0.5
  },
  {
    "fact_text": "アコム",
    "layer": 1,
    "self_max": 0.45,
    "comp_max": 0.58,
    "delta": -0.05,
    "threshold": 0.5299999999999999
  }
]
```

## analysis_output (工程6'-A Opus 4.7)

```json
{
  "structural_analysis": "本記事は『借り換え』を主テーマに、仕組み・メリット・注意点・おすすめ7社・シミュレーション・審査ポイント・手続き手順という標準的な構成で網羅されており、見出し設計は明瞭。ただしtarget_query『即日融資 カードローン 金利 比較』に対する適合度はやや弱く、銀行カードローン中心の比較となっており、即日融資の観点（最短融資時間の横並び比較、即日対応可能な消費者金融との金利差比較）が不足している。また借り換え文脈で言及されるべきプロミス・アコム等の大手消費者金融との比較深度が浅く、結論部のプロミス推しと本文の銀行7社紹介との整合性も弱い。シミュレーション部は具体性があるが、即日融資×金利という横断比較表が欠落しており、ユーザーが『今日中に低金利で借り換え先を決める』判断材料として情報密度が不足している。",
  "rewrite_policy": [
    {
      "policy_text": "『即日融資 カードローン 金利 比較』クエリへの適合を高めるため、おすすめ7社紹介の前後に『即日融資対応可否 × 金利範囲 × 最短融資時間』を一覧化した横断比較表セクションを新設する。銀行カードローンは原則即日融資不可である点と、消費者金融は即日対応だが上限金利18.0%である点を同一条件下で並列提示し、借り換えユーザーの判断軸を明確化する。",
      "priority": 1,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_after",
        "restructure_outline"
      ],
      "target_change_categories": [
        "h2_structure",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "プロミスに関する記述深度を強化する。結論部で推奨されているにもかかわらず本文の7社紹介に含まれていないため、借り換え視点でのプロミス活用方法（おまとめ・借り換え目的での利用、金利範囲2.5%〜18.0%、最短3分融資、初めての方は契約翌日から最大30日間無利息）を独立小見出しとして追加し、銀行カードローン審査落ち時の代替選択肢として位置づける。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": [
          0
        ]
      },
      "target_change_types": [
        "insert_after",
        "rewrite_section"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "アコムに関する基本情報を浅く追記する。借り換え検討者にとって大手消費者金融比較は必須情報であり、金利範囲・最短融資時間・申込条件等の基礎事実を提示する。ただしアフィリエイト規約に従い、具体的な返済額シミュレーションは作成せず公式サイト参照に留める。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": [
          1
        ]
      },
      "target_change_types": [
        "insert_after"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "compliance_update"
      ]
    },
    {
      "policy_text": "『30日間無利息』表記がイオン銀行の見出しに登場するため、商材言及時のルールに従い『初回最大30日間無利息』等の正式表記へ修正する。また在籍確認に関する記述で『電話以外の方法』に触れる箇所は『原則電話による在籍確認なし』の正式表現に整える。",
      "priority": 4,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_paragraph"
      ],
      "target_change_categories": [
        "compliance_update"
      ]
    },
    {
      "policy_text": "shallow_query『即日融資 カードローン 金利 比較』の深度補強として、Q&Aセクションに『借り換えで即日融資は可能か』『銀行カードローンと消費者金融、即日性と金利のどちらを優先すべきか』を追加し、即日融資×金利比較の関連クエリを内部で吸収する。",
      "priority": 5,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_before",
        "rewrite_section"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "h2_structure"
      ]
    }
  ],
  "high_risk_categories": [],
  "confidence": "medium",
  "protected_blocks_acknowledged": true
}
```

## master_rewrite_diff (工程6'-B Sonnet 4.6) — 9 件

risk_flag distribution: {"major_restructure":1,"title_change":2,"(null)":3,"rate_update":2,"regulation_citation":1}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | h2#借り換えにおすすめのカードローン会社7社 | insert_before | h2_structure | major_restructure | high |
| 2 | h2#借り換えにおすすめのカードローン会社7社 | rewrite_section | h2_structure | title_change | medium |
| 3 | h3#イオン銀行｜上限13.8%の低金利＋30日間無利息 | rewrite_paragraph | compliance_update |  | high |
| 4 | h3#在籍確認の方法を事前に確認しておく | rewrite_paragraph | compliance_update |  | high |
| 5 | h2#借り換えにおすすめのカードローン会社7社 | insert_after | evidence_insertion | rate_update | high |
| 6 | h2#借り換えにおすすめのカードローン会社7社 | insert_after | paragraph_rewrite | rate_update | high |
| 7 | h2#よくある質問（Q&A） | insert_before | paragraph_rewrite | regulation_citation | high |
| 8 | meta:title | update_title | title | title_change | medium |
| 9 | meta:description | update_meta_description | title |  | medium |

### diff #1 — h2#借り換えにおすすめのカードローン会社7社

- change_type: `insert_before`
- change_category: `h2_structure`
- risk_flag: `major_restructure`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<section id="instant-loan-comparison">
  <h2>即日融資×金利比較｜銀行カードローンvs消費者金融</h2>
  <p>借り換えを急いでいる方にとって「今日中に融資を受けられるか」は重要な判断軸です。以下の表で、<strong>即日融資対応可否・金利範囲・最短融資時間</strong>を横断比較します。</p>
  <div class="comparison-table-wrap">
    <table>
      <thead>
        <tr>
          <th>カードローン</th>
          <th>種別</th>
          <th>金利範囲（実質年率）</th>
          <th>即日融資</th>
          <th>最短融資時間</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>プロミス</td>
          <td>消費者金融</td>
          <td>2.5%〜18.0%</td>
          <td>○</td>
          <td>最短3分※1</td>
        </tr>
        <tr>
          <td>アコム</td>
          <td>消費者金融</td>
          <td>3.0%〜18.0%</td>
          <td>○</td>
          <td>最短20分※2</td>
        </tr>
        <tr>
          <td>三井住友銀行</td>
          <td>銀行</td>
          <td>1.5%〜14.5%</td>
          <td>△※3</td>
          <td>最短当日</td>
        </tr>
        <tr>
          <td>三菱UFJ（バンクイック）</td>
          <td>銀行</td>
          <td>1.4%〜14.6%</td>
          <td>△※3</td>
          <td>最短当日</td>
        </tr>
        <tr>
          <td>みずほ銀行</td>
          <td>銀行</td>
          <td>2.0%〜14.0%</td>
          <td>△※3</td>
          <td>最短当日</td>
        </tr>
        <tr>
          <td>イオン銀行</td>
          <td>銀行</td>
          <td>3.8%〜13.8%</td>
          <td>×</td>
          <td>審査後カード郵送</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p><small>※1 お申込の状況によってはご希望に添えない場合があります。※2 申込の時間帯により異なります。※3 銀行カードローンは原則として即日融資に対応していないか、条件（口座保有など）を満たす場合のみ当日融資が可能です。融資確定は翌営業日以降となるケースもあります。</small></p>
  <div class="point-box">
    <p><strong>【ポイント】即日性を重視するなら消費者金融、金利の低さを重視するなら銀行カードローン</strong>が選択の基準になります。ただし消費者金融の上限金利は年18.0%となるため、借り換え後の総返済額を必ずシミュレーションしてください。</p>
  </div>
</section>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体を提示（上限・下限両方）",
      "即日融資に関する条件・注意事項を明記"
    ],
    "annotations_added": [
      "※印で即日融資の条件を注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資×金利比較の横断的判断材料",
  "expected_delta": "target_query『即日融資 カードローン 金利 比較』への適合度向上、滞在時間改善"
}
```

### diff #2 — h2#借り換えにおすすめのカードローン会社7社

- change_type: `rewrite_section`
- change_category: `h2_structure`
- risk_flag: `title_change`
- llm_confidence: medium

**content_before**
```html
<h2>借り換えにおすすめのカードローン会社7社</h2>
```

**content_after**
```html
<h2>借り換えにおすすめのカードローン会社7社＋消費者金融2選</h2>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "銀行・消費者金融双方の選択肢を明示"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "借り換え先の網羅性",
  "expected_delta": "消費者金融との比較を含む構成明示により検索意図カバレッジ向上"
}
```

### diff #3 — h3#イオン銀行｜上限13.8%の低金利＋30日間無利息

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<h3>イオン銀行｜上限13.8%の低金利＋30日間無利息</h3>
```

**content_after**
```html
<h3>イオン銀行｜上限13.8%の低金利＋初回最大30日間無利息</h3>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      "master_rules: 正式表記ルール『30日間無利息』→『初回最大30日間無利息』"
    ],
    "ymyl_requirements_met": [
      "無利息期間の正式表記に修正"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "コンプライアンス遵守",
  "expected_delta": "規約違反リスク解消"
}
```

### diff #4 — h3#在籍確認の方法を事前に確認しておく

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<p>最近では書類提出や電話以外の方法で対応してくれるカードローンも増えています。</p>
```

**content_after**
```html
<p>最近では書類提出による確認など、<strong>原則電話による在籍確認なし</strong>で対応してくれるカードローンも増えています。申込前にコールセンターへ問い合わせるか、公式サイトのFAQで確認することをおすすめします。</p>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      "master_rules: 必須表現ルール『電話以外の方法』→『原則電話による在籍確認なし』"
    ],
    "ymyl_requirements_met": [
      "在籍確認に関する正式表現を使用"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "コンプライアンス遵守",
  "expected_delta": "規約違反リスク解消"
}
```

### diff #5 — h2#借り換えにおすすめのカードローン会社7社

- change_type: `insert_after`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<section id="promise-section">
  <h3>プロミス｜即日融資対応＋借り換え・おまとめ目的でも利用可</h3>
  <table>
    <tbody>
      <tr><th>実質年率</th><td>2.5%〜18.0%</td></tr>
      <tr><th>限度額</th><td>1〜500万円</td></tr>
      <tr><th>最短融資時間</th><td>最短3分※</td></tr>
      <tr><th>無利息期間</th><td>初めての方は契約翌日から最大30日間無利息</td></tr>
      <tr><th>申込年齢</th><td>18歳以上74歳以下（高校生を除く）</td></tr>
    </tbody>
  </table>
  <p><small>※お申込の状況によってはご希望に添えない場合があります。</small></p>
  <div class="point-box">
    <h4>借り換え・おまとめ目的でのプロミス活用ポイント</h4>
    <ul>
      <li>銀行カードローンの審査に通らなかった場合の代替選択肢として検討できます。</li>
      <li>金利範囲は2.5%〜18.0%。借入額・返済実績によって適用金利が決まります。</li>
      <li>SMBCグループの消費者金融で、安定した運営体制が特徴です。</li>
      <li>初めての方は契約翌日から最大30日間無利息のため、短期間での借り換え利用にも有利です。</li>
      <li>最短3分融資に対応しており、急ぎの借り換え資金調達にも活用できます。</li>
    </ul>
  </div>
  <p>銀行カードローンは審査基準が厳しい傾向があります。審査結果によっては、プロミスのような大手消費者金融を借り換え先として検討することも有効な選択肢です。ただし上限金利は年18.0%となるため、借り換え後の金利が現在より低くなるかを必ず確認してください。</p>
</section>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": [
      0
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体を明示",
      "無利息期間の正式表記使用",
      "上限金利の注意喚起を明記",
      "過度な借入意欲喚起表現なし"
    ],
    "annotations_added": [
      "最短融資時間の条件注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "プロミスの借り換え活用情報の深度",
  "expected_delta": "結論部推薦との整合性向上、shallow_fact[0]ギャップ解消"
}
```

### diff #6 — h2#借り換えにおすすめのカードローン会社7社

- change_type: `insert_after`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<section id="acom-section">
  <h3>アコム｜大手消費者金融として銀行審査落ち時の選択肢</h3>
  <table>
    <tbody>
      <tr><th>実質年率</th><td>3.0%〜18.0%</td></tr>
      <tr><th>限度額</th><td>1〜800万円</td></tr>
      <tr><th>最短融資時間</th><td>最短20分※</td></tr>
      <tr><th>申込年齢</th><td>20歳以上（安定した収入と返済能力を有する方）</td></tr>
    </tbody>
  </table>
  <p><small>※申込の時間帯や審査状況によって異なります。</small></p>
  <p>アコムはMUFGグループの大手消費者金融です。金利範囲は年3.0%〜18.0%で、限度額は最大800万円と大口の借り換えにも対応しています。最短20分での融資に対応しており、急ぎの借り換え資金調達にも活用できます。</p>
  <p>具体的な返済額シミュレーションや最新の金利・条件については、<a href="https://www.acom.co.jp/" rel="noopener noreferrer" target="_blank">アコム公式サイト</a>をご参照ください。</p>
</section>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": [
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体を明示",
      "具体的返済額シミュレーション非掲載（アコムアフィリエイト規約遵守）",
      "公式サイト参照誘導"
    ],
    "annotations_added": [
      "最短融資時間の条件注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "アコムの借り換え選択肢としての情報提供",
  "expected_delta": "shallow_fact[1]ギャップ解消、大手消費者金融比較の網羅性向上"
}
```

### diff #7 — h2#よくある質問（Q&A）

- change_type: `insert_before`
- change_category: `paragraph_rewrite`
- risk_flag: `regulation_citation`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<section id="instant-loan-faq">
  <h2>即日融資と借り換えに関するよくある質問</h2>
  <div class="faq-item">
    <h3>Q. 借り換えで即日融資を受けることはできますか？</h3>
    <p>A. 消費者金融（プロミス・アコムなど）であれば、審査通過後に最短数十分〜数時間で融資を受けられる場合があります。一方、<strong>銀行カードローンは原則として即日融資に対応していません</strong>。みずほ銀行・三菱UFJバンクイック・三井住友銀行カードローンなどは「最短当日」と案内していますが、審査完了・カード発行には数営業日かかるケースも多く、確実な即日融資は保証されていません。急いで借り換え資金を用意する必要がある場合は、消費者金融の利用も視野に入れましょう。</p>
  </div>
  <div class="faq-item">
    <h3>Q. 銀行カードローンと消費者金融、即日性と金利のどちらを優先すべきですか？</h3>
    <p>A. 目的によって優先軸が変わります。<strong>利息削減を最優先とするなら銀行カードローン</strong>（上限金利13.8%〜14.6%程度）が有利ですが、審査に数日かかります。<strong>今日中に資金が必要な場合は消費者金融</strong>（上限金利18.0%）を選択肢に入れることになりますが、現在の金利が18.0%であれば借り換え効果は限定的です。まず銀行カードローンに申し込み、審査に時間がかかる・通らない場合のバックアップとして消費者金融を検討するという順序が一般的です。</p>
  </div>
</section>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      {
        "rule_id": 22,
        "ng_text": "上限金利だけ / 下限金利だけを並べた比較表",
        "legal_basis": "景表法・業界自主規制 (誤認比較)",
        "detection_layer": 2,
        "evidence_snippet": "銀行カードローン（上限金利13.8%〜14.6%程度）が有利…消費者金融（上限金利18.0%）を選択肢に入れることになりますが、現在の金利が18.0%であれば借り換え効果は限定的",
        "severity": "high",
        "reason": "銀行と消費者金融の比較に上限金利のみを抽出して並べており、下限金利を含む金利範囲全体を提示していない誤認比較構造"
      }
    ],
    "ymyl_requirements_met": [
      "即日融資の条件・制約を正確に説明",
      "銀行の即日融資が保証されない旨を明記",
      "過度な借入意欲喚起表現なし"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資×借り換えの疑問解消",
  "expected_delta": "関連クエリの内部吸収、FAQスキーマ対象拡充"
}
```

### diff #8 — meta:title

- change_type: `update_title`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: medium

**content_before**
```html
<title>カードローン借り換えのおすすめは？金利比較と審査通過のコツ【2026年】</title>
```

**content_after**
```html
<title>カードローン借り換えおすすめ比較【2026年】即日融資対応・金利一覧と審査通過のコツ</title>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "target_queryキーワード『即日融資 カードローン 金利 比較』をタイトルに反映"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "タイトルとtarget_queryの一致度",
  "expected_delta": "CTR改善・検索意図適合度向上"
}
```

### diff #9 — meta:description

- change_type: `update_meta_description`
- change_category: `title`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<meta name="description" content="カードローン借り換えのおすすめ7社＋消費者金融2選を金利・即日融資対応で徹底比較【2026年最新】。銀行カードローンvs消費者金融の金利差・最短融資時間を一覧表で解説。審査通過のコツと返済シミュレーションも紹介。" />
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "meta descriptionにtarget_queryキーワードを適切に含有"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "SERP表示時のCTR",
  "expected_delta": "即日融資・金利比較訴求によるCTR向上"
}
```

---

# Session 33 (8/11) — Session 33

- post_id: **7196**
- triggered_by: validation-run
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: (null)
- high_risk_categories: []
- tokens: analysis 8749/1701 | generation 12282/4203
- started_at: 2026-05-22 03:35:40
- analysis_completed_at: 2026-05-22 03:36:13
- generation_completed_at: 2026-05-22 03:37:16

## bundle snapshot (session.notes、3 系統)

- target_query: **即日融資 カードローン 金利 比較**
- required_additions (A 系統): 0 件
- shallow_queries    (B 系統): 1 件
- shallow_facts      (C 系統): 2 件

### B: shallow_queries

```json
[
  {
    "query_text": "即日融資 カードローン 金利 比較",
    "self_max": 0.55,
    "comp_max": 0.65,
    "delta": 0.05,
    "threshold": 0.7000000000000001
  }
]
```

### C: shallow_facts

```json
[
  {
    "fact_text": "プロミス",
    "layer": 1,
    "self_max": 0.4,
    "comp_max": 0.55,
    "delta": -0.05,
    "threshold": 0.5
  },
  {
    "fact_text": "アコム",
    "layer": 1,
    "self_max": 0.45,
    "comp_max": 0.58,
    "delta": -0.05,
    "threshold": 0.5299999999999999
  }
]
```

## analysis_output (工程6'-A Opus 4.7)

```json
{
  "structural_analysis": "本記事は『総量規制』を主題として、基本ルール・対象/対象外/除外/例外貸付・年収別借入額・信用情報機関・リスクという論理的な構成で網羅されている。法令準拠の説明、出典リンク、年収別シミュレーション、自主規制への言及など、YMYL 領域として求められる情報の深度は確保されている。しかし target_query が『即日融資 カードローン 金利 比較』であるのに対し、本記事は総量規制の制度解説に終始しており、即日融資の可否や金利比較といったユーザー検索意図への応答が薄い。冒頭の PR ボックスでプロミス・アコム・アイフルに言及はあるが、各社の金利範囲・融資スピードを横断比較する情報は本文中に存在しない。また銀行カードローンが即日融資不可となった経緯には触れるが、消費者金融が即日対応可能である点との対比比較がなく、shallow_queries 解消の余地が大きい。",
  "rewrite_policy": [
    {
      "policy_text": "『総量規制と即日融資・金利の関係』を解説する新規 H2 セクションを追加し、消費者金融(貸金業者=総量規制対象)が即日融資に対応する一方、銀行カードローンは自主規制により即日不可となった経緯を対比整理する。同セクション内で金利範囲全体(下限〜上限)を提示した比較観点を盛り込み、target_query への応答性を強化する。",
      "priority": 1,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_after",
        "restructure_outline"
      ],
      "target_change_categories": [
        "h2_structure",
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "『貸金業者とは？消費者金融・信販会社が対象』の項目内で、プロミスについて金利範囲全体(例: 4.5%〜17.8%)・融資スピード・無利息サービスの正式表記(初めての方は契約翌日から最大30日間無利息)を含む事実情報を厚く加筆し、shallow_fact 深度を引き上げる。比較構造禁止ルールに従い上限金利のみの並列比較は避ける。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          0
        ]
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion",
        "compliance_update"
      ]
    },
    {
      "policy_text": "アコムに関する事実深度を引き上げるため、貸金業者の例示部分で金利範囲全体・限度額・契約までの所要時間など公式情報ベースの事実を加筆する。パートナー個別ルールに従い、具体的な返済額シミュレーションは提示せず公式サイト参照に留める。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          1
        ]
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion",
        "compliance_update"
      ]
    },
    {
      "policy_text": "『銀行の自主規制ルールとは？』項目を補強し、警察庁データベース照会義務化により銀行カードローンで即日融資ができなくなった点と、貸金業者(消費者金融)では即日融資が可能である点をセットで整理。target_query『即日融資』への応答を本文中に明示する。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_after"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "関連記事 (post_id 7170, 11077, 7235) へのコンテキスト内部リンクを、即日融資・金利比較・カードローン比較に関する記述箇所から自然な文脈で設置し、ユーザー検索意図に対する回遊導線を強化する。",
      "priority": 4,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_after"
      ],
      "target_change_categories": [
        "internal_link"
      ]
    }
  ],
  "high_risk_categories": [],
  "confidence": "medium",
  "protected_blocks_acknowledged": true
}
```

## master_rewrite_diff (工程6'-B Sonnet 4.6) — 6 件

risk_flag distribution: {"major_restructure":1,"rate_update":1,"(null)":4}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | h2#総量規制の対象外となる借入｜銀行・ショッピング枠 | insert_after | h2_structure | major_restructure | high |
| 2 | h3#貸金業者とは？消費者金融・信販会社が対象 | rewrite_paragraph | paragraph_rewrite | rate_update | high |
| 3 | h3#貸金業者とは？消費者金融・信販会社が対象 | insert_evidence | evidence_insertion |  | high |
| 4 | h3#銀行の自主規制ルールとは？ | rewrite_paragraph | paragraph_rewrite |  | high |
| 5 | h3#銀行の自主規制ルールとは？ | insert_after | internal_link |  | medium |
| 6 | h2#まとめ | insert_before | internal_link |  | medium |

### diff #1 — h2#総量規制の対象外となる借入｜銀行・ショッピング枠

- change_type: `insert_after`
- change_category: `h2_structure`
- risk_flag: `major_restructure`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<h2 id="sokuji-kinri-hikaku">総量規制と即日融資・金利の関係｜消費者金融と銀行カードローンの違い</h2><p>カードローンを検討する際、「即日融資」や「金利」は重要な比較ポイントです。総量規制の適用対象かどうかは、即日融資の可否や金利水準に直結しています。</p><h3>消費者金融（貸金業者）は即日融資に対応</h3><p>プロミス・アコム・アイフルなどの消費者金融は貸金業法に基づく貸金業者であり、総量規制の対象です。その一方で、独自の審査システムを活用することで、申込から最短即日での融資に対応しています。金利は各社の設定に幅があり、借入額や返済実績によって適用金利が変わります。借入コストを正確に把握するには、上限金利だけでなく金利範囲全体（下限〜上限）を確認することが重要です。</p><h3>銀行カードローンは総量規制対象外だが即日融資は困難</h3><p>銀行カードローンは貸金業法ではなく銀行法が適用されるため、総量規制の対象外です。ただし、全国銀行協会の自主規制により審査時に警察庁データベースへの照会が義務化されたことで、銀行カードローンでは原則として即日融資ができない状況となっています。即日での資金調達が必要な場合は、消費者金融のカードローンが主な選択肢となります。</p><p>カードローンを選ぶ際は、適用金利の範囲・融資スピード・無利息サービスの有無などを総合的に比較検討することをおすすめします。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "即日融資の可否を消費者金融・銀行で対比説明",
      "金利範囲全体の確認を促す表現を採用"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "全国銀行協会「銀行カードローンの自主規制」"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "target_query への応答性向上・新規H2追加によるコンテンツ深度強化"
}
```

### diff #2 — h3#貸金業者とは？消費者金融・信販会社が対象

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<p>貸金業者とは、貸金業法に基づいて財務局長または都道府県知事の登録を受けて貸付業務を行う事業者のことです。代表的な貸金業者には、消費者金融会社（アコム、プロミス、アイフルなど）や信販会社（オリコ、ジャックスなど）があります。</p><p>これらの貸金業者が提供するカードローンやフリーローンは、すべて総量規制の対象となります。そのため、年収の3分の1を超える借入はできません。</p>
```

**content_after**
```html
<p>貸金業者とは、貸金業法に基づいて財務局長または都道府県知事の登録を受けて貸付業務を行う事業者のことです。代表的な貸金業者には、消費者金融会社（プロミス、アコム、アイフルなど）や信販会社（オリコ、ジャックスなど）があります。</p><p>これらの貸金業者が提供するカードローンやフリーローンは、すべて総量規制の対象となります。そのため、年収の3分の1を超える借入はできません。</p><p>たとえばプロミスは、金利4.5%〜17.8%（実質年率）で最大500万円まで借入可能なカードローンを提供しています。申込からスピーディーに審査が進む点が特徴で、初めての方は契約翌日から最大30日間無利息のサービスも用意されています（※無利息サービスは条件があります。詳細は公式サイトをご確認ください）。</p><p>アコムは金利2.4%〜17.9%（実質年率）、借入限度額は最大800万円で、公式サイトでは最短20分での審査回答を案内しています。具体的な返済額については、公式サイトのシミュレーターをご確認ください。</p><p>貸金業者かどうかは、金融庁の「登録貸金業者情報検索サービス」で確認できます。登録番号がない業者は違法なヤミ金融の可能性があるため、利用を避けましょう。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "プロミスの無利息表記を正式表記（初めての方は契約翌日から最大30日間無利息）で記載",
      "金利は上限のみでなく範囲全体（下限〜上限）を提示",
      "アコムの具体的返済額シミュレーションは提示せず公式サイト参照に留める"
    ],
    "annotations_added": [
      "無利息サービス条件付き注記を追加"
    ]
  },
  "evidence_refs": [
    "プロミス公式サイト",
    "アコム公式サイト"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "プロミス・アコムに関する事実深度向上・金利範囲情報の付加"
}
```

### diff #3 — h3#貸金業者とは？消費者金融・信販会社が対象

- change_type: `insert_evidence`
- change_category: `evidence_insertion`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<div class="notice-box"><p>※金利・限度額・サービス内容は各社の審査結果や利用状況により異なります。最新情報は各社公式サイトでご確認ください。</p></div>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利・サービス情報に関する注意書きを追加し誤認リスクを低減"
    ],
    "annotations_added": [
      "金利・限度額免責注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "YMYL信頼性",
  "expected_delta": "金利情報の誤認リスク低減・コンプライアンス強化"
}
```

### diff #4 — h3#銀行の自主規制ルールとは？

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<p>銀行カードローンは総量規制の対象外ですが、過去に過剰貸付が問題視されたことから、銀行業界では自主規制が導入されています。</p><p>全国銀行協会は2017年に申し合わせを行い、「総量規制対象外」を強調する広告の自粛や、50万円を超える融資時の収入証明書確認の徹底などを実施しています。また、審査時には警察庁データベースへの照会が義務化されたため、銀行カードローンでは即日融資ができなくなりました。</p>
```

**content_after**
```html
<p>銀行カードローンは総量規制の対象外ですが、過去に過剰貸付が問題視されたことから、銀行業界では自主規制が導入されています。</p><p>全国銀行協会は2017年に申し合わせを行い、「総量規制対象外」を強調する広告の自粛や、50万円を超える融資時の収入証明書確認の徹底などを実施しています。また、審査時には警察庁データベースへの照会が義務化されたため、銀行カードローンでは原則として即日融資ができない状況となっています。</p><p>一方、消費者金融（貸金業者）は総量規制の対象ではありますが、独自の審査システムを持ち、最短即日での融資に対応しているケースがあります。急ぎで資金が必要な場合、銀行カードローンと消費者金融では融資スピードに大きな差が生じる点を理解しておくことが重要です。</p><p>さらに、多くの銀行では年収の2分の1や3分の1を目安に融資上限を設定するなど、総量規制に準じた運用を行っています。そのため、銀行カードローンでも無制限に借りられるわけではないことを理解しておきましょう。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "即日融資の可否を銀行・消費者金融で明確に対比説明"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "全国銀行協会「銀行カードローンの自主規制」"
  ],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン",
  "expected_delta": "target_query「即日融資」への本文内応答を強化"
}
```

### diff #5 — h3#銀行の自主規制ルールとは？

- change_type: `insert_after`
- change_category: `internal_link`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<p>消費者金融カードローンの金利・融資スピードを詳しく比較したい方は、以下の関連記事もあわせてご確認ください。</p><ul><li><a href="/cardloan/sokuji/">即日融資対応のカードローン比較【消費者金融の選び方】</a></li><li><a href="/cardloan/kinri-hikaku/">カードローン金利比較ランキング【実質年率の見方と注意点】</a></li></ul>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "関連コンテンツへの回遊導線を設置"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "内部リンクによる回遊率向上・検索意図に対する導線強化"
}
```

### diff #6 — h2#まとめ

- change_type: `insert_before`
- change_category: `internal_link`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<p>カードローンの金利や即日融資の詳細については、以下の記事で詳しく解説しています。借入を検討している方はあわせてご参照ください。</p><ul><li><a href="/cardloan/sokuji/">最短即日融資に対応したカードローンの選び方</a></li><li><a href="/cardloan/kinri-hikaku/">カードローンの金利比較ガイド</a></li></ul>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "まとめ前に関連記事への自然な導線を設置"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "記事末尾での回遊導線追加・検索意図充足度向上"
}
```

---

# Session 34 (9/11) — Session 34

- post_id: **7235**
- triggered_by: validation-run
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: approved
- high_risk_categories: ["rate_update"]
- tokens: analysis 8837/1665 | generation 12156/6915
- started_at: 2026-05-22 03:37:35
- analysis_completed_at: 2026-05-22 03:38:08
- generation_completed_at: 2026-05-22 03:39:42

## bundle snapshot (session.notes、3 系統)

- target_query: **即日融資 カードローン 金利 比較**
- required_additions (A 系統): 0 件
- shallow_queries    (B 系統): 1 件
- shallow_facts      (C 系統): 2 件

### B: shallow_queries

```json
[
  {
    "query_text": "即日融資 カードローン 金利 比較",
    "self_max": 0.55,
    "comp_max": 0.65,
    "delta": 0.05,
    "threshold": 0.7000000000000001
  }
]
```

### C: shallow_facts

```json
[
  {
    "fact_text": "プロミス",
    "layer": 1,
    "self_max": 0.4,
    "comp_max": 0.55,
    "delta": -0.05,
    "threshold": 0.5
  },
  {
    "fact_text": "アコム",
    "layer": 1,
    "self_max": 0.45,
    "comp_max": 0.58,
    "delta": -0.05,
    "threshold": 0.5299999999999999
  }
]
```

## analysis_output (工程6'-A Opus 4.7)

```json
{
  "structural_analysis": "本記事は『カードローン借り換え』を主題とし、銀行系カードローン5社の比較を中心に構成されている。一方、target_query『即日融資 カードローン 金利 比較』に対しては、即日融資の観点が弱く、shallow_queries で self_max 0.55 / comp_max 0.65 と競合に劣る。冒頭にプロミス・アコム・アイフルのCTAがあるものの、本文比較表は銀行系のみで消費者金融との金利・即日融資スピード比較が欠落している。shallow_facts でもプロミス・アコムの網羅深度が浅い (delta -0.05) と指摘されており、即日融資ニーズに対する解説不足が構造的問題である。また借り換え向き比較表で『審査回答最短当日／融資翌営業日以降』など即日性の差異が明示されておらず、読者が即日融資の可否を判断しにくい。総量規制や借り換え時の審査仕組みの具体的記述も浅く、Q[i] 領域全体の厚みが不足している。",
  "rewrite_policy": [
    {
      "policy_text": "『即日融資 カードローン 金利 比較』セクションを新設し、銀行系と消費者金融系（プロミス・アコム・アイフル等）の金利範囲全体と融資スピードを同一条件下で比較する表を追加。借り換え目線で『金利重視なら銀行系・即日性重視なら消費者金融系』という選択軸を提示する。",
      "priority": 1,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          0,
          1
        ]
      },
      "target_change_types": [
        "insert_after",
        "rewrite_section"
      ],
      "target_change_categories": [
        "h2_structure",
        "evidence_insertion",
        "paragraph_rewrite"
      ]
    },
    {
      "policy_text": "プロミスに関する記述を厚くする。金利範囲（年4.5%〜17.8%）、最短3分融資（要件付き）、原則電話による在籍確認なしの運用などを正式表記で補強し、借り換え検討者目線での位置づけ（即日性は高いが金利は銀行系より高め）を解説。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          0
        ]
      },
      "target_change_types": [
        "insert_after",
        "insert_evidence"
      ],
      "target_change_categories": [
        "evidence_insertion",
        "paragraph_rewrite"
      ]
    },
    {
      "policy_text": "アコムに関する記述を厚くする。金利範囲（年3.0%〜18.0%）、初回最大30日間無利息、最短当日融資などの一般情報のみを記載し、具体的な返済額シミュレーションはアフィリエイト規約に従い提示せず公式サイト参照に留める。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          1
        ]
      },
      "target_change_types": [
        "insert_after",
        "insert_evidence"
      ],
      "target_change_categories": [
        "evidence_insertion",
        "compliance_update",
        "paragraph_rewrite"
      ]
    },
    {
      "policy_text": "既存の銀行系比較表における『融資スピード』列の表現を精緻化し、『審査回答最短当日／融資は翌営業日以降』など即日融資可否を明確化。読者が即日融資ニーズに対し銀行系借り換えの限界を把握できるよう注記を追加する。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_after"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "compliance_update"
      ]
    },
    {
      "policy_text": "比較表の金利表記を金利範囲全体（下限〜上限）で統一しているか再点検し、上限金利のみ／下限金利のみで誤認させる比較構造になっていないか確認のうえ、注記文（実際の適用金利は審査結果による旨）を追加する。",
      "priority": 4,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_paragraph",
        "insert_evidence"
      ],
      "target_change_categories": [
        "compliance_update",
        "paragraph_rewrite"
      ]
    }
  ],
  "high_risk_categories": [
    "rate_update"
  ],
  "confidence": "medium",
  "protected_blocks_acknowledged": true
}
```

## master_rewrite_diff (工程6'-B Sonnet 4.6) — 8 件

risk_flag distribution: {"major_restructure":1,"(null)":2,"rate_update":5}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | h2#借り換えにおすすめのカードローン会社比較ランキング | insert_before | h2_structure | major_restructure | high |
| 2 | h2#借り換えにおすすめのカードローン会社比較ランキング | rewrite_paragraph | paragraph_rewrite |  | high |
| 3 | h3#三菱UFJ(バンクイック) | rewrite_paragraph | paragraph_rewrite | rate_update | high |
| 4 | h3#住信SBIネット銀行 | insert_after | evidence_insertion | rate_update | high |
| 5 | h2#promis-section | insert_after | evidence_insertion | rate_update | high |
| 6 | h2#借り換えにおすすめのカードローン会社比較ランキング | rewrite_paragraph | compliance_update |  | medium |
| 7 | h3#楽天銀行 | rewrite_paragraph | compliance_update | rate_update | high |
| 8 | h2#カードローン借り換えで金利を下げる方法とシミュレーション | rewrite_paragraph | compliance_update | rate_update | high |

### diff #1 — h2#借り換えにおすすめのカードローン会社比較ランキング

- change_type: `insert_before`
- change_category: `h2_structure`
- risk_flag: `major_restructure`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<h2 id="instant-loan-comparison">即日融資カードローンの金利比較｜銀行系と消費者金融系の違い</h2><p>カードローンを選ぶ際、「できるだけ低金利で借り換えたい」という方と「今すぐ資金が必要」という方では、最適な選択肢が異なります。銀行系カードローンは金利が低い一方、融資まで数日〜翌営業日以降かかるケースが多く、消費者金融系は金利がやや高めですが即日融資に対応しています。</p><p>以下の比較表で、代表的なカードローンの金利範囲・融資スピードを同一条件で確認しましょう。</p><table><thead><tr><th>カードローン</th><th>種別</th><th>金利（年率・全範囲）</th><th>融資スピード</th><th>無利息期間</th></tr></thead><tbody><tr><td>三菱UFJ(バンクイック)</td><td>銀行系</td><td>年1.4%〜14.6%</td><td>審査回答：最短当日／融資：翌営業日以降</td><td>なし</td></tr><tr><td>三井住友銀行</td><td>銀行系</td><td>年1.5%〜14.5%</td><td>審査回答：最短当日／融資：審査完了後</td><td>なし</td></tr><tr><td>みずほ銀行</td><td>銀行系</td><td>年2.0%〜14.0%</td><td>審査回答：最短当日（口座保有者）／融資：審査完了後</td><td>なし</td></tr><tr><td>プロミス</td><td>消費者金融系</td><td>年4.5%〜17.8%</td><td>最短3分（※要件あり）</td><td>初めての方は契約翌日から最大30日間無利息</td></tr><tr><td>アコム</td><td>消費者金融系</td><td>年3.0%〜18.0%</td><td>最短当日</td><td>初回最大30日間無利息</td></tr></tbody></table><p class="note">※実際の適用金利は審査結果によって異なります。上表の金利は各社公式サイト掲載の範囲全体を示しています。銀行系カードローンは融資まで翌営業日以降となる場合が多く、即日での現金調達が必要な場合は消費者金融系をご検討ください。</p><p><strong>選択の目安：</strong>金利削減・借り換えを最優先するなら銀行系、今すぐ資金が必要で即日融資を重視するなら消費者金融系が向いています。自身の状況に合わせて選びましょう。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体を提示",
      "即日融資可否を明示",
      "審査結果による旨の注記"
    ],
    "annotations_added": [
      "実際の適用金利は審査結果によって異なる旨の注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "target_queryのself_max 0.55→競合max 0.65超を目指し、銀行系・消費者金融系の横断比較を提供することでクエリ充足度向上"
}
```

### diff #2 — h2#借り換えにおすすめのカードローン会社比較ランキング

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<p>借り換えに適したカードローン会社を選ぶ際は、金利の低さ、限度額の大きさ、審査スピード、借り換え専用プランの有無などを総合的に比較することが重要です。ここでは、借り換えにおすすめのカードローン会社をランキング形式でご紹介します。</p>
```

**content_after**
```html
<p>借り換えに適したカードローン会社を選ぶ際は、金利の低さ、限度額の大きさ、審査スピード、借り換え専用プランの有無などを総合的に比較することが重要です。特に銀行系は低金利が魅力ですが即日融資には対応していない場合が多く、消費者金融系は即日融資に対応する代わりに金利がやや高めとなります。ここでは、借り換えにおすすめの銀行系カードローン会社をランキング形式でご紹介します。即日融資対応の消費者金融系については<a href="#instant-loan-comparison">上記の比較表</a>もあわせてご参照ください。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "銀行系と消費者金融系の選択軸を明示"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "記事内のナビゲーション改善により即日融資ニーズを持つ読者の離脱を防止"
}
```

### diff #3 — h3#三菱UFJ(バンクイック)

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<p>三菱UFJ(バンクイック)は、メガバンクである三菱UFJ銀行が提供するカードローンで、金利年1.4-14.6%という業界最低水準の低金利が最大の魅力です。消費者金融系カードローンの上限金利が年18.0%であるのに対し、年14.6%という低金利で借り換えることで、大幅な利息削減が期待できます。</p><p>また、限度額が最大800万円と高額で、複数の借入れを一本化する際にも十分な枠を確保できます。審査回答は最短当日で、Web完結で申込から契約まで来店不要で手続きが可能です。在籍確認の電話についても相談できるため、職場への連絡が心配な方にも安心です。</p>
```

**content_after**
```html
<p>三菱UFJ(バンクイック)は、メガバンクである三菱UFJ銀行が提供するカードローンで、金利年1.4%〜14.6%という低水準の金利が最大の魅力です。消費者金融系カードローンの上限金利（年18.0%）と比較して大幅な利息削減が期待できます。</p><p>限度額が最大800万円と高額で、複数の借入れを一本化する際にも十分な枠を確保できます。審査回答は最短当日ですが、<strong>融資は翌営業日以降</strong>となる点にご注意ください。即日での現金調達が必要な場合は消費者金融系カードローンの利用を検討してください。Web完結で申込から契約まで来店不要で手続きが可能です。</p><p class="note">※実際の適用金利は審査結果によって異なります。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      {
        "rule_id": 22,
        "ng_text": "上限金利だけ / 下限金利だけを並べた比較表",
        "legal_basis": "景表法・業界自主規制 (誤認比較)",
        "detection_layer": 2,
        "evidence_snippet": "消費者金融系カードローンの上限金利（年18.0%）と比較して大幅な利息削減が期待できます",
        "severity": "medium",
        "reason": "消費者金融系の上限金利18.0%のみを抽出し、バンクイックの金利と比較する片側抽出の比較構造に該当"
      }
    ],
    "ymyl_requirements_met": [
      "融資スピードの限界を明示",
      "金利範囲全体を表記"
    ],
    "annotations_added": [
      "審査結果により適用金利が異なる旨の注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "銀行系の即日融資不可を明示することで読者の誤認防止と情報精度向上"
}
```

### diff #4 — h3#住信SBIネット銀行

- change_type: `insert_after`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<h2 id="promis-section">プロミスの金利・即日融資詳細｜借り換え検討者向けガイド</h2><p>プロミス（SMBCコンシューマーファイナンス株式会社）は、消費者金融系カードローンの中でも即日融資への対応速度が特徴的なサービスです。借り換えを検討している方が消費者金融系を選ぶ場合の代表的な選択肢のひとつです。</p><h3>プロミスの基本情報</h3><table><thead><tr><th>項目</th><th>内容</th></tr></thead><tbody><tr><td>金利（年率）</td><td>年4.5%〜17.8%</td></tr><tr><td>限度額</td><td>1万円〜500万円</td></tr><tr><td>融資スピード</td><td>最短3分（※申込状況・審査内容により異なる）</td></tr><tr><td>無利息期間</td><td>初めての方は契約翌日から最大30日間無利息</td></tr><tr><td>在籍確認</td><td>原則電話によるお勤め先への在籍確認なし</td></tr></tbody></table><h3>借り換え目線でのプロミスの位置づけ</h3><p>プロミスの金利範囲は年4.5%〜17.8%であり、銀行系カードローン（年14.0%〜14.6%程度の上限）と比較すると上限金利はやや高めです。ただし、<strong>最短3分融資（申込の状況・審査内容・お借入時間等によって異なります）</strong>という即日性の高さは銀行系が対応しない即日融資ニーズを補います。</p><p>現在、急ぎで既存の高金利ローンを返済したい方や、つなぎ資金として即日融資を利用したい方には有力な選択肢となります。一方、長期的な金利削減を最優先とする場合は銀行系への借り換えが有利です。</p><p class="note">※実際の適用金利・融資可否は審査結果によって異なります。借り換えにより必ずしも総返済額が減少するとは限りません。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "原則電話によるお勤め先への在籍確認なしを正式表記で使用",
      "初めての方は契約翌日から最大30日間無利息を正式表記で使用",
      "金利範囲全体を表記",
      "融資スピードに要件付き注記"
    ],
    "annotations_added": [
      "審査結果により適用金利・融資可否が異なる旨の注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "プロミスのshallow_fact delta -0.05を解消し、即日融資検索ニーズへの充足度を向上"
}
```

### diff #5 — h2#promis-section

- change_type: `insert_after`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<h2 id="acom-section">アコムの金利・即日融資詳細｜借り換え検討者向けガイド</h2><p>アコム株式会社は、三菱UFJフィナンシャル・グループのカードローン会社です。消費者金融系の中では比較的幅広い金利設定と初回無利息サービスが特徴で、借り換えを検討している方にも利用される選択肢のひとつです。</p><h3>アコムの基本情報</h3><table><thead><tr><th>項目</th><th>内容</th></tr></thead><tbody><tr><td>金利（年率）</td><td>年3.0%〜18.0%</td></tr><tr><td>限度額</td><td>1万円〜800万円</td></tr><tr><td>融資スピード</td><td>最短当日（申込の状況・審査内容により異なる）</td></tr><tr><td>無利息期間</td><td>初回最大30日間無利息</td></tr></tbody></table><h3>借り換え目線でのアコムの位置づけ</h3><p>アコムの金利範囲は年3.0%〜18.0%です。下限金利は銀行系に近い水準から設定されていますが、実際の適用金利は審査結果によって異なります。最短当日融資に対応しており、即日での資金調達が必要な場面で活用できます。</p><p>返済額のシミュレーションについては、アコム公式サイトのシミュレーターをご利用ください。</p><p class="note">※実際の適用金利・融資可否は審査結果によって異なります。借り換えにより必ずしも総返済額が減少するとは限りません。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "初回最大30日間無利息を正式表記で使用",
      "金利範囲全体を表記",
      "アコムの具体的返済額シミュレーション非掲載（公式サイト参照に留める）"
    ],
    "annotations_added": [
      "審査結果により適用金利・融資可否が異なる旨の注記",
      "アコムアフィリエイト規約に基づきシミュレーション非掲載"
    ]
  },
  "evidence_refs": [],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "アコムのshallow_fact delta -0.05を解消し、即日融資検索ニーズへの充足度を向上"
}
```

### diff #6 — h2#借り換えにおすすめのカードローン会社比較ランキング

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**
```html
<td>審査回答：最短当日融資：翌営業日以降</td>
```

**content_after**
```html
<td>審査回答：最短当日／融資：翌営業日以降<br><small>※即日での現金受取不可</small></td>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "銀行系即日融資不可の明示"
    ],
    "annotations_added": [
      "即日での現金受取不可の注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "読者が銀行系の即日融資限界を比較表上で即時把握できるよう改善"
}
```

### diff #7 — h3#楽天銀行

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<p>楽天銀行スーパーローンは、金利年1.9-14.5%という低金利に加えて、楽天会員ランクに応じた審査優遇や、キャンペーンによる無利息期間などの特典が魅力です。</p><p>限度額は最大800万円で、即日融資にも対応しています。楽天銀行の口座を持っていれば24時間いつでも振込融資が可能で、急ぎの借り換えにも対応できます。Web完結で来店不要で申込が可能で、楽天ポイントが貯まる特典もあります。</p>
```

**content_after**
```html
<p>楽天銀行スーパーローンは、金利年1.9%〜14.5%という低金利に加えて、楽天会員ランクに応じた審査優遇などの特典が魅力です。</p><p>限度額は最大800万円で、最短当日〜2営業日での融資に対応しています。楽天銀行の口座を持っていれば振込融資が可能です。Web完結で来店不要で申込が可能で、楽天ポイントが貯まる特典もあります。</p><p class="note">※実際の適用金利は年1.9%〜14.5%の範囲内で審査結果によって決定します。融資タイミングは申込・審査状況により異なります。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体を表記（下限〜上限）",
      "審査結果による旨の注記追加"
    ],
    "annotations_added": [
      "実際の適用金利は審査結果によって決定する旨の注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "金利範囲の正確な提示により景表法・業界自主規制への適合度向上"
}
```

### diff #8 — h2#カードローン借り換えで金利を下げる方法とシミュレーション

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<p>カードローンの金利は、利息制限法によって上限が定められています。借入金額が10万円未満の場合は年20.0%、10万円以上100万円未満の場合は年18.0%、100万円以上の場合は年15.0%が上限です。[出典:金融庁：貸金業法について:https://www.fsa.go.jp/policy/kashikin/index.html]</p><p>消費者金融系カードローンの多くは上限金利年18.0%ですが、銀行系カードローンは年14.0-15.0%程度に設定されていることが多く、借り換えることで金利を下げられる可能性があります。また、借入金額が大きくなるほど適用金利が低くなる傾向があるため、複数の借入れを一本化することでも金利削減効果が期待できます。</p>
```

**content_after**
```html
<p>カードローンの金利は、利息制限法によって上限が定められています。借入金額が10万円未満の場合は年20.0%、10万円以上100万円未満の場合は年18.0%、100万円以上の場合は年15.0%が上限です。<a href="https://www.fsa.go.jp/policy/kashikin/index.html" target="_blank" rel="noopener noreferrer">[出典：金融庁「貸金業法について」]</a></p><p>消費者金融系カードローンの多くは上限金利が年17.8%〜18.0%ですが、銀行系カードローンは上限金利が年14.0%〜14.9%程度に設定されていることが多く、借り換えることで金利を下げられる可能性があります。なお、各社が提示する金利は下限〜上限の範囲であり、<strong>実際に適用される金利は審査結果によって決定</strong>されます。また、借入金額が大きくなるほど適用金利が低くなる傾向があるため、複数の借入れを一本化することでも金利削減効果が期待できます。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体の正確な表記",
      "実際の適用金利は審査結果による旨を本文中に明示"
    ],
    "annotations_added": [
      "適用金利は審査結果によって決定される旨の強調"
    ]
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "金利 比較",
  "expected_delta": "金利比較の正確性向上により誤認比較構造を解消し、コンプライアンス適合度を改善"
}
```

---

# Session 35 (10/11) — Session 35

- post_id: **18639**
- triggered_by: validation-run
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: (null)
- high_risk_categories: []
- tokens: analysis 8319/1784 | generation 12383/7303
- started_at: 2026-05-22 03:40:10
- analysis_completed_at: 2026-05-22 03:40:45
- generation_completed_at: 2026-05-22 03:42:22

## bundle snapshot (session.notes、3 系統)

- target_query: **即日融資 カードローン 金利 比較**
- required_additions (A 系統): 0 件
- shallow_queries    (B 系統): 1 件
- shallow_facts      (C 系統): 2 件

### B: shallow_queries

```json
[
  {
    "query_text": "即日融資 カードローン 金利 比較",
    "self_max": 0.55,
    "comp_max": 0.65,
    "delta": 0.05,
    "threshold": 0.7000000000000001
  }
]
```

### C: shallow_facts

```json
[
  {
    "fact_text": "プロミス",
    "layer": 1,
    "self_max": 0.4,
    "comp_max": 0.55,
    "delta": -0.05,
    "threshold": 0.5
  },
  {
    "fact_text": "アコム",
    "layer": 1,
    "self_max": 0.45,
    "comp_max": 0.58,
    "delta": -0.05,
    "threshold": 0.5299999999999999
  }
]
```

## analysis_output (工程6'-A Opus 4.7)

```json
{
  "structural_analysis": "本記事はauじぶん銀行カードローンの金利を3つのコース別に整理し、au限定割の適用手順、借り換えシミュレーション、他社比較、返済シミュレーション、金利を下げる方法まで網羅されており、構造的には金利訴求記事として完成度が高い。ただしtarget_query『即日融資 カードローン 金利 比較』に対しては、auじぶん銀行自体が即日融資非対応の銀行カードローンであるため、即日融資軸の比較情報が薄い。また、消費者金融との金利比較セクションにおいてプロミス・アコム等の主要消費者金融への言及深度が競合より浅く、比較表の網羅性に課題がある。低金利おすすめ5社のセクションも目次に存在するが、プロミス・みずほ・三菱UFJ程度の薄い扱いに留まる懸念があり、ユーザーが『即日融資と金利のトレードオフ』を判断するための情報補強が必要。保護領域(soico-cta-*, box-###, ez-toc-*)は触れず、本文セクションでの加筆を中心に設計する。",
  "rewrite_policy": [
    {
      "policy_text": "『他社カードローンとの金利比較』セクションにおいて、消費者金融プロミスの金利範囲(年4.5%〜17.8%)を金利範囲全体として明示し、即日融資対応の有無を比較軸に追加。auじぶん銀行が即日融資非対応である点と、急ぎの場合の代替選択肢としてのプロミスの位置づけを、誤認比較を避けつつ同一条件下で提示する。",
      "priority": 1,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          0
        ]
      },
      "target_change_types": [
        "rewrite_section",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "消費者金融との金利比較表にアコムの金利範囲(年3.0%〜18.0%)・限度額・無利息期間を追加し、銀行カードローンと消費者金融の選択基準を解説する段落を新設する。ただしアコム個別の具体的返済額シミュレーション提示は行わず、公式サイト参照に留める(パートナー規約遵守)。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          1
        ]
      },
      "target_change_types": [
        "rewrite_section",
        "insert_after"
      ],
      "target_change_categories": [
        "evidence_insertion",
        "paragraph_rewrite",
        "compliance_update"
      ]
    },
    {
      "policy_text": "『即日融資』軸のサブクエリ深度を上げるため、『auじぶん銀行カードローンは即日融資に対応しているか』のH3小見出しを新設し、銀行カードローンは警察庁データベース照会のため即日融資が原則不可である事実を明示。急ぎの場合は消費者金融が選択肢になる旨を金利とのトレードオフとして中立的に解説する。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_after",
        "rewrite_paragraph"
      ],
      "target_change_categories": [
        "h2_structure",
        "paragraph_rewrite"
      ]
    },
    {
      "policy_text": "『低金利でおすすめのカードローン会社5社』セクションのプロミス紹介部分について、金利範囲全体(年4.5%〜17.8%)を明示し、無利息期間の表記を『初めての方は契約翌日から最大30日間無利息』の正式表記に統一。最短即日融資可能な点を金利比較の文脈で補足する。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          0
        ]
      },
      "target_change_types": [
        "rewrite_paragraph"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "compliance_update"
      ]
    },
    {
      "policy_text": "銀行系カードローン比較表の下限金利のみの羅列を避け、金利範囲・限度額・無利息期間・即日融資可否を同一条件で並べた比較構造に整理し直す。比較表の前後に『金利範囲全体を確認することの重要性』を解説する一文を補強し、景表法・業界自主規制への配慮を強化。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "rewrite_section"
      ],
      "target_change_categories": [
        "compliance_update",
        "paragraph_rewrite"
      ]
    }
  ],
  "high_risk_categories": [],
  "confidence": "medium",
  "protected_blocks_acknowledged": true
}
```

## master_rewrite_diff (工程6'-B Sonnet 4.6) — 8 件

risk_flag distribution: {"rate_update":2,"(null)":3,"regulation_citation":1,"title_change":2}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | h3#消費者金融との金利比較 | rewrite_section | evidence_insertion | rate_update | high |
| 2 | h3#消費者金融との金利比較 | insert_after | paragraph_rewrite |  | high |
| 3 | h3#銀行系カードローンとの金利比較 | rewrite_section | compliance_update | regulation_citation | high |
| 4 | h3#プロミス｜金利年2.5%～18.0%・初回最大30日間無利息 | rewrite_paragraph | compliance_update | rate_update | high |
| 5 | h3#プロミス｜金利年2.5%～18.0%・初回最大30日間無利息 | rewrite_paragraph | paragraph_rewrite |  | medium |
| 6 | h3#消費者金融との金利比較 | insert_after | paragraph_rewrite |  | high |
| 7 | meta:title | update_title | title | title_change | medium |
| 8 | meta:description | update_meta_description | title | title_change | medium |

### diff #1 — h3#消費者金融との金利比較

- change_type: `rewrite_section`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<h3>消費者金融との金利比較</h3><table><thead><tr><th>カードローン名</th><th>金利（年率）</th><th>限度額</th><th>無利息期間</th></tr></thead><tbody><tr><td>auじぶん銀行（通常）</td><td>1.48%～17.5%</td><td>1〜800万円</td><td>なし</td></tr><tr><td>プロミス</td><td>2.5%～18.0%</td><td>1〜800万円</td><td>初回最大30日</td></tr><tr><td>アコム</td><td>2.4%～17.9%</td><td>1〜800万円</td><td>初回最大30日</td></tr><tr><td>アイフル</td><td>3.0%～18.0%</td><td>1〜800万円</td><td>初回最大30日</td></tr></tbody></table><p>消費者金融と比較すると、auじぶん銀行の上限金利は年17.5%で、消費者金融の年18.0%より年0.5%低い設定です。</p><p>au限定割適用で年17.0%～17.4%まで下がる 消費者金融は初回最大30日間無利息期間があります 短期間の借入なら消費者金融の方がお得な場合もあります。※借入限度額は審査によって決定いたします。※ご利用限度額50万円超、または他社を含めた借り入れ金額が100万円超の場合は源泉徴収票など収入を証明するものが必要です。</p>
```

**content_after**
```html
<h3>消費者金融との金利比較</h3><table><thead><tr><th>カードローン名</th><th>金利（年率）</th><th>限度額</th><th>無利息期間</th><th>即日融資</th></tr></thead><tbody><tr><td>auじぶん銀行（通常）</td><td>年1.48%～17.5%</td><td>1〜800万円</td><td>なし</td><td>非対応</td></tr><tr><td>プロミス</td><td>年4.5%～17.8%</td><td>1〜500万円</td><td>初めての方は契約翌日から最大30日間無利息</td><td>最短即日</td></tr><tr><td>アコム</td><td>年3.0%～18.0%</td><td>1〜800万円</td><td>初回最大30日間無利息</td><td>最短即日</td></tr><tr><td>アイフル</td><td>年3.0%～18.0%</td><td>1〜800万円</td><td>初回最大30日間無利息</td><td>最短即日</td></tr></tbody></table><p>消費者金融と比較すると、auじぶん銀行の上限金利は年17.5%で、消費者金融の多くより低い水準です。au限定割を適用すれば年17.0%～17.4%まで下がります。一方、auじぶん銀行は銀行カードローンであるため、警察庁データベースへの照会が必要となり、<strong>原則として即日融資には対応していません</strong>。</p><p>短期間の借入や急ぎの資金が必要な場合は、初回無利息期間を持つ消費者金融が選択肢になります。ただし、消費者金融の金利範囲全体（例：プロミスは年4.5%～17.8%）を確認のうえ、ご自身の借入条件に合ったサービスを選ぶことが重要です。</p><p><small>※借入限度額は審査によって決定いたします。※ご利用限度額50万円超、または他社を含めた借り入れ金額が100万円超の場合は源泉徴収票など収入を証明するものが必要です。※プロミスの金利・限度額は公式サイトをご確認ください。</small></p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0
    ]
  },
  "compliance": {
    "violations": [
      "比較構造禁止: 金利範囲全体を提示せず下限のみ記載の可能性",
      "正式表記: 無利息期間の表記が正式表記と異なる"
    ],
    "ymyl_requirements_met": [
      "金利範囲全体を明示",
      "即日融資可否を比較軸に追加",
      "YMYL禁止表現なし"
    ],
    "annotations_added": [
      "即日融資列を追加",
      "プロミス金利を年4.5%～17.8%に修正",
      "アコム金利を年3.0%～18.0%に修正",
      "無利息期間を正式表記に統一"
    ]
  },
  "evidence_refs": [
    "bundle_snapshot.shallow_facts[0]: プロミス",
    "bundle_snapshot.shallow_facts[1]: アコム"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "即日融資軸の比較情報を補強し、target_queryとの意味的類似度向上。消費者金融2社の金利カバレッジ不足を解消。"
}
```

### diff #2 — h3#消費者金融との金利比較

- change_type: `insert_after`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<h3>auじぶん銀行カードローンは即日融資に対応しているか</h3><p>auじぶん銀行カードローンを含む銀行カードローンは、貸金業法の適用外であるものの、融資審査において警察庁が管理するデータベースへの照会が義務付けられています。この照会には一定の時間を要するため、<strong>銀行カードローンは原則として即日融資（申込当日中の融資）には対応していません</strong>。</p><p>一般的に、審査完了から融資まで数日〜1週間程度かかる場合があります。急ぎの資金が必要な場合は、最短即日融資に対応した消費者金融（プロミス・アコムなど）が選択肢となります。</p><p>ただし、消費者金融は金利範囲の上限が年17.8%〜18.0%と高くなる場合があります。急ぎの場合は消費者金融、低金利・長期返済を重視する場合はauじぶん銀行カードローンと、目的に合わせて使い分けることが大切です。</p><p><small>※各社の審査状況・申込時間帯によって融資タイミングは異なります。詳細は各公式サイトをご確認ください。</small></p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "即日融資非対応の理由を中立的に説明",
      "消費者金融との金利トレードオフを明示",
      "YMYL禁止表現なし"
    ],
    "annotations_added": [
      "銀行カードローン即日融資非対応の理由を明記",
      "金利とスピードのトレードオフ解説を追加"
    ]
  },
  "evidence_refs": [
    "bundle_snapshot.shallow_queries[0]: 即日融資 カードローン 金利 比較"
  ],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "target_queryの即日融資サブクエリへの対応深度を向上。H3追加によりコンテンツ構造を強化。"
}
```

### diff #3 — h3#銀行系カードローンとの金利比較

- change_type: `rewrite_section`
- change_category: `compliance_update`
- risk_flag: `regulation_citation`
- llm_confidence: high

**content_before**
```html
<h3>銀行系カードローンとの金利比較</h3><table><thead><tr><th>カードローン名</th><th>金利（年率）</th><th>限度額</th><th>無利息期間</th></tr></thead><tbody><tr><td>auじぶん銀行（通常）</td><td>1.48%～17.5%</td><td>1〜800万円</td><td>なし</td></tr><tr><td>auじぶん銀行（借り換え）</td><td>1.48%～12.5%</td><td>1〜800万円</td><td>なし</td></tr><tr><td>みずほ銀行</td><td>2.0%～14.0%</td><td>1〜800万円</td><td>なし</td></tr><tr><td>三菱UFJ(バンクイック)</td><td>1.4%～14.6%</td><td>1〜800万円</td><td>なし</td></tr><tr><td>イオン銀行</td><td>3.8%～13.8%</td><td>1〜800万円</td><td>初回30日</td></tr></tbody></table><p>通常コースの上限金利年17.5%はやや高め 銀行系カードローンと比較すると、auじぶん銀行の通常コースはやや高めです。しかし、借り換えコースの上限金利年12.5%は非常に競争力があります。</p><p>みずほ銀行やバンクイックと比べても遜色ありません。au限定割を適用すればさらに金利が下がるため、auユーザーにとっては魅力的な選択肢です。</p>
```

**content_after**
```html
<h3>銀行系カードローンとの金利比較</h3><p>カードローンを比較する際は、下限金利だけでなく<strong>金利範囲全体（下限〜上限）</strong>を確認することが重要です。審査結果によって適用金利が異なるため、下限金利のみで判断すると実際の借入条件と乖離する場合があります。</p><table><thead><tr><th>カードローン名</th><th>金利（年率）</th><th>限度額</th><th>無利息期間</th><th>即日融資</th></tr></thead><tbody><tr><td>auじぶん銀行（通常）</td><td>年1.48%～17.5%</td><td>1〜800万円</td><td>なし</td><td>非対応</td></tr><tr><td>auじぶん銀行（借り換え）</td><td>年1.48%～12.5%</td><td>1〜800万円</td><td>なし</td><td>非対応</td></tr><tr><td>みずほ銀行</td><td>年2.0%～14.0%</td><td>1〜800万円</td><td>なし</td><td>非対応</td></tr><tr><td>三菱UFJ(バンクイック)</td><td>年1.4%～14.6%</td><td>1〜800万円</td><td>なし</td><td>非対応</td></tr><tr><td>イオン銀行</td><td>年3.8%～13.8%</td><td>1〜800万円</td><td>初回30日間無利息</td><td>非対応</td></tr></tbody></table><p>銀行系カードローンはいずれも即日融資に対応していません。auじぶん銀行の通常コースは上限金利年17.5%と銀行系の中ではやや高めですが、借り換えコースの上限金利年12.5%は他行と比べても競争力があります。au限定割を適用すればさらに金利が下がるため、auユーザーにとって有利な選択肢となります。</p><p><small>※各社の金利・限度額は審査結果により異なります。最新情報は各公式サイトをご確認ください。</small></p>
```

**rationale**
```json
{
  "primary_source": "compliance_rule",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [
      "比較構造禁止: 金利範囲の単位表記が不統一、即日融資軸なし"
    ],
    "ymyl_requirements_met": [
      "金利範囲全体を「年X%〜Y%」形式で統一表記",
      "即日融資可否列を追加",
      "比較表前に注記文を挿入"
    ],
    "annotations_added": [
      "比較表前に金利範囲確認の重要性を解説する一文を追加",
      "即日融資列を追加",
      "景表法・業界自主規制への対応を強化"
    ]
  },
  "evidence_refs": [
    "master_rules: 比較構造禁止ルール"
  ],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "カードローン 金利 比較",
  "expected_delta": "比較構造の景表法対応強化と即日融資軸追加により、EATとコンプライアンス品質を向上。"
}
```

### diff #4 — h3#プロミス｜金利年2.5%～18.0%・初回最大30日間無利息

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<h3>プロミス｜金利年2.5%～18.0%・初回最大30日間無利息</h3>
```

**content_after**
```html
<h3>プロミス｜金利年4.5%～17.8%・初めての方は契約翌日から最大30日間無利息</h3>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0
    ]
  },
  "compliance": {
    "violations": [
      "正式表記: プロミスの金利表記が不正確（年2.5%～18.0%）",
      "正式表記: 無利息期間の表記が正式表記と異なる"
    ],
    "ymyl_requirements_met": [
      "金利範囲を年4.5%～17.8%に修正",
      "無利息期間を正式表記に統一"
    ],
    "annotations_added": [
      "プロミス金利を正式表記に修正",
      "無利息期間を正式表記「初めての方は契約翌日から最大30日間無利息」に修正"
    ]
  },
  "evidence_refs": [
    "bundle_snapshot.shallow_facts[0]: プロミス",
    "master_rules: 正式表記ルール（30日間無利息）"
  ],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "カードローン 金利 比較",
  "expected_delta": "プロミスの正式金利・無利息表記への修正でコンプライアンス品質を向上。"
}
```

### diff #5 — h3#プロミス｜金利年2.5%～18.0%・初回最大30日間無利息

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<p>プロミスは消費者金融大手のひとつで、金利は年4.5%～17.8%です。初めての方は契約翌日から最大30日間無利息で利用できます。最短即日融資に対応しており、急ぎの資金調達が必要な場合の選択肢となります。auじぶん銀行カードローンと比較すると上限金利はやや高くなりますが、即日融資対応と無利息期間を活用することで短期借入コストを抑えられる場合があります。借入条件の詳細は<a href="https://www.promise.co.jp/" rel="noopener noreferrer" target="_blank">プロミス公式サイト</a>をご確認ください。</p><p><small>※審査結果により適用金利・融資タイミングは異なります。</small></p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体を明示",
      "即日融資対応を金利比較の文脈で補足",
      "YMYL禁止表現なし"
    ],
    "annotations_added": [
      "プロミスの即日融資対応を金利トレードオフの文脈で補足",
      "正式金利・無利息期間を本文に反映"
    ]
  },
  "evidence_refs": [
    "bundle_snapshot.shallow_facts[0]: プロミス"
  ],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "プロミス紹介の記述深度向上。即日融資×金利比較軸の補強。"
}
```

### diff #6 — h3#消費者金融との金利比較

- change_type: `insert_after`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<h4>銀行カードローンと消費者金融の選択基準</h4><p>銀行カードローンと消費者金融はそれぞれ特徴が異なるため、目的に応じた選択が重要です。</p><ul><li><strong>銀行カードローン（auじぶん銀行など）</strong>：上限金利が比較的低く、長期的な借入コストを抑えやすい。ただし審査に時間がかかるため、即日融資には対応しない。低金利での長期借入・借り換えに向いている。</li><li><strong>消費者金融（プロミス・アコムなど）</strong>：最短即日融資に対応し、初回無利息期間を活用できる。金利範囲の上限は銀行より高くなる場合があるが、短期・少額の借入コストを初回無利息期間で実質ゼロにできる場合がある。</li></ul><p>アコムの金利は年3.0%～18.0%で、初回最大30日間無利息が適用されます。具体的な返済額・借入条件は<a href="https://www.acom.co.jp/" rel="noopener noreferrer" target="_blank">アコム公式サイト</a>をご確認ください。</p><p><small>※各社の審査基準・金利は変動する場合があります。最新情報は各公式サイトをご確認ください。</small></p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      1
    ]
  },
  "compliance": {
    "violations": [
      "パートナー個別: アコムの具体的返済額シミュレーション禁止"
    ],
    "ymyl_requirements_met": [
      "アコム金利範囲（年3.0%～18.0%）を明示",
      "アコムの具体的返済額シミュレーションを提示せず公式サイト参照に留めた",
      "選択基準を中立的に解説"
    ],
    "annotations_added": [
      "アコム金利を年3.0%～18.0%として追記",
      "公式サイト参照に留めるアフィリエイト規約遵守を明記",
      "銀行カードローンvs消費者金融の選択基準を新設"
    ]
  },
  "evidence_refs": [
    "bundle_snapshot.shallow_facts[1]: アコム",
    "master_rules: パートナー個別ルール（アコム）"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "アコムの情報深度向上。銀行vs消費者金融の選択基準解説でユーザーの意思決定を支援。"
}
```

### diff #7 — meta:title

- change_type: `update_title`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: medium

**content_before**
```html
<title>auじぶん銀行カードローンの金利は年1.48%～17.5%｜au限定割で最大0.5%優遇【2026年】</title>
```

**content_after**
```html
<title>auじぶん銀行カードローンの金利は年1.48%～17.5%｜即日融資との違いや他社比較【2026年】</title>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "target_queryの主要キーワード「即日融資」「比較」をtitleに追加",
      "誇張表現なし"
    ],
    "annotations_added": [
      "即日融資・比較訴求をtitleに追加"
    ]
  },
  "evidence_refs": [
    "bundle_snapshot.shallow_queries[0]: 即日融資 カードローン 金利 比較"
  ],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "titleへのクエリキーワード反映でCTR・関連性スコアの向上が期待できる。"
}
```

### diff #8 — meta:description

- change_type: `update_meta_description`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<meta name="description" content="auじぶん銀行カードローンの金利は年1.48%～17.5%。au限定割で最大0.5%優遇、借り換えコースは上限年12.5%。即日融資は非対応ですが低金利が魅力。プロミス（年4.5%～17.8%）・アコム（年3.0%～18.0%）など消費者金融との金利・即日融資の違いを比較解説【2026年2月時点】">
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体を明示",
      "即日融資非対応を正確に記述",
      "YMYL禁止表現なし"
    ],
    "annotations_added": [
      "即日融資・比較キーワードをdescriptionに追加",
      "プロミス・アコムの金利範囲を追記"
    ]
  },
  "evidence_refs": [
    "bundle_snapshot.shallow_queries[0]",
    "bundle_snapshot.shallow_facts[0]",
    "bundle_snapshot.shallow_facts[1]"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "meta descriptionにターゲットクエリキーワードを追加しCTR向上を期待。"
}
```

---

# Session 36 (11/11) — Session 36

- post_id: **14691**
- triggered_by: validation-run
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: (null)
- high_risk_categories: []
- tokens: analysis 8513/1449 | generation 12521/4572
- started_at: 2026-05-22 03:42:52
- analysis_completed_at: 2026-05-22 03:43:23
- generation_completed_at: 2026-05-22 03:44:25

## bundle snapshot (session.notes、3 系統)

- target_query: **即日融資 カードローン 金利 比較**
- required_additions (A 系統): 0 件
- shallow_queries    (B 系統): 1 件
- shallow_facts      (C 系統): 2 件

### B: shallow_queries

```json
[
  {
    "query_text": "即日融資 カードローン 金利 比較",
    "self_max": 0.55,
    "comp_max": 0.65,
    "delta": 0.05,
    "threshold": 0.7000000000000001
  }
]
```

### C: shallow_facts

```json
[
  {
    "fact_text": "プロミス",
    "layer": 1,
    "self_max": 0.4,
    "comp_max": 0.55,
    "delta": -0.05,
    "threshold": 0.5
  },
  {
    "fact_text": "アコム",
    "layer": 1,
    "self_max": 0.45,
    "comp_max": 0.58,
    "delta": -0.05,
    "threshold": 0.5299999999999999
  }
]
```

## analysis_output (工程6'-A Opus 4.7)

```json
{
  "structural_analysis": "本記事はJAバンクのカードローン・各種ローンを網羅的に解説しており、准組合員制度、ローン商品5種、審査基準、申込フロー、地域別JA比較まで構造化されている。目次設計は読者ニーズに沿っており、JAバンク単体記事としての完成度は高い。ただしtarget_query『即日融資 カードローン 金利 比較』に対しては、JAバンクが即日融資非対応である旨は明記されているものの、即日融資ニーズを持つ読者への代替手段提示が弱い。特にプロミス・アコムなど消費者金融カードローンとの金利・融資スピード比較が表層的で、『消費者金融カードローンを検討する』セクションが簡素。冒頭CTAでプロミスに触れているが本文中の比較情報が不足しており、即日融資×金利比較という検索意図への網羅深度が競合に劣る。代替手段セクションの厚みと、消費者金融との対比表的な情報整備が課題。",
  "rewrite_policy": [
    {
      "policy_text": "『消費者金融カードローンを検討する』セクションを拡充し、プロミス（金利年4.5%〜17.8%、最短3分融資）の金利範囲・融資スピード・無利息期間（初めての方は契約翌日から最大30日間無利息）を具体的に追記。JAバンクが即日融資非対応である点を補完する代替策として、金利範囲全体を提示した比較形式で記述する。",
      "priority": 1,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          0
        ]
      },
      "target_change_types": [
        "rewrite_section",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "『消費者金融との金利比較』セクションでアコムに言及する際、金利範囲（年3.0%〜18.0%）と融資スピードのみを記載し、具体的返済額シミュレーションは提示せず公式サイト参照に留める。同一条件下でJAバンク・銀行カードローン・消費者金融3者の金利範囲全体を並べた比較表に再構成する。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          1
        ]
      },
      "target_change_types": [
        "rewrite_section",
        "insert_evidence"
      ],
      "target_change_categories": [
        "paragraph_rewrite",
        "evidence_insertion",
        "compliance_update"
      ]
    },
    {
      "policy_text": "『JAバンクで借りるメリット・デメリット』のデメリット項に、即日融資非対応の代替として消費者金融カードローンの活用シーンを補足するパラグラフを追加。緊急性が高い場合と低金利重視の場合で選択肢が分かれる旨を整理し、読者の意思決定を支援する。",
      "priority": 3,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": []
      },
      "target_change_types": [
        "insert_after",
        "rewrite_paragraph"
      ],
      "target_change_categories": [
        "paragraph_rewrite"
      ]
    },
    {
      "policy_text": "即日融資カードローン比較の文脈で、融資スピード（最短3分〜数日）・金利範囲・在籍確認方法（原則電話による在籍確認なしのケースを含む）を整理した小見出しを『代替手段』内に挿入し、target_queryへの網羅深度を引き上げる。",
      "priority": 4,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [
          0
        ],
        "shallow_facts": [
          0,
          1
        ]
      },
      "target_change_types": [
        "insert_after",
        "insert_evidence"
      ],
      "target_change_categories": [
        "h2_structure",
        "evidence_insertion"
      ]
    }
  ],
  "high_risk_categories": [],
  "confidence": "medium",
  "protected_blocks_acknowledged": true
}
```

## master_rewrite_diff (工程6'-B Sonnet 4.6) — 6 件

risk_flag distribution: {"rate_update":4,"(null)":1,"title_change":1}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | h3#消費者金融カードローンを検討する | rewrite_section | paragraph_rewrite | rate_update | high |
| 2 | h3#消費者金融との金利比較 | rewrite_section | evidence_insertion | rate_update | high |
| 3 | h3#デメリット｜即日融資には対応していない | insert_after | paragraph_rewrite |  | medium |
| 4 | h2#JAバンクで審査落ちした場合の代替手段 | insert_after | h2_structure | rate_update | high |
| 5 | meta:title | update_title | title | title_change | medium |
| 6 | meta:description | update_meta_description | title | rate_update | medium |

### diff #1 — h3#消費者金融カードローンを検討する

- change_type: `rewrite_section`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<h3>消費者金融カードローンを検討する</h3>
```

**content_after**
```html
<h3>消費者金融カードローンを検討する</h3>
<p>JAバンクの審査に通らなかった場合や、<strong>急ぎでお金が必要な場合</strong>には、消費者金融カードローンが有力な選択肢となります。消費者金融は即日融資に対応しており、JAバンクの1〜3週間という審査期間と大きく異なります。</p>
<h4>プロミス</h4>
<p>プロミスはSMBCグループの消費者金融カードローンです。金利は<strong>年4.5%〜17.8%</strong>で、申込から融資まで<strong>最短3分</strong>で対応しています（審査の結果によっては希望に沿えない場合があります）。はじめてご利用の方は<strong>初めての方は契約翌日から最大30日間無利息</strong>のサービスも提供しています。原則電話によるお勤め先への在籍確認なしで申し込める点も、プライバシーを重視する方にとってのメリットです。</p>
<h4>アコム</h4>
<p>アコムの金利は<strong>年3.0%〜18.0%</strong>で、こちらも即日融資に対応しています。具体的な返済額のシミュレーションは<a href="https://www.acom.co.jp/" target="_blank" rel="noopener noreferrer">アコム公式サイト</a>をご参照ください。</p>
<p>消費者金融カードローンはJAバンクや銀行カードローンと比べると金利が高めになる傾向がありますが、融資スピードの速さが大きな強みです。緊急性に応じて検討してください。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体を提示",
      "無利息期間の正式表記使用",
      "原則電話による在籍確認なし表記",
      "アコム返済シミュレーション非掲載"
    ],
    "annotations_added": [
      "初めての方は契約翌日から最大30日間無利息",
      "原則電話によるお勤め先への在籍確認なし"
    ]
  },
  "evidence_refs": [
    "プロミス金利年4.5%〜17.8%",
    "アコム金利年3.0%〜18.0%",
    "最短3分融資"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資×金利比較",
  "expected_delta": "消費者金融カードローン情報の網羅深度が向上し、target_queryへの適合度が改善する"
}
```

### diff #2 — h3#消費者金融との金利比較

- change_type: `rewrite_section`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<h3>消費者金融との金利比較</h3>
```

**content_after**
```html
<h3>消費者金融との金利比較</h3>
<p>JAバンク・銀行カードローン・消費者金融の3者を金利範囲・融資スピードで比較すると、以下のようになります。</p>
<table>
  <thead>
    <tr>
      <th>種別</th>
      <th>代表例</th>
      <th>金利範囲（年）</th>
      <th>融資スピード</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>JAバンク</td>
      <td>JAカードローン</td>
      <td>年2.0%〜14.0%程度</td>
      <td>1〜3週間程度</td>
    </tr>
    <tr>
      <td>銀行カードローン</td>
      <td>各銀行系カードローン</td>
      <td>年1.5%〜14.5%程度</td>
      <td>数日〜1週間程度</td>
    </tr>
    <tr>
      <td>消費者金融</td>
      <td>プロミス</td>
      <td>年4.5%〜17.8%</td>
      <td>最短3分（審査結果による）</td>
    </tr>
    <tr>
      <td>消費者金融</td>
      <td>アコム</td>
      <td>年3.0%〜18.0%</td>
      <td>最短即日（審査結果による）</td>
    </tr>
  </tbody>
</table>
<p>※金利は各社公式サイト掲載の金利範囲全体を示しています。実際の適用金利は審査結果により異なります。</p>
<p>低金利を重視するならJAバンクや銀行カードローンが有利ですが、融資スピードを重視する場合は消費者金融カードローンが適しています。アコムの具体的な返済額シミュレーションは<a href="https://www.acom.co.jp/" target="_blank" rel="noopener noreferrer">アコム公式サイト</a>をご確認ください。</p>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_fact",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体を提示した比較表",
      "同一条件下での3者比較",
      "アコム返済シミュレーション非掲載・公式サイト参照"
    ],
    "annotations_added": [
      "金利範囲全体表示（上限・下限両方）",
      "審査結果による旨の注記"
    ]
  },
  "evidence_refs": [
    "プロミス金利年4.5%〜17.8%",
    "アコム金利年3.0%〜18.0%",
    "JAバンク金利年2.0〜14.0%程度"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "金利比較",
  "expected_delta": "3者比較表により即日融資×金利比較クエリへの網羅深度が向上する"
}
```

### diff #3 — h3#デメリット｜即日融資には対応していない

- change_type: `insert_after`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<div class="ja-alternative-guidance">
  <h4>即日融資が必要な場合の代替選択肢</h4>
  <p>JAバンクは即日融資に対応していないため、緊急性の高い資金ニーズには不向きです。状況に応じて以下のように選択肢を検討してください。</p>
  <ul>
    <li><strong>緊急性が高い場合（当日〜数日以内に必要）：</strong>消費者金融カードローン（プロミス・アコムなど）が選択肢となります。金利はJAバンクより高めですが、最短即日での融資に対応しています。</li>
    <li><strong>低金利を重視する場合（1〜3週間の余裕がある）：</strong>JAバンクや銀行カードローンが適しています。金利年2.0%〜14.0%程度と消費者金融より有利な条件で借入できる可能性があります。</li>
  </ul>
  <p>どちらの場合も、借入前に返済計画を立て、無理のない範囲での利用を心がけましょう。</p>
</div>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "返済計画を促す注記を追加",
      "借入意欲を過度に煽らない表現"
    ],
    "annotations_added": [
      "緊急性と金利重視の場合分けによる読者の意思決定支援"
    ]
  },
  "evidence_refs": [
    "JAバンク融資期間1〜3週間",
    "消費者金融最短即日融資"
  ],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 代替手段",
  "expected_delta": "読者の意思決定支援コンテンツが追加され、ページの有用性スコアが向上する"
}
```

### diff #4 — h2#JAバンクで審査落ちした場合の代替手段

- change_type: `insert_after`
- change_category: `h2_structure`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<div class="instant-loan-comparison">
  <h3>即日融資カードローンを比較する際のポイント</h3>
  <p>JAバンクが即日融資に対応していない点を踏まえ、急な資金ニーズには消費者金融カードローンを比較検討することが有効です。以下のポイントを確認しましょう。</p>
  <h4>融資スピード</h4>
  <p>消費者金融カードローンの中には、最短3分〜数時間で融資を受けられるものがあります（審査の結果によっては希望に沿えない場合があります）。申込から融資まで通常1〜3週間かかるJAバンクとは大きく異なります。</p>
  <h4>金利範囲</h4>
  <p>消費者金融カードローンの金利は、プロミスが年4.5%〜17.8%、アコムが年3.0%〜18.0%です。適用される金利は審査結果により異なり、金利範囲全体（上限・下限の両方）を確認した上で比較することが重要です。上限金利または下限金利のみでの比較は誤った判断につながる可能性があります。</p>
  <h4>在籍確認の方法</h4>
  <p>プロミスなど一部の消費者金融カードローンでは、原則電話によるお勤め先への在籍確認なしで申込できるサービスを提供しています。職場への連絡が気になる方は、申込前に各社の在籍確認方法を公式サイトで確認しましょう。</p>
</div>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0,
      1
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体（上限・下限両方）の提示を推奨",
      "原則電話による在籍確認なし正式表記",
      "審査結果による旨の注記"
    ],
    "annotations_added": [
      "原則電話によるお勤め先への在籍確認なし",
      "金利範囲全体での比較推奨"
    ]
  },
  "evidence_refs": [
    "プロミス金利年4.5%〜17.8%",
    "アコム金利年3.0%〜18.0%",
    "最短3分融資"
  ],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "融資スピード・金利・在籍確認の3軸整理により target_query への網羅深度が向上する"
}
```

### diff #5 — meta:title

- change_type: `update_title`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: medium

**content_before**
```html
<title>JAでお金借りる方法｜農家以外も准組合員で低金利【2026年】</title>
```

**content_after**
```html
<title>JAでお金借りる方法｜農家以外も准組合員で低金利・即日融資との比較【2026年】</title>
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": []
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "target_query関連キーワードをtitleに追加"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "titleへのキーワード追加によりCTRおよびtarget_queryへの関連性スコアが改善する"
}
```

### diff #6 — meta:description

- change_type: `update_meta_description`
- change_category: `title`
- risk_flag: `rate_update`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<meta name="description" content="JAバンクでお金を借りる方法を解説。農家以外も准組合員（出資金1,000円程度）で申込可能。金利は年2.0%〜14.0%程度と低金利ですが即日融資には非対応。急ぎの場合はプロミス（年4.5%〜17.8%・最短3分融資）など消費者金融カードローンとの比較も紹介。【2026年最新】" />
```

**rationale**
```json
{
  "primary_source": "embedding_shallow_query",
  "bundle_refs": {
    "required_additions": [],
    "shallow_queries": [
      0
    ],
    "shallow_facts": [
      0
    ]
  },
  "compliance": {
    "violations": [],
    "ymyl_requirements_met": [
      "金利範囲全体を提示",
      "即日融資非対応の明記"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "プロミス金利年4.5%〜17.8%",
    "最短3分融資"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資 カードローン 金利 比較",
  "expected_delta": "meta descriptionに即日融資・金利比較キーワードを追加しCTR向上を図る"
}
```

---
