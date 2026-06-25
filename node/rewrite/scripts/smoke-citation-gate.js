'use strict';
/**
 * citation-gate 決定論部の smoke test (LLM/DB 不要)。
 * 本番 session 166 / diff 822 の「楽天記事に三井住友の出典」バグを再現し、修正を検証する。
 *   node rewrite/scripts/smoke-citation-gate.js
 */
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'dummy-for-smoke';

const {
  needsCitation, authorityOk, subjectMatch, stripInlineCitations,
  brandOfUrl, siteName, renderCitation, provenanceOk,
} = require('../llm-execution/citation-gate');
const { classifyDomain } = require('../competitor-corpus/collect');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

// 実データ (diff 822)
const GOLD_CLAIM = '一般的に、ゴールドカードやブラックカードは一般カードに比べてポイント還元率が高く設定される場合があります。上位グレードへステップアップするかどうかは、年会費と還元率のバランスや、コンシェルジュ・ラウンジといった付帯サービスを使う頻度を踏まえて判断するとよいでしょう。';
const SMBC = 'https://www.smbc-card.com/nyukai/magazine/status-card/goldcard-invitation.jsp';
const RAKUTEN = 'https://www.rakuten-card.co.jp/minna-money/credit-card/knowledge/article_2308_80297';
const PLAZA = 'https://plaza.rakuten.co.jp/rocca1/diary/202308010000';
const SUBJECT = '楽天カード ゴールド 招待 | 楽天ゴールドカードの招待・インビテーション';

console.log('# G1 発火適格 (一般論には出典を付けない)');
ok('ゴールドカード一般論 → 出典不要', needsCitation(GOLD_CLAIM) === false);
ok('数値主張 (還元率0.75%) → 出典必要', needsCitation('楽天ゴールドカードのポイント還元率は0.75%です') === true);
ok('制度名 (NISA) → 出典必要', needsCitation('NISA口座は1人1口座しか開設できません') === true);
ok('一般語のみ (手数料は会社で異なる) → 不要', needsCitation('手数料は会社によって異なります') === false);

console.log('# G2 権威適格 (個人ブログ棄却)');
ok('plaza.rakuten (個人ブログ) → blog 分類', classifyDomain(PLAZA) === 'blog');
ok('plaza.rakuten → authority NG', authorityOk(PLAZA) === false);
ok('rakuten-card → authority OK', authorityOk(RAKUTEN) === true);

console.log('# G3 主題照合 (楽天記事に三井住友は主題外)');
ok('smbc-card を楽天記事に → 主題外で棄却', subjectMatch(SMBC, `${SUBJECT} ${GOLD_CLAIM}`).ok === false);
ok('rakuten-card を楽天記事に → 通過', subjectMatch(RAKUTEN, `${SUBJECT} ${GOLD_CLAIM}`).ok === true);
ok('media/不明ドメインは中立通過', subjectMatch('https://example-media.com/x', SUBJECT).ok === true);

console.log('# 社名レンダリング');
ok('smbc-card → 三井住友カード', siteName(SMBC) === '三井住友カード');
ok('rakuten-card → 楽天', siteName(RAKUTEN) === '楽天');
ok('renderCitation に URL と社名', renderCitation(RAKUTEN).includes(RAKUTEN) && renderCitation(RAKUTEN).includes('出典: 楽天'));

console.log('# inline 出典の除去 (再構造の強制)');
const withInline = `<!-- wp:paragraph --><p>本文</p><!-- /wp:paragraph -->\n<!-- wp:quote --><blockquote class="wp-block-quote"><!-- wp:paragraph --><p><a href="${SMBC}" target="_blank" rel="noopener">出典: 三井住友カード</a></p><!-- /wp:paragraph --></blockquote>\n<!-- /wp:quote -->`;
const stripped = stripInlineCitations(withInline);
ok('LLM が書いた smbc 出典ブロックを除去', !stripped.includes('smbc-card.com') && !stripped.includes('出典') && stripped.includes('本文'));

console.log('# G5 出自整合 (決定論)');
const factInSource = (f, u) => f === 'fact A' && u === RAKUTEN;
ok('出自一致 → OK', provenanceOk('fact A', RAKUTEN, factInSource) === true);
ok('出自不一致 → NG', provenanceOk('fact A', SMBC, factInSource) === false);
ok('チェック手段なし → Layer0信頼で通過', provenanceOk('fact A', SMBC, undefined) === true);

console.log(`\n結果: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
