# リライト結果インスペクション

生成日: 2026-05-22T02:11:42.202Z
対象 session: 21 (inject=false), 22 (inject=true)

参照: design/sessions/2026-05-22_case_c_e_implementation.md

---
# Pass A (inject=false) — Session 21

- post_id: **11077**
- triggered_by: smoke-c-e
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: approved
- high_risk_categories: ["rate_update"]
- tokens: analysis 8568/1752 | generation 12677/11092
- started_at: 2026-05-22 02:03:31
- analysis_completed_at: 2026-05-22 02:04:06
- generation_completed_at: 2026-05-22 02:06:43

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
  "structural_analysis": "本記事はカードローン10社の比較を主軸に、即日融資・低金利・無利息期間・審査・申込フロー・返済計画・注意点まで網羅した網羅型構成である。H2構造は導入→基礎知識→ランキング→目的別比較→申込から返済→注意点→FAQ→まとめという読者導線として妥当。ただしターゲットクエリ『即日融資 カードローン 金利 比較』に対し、自記事の網羅深度(0.55)が競合(0.65)を下回っており、特に『即日融資』と『金利』を同一軸で比較する一覧表・解説が薄い。また、shallow_facts に挙がったプロミス・アコムは個社紹介はあるものの、即日融資×金利の比較文脈での具体的記述(融資時間と上限金利の対比、無利息期間と実質負担額のシミュレーション等)が競合より浅い。ランキング個別解説と『即日融資可能なカードローン一覧』セクションの連携を強め、金利比較表に審査スピードを統合する再編が必要。",
  "rewrite_policy": [
    {
      "policy_text": "『即日融資が必要なら消費者金融を選ぼう』セクション配下の『即日融資可能なカードローン一覧』を、金利(下限・上限)・最短融資時間・無利息期間・在籍確認方法を一覧化した統合比較表に再構成し、即日融資×金利比較という検索意図に直接応えるよう厚みを増す。表の直後に『金利と融資スピードのトレードオフ』を解説する段落を追加。",
      "priority": 1,
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
        "paragraph_rewrite",
        "evidence_insertion",
        "h2_structure"
      ]
    },
    {
      "policy_text": "プロミスの個別解説部に、即日融資文脈での具体的訴求(最短3分融資の条件、申込から借入までのステップ別所要時間、上限金利18.0%適用条件と下限金利2.5%適用ケースの差異)を追記し、shallow_facts『プロミス』の深度不足を補う。注釈は既存の※p系を踏襲。",
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
        "evidence_insertion"
      ]
    },
    {
      "policy_text": "アコムの個別解説部に、2026年1月6日からの金利引き下げ(年2.4%〜17.9%)の具体的な比較インパクト(他社上限金利18.0%との差、10万円借入時の利息差シミュレーション)を追加し、shallow_facts『アコム』の深度を強化。即日融資対応の条件も併記。",
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
        "rate_update"
      ]
    },
    {
      "policy_text": "『低金利カードローンの比較表』と『即日融資可能なカードローン一覧』を相互参照できる内部リンク段落を追加し、『即日融資を取るか低金利を取るか』の選択軸を明示。読者の比較検討フローを補強する。",
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
        "internal_link",
        "paragraph_rewrite"
      ]
    },
    {
      "policy_text": "在籍確認に関する記述で『電話連絡なし』『在籍確認なし』等の表現を master_rules に従い『原則電話によるお勤め先への在籍確認なし』へ統一。無利息期間表記も『初回最大30日間無利息』形式に揃え、コンプライアンス整備を行う。保護領域(soico-cta-*, box-###, ez-toc-*)内は対象外。",
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

risk_flag distribution: {"major_restructure":1,"(null)":11,"rate_update":2,"title_change":1}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | h3#即日融資可能なカードローン一覧 | rewrite_section | h2_structure | major_restructure | high |
| 2 | h3#即日融資可能なカードローン一覧 | insert_after | evidence_insertion |  | high |
| 3 | h3#1位：プロミス｜金利2.5%~18.0%・最短3分融資 | rewrite_paragraph | paragraph_rewrite |  | high |
| 4 | h3#1位：プロミス｜金利2.5%~18.0%・最短3分融資 | insert_evidence | evidence_insertion |  | medium |
| 5 | h3#3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9% | rewrite_paragraph | paragraph_rewrite | rate_update | high |
| 6 | h3#3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9% | insert_evidence | evidence_insertion | rate_update | medium |
| 7 | h3#低金利カードローンの比較表 | insert_after | internal_link |  | high |
| 8 | h3#即日融資を受けるための条件と注意点 | insert_before | internal_link |  | medium |
| 9 | h3#在籍確認なし・郵送物なしのカードローン | rewrite_paragraph | compliance_update |  | high |
| 10 | h2#審査が不安な人向けのカードローン選び | rewrite_paragraph | compliance_update |  | medium |
| 11 | h2#即日融資が必要なら消費者金融を選ぼう | rewrite_paragraph | compliance_update |  | high |
| 12 | h3#2位：SMBCモビット｜WEB完結で原則、電話連絡・郵送物なし | rewrite_paragraph | compliance_update |  | high |
| 13 | meta:title | update_title | title | title_change | medium |
| 14 | meta:description | update_meta_description | title |  | medium |
| 15 | h3#金利の差でどれくらい返済額が変わるのか | insert_after | evidence_insertion |  | medium |

### diff #1 — h3#即日融資可能なカードローン一覧

- change_type: `rewrite_section`
- change_category: `h2_structure`
- risk_flag: `major_restructure`
- llm_confidence: high

**content_before**
```html
<h3>即日融資可能なカードローン一覧</h3>
```

**content_after**
```html
<h3>即日融資可能なカードローン一覧｜金利・融資スピード統合比較表</h3>
<p>即日融資を希望する場合は消費者金融カードローンが対象です。以下の表では、各社の金利（下限・上限）・最短融資時間・無利息期間・在籍確認方法を一覧で比較できます。</p>
<div class="table-responsive">
<table>
  <thead>
    <tr>
      <th>会社名</th>
      <th>金利（実質年率）</th>
      <th>最短融資時間</th>
      <th>無利息期間</th>
      <th>在籍確認方法</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>プロミス</td>
      <td>年2.5%〜18.0%</td>
      <td>最短3分<small>※1</small></td>
      <td>初回最大30日間<small>※2</small></td>
      <td>原則電話によるお勤め先への在籍確認なし</td>
    </tr>
    <tr>
      <td>SMBCモビット</td>
      <td>年3.0%〜18.0%</td>
      <td>最短15分<small>※3</small></td>
      <td>なし</td>
      <td>WEB完結で原則電話によるお勤め先への在籍確認なし</td>
    </tr>
    <tr>
      <td>アコム</td>
      <td>年2.4%〜17.9%</td>
      <td>最短20分<small>※4</small></td>
      <td>初回最大30日間<small>※5</small></td>
      <td>原則電話によるお勤め先への在籍確認なし（書面確認）</td>
    </tr>
    <tr>
      <td>アイフル</td>
      <td>年3.0%〜18.0%</td>
      <td>最短14分<small>※6</small></td>
      <td>初回最大30日間</td>
      <td>原則電話によるお勤め先への在籍確認なし（99.1%）</td>
    </tr>
    <tr>
      <td>レイク</td>
      <td>年4.5%〜18.0%</td>
      <td>最短15秒で審査結果<small>※7</small></td>
      <td>初回最大365日間または最大180日間</td>
      <td>審査状況により異なる</td>
    </tr>
  </tbody>
</table>
</div>
<p class="annotation">※1:お申込時間や審査によりご希望に添えない場合がございます。※2:メールアドレス登録とWeb明細利用の登録が必要です。初回利用翌日から起算。※3:申込の曜日、時間帯によっては翌日以降の取扱となる場合があります。※4:お申込時間や審査によりご希望に添えない場合がございます。当日契約の期限は21時まで。※5:アコムでのご契約がはじめてのお客さまが対象。※6:審査状況によりご希望に添えない場合があります。※7:審査状況によりご希望に添えない場合があります。</p>
<p>※上記情報は2026年1月時点のものです。最新の情報は各社公式サイトでご確認ください。</p>
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
      "金利範囲の明示",
      "融資スピードの注釈付き表記",
      "在籍確認の正規表現使用"
    ],
    "annotations_added": [
      "各社融資スピードへの免責注釈",
      "在籍確認表現をmaster_rules準拠に修正"
    ]
  },
  "evidence_refs": [
    "プロミス公式サイト",
    "アコム公式サイト",
    "SMBCモビット公式サイト",
    "アイフル公式サイト"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資×金利比較の検索意図への直接対応",
  "expected_delta": "ターゲットクエリ『即日融資 カードローン 金利 比較』に対するembedding類似度向上、競合との深度差（0.55→0.65+）縮小"
}
```

### diff #2 — h3#即日融資可能なカードローン一覧

- change_type: `insert_after`
- change_category: `evidence_insertion`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<h4>金利と融資スピードのトレードオフを理解しよう</h4>
<p>即日融資が可能な消費者金融カードローンの上限金利は、多くの会社で年17.9%〜18.0%です。一方、銀行カードローンは上限金利が年14.0%〜14.6%程度と低く設定されていますが、警察庁データベースへの照会義務があるため審査に最短でも翌営業日以降かかり、即日融資には対応していません。</p>
<p>つまり、<strong>「今日中に借りたい」なら消費者金融（上限金利18.0%前後）</strong>、<strong>「急がないので金利を抑えたい」なら銀行カードローン（上限金利14.0%〜14.6%）</strong>という使い分けが基本になります。なお、消費者金融でも借入額が大きくなるほど適用金利は下がる傾向があり、プロミスの下限2.5%・アコムの下限2.4%はいずれも高額利用時の適用金利です。</p>
<p>短期間で全額返済できる場合は無利息期間（多くの消費者金融で初回最大30日間）を活用することで、実質的な利息負担をゼロにすることも可能です。</p>
<p class="annotation">※銀行カードローンの即日融資が不可である点については全国銀行協会「銀行カードローンに関する全銀協の取組みについて」に基づきます。</p>
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
      "金利の上限・下限を明示",
      "消費者金融と銀行の違いを正確に記述",
      "無利息期間の条件を明記"
    ],
    "annotations_added": [
      "全銀協ガイドライン参照を注釈として追記"
    ]
  },
  "evidence_refs": [
    "全国銀行協会「銀行カードローンに関する全銀協の取組みについて」"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資と低金利の選択軸を解説することで比較クエリへの網羅深度向上",
  "expected_delta": "即日融資×金利比較コンテンツの質的充実、情報の深度スコア改善"
}
```

### diff #3 — h3#1位：プロミス｜金利2.5%~18.0%・最短3分融資

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<p>プロミスは金利が年2.5%~18.0%と契約金額が大きい場合に適用される下限金利が大手消費者金融の中で最も低く、最短3分融資(※1)という業界最速のスピードを誇ります。</p>
<p>無利息期間は初回利用翌日から30日間と、契約日ではなく実際に借入した日から起算されるため、契約後すぐに借りない場合でも無駄がありません。18歳から申込可能（高校生除く）で、若年層にも対応しています。(※2)</p>
<p>原則電話での在籍確認なしで、98%の方が電話以外の方法で完了しています。(※3)最大500万円まで借入可能で、SMBCグループの安心感もあります。</p>
```

**content_after**
```html
<p>プロミスは金利が年2.5%〜18.0%で、最短3分融資<small>※1</small>に対応しています。申込から借入までの一般的な流れは、①WEBまたはアプリで申込（最短数分）→②自動審査（最短数分）→③審査結果通知→④契約手続き→⑤振込または提携ATMでの借入となり、スムーズに手続きが進めば最短3分での借入が可能です<small>※1</small>。</p>
<p>金利は借入額によって異なります。上限金利18.0%は主に少額・短期借入時に適用され、下限金利2.5%は概ね概ね高額・長期の借入に適用されます。たとえば10万円を30日間借りた場合の利息は最大約1,479円（年18.0%で計算）、無利息期間（初回最大30日間<small>※2</small>）を適用すれば利息負担は0円となります。</p>
<p>無利息期間は初回利用翌日から起算されるため、契約後すぐに借りない場合でも無駄がありません。18歳から申込可能（高校生除く）で、若年層にも対応しています<small>※3</small>。原則電話によるお勤め先への在籍確認なし（98%の方が電話以外の方法で完了<small>※4</small>）で、SMBCグループのサービスとして安心感があります。</p>
<p class="annotation">※1:お申込時間や審査によりご希望に添えない場合がございます。※2:メールアドレス登録とWeb明細利用の登録が必要です。初回利用翌日から起算。※3:主婦・学生でもアルバイト・パートなど安定した収入のある場合はお申込いただけます。ただし、高校生（定時制高校生および高等専門学校生も含む）はお申込いただけません。また、収入が年金のみの方はお申込いただけません。※4:出典：プロミス公式HP</p>
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
      "「業界最速」はmaster_rules禁止表現のため削除"
    ],
    "ymyl_requirements_met": [
      "利息シミュレーション数値の明示",
      "融資ステップの具体的記述",
      "在籍確認表現のmaster_rules準拠化"
    ],
    "annotations_added": [
      "利息計算の根拠注釈",
      "在籍確認98%の出典注釈"
    ]
  },
  "evidence_refs": [
    "プロミス公式サイト",
    "プロミス公式HP（在籍確認98%）"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "プロミスの即日融資条件と金利適用ケースの詳細化",
  "expected_delta": "shallow_fact「プロミス」の深度スコア改善（0.40→0.50+）"
}
```

### diff #4 — h3#1位：プロミス｜金利2.5%~18.0%・最短3分融資

- change_type: `insert_evidence`
- change_category: `evidence_insertion`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<div class="evidence-box">
<h5>プロミスの金利適用条件まとめ</h5>
<ul>
  <li><strong>上限金利（年18.0%）</strong>：主に借入額が少額（目安：10万円未満）の場合に適用されることが多い</li>
  <li><strong>下限金利（年2.5%）</strong>：借入限度額が高く設定された場合（目安：500万円前後の高額契約時）に適用</li>
  <li><strong>即日融資の条件</strong>：①21時までの申込完了、②本人確認書類・収入証明書類の提出完了、③審査通過、④振込先口座の登録が当日中に完了していること</li>
</ul>
<p class="annotation">※上記は目安です。実際の適用金利・融資可否は審査結果によって異なります。最新情報はプロミス公式サイトをご確認ください。</p>
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
      "金利適用条件の具体的説明",
      "即日融資条件の明示",
      "免責注釈の付与"
    ],
    "annotations_added": [
      "金利適用は審査結果による旨の免責注釈"
    ]
  },
  "evidence_refs": [
    "プロミス公式サイト"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "プロミスの金利条件を深掘りし即日融資文脈での訴求強化",
  "expected_delta": "プロミス個別解説の情報深度向上、滞在時間改善"
}
```

### diff #5 — h3#3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9%

- change_type: `rewrite_paragraph`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<p>✓ 2026年1月6日より金利引き下げ（</p>
```

**content_after**
```html
<p>アコムは2026年1月6日より金利を引き下げ、年2.4%〜17.9%となりました。上限金利17.9%は他の大手消費者金融（プロミス・SMBCモビット・アイフル：年18.0%）より0.1%低く設定されています。この差が実際の返済にどう影響するかを試算すると、10万円を1年間借り続けた場合、年18.0%では利息約18,000円、年17.9%では利息約17,900円と約100円の差になります。少額・短期では差は小さいものの、借入額が大きく・期間が長くなるほど差は広がります。</p>
<p>また、アコムの下限金利は年2.4%と大手消費者金融の中で最低水準です。高額・長期契約時には有利な条件が期待できます。</p>
<p>即日融資については最短20分<small>※a</small>（当日契約の期限は21時まで）に対応。原則電話によるお勤め先への在籍確認なし（書面確認）で、カードレスを選択すれば原則郵送物もなし。初めてのご契約の方は初回最大30日間無利息<small>※a2</small>が適用されます。</p>
<p class="annotation">※a:お申込時間や審査によりご希望に添えない場合がございます。当日契約の期限は21時まで。※a2:アコムでのご契約がはじめてのお客さまが対象。利息の試算はあくまで参考値であり、実際の返済額は借入状況・返済方法により異なります。</p>
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
      "金利引き下げの具体的数値と比較インパクトの明示",
      "利息シミュレーションへの免責注釈",
      "在籍確認表現のmaster_rules準拠化",
      "無利息期間の適用条件明記"
    ],
    "annotations_added": [
      "利息試算は参考値である旨の免責注釈",
      "当日契約期限の明記"
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
  "intent_dimension": "アコムの2026年金利引き下げの比較インパクトを具体化",
  "expected_delta": "shallow_fact「アコム」の深度スコア改善（0.45→0.53+）"
}
```

### diff #6 — h3#3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9%

- change_type: `insert_evidence`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<div class="evidence-box">
<h5>アコムの金利引き下げ前後の比較（2026年1月6日）</h5>
<table>
  <thead>
    <tr>
      <th>項目</th>
      <th>変更前</th>
      <th>変更後（2026年1月6日〜）</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>金利（実質年率）</td>
      <td>年3.0%〜18.0%</td>
      <td>年2.4%〜17.9%</td>
    </tr>
    <tr>
      <td>下限金利の差</td>
      <td>−</td>
      <td>0.6%引き下げ</td>
    </tr>
    <tr>
      <td>上限金利の差</td>
      <td>−</td>
      <td>0.1%引き下げ</td>
    </tr>
    <tr>
      <td>10万円・1年借入時の利息（上限金利適用時）</td>
      <td>約18,000円</td>
      <td>約17,900円（約100円減）</td>
    </tr>
  </tbody>
</table>
<p class="annotation">※利息の計算は参考値です。実際の返済額は借入状況・返済スケジュールにより異なります。出典：アコム公式サイト</p>
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
      "金利変更の前後比較を数値で明示",
      "利息シミュレーションに免責注釈"
    ],
    "annotations_added": [
      "出典をアコム公式サイトと明記",
      "利息計算は参考値である旨の注釈"
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
  "intent_dimension": "アコム金利引き下げの定量的インパクトを可視化",
  "expected_delta": "比較コンテンツとしての価値向上、E-E-A-T強化"
}
```

### diff #7 — h3#低金利カードローンの比較表

- change_type: `insert_after`
- change_category: `internal_link`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<div class="cross-reference-box">
<p><strong>即日融資も視野に入れて比較したい方へ</strong></p>
<p>このページでは低金利（主に銀行カードローン）の比較表を掲載していますが、「今日中に借りたい」という方には消費者金融カードローンの即日融資比較が参考になります。上限金利が銀行より高くなる分、スピードと利便性で優れています。</p>
<ul>
  <li>→ <a href="#即日融資可能なカードローン一覧">即日融資×金利の統合比較表を見る</a>（消費者金融5社を比較）</li>
  <li>→ <a href="#即日融資を受けるための条件と注意点">即日融資を受けるための条件と注意点</a></li>
</ul>
<p>急ぎではなく金利重視なら銀行カードローン（上限金利14.0%〜14.6%）、今日中に借りたいなら消費者金融（上限金利17.9%〜18.0%・最短3分〜20分融資対応）という選択軸で検討してみてください。</p>
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
      "金利数値を明示",
      "即日融資・低金利の選択軸を中立的に提示"
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
  "intent_dimension": "低金利→即日融資セクションへの導線強化、ページ内回遊率向上",
  "expected_delta": "内部リンク構造の改善、比較検討ユーザーの離脱率低減"
}
```

### diff #8 — h3#即日融資を受けるための条件と注意点

- change_type: `insert_before`
- change_category: `internal_link`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<div class="cross-reference-box">
<p><strong>低金利で借りることを優先したい方へ</strong></p>
<p>即ぎではない場合は、銀行カードローン（上限金利14.0%〜14.6%）の活用も選択肢です。金利の差がどの程度の返済額の違いになるかは「<a href="#金利の差でどれくらい返済額が変わるのか">金利の差でどれくらい返済額が変わるのか</a>」のシミュレーションをご覧ください。</p>
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
      "金利数値を明示",
      "選択肢の中立的提示"
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
  "intent_dimension": "即日融資セクションから低金利セクションへの逆方向導線の設置",
  "expected_delta": "比較検討フローの補強、ページ内回遊率向上"
}
```

### diff #9 — h3#在籍確認なし・郵送物なしのカードローン

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
      "見出し中の『在籍確認なし』はmaster_rules禁止表現"
    ],
    "ymyl_requirements_met": [
      "master_rules正規表現『原則電話によるお勤め先への在籍確認なし』に統一"
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
  "intent_dimension": "コンプライアンス整備",
  "expected_delta": "master_rules違反の解消、YMYL品質向上"
}
```

### diff #10 — h2#審査が不安な人向けのカードローン選び

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**
```html
<p>消費者金融は貸金業法が適用され、年収の3分の1を超える借入ができない総量規制の対象です。一方、銀行カードローンは銀行法が適用されるため総量規制の対象外ですが、自主規制により過剰融資を防ぐ取り組みを行っています。</p>
<p>消費者金融の最大の特徴は審査スピードの速さで、最短20分で審査が完了し即日融資が可能です。</p>
```

**content_after**
```html
<p>消費者金融は貸金業法が適用され、年収の3分の1を超える借入ができない総量規制の対象です。一方、銀行カードローンは銀行法が適用されるため総量規制の対象外ですが、自主規制により過剰融資を防ぐ取り組みを行っています。</p>
<p>消費者金融の特徴は審査スピードの速さで、最短20分程度で審査が完了し即日融資が可能です（お申込時間や審査によりご希望に添えない場合があります）。</p>
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
      "「最大の特徴」という絶対的優位表現を中立的表現に修正"
    ],
    "ymyl_requirements_met": [
      "審査スピードへの免責注釈の追加",
      "過剰な優位性強調の排除"
    ],
    "annotations_added": [
      "審査スピードへの免責注釈"
    ]
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "コンプライアンス整備",
  "expected_delta": "過剰表現の解消、YMYL品質向上"
}
```

### diff #11 — h2#即日融資が必要なら消費者金融を選ぼう

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<p>消費者金融の最大の特徴は審査スピードの速さで、最短20分で審査が完了し即日融資が可能です。
銀行カードローンは審査に警察庁データベースへの照会が義務付けられているため、結果回答は最短でも翌営業日となり即日融資はできません。</p>
```

**content_after**
```html
<p>消費者金融の特徴は審査スピードの速さで、最短20分程度で審査が完了し即日融資が可能です（お申込時間や審査によりご希望に添えない場合があります）。銀行カードローンは審査に警察庁データベースへの照会が義務付けられているため、結果回答は最短でも翌営業日となり即日融資はできません。</p>
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
      "「最大の特徴」という絶対的優位表現を修正"
    ],
    "ymyl_requirements_met": [
      "審査スピードへの免責注釈追加"
    ],
    "annotations_added": [
      "即日融資への免責注釈"
    ]
  },
  "evidence_refs": [
    "全国銀行協会「銀行カードローンに関する全銀協の取組みについて」"
  ],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "コンプライアンス整備・免責表現の統一",
  "expected_delta": "YMYL品質向上、master_rules準拠"
}
```

### diff #12 — h3#2位：SMBCモビット｜WEB完結で原則、電話連絡・郵送物なし

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
      "『電話連絡なし』はmaster_rules禁止表現"
    ],
    "ymyl_requirements_met": [
      "master_rules正規表現『原則電話によるお勤め先への在籍確認なし』に統一"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "SMBCモビット公式サイト"
  ],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "コンプライアンス整備",
  "expected_delta": "master_rules違反の解消"
}
```

### diff #13 — meta:title

- change_type: `update_title`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: medium

**content_before**
```html
<title>カードローンのおすすめはどこ？人気10社を徹底比較【2026年】</title>
```

**content_after**
```html
<title>カードローンおすすめ10社を比較【2026年】即日融資・金利・無利息期間を徹底解説</title>
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
      "ターゲットクエリ『即日融資 カードローン 金利 比較』の主要キーワードをタイトルに含める"
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
  "intent_dimension": "ターゲットクエリへのタイトルタグマッチング向上",
  "expected_delta": "CTR改善、即日融資×金利比較クエリでの検索順位向上"
}
```

### diff #14 — meta:description

- change_type: `update_meta_description`
- change_category: `title`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<meta name="description" content="【2026年最新】即日融資対応カードローン5社の金利・融資スピード・無利息期間を一覧比較。プロミス（最短3分）・アコム（年2.4%〜）・SMBCモビットほか10社を徹底解説。消費者金融と銀行カードローンの選び方も詳しく説明します。※お申込時間や審査によりご希望に添えない場合があります。" />
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
      "即日融資への免責注釈をメタディスクリプション内に含める",
      "具体的な金利数値を明示"
    ],
    "annotations_added": [
      "即日融資免責注釈"
    ]
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "メタディスクリプションによるCTR向上",
  "expected_delta": "ターゲットクエリ『即日融資 カードローン 金利 比較』でのスニペット最適化"
}
```

### diff #15 — h3#金利の差でどれくらい返済額が変わるのか

- change_type: `insert_after`
- change_category: `evidence_insertion`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<div class="evidence-box">
<h5>消費者金融（即日融資）vs 銀行カードローン（低金利）の返済額比較</h5>
<table>
  <thead>
    <tr>
      <th>借入条件</th>
      <th>消費者金融（上限金利18.0%）</th>
      <th>アコム（上限金利17.9%）</th>
      <th>銀行カードローン（上限金利14.0%）</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>10万円・30日間</td>
      <td>約1,479円</td>
      <td>約1,470円</td>
      <td>約1,151円</td>
    </tr>
    <tr>
      <td>30万円・6ヶ月</td>
      <td>約27,000円</td>
      <td>約26,850円</td>
      <td>約21,000円</td>
    </tr>
    <tr>
      <td>即日融資</td>
      <td>可能（最短3〜20分）</td>
      <td>可能（最短20分）</td>
      <td>不可（最短翌営業日）</td>
    </tr>
  </tbody>
</table>
<p class="annotation">※利息の計算は「元本×金利÷365×借入日数」による参考値です。実際の返済額は借入状況・返済スケジュール・適用金利により異なります。融資時間はお申込時間や審査によりご希望に添えない場合があります。</p>
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
      "利息シミュレーションへの免責注釈",
      "即日融資の可否を明示",
      "金利数値の根拠を記載"
    ],
    "annotations_added": [
      "利息計算式の明示",
      "融資時間への免責注釈"
    ]
  },
  "evidence_refs": [],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資と低金利の金額差を可視化、比較検討意図への対応",
  "expected_delta": "『即日融資 カードローン 金利 比較』クエリへのコンテンツ深度向上、滞在時間改善"
}
```

---

# Pass B (inject=true) — Session 22

- post_id: **11077**
- triggered_by: smoke-c-e
- model: analysis=claude-opus-4-7 / generation=claude-sonnet-4-6
- status (final): **awaiting_diff_judgment**
- policy_judgment: approved
- high_risk_categories: ["rate_update"]
- tokens: analysis 8568/2117 | generation 13025/14632
- started_at: 2026-05-22 02:06:43
- analysis_completed_at: 2026-05-22 02:07:23
- generation_completed_at: 2026-05-22 02:10:41

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
  "structural_analysis": "本記事は『カードローンおすすめ10社比較』をテーマに、消費者金融と銀行カードローンの違い、ランキングTOP10、即日融資、低金利、無利息期間、審査、申込フロー、返済、リスク注意までを網羅した大規模比較記事である。target_query『即日融資 カードローン 金利 比較』に対する基本構造は整っているが、embedding 上の網羅深度 (self_max 0.55 vs comp_max 0.65) が閾値 0.70 に届かず、比較軸の具体性・定量性が競合に対し浅い。特に『金利×即日融資×比較』という複合観点での横断比較表が、ランキング個別解説に分散しており、ユーザーが一目で意思決定できる集約ビューが不足している。またプロミス・アコムは個社解説の網羅深度が競合比で浅く (delta -0.05)、最新金利改定 (アコム 2026年1月 2.4-17.9%) の根拠提示や、即日融資条件・申込時間帯リスクの定量解説が薄い。保護領域 (soico-cta-*, box-###, ez-toc-*) は触れず、本文側の比較表強化・個社深掘り・即日融資条件の精緻化に集中すべき。",
  "rewrite_policy": [
    {
      "policy_text": "『即日融資 × 金利 × 比較』の複合観点を1枚で俯瞰できる集約比較表セクションを新設し、各社の下限/上限金利・最短審査時間・最短融資時間・無利息期間・WEB完結可否・在籍確認方式を1行で比較。target_query の網羅深度を embedding 上で底上げする。",
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
      "policy_text": "プロミス個社セクションを深掘り。金利下限2.5%が適用される条件 (高額契約時)、最短3分融資の前提条件 (申込時間帯・審査状況)、無利息期間が『初回利用翌日起算』である点のメリット、WEB完結時の郵送物取扱い、SMBCグループ連携の具体的利便性を段落追加。注釈は既存スタイル踏襲。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
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
      "policy_text": "アコム個社セクションを深掘り。2026年1月6日金利引き下げ (年2.4%〜17.9%) の根拠を公式リリース出典で明示、初回30日間無利息の正式表記 (『初めての方は契約翌日から最大30日間無利息』) に補正、最短20分審査の条件、原則電話による在籍確認なしの方針を追記し、competitor 比の網羅深度ギャップを解消する。",
      "priority": 2,
      "uses_bundle_refs": {
        "required_additions": [],
        "shallow_queries": [],
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
      "policy_text": "『即日融資が必要なら消費者金融を選ぼう』セクション内に、即日融資が成立する申込時刻のカットオフ目安 (例: 各社21時前後)、土日祝の振込対応可否、運転免許証等の本人確認書類即時アップロードの重要性を具体化。ユーザーが即日融資を実際に受けられる条件を定量的に提示する。",
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
      "policy_text": "金利比較セクションで、借入額別 (10万/50万/100万) の上限金利適用例と、利息制限法上の段階金利、年18.0%と年14.5%で同額借入時の総返済額差を返済シミュレーション例で提示。金利比較の網羅深度を embedding 上で強化する。",
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
    },
    {
      "policy_text": "master_rules に基づき本文中の表現を一括点検。『電話連絡なし』『電話なし』『在籍確認なし』表記を『原則電話による在籍確認なし』に統一、『30日間無利息』表記を『初回最大30日間無利息』もしくは『初めての方は契約翌日から最大30日間無利息』に正式表記補正。保護領域 (soico-cta-*, box-###, ez-toc-*) は対象外。",
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

risk_flag distribution: {"rate_update":6,"(null)":6,"title_change":2,"regulation_citation":1}

| # | target_section | change_type | change_category | risk | conf |
|---|---|---|---|---|---|
| 1 | h2#即日融資が必要なら消費者金融を選ぼう | insert_before | evidence_insertion | rate_update | high |
| 2 | h3#1位：プロミス｜金利2.5%~18.0%・最短3分融資 | rewrite_section | paragraph_rewrite | rate_update | high |
| 3 | h3#3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9% | rewrite_section | paragraph_rewrite | rate_update | high |
| 4 | h3#即日融資を受けるための条件と注意点 | rewrite_paragraph | paragraph_rewrite |  | high |
| 5 | h3#土日祝日でも即日融資は可能か | insert_after | evidence_insertion |  | medium |
| 6 | h3#金利の差でどれくらい返済額が変わるのか | rewrite_section | evidence_insertion | rate_update | high |
| 7 | h3#低金利カードローンの比較表 | insert_evidence | evidence_insertion | rate_update | medium |
| 8 | h3#在籍確認なし・郵送物なしのカードローン | rewrite_paragraph | compliance_update |  | high |
| 9 | h3#2位：SMBCモビット｜WEB完結で原則、電話連絡・郵送物なし | rewrite_paragraph | compliance_update |  | high |
| 10 | h3#4位：アイフル｜最短14分審査・在籍確認99.1%が電話なし | rewrite_paragraph | compliance_update |  | high |
| 11 | h2#【2026年最新】カードローンおすすめランキングTOP10 | insert_after | evidence_insertion | rate_update | high |
| 12 | meta:title | update_title | title | title_change | medium |
| 13 | meta:description | update_meta_description | title | title_change | medium |
| 14 | h3#審査基準と申込条件を理解する | rewrite_paragraph | compliance_update | regulation_citation | medium |
| 15 | h3#無利息期間があるカードローン一覧 | rewrite_paragraph | compliance_update |  | high |

### diff #1 — h2#即日融資が必要なら消費者金融を選ぼう

- change_type: `insert_before`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<section id="sokuji-kinri-hikaku">
  <h2>【即日融資×金利】主要カードローン一括比較表</h2>
  <p>「今日中に借りたい」「少しでも金利を抑えたい」という方のために、大手カードローン各社の<strong>下限・上限金利／最短審査時間／最短融資時間／無利息期間／WEB完結可否／在籍確認方式</strong>を1枚の表で比較しました。</p>
  <div class="table-responsive">
    <table>
      <thead>
        <tr>
          <th>会社名</th>
          <th>下限金利</th>
          <th>上限金利</th>
          <th>最短審査時間</th>
          <th>最短融資時間</th>
          <th>無利息期間</th>
          <th>WEB完結</th>
          <th>在籍確認方式</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>プロミス</td>
          <td>年2.5%</td>
          <td>年18.0%</td>
          <td>最短3分<small>※1</small></td>
          <td>最短3分<small>※1</small></td>
          <td>初回利用翌日から最大30日間<small>※2</small></td>
          <td>○</td>
          <td>原則電話による在籍確認なし</td>
        </tr>
        <tr>
          <td>SMBCモビット</td>
          <td>年3.0%</td>
          <td>年18.0%</td>
          <td>最短15分<small>※3</small></td>
          <td>最短15分<small>※3</small></td>
          <td>なし</td>
          <td>○</td>
          <td>原則電話による在籍確認なし（WEB完結時）</td>
        </tr>
        <tr>
          <td>アコム</td>
          <td>年2.4%</td>
          <td>年17.9%</td>
          <td>最短20分<small>※4</small></td>
          <td>最短20分<small>※4</small></td>
          <td>初めての方は契約翌日から最大30日間無利息</td>
          <td>○</td>
          <td>原則お勤め先へ電話による在籍確認なし（書面確認）</td>
        </tr>
        <tr>
          <td>アイフル</td>
          <td>年3.0%</td>
          <td>年18.0%</td>
          <td>最短14分<small>※5</small></td>
          <td>最短14分<small>※5</small></td>
          <td>初回最大30日間</td>
          <td>○</td>
          <td>原則電話による在籍確認なし（99.1%が電話以外）</td>
        </tr>
        <tr>
          <td>レイク</td>
          <td>年4.5%</td>
          <td>年18.0%</td>
          <td>最短15秒<small>※6</small></td>
          <td>最短25分<small>※6</small></td>
          <td>最大365日間（条件による）</td>
          <td>○</td>
          <td>原則電話による在籍確認なし</td>
        </tr>
        <tr>
          <td>三菱UFJ銀行（バンクイック）</td>
          <td>年1.8%</td>
          <td>年14.6%</td>
          <td>最短翌営業日</td>
          <td>最短翌営業日</td>
          <td>なし</td>
          <td>○</td>
          <td>書面・Web確認</td>
        </tr>
        <tr>
          <td>三井住友銀行</td>
          <td>年1.5%</td>
          <td>年14.5%</td>
          <td>最短翌営業日</td>
          <td>最短翌営業日</td>
          <td>なし</td>
          <td>○</td>
          <td>書面・Web確認</td>
        </tr>
        <tr>
          <td>みずほ銀行</td>
          <td>年2.0%</td>
          <td>年14.0%</td>
          <td>最短翌営業日</td>
          <td>最短翌営業日</td>
          <td>なし</td>
          <td>○</td>
          <td>書面・Web確認</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p><small>※1:お申込時間や審査によりご希望に添えない場合がございます。／※2:メールアドレス登録とWeb明細利用の登録が必要です。／※3:申込の曜日・時間帯によっては翌日以降の取扱となる場合があります。／※4:お申込時間や審査によりご希望に添えない場合がございます。アコムの当日契約の期限は21時までです。／※5:お申込時間や審査によりご希望に添えない場合がございます。／※6:審査時間・融資時間はお申込み状況や審査内容により異なります。</small></p>
  <p>即日融資を希望する場合は<strong>消費者金融（プロミス・アコム・アイフル・レイク等）</strong>を選びましょう。銀行カードローンは警察庁データベースへの照会が義務付けられているため、即日融資には対応していません。</p>
</section><p>審査が甘いので安心です。</p>
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
        "rule_id": 1,
        "ng_text": "審査が甘い",
        "legal_basis": null,
        "position": 3016
      }
    ],
    "ymyl_requirements_met": [
      "金利数値は各社公式情報を基に記載",
      "即日融資の可否を正確に区分"
    ],
    "annotations_added": [
      "各社注釈を個別付記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "比較・選択",
  "expected_delta": "即日融資×金利×比較の複合観点を1表で充足し、embedding網羅深度を0.55→0.65以上へ引き上げる"
}
```

### diff #2 — h3#1位：プロミス｜金利2.5%~18.0%・最短3分融資

- change_type: `rewrite_section`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<p>プロミスは金利が年2.5%~18.0%と契約金額が大きい場合に適用される下限金利が大手消費者金融の中で最も低く、最短3分融資(※1)という業界最速のスピードを誇ります。</p>
<p>無利息期間は初回利用翌日から30日間と、契約日ではなく実際に借入した日から起算されるため、契約後すぐに借りない場合でも無駄がありません。18歳から申込可能（高校生除く）で、若年層にも対応しています。(※2)</p>
<p>原則電話での在籍確認なしで、98%の方が電話以外の方法で完了しています。(※3)最大500万円まで借入可能で、SMBCグループの安心感もあります。</p>
```

**content_after**
```html
<p>プロミスは年2.5%〜18.0%の金利設定で、<strong>下限金利2.5%は高額契約時（概ね借入額が高いほど適用されやすい）</strong>に適用されます。上限金利は年18.0%で、利息制限法に基づく段階金利の枠内に収まっています。</p>
<p><strong>最短3分融資（※1）</strong>を実現するには、①平日・土日問わず原則21時頃までの申込、②スマートフォンからの本人確認書類（運転免許証等）即時アップロード、③審査通過後の即時振込または提携ATM利用、という条件が揃う必要があります。申込時間帯や審査状況によっては翌日以降となる場合がありますのでご注意ください。</p>
<p>無利息期間は<strong>初回利用翌日から最大30日間</strong>（メールアドレス登録・Web明細利用の登録が必要）。契約日ではなく実際の借入日から起算されるため、契約後すぐに借りない場合でも無利息期間を無駄なく活用できます。</p>
<p>WEB完結申込を選択すると、原則郵送物なしで手続きを完了できます（手続きによって郵送物が発生する場合もあります）。原則電話での在籍確認なし（98%の方が電話以外の方法で完了）で、プライバシーに配慮した運用が可能です。（※3）</p>
<p>SMBCグループの一員として三井住友銀行ATMが利用でき、全国のコンビニATMネットワークとの連携も充実しています。18歳から申込可能（高校生除く）で、最大800万円まで借入可能です。（※4）</p>
<p><small>※1:お申込時間や審査によりご希望に添えない場合がございます。／※2:メールアドレス登録とWeb明細利用の登録が必要です。／※3:出典:プロミス公式HP／※4:借入限度額は審査によって決定いたします。主婦・学生でもアルバイト・パートなど安定した収入のある場合はお申込いただけます。ただし、高校生（定時制高校生および高等専門学校生も含む）はお申込いただけません。また、収入が年金のみの方はお申込いただけません。</small></p>
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
      "「業界最速」はmaster_rules禁止表現のため削除"
    ],
    "ymyl_requirements_met": [
      "金利適用条件を明示",
      "即日融資の前提条件を定量的に記述"
    ],
    "annotations_added": [
      "最短3分の前提条件注記",
      "無利息期間の起算ルール注記"
    ]
  },
  "evidence_refs": [
    "プロミス公式サイト"
  ],
  "policy_index": 1
}
```

**estimated_impact**
```json
{
  "intent_dimension": "詳細調査・個社比較",
  "expected_delta": "プロミスの embedding shallow_fact スコアを0.40→0.50以上へ引き上げ、禁止表現「業界最速」を除去"
}
```

### diff #3 — h3#3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9%

- change_type: `rewrite_section`
- change_category: `paragraph_rewrite`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<p>✓ 2026年1月6日より金利引き下げ（</p>
```

**content_after**
```html
<h3>3位：アコム｜2026年1月6日より金利引き下げで年2.4%〜17.9%</h3>
<p>アコムは<strong>2026年1月6日付で金利を引き下げ、年2.4%〜17.9%</strong>となりました（出典：アコム公式プレスリリース「貸付利率の引き下げについて」2026年1月6日）。下限金利2.4%は大手消費者金融の中でも最低水準であり、高額・長期契約ほど低金利の恩恵を受けやすい設計です。</p>
<p><strong>最短20分審査（※a）</strong>を実現するには、①アコムの当日契約期限である21時までの申込、②スマートフォンからの本人確認書類の即時アップロード、③審査通過後の即時振込またはATM利用、が条件となります。申込時間や審査状況によりご希望に添えない場合があります。</p>
<p>無利息期間は<strong>「初めての方は契約翌日から最大30日間無利息」</strong>（アコムでのご契約がはじめてのお客さまが対象）。契約翌日から起算されるため、契約後すぐに借入を開始した場合に最大限活用できます。</p>
<p>在籍確認は<strong>原則お勤め先へ電話による在籍確認なし（書面確認）</strong>で、プライバシーに配慮した確認方法を採用しています。カードレス契約を選択すると原則郵送物なしで手続き可能です。</p>
<p>20歳以上で安定した収入と返済能力を有する方が申込対象です。最大800万円まで借入可能で、三菱UFJフィナンシャル・グループの安心感があります。</p>
<p><small>※a:お申込時間や審査によりご希望に添えない場合がございます。アコムの当日契約の期限は21時までです。金利情報は2026年1月時点のものです。最新の情報はアコム公式サイトでご確認ください。</small></p>
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
      "「30日間無利息」を正式表記「初めての方は契約翌日から最大30日間無利息」に補正",
      "「電話なし」を「原則お勤め先へ電話による在籍確認なし（書面確認）」に統一"
    ],
    "ymyl_requirements_met": [
      "金利引き下げの出典・日付を明示",
      "無利息期間の正式条件を記載",
      "即日融資カットオフ時刻（21時）を明示"
    ],
    "annotations_added": [
      "金利引き下げ出典注記",
      "当日契約期限21時の注記"
    ]
  },
  "evidence_refs": [
    "アコム公式プレスリリース 2026年1月6日"
  ],
  "policy_index": 2
}
```

**estimated_impact**
```json
{
  "intent_dimension": "詳細調査・個社比較",
  "expected_delta": "アコムの embedding shallow_fact スコアを0.45→0.53以上へ引き上げ、金利改定根拠・即日融資条件の定量化により競合との深度ギャップを解消"
}
```

### diff #4 — h3#即日融資を受けるための条件と注意点

- change_type: `rewrite_paragraph`
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
<p>即日融資を確実に受けるためには、以下の条件をすべて満たす必要があります。</p>
<ul>
  <li><strong>申込時刻のカットオフ</strong>：各社おおむね当日21時頃までの審査完了が目安です。プロミス・アイフルは原則21時頃、アコムは当日契約期限が21時です。この時刻を過ぎると翌日以降の対応となります。</li>
  <li><strong>本人確認書類の即時アップロード</strong>：運転免許証・マイナンバーカード等をスマートフォンで撮影・アップロードし、審査担当者への書類到達を早めることが重要です。郵送での提出を選ぶと即日融資が困難になります。</li>
  <li><strong>振込先口座の準備</strong>：申込と同じ金融機関口座（または各社指定の口座）を用意しておくと、審査通過後の振込がスムーズになります。</li>
  <li><strong>審査状況による制約</strong>：申込が集中する時間帯や、追加書類が必要と判断された場合は審査に時間がかかり、即日融資ができない場合があります。</li>
</ul>
<p>土日祝日については、消費者金融の多くが土日祝日でも審査・振込に対応しています（詳細は「土日祝日でも即日融資は可能か」のセクションをご参照ください）。</p>
<p><small>※お申込み時間や審査状況によりご希望にそえない場合があります。</small></p>
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
      "即日融資の前提条件を定量的に列挙",
      "カットオフ時刻を具体的に明示"
    ],
    "annotations_added": [
      "審査状況による制約の注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資の実行可能性確認",
  "expected_delta": "ユーザーが即日融資を受けられる条件を定量的に把握でき、target_queryの網羅深度を補強"
}
```

### diff #5 — h3#土日祝日でも即日融資は可能か

- change_type: `insert_after`
- change_category: `evidence_insertion`
- risk_flag: `(null)`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<div class="sokuji-weekend-detail">
  <h4>各社の土日祝・振込対応まとめ</h4>
  <table>
    <thead>
      <tr>
        <th>会社名</th>
        <th>土日祝の審査対応</th>
        <th>土日祝の即日振込</th>
        <th>備考</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>プロミス</td>
        <td>○</td>
        <td>○（原則21時頃まで）</td>
        <td>提携ATMは24時間利用可</td>
      </tr>
      <tr>
        <td>アコム</td>
        <td>○</td>
        <td>○（当日21時まで）</td>
        <td>当日契約期限21時</td>
      </tr>
      <tr>
        <td>アイフル</td>
        <td>○</td>
        <td>○（原則21時頃まで）</td>
        <td>最短14分審査</td>
      </tr>
      <tr>
        <td>レイク</td>
        <td>○</td>
        <td>○（審査状況による）</td>
        <td>最短25分融資</td>
      </tr>
      <tr>
        <td>SMBCモビット</td>
        <td>○</td>
        <td>△（時間帯により翌日）</td>
        <td>申込曜日・時間帯による</td>
      </tr>
      <tr>
        <td>銀行カードローン各社</td>
        <td>×</td>
        <td>×</td>
        <td>警察庁照会のため最短翌営業日</td>
      </tr>
    </tbody>
  </table>
  <p><small>※上記は各社公式情報を基にした目安です。審査状況や申込時間帯によって異なる場合があります。最新情報は各社公式サイトでご確認ください。</small></p>
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
      "土日祝の対応可否を各社別に明示",
      "銀行カードローンの制約理由を記載"
    ],
    "annotations_added": [
      "注記「審査状況により異なる場合がある」"
    ]
  },
  "evidence_refs": [],
  "policy_index": 3
}
```

**estimated_impact**
```json
{
  "intent_dimension": "即日融資の実行可能性確認（土日祝）",
  "expected_delta": "土日祝対応の定量情報を補強し、即日融資クエリの網羅深度を向上"
}
```

### diff #6 — h3#金利の差でどれくらい返済額が変わるのか

- change_type: `rewrite_section`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**
```html
<h3>金利の差でどれくらい返済額が変わるのか</h3>
```

**content_after**
```html
<h3>金利の差でどれくらい返済額が変わるのか</h3>
<p>利息制限法では、借入元本の金額に応じて上限金利が段階的に定められています。</p>
<ul>
  <li>借入元本 <strong>10万円未満</strong>：上限金利 年20.0%</li>
  <li>借入元本 <strong>10万円以上100万円未満</strong>：上限金利 年18.0%</li>
  <li>借入元本 <strong>100万円以上</strong>：上限金利 年15.0%</li>
</ul>
<p>つまり、同じカードローンでも借入額が増えるほど適用される上限金利は低くなります。</p>
<h4>借入額別・返済シミュレーション例（毎月一定額返済の場合）</h4>
<table>
  <thead>
    <tr>
      <th>借入額</th>
      <th>金利</th>
      <th>月返済額（目安）</th>
      <th>返済期間（目安）</th>
      <th>総利息（目安）</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="2">10万円</td>
      <td>年18.0%</td>
      <td>約5,000円</td>
      <td>約24ヶ月</td>
      <td>約19,700円</td>
    </tr>
    <tr>
      <td>年14.5%</td>
      <td>約5,000円</td>
      <td>約23ヶ月</td>
      <td>約15,800円</td>
    </tr>
    <tr>
      <td rowspan="2">50万円</td>
      <td>年18.0%</td>
      <td>約15,000円</td>
      <td>約41ヶ月</td>
      <td>約109,000円</td>
    </tr>
    <tr>
      <td>年14.5%</td>
      <td>約15,000円</td>
      <td>約38ヶ月</td>
      <td>約82,000円</td>
    </tr>
    <tr>
      <td rowspan="2">100万円</td>
      <td>年18.0%</td>
      <td>約30,000円</td>
      <td>約43ヶ月</td>
      <td>約278,000円</td>
    </tr>
    <tr>
      <td>年14.5%</td>
      <td>約30,000円</td>
      <td>約39ヶ月</td>
      <td>約207,000円</td>
    </tr>
  </tbody>
</table>
<p><small>※上記は概算シミュレーションです。実際の返済額は各社の返済方式・適用金利・返済スケジュールにより異なります。利息制限法に基づく上限金利の範囲内での試算です。ご利用は計画的に。</small></p>
<p>年18.0%と年14.5%では、<strong>50万円の借入で約2.7万円、100万円の借入で約7.1万円の利息差</strong>が生じる計算になります。低金利の銀行カードローンを選ぶことで長期的な利息負担を大きく軽減できます。</p>
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
      "利息制限法の段階金利を正確に記載",
      "返済シミュレーションに「ご利用は計画的に」注記を付与",
      "概算である旨を明示"
    ],
    "annotations_added": [
      "シミュレーション概算注記",
      "利息制限法出典"
    ]
  },
  "evidence_refs": [
    "利息制限法第1条"
  ],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "金利比較・返済計画",
  "expected_delta": "借入額別の定量シミュレーションにより金利比較の網羅深度を強化し、target_query スコアを向上"
}
```

### diff #7 — h3#低金利カードローンの比較表

- change_type: `insert_evidence`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<p>以下の表は、借入額100万円・年15.0%（消費者金融上限）と年14.0%（銀行最低水準・みずほ銀行）で同額借入した場合の利息差のイメージです。</p>
<table>
  <thead>
    <tr>
      <th>借入額</th>
      <th>金利</th>
      <th>1年間の利息（目安）</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>100万円</td>
      <td>年15.0%</td>
      <td>約150,000円</td>
    </tr>
    <tr>
      <td>100万円</td>
      <td>年14.0%</td>
      <td>約140,000円</td>
    </tr>
    <tr>
      <td colspan="2">差額</td>
      <td>約10,000円／年</td>
    </tr>
  </tbody>
</table>
<p><small>※上記は元本が変動しない場合の単純計算による概算です。実際の返済額は返済方式・適用金利により異なります。</small></p>
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
      "概算である旨を明示"
    ],
    "annotations_added": [
      "概算注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 4
}
```

**estimated_impact**
```json
{
  "intent_dimension": "金利比較",
  "expected_delta": "低金利セクションの定量的根拠を補強し、銀行選択の意思決定を支援"
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
<h3>原則電話による在籍確認なし・郵送物なしのカードローン</h3>
<p>職場への電話を避けたい方や郵送物が困る方のために、各社の対応状況をまとめました。</p>
<p>なお、「在籍確認なし」「電話なし」と表現される場合がありますが、正確には<strong>「原則電話によるお勤め先への在籍確認なし」</strong>であり、書面（健康保険証・雇用証明書等）や画像アップロードによる確認が行われます。在籍確認が完全に省略されるわけではありません。</p>
<ul>
  <li><strong>プロミス</strong>：原則電話による在籍確認なし（98%の方が電話以外の方法で完了）</li>
  <li><strong>SMBCモビット</strong>：WEB完結申込で原則電話による在籍確認なし・郵送物なし</li>
  <li><strong>アコム</strong>：原則お勤め先へ電話による在籍確認なし（書面確認）</li>
  <li><strong>アイフル</strong>：原則電話による在籍確認なし（99.1%が電話以外で完了）</li>
</ul>
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
      "master_rules: 「在籍確認なし」→「原則電話によるお勤め先への在籍確認なし」に統一"
    ],
    "ymyl_requirements_met": [
      "在籍確認の仕組みを正確に説明（完全省略ではない旨を明記）"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 5
}
```

**estimated_impact**
```json
{
  "intent_dimension": "審査・プライバシー",
  "expected_delta": "master_rules違反表現を解消し、コンプライアンス適合度を向上"
}
```

### diff #9 — h3#2位：SMBCモビット｜WEB完結で原則、電話連絡・郵送物なし

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<p>SMBCモビットは、WEB完結申込を選択すると原則、電話連絡・郵送物なしで契約できます。</p>
<p>プライバシーを最重視する方に最適で、三井住友銀行ATM手数料が無料、Tポイントが貯まる・使えるという独自のメリットもあります。SMBCグループの安心感があり、最大800万円まで借入可能(※1)です。</p>
<p>金利は年3.0%〜18.0%で、最短30分で審査(※2)が完了します。ただし、無利息期間がない点には注意が必要です。</p>
<p>職場への電話連絡を絶対に避けたい方、郵送物が困る方には最もおすすめです。</p>
```

**content_after**
```html
<p>SMBCモビットは、WEB完結申込を選択すると原則、電話による在籍確認・郵送物なしで契約できます。職場に知られたくない方、郵送物が困る方に適した選択肢です。</p>
<p>三井住友銀行ATM手数料が無料、Vポイントが貯まる・使えるという独自のメリットもあります。SMBCグループの安心感があり、最大800万円まで借入可能です（※1）。</p>
<p>金利は年3.0%〜18.0%で、最短15分で審査（※2）が完了します。ただし、無利息期間がない点には注意が必要です。消費者金融各社との金利差は小さいですが、SMBCグループとしての信頼性を重視する方に向いています。</p>
<p><small>※1:借入限度額は審査によって決定いたします。／※2:申込の曜日、時間帯によっては翌日以降の取扱となる場合があります。</small></p>
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
      "「電話連絡なし」→「原則電話による在籍確認なし」に統一（master_rules必須表現）",
      "「Tポイント」→「Vポイント」に修正（事実確認）"
    ],
    "ymyl_requirements_met": [
      "在籍確認の正式表記に準拠"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "SMBCモビット公式サイト"
  ],
  "policy_index": 5
}
```

**estimated_impact**
```json
{
  "intent_dimension": "個社比較・プライバシー",
  "expected_delta": "master_rules違反表現を解消し、正確な商品情報を提供"
}
```

### diff #10 — h3#4位：アイフル｜最短14分審査・在籍確認99.1%が電話なし

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `(null)`
- llm_confidence: high

**content_before**
```html
<h3>4位：アイフル｜最短14分審査・在籍確認99.1%が電話なし</h3>
```

**content_after**
```html
<h3>4位：アイフル｜最短14分審査・在籍確認99.1%が原則電話による確認なし</h3>
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
      "「電話なし」→「原則電話による確認なし」に統一（master_rules必須表現）"
    ],
    "ymyl_requirements_met": [
      "在籍確認の正式表記に準拠"
    ],
    "annotations_added": []
  },
  "evidence_refs": [],
  "policy_index": 5
}
```

**estimated_impact**
```json
{
  "intent_dimension": "compliance",
  "expected_delta": "見出しの表現をmaster_rules準拠に修正"
}
```

### diff #11 — h2#【2026年最新】カードローンおすすめランキングTOP10

- change_type: `insert_after`
- change_category: `evidence_insertion`
- risk_flag: `rate_update`
- llm_confidence: high

**content_before**: (null)

**content_after**
```html
<p>以下の表は、各社の主要スペックを一覧で確認できる早見表です。詳細は各社セクションをご覧ください。</p>
<div class="table-responsive">
  <table>
    <thead>
      <tr>
        <th>順位</th>
        <th>会社名</th>
        <th>金利（年）</th>
        <th>最短融資</th>
        <th>無利息期間</th>
        <th>即日融資</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>1位</td><td>プロミス</td><td>2.5%〜18.0%</td><td>最短3分<small>※</small></td><td>初回利用翌日から最大30日間</td><td>○</td></tr>
      <tr><td>2位</td><td>SMBCモビット</td><td>3.0%〜18.0%</td><td>最短15分<small>※</small></td><td>なし</td><td>○</td></tr>
      <tr><td>3位</td><td>アコム</td><td>2.4%〜17.9%</td><td>最短20分<small>※</small></td><td>初めての方は契約翌日から最大30日間無利息</td><td>○</td></tr>
      <tr><td>4位</td><td>アイフル</td><td>3.0%〜18.0%</td><td>最短14分<small>※</small></td><td>初回最大30日間</td><td>○</td></tr>
      <tr><td>5位</td><td>レイク</td><td>4.5%〜18.0%</td><td>最短25分<small>※</small></td><td>最大365日間（条件による）</td><td>○</td></tr>
      <tr><td>6位</td><td>ダイレクトワン</td><td>4.9%〜18.0%</td><td>最短即日</td><td>初回55日間</td><td>○</td></tr>
      <tr><td>7位</td><td>三菱UFJ銀行（バンクイック）</td><td>1.8%〜14.6%</td><td>最短翌営業日</td><td>なし</td><td>×</td></tr>
      <tr><td>8位</td><td>三井住友銀行</td><td>1.5%〜14.5%</td><td>最短翌営業日</td><td>なし</td><td>×</td></tr>
      <tr><td>9位</td><td>みずほ銀行</td><td>2.0%〜14.0%</td><td>最短翌営業日</td><td>なし</td><td>×</td></tr>
      <tr><td>10位</td><td>楽天銀行</td><td>1.9%〜14.5%</td><td>最短翌営業日</td><td>なし</td><td>×</td></tr>
    </tbody>
  </table>
</div>
<p><small>※各社の最短融資時間はお申込時間や審査によりご希望に添えない場合がございます。金利・条件は2026年1月時点のものです。最新情報は各社公式サイトでご確認ください。</small></p>
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
      "各社金利・即日融資可否を正確に記載",
      "無利息期間の正式表記を使用"
    ],
    "annotations_added": [
      "審査状況による注記",
      "情報鮮度注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "比較・選択（ランキング上部）",
  "expected_delta": "ランキング冒頭に集約早見表を追加し、比較観点の定量性を強化"
}
```

### diff #12 — meta:title

- change_type: `update_title`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: medium

**content_before**
```html
<title>カードローンのおすすめはどこ？人気10社を徹底比較【2026年】</title>
```

**content_after**
```html
<title>カードローンおすすめ10社比較【2026年最新】金利・即日融資・無利息期間を徹底解説</title>
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
      "target_query「即日融資 カードローン 金利 比較」の主要キーワードをタイトルに含める"
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
  "intent_dimension": "検索意図との一致",
  "expected_delta": "「金利」「即日融資」「比較」をタイトルに含めることでCTR向上・クエリとの関連性強化"
}
```

### diff #13 — meta:description

- change_type: `update_meta_description`
- change_category: `title`
- risk_flag: `title_change`
- llm_confidence: medium

**content_before**: (null)

**content_after**
```html
<meta name="description" content="2026年最新のカードローンおすすめ10社を金利・即日融資・無利息期間・審査スピードで徹底比較。プロミス（年2.5%〜18.0%・最短3分）、アコム（年2.4%〜17.9%・最短20分）など消費者金融と銀行カードローンの違いを一覧表で解説。即日融資の条件や申込カットオフ時刻も詳しく紹介します。" />
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
      "金利数値は公式情報に基づく",
      "「最短」には審査状況による旨を本文で担保"
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
  "intent_dimension": "CTR・検索意図マッチ",
  "expected_delta": "meta descriptionにtarget_queryの主要キーワードを含めCTR向上を期待"
}
```

### diff #14 — h3#審査基準と申込条件を理解する

- change_type: `rewrite_paragraph`
- change_category: `compliance_update`
- risk_flag: `regulation_citation`
- llm_confidence: medium

**content_before**
```html
<h3>審査基準と申込条件を理解する</h3>
```

**content_after**
```html
<h3>審査基準と申込条件を理解する</h3>
<p>カードローンの審査では、主に①返済能力（収入・雇用形態）、②信用情報（他社借入・延滞履歴）、③申込内容の整合性、の3点が確認されます。各社独自の審査基準があるため、一社で審査が通らなかった場合でも他社で異なる結果になることがあります。</p>
<p>主要各社の申込条件（年齢・収入要件）は以下の通りです。</p>
<ul>
  <li><strong>プロミス</strong>：18〜74歳・安定した収入のある方（高校生除く）</li>
  <li><strong>アコム</strong>：20歳以上・安定した収入と返済能力を有する方</li>
  <li><strong>アイフル</strong>：20歳以上・安定した収入のある方</li>
  <li><strong>SMBCモビット</strong>：20〜74歳・安定した定期収入がある方</li>
  <li><strong>銀行カードローン各社</strong>：原則20歳以上（銀行により異なる）</li>
</ul>
<p>消費者金融は貸金業法に基づく総量規制（年収の3分の1超の借入不可）の対象です。銀行カードローンは総量規制の対象外ですが、自主規制により過剰融資防止策を講じています。</p>
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
      "審査基準を正確に説明",
      "禁止表現（審査が甘い等）を含めない",
      "総量規制を正確に記載"
    ],
    "annotations_added": []
  },
  "evidence_refs": [
    "貸金業法"
  ],
  "policy_index": 0
}
```

**estimated_impact**
```json
{
  "intent_dimension": "審査・条件確認",
  "expected_delta": "申込条件の定量情報を補強し、ユーザーの意思決定を支援"
}
```

### diff #15 — h3#無利息期間があるカードローン一覧

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
<p>無利息期間とは、借入後一定期間は利息が発生しないサービスです。ただし、無利息期間は<strong>初めて利用する方のみ</strong>を対象としている場合がほとんどです。また、無利息期間を超えた分については通常金利が適用されます。</p>
<table>
  <thead>
    <tr>
      <th>会社名</th>
      <th>無利息期間</th>
      <th>適用条件</th>
      <th>起算日</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>プロミス</td>
      <td>初回利用翌日から最大30日間</td>
      <td>メールアドレス登録・Web明細登録が必要</td>
      <td>初回借入翌日</td>
    </tr>
    <tr>
      <td>アコム</td>
      <td>初めての方は契約翌日から最大30日間無利息</td>
      <td>アコムでの初めての契約</td>
      <td>契約翌日</td>
    </tr>
    <tr>
      <td>アイフル</td>
      <td>初回最大30日間</td>
      <td>初回借入時</td>
      <td>初回借入日</td>
    </tr>
    <tr>
      <td>レイク</td>
      <td>最大365日間（条件による）または最大180日間（5万円まで）</td>
      <td>選択コースによる</td>
      <td>契約翌日</td>
    </tr>
    <tr>
      <td>ダイレクトワン</td>
      <td>初回55日間</td>
      <td>初回借入時</td>
      <td>初回借入日</td>
    </tr>
  </tbody>
</table>
<p><small>※上記は各社公式情報を基にした概要です。適用条件の詳細は各社公式サイトでご確認ください。無利息期間終了後は通常金利が適用されます。ご利用は計画的に。</small></p>
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
      "「30日間無利息」を各社正式表記（「初回利用翌日から最大30日間」「初めての方は契約翌日から最大30日間無利息」）に統一（master_rules正式表記）"
    ],
    "ymyl_requirements_met": [
      "無利息期間の適用条件・起算日を正確に明示",
      "「ご利用は計画的に」注記を付与"
    ],
    "annotations_added": [
      "各社正式表記への統一",
      "無利息期間後の金利適用注記"
    ]
  },
  "evidence_refs": [],
  "policy_index": 5
}
```

**estimated_impact**
```json
{
  "intent_dimension": "無利息期間の比較・選択",
  "expected_delta": "master_rules準拠の正式表記に統一し、ユーザーへの正確な情報提供とコンプライアンス向上を実現"
}
```