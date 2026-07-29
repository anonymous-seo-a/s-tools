'use strict';
/**
 * 出典付与ゲート (案: 2026-06-25 出典誤紐付け再設計 §9)。
 *
 * 背景 (本番 session 166 / diff 822 で確定した根本原因):
 *   - RC1: fact が pipeline を通じて source を運ばず、LLM が「フラットな競合URL束」から
 *          任意に選んでいた → 取り違えが構造的に不可避 (楽天記事に三井住友の出典)。
 *   - RC2: 一次情報を要しない一般論にも出典が付く発火条件。
 *   - RC3: 主題外競合がプールに混入 + classifyDomain が個人ブログを official 誤分類。
 *
 * 再設計の核 (真=美): 出典を LLM に書かせない。
 *   LLM は「この diff は required_additions[i] に依拠する」と rationale.bundle_refs で申告するだけ。
 *   URL/社名はサーバが「その fact の出自 source_url (Layer 0)」から決定論的にレンダリングする。
 *   → LLM が URL を選ばない以上、取り違えは発生不可能 (検証で潰すのではなく構造で消す)。
 *
 * 7プロパティ × ゲート1対1 (失敗モードの完全分割):
 *   P1 生存            G6 liveness (本モジュールは形式検証のみ。404実フェッチは段階導入)
 *   P2 社名↔URL一致     再構造 (社名を URL から導出するので構造的に成立)
 *   P3 主題一致         G3 subjectMatch (決定論)
 *   P4a C⊂F (リライト逸脱) G4 verifyEntailment (安価LLM=Haiku、fail-safe)
 *   P4b F∈U (出自実在)   G5 provenance (決定論: fact が source_url の snapshot に実在するか)
 *   P5 発火適格         G1 needsCitation (一般論には付けない)
 *   P6 権威適格         G2 authority (個人ブログ/フォーラム棄却)
 *   P7 出自整合         再構造 (source_url が出自そのもの)
 *
 * 失敗時分岐 (YMYL critical):
 *   一般論 (P5不成立)        → 出典 drop・主張は残す (held にしない)
 *   一次情報主張 + ゲート不通過 → held (裏付けの取れない数値/制度主張は無出典で出荷しない)
 */

const { extractNumbers } = require('./number-grounding');
const { classifyDomain, isPersonalBlog } = require('../competitor-corpus/collect');
const { sendMessage } = require('../../shared/llm-adapters/anthropic-adapter');

const GATE_MODEL = 'claude-haiku-4-5'; // 安価な entailment 判定に Haiku を固定 (コスト1/5・判定品質十分)

// ── 企業ブランド辞書 (G3 主題照合 / 社名レンダリング兼用) ───────────────────
// domains: そのブランドの公式/媒体ドメイン suffix。tokens: 記事主題に現れる表記。name: 出典表示名。
const BRANDS = [
  // 証券
  { domains: ['rakuten-sec.co.jp', 'rakuten-card.co.jp', 'rakuten.co.jp', 'rakuten-bank.co.jp'], tokens: ['楽天'], name: '楽天' },
  { domains: ['sbisec.co.jp', 'sbineotrade.jp', 'sbigroup.co.jp'], tokens: ['SBI', 'ＳＢＩ'], name: 'SBI証券' },
  { domains: ['monex.co.jp'], tokens: ['マネックス'], name: 'マネックス証券' },
  { domains: ['matsui.co.jp'], tokens: ['松井'], name: '松井証券' },
  { domains: ['daiwa.jp'], tokens: ['大和'], name: '大和証券' },
  { domains: ['nomura.co.jp'], tokens: ['野村'], name: '野村證券' },
  { domains: ['smbcnikko.co.jp'], tokens: ['SMBC日興', 'ＳＭＢＣ日興', '日興'], name: 'SMBC日興証券' },
  { domains: ['auone-kabu.jp'], tokens: ['auカブコム', 'カブコム'], name: 'auカブコム証券' },
  { domains: ['gmo-click.com', 'click-sec.com'], tokens: ['GMO', 'ＧＭＯ'], name: 'GMOクリック証券' },
  { domains: ['okasan-online.co.jp', 'okasan.co.jp'], tokens: ['岡三'], name: '岡三オンライン' },
  // カードローン / カード
  { domains: ['acom.co.jp'], tokens: ['アコム'], name: 'アコム' },
  { domains: ['promise.co.jp'], tokens: ['プロミス'], name: 'プロミス' },
  { domains: ['aiful.co.jp'], tokens: ['アイフル'], name: 'アイフル' },
  { domains: ['mobit.ne.jp'], tokens: ['モビット'], name: 'SMBCモビット' },
  { domains: ['smbc-card.com'], tokens: ['三井住友カード', '三井住友'], name: '三井住友カード' },
  { domains: ['smbc-cf.com'], tokens: ['SMBCコンシューマー', 'ＳＭＢＣ'], name: 'SMBCコンシューマーファイナンス' },
  { domains: ['jcb.co.jp'], tokens: ['JCB', 'ＪＣＢ'], name: 'JCB' },
  { domains: ['saisoncard.co.jp'], tokens: ['セゾン'], name: 'セゾンカード' },
];

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}
function hostMatchesSuffix(host, suffix) {
  return host === suffix || host.endsWith('.' + suffix);
}

// source_url → ブランド (既知企業のみ)。media/gov/不明は null (主題照合は中立=通過扱い)。
function brandOfUrl(url) {
  const host = hostOf(url);
  if (!host) return null;
  for (const b of BRANDS) {
    if (b.domains.some((d) => hostMatchesSuffix(host, d))) return b;
  }
  return null;
}

// 出典表示名: 既知ブランドはその社名、未知はホスト名 (www. を除去)。
function siteName(url) {
  const b = brandOfUrl(url);
  if (b) return b.name;
  const host = hostOf(url);
  return host ? host.replace(/^www\./, '') : '出典';
}

// ── G1 発火適格: 一次情報を要する主張か (一般論には出典を付けない) ──────────
// 一次情報を要するのは「具体数値」または「固有名の制度・法令」を述べる主張のみ。
// 「一般的に〜場合がある」式の傾向記述 (具体数値も固有制度名も含まない) には出典を付けない。
// 注: 「ポイント還元率」「手数料」「金利」等の一般語は単独では発火させない (数値が伴えば
//     hasConcreteNumber が拾う)。固有名の制度/法令だけを発火キーにすることで一般論を除外する。
const INSTITUTION_RE = /NISA|iDeCo|つみたて投資枠|成長投資枠|確定拠出年金|貸金業法|出資法|個人情報保護法|総量規制|預金保険|信用情報機関|指定信用情報|犯罪収益移転防止|資金決済法|金融商品取引法/;
// 数値があっても 1〜2 桁単独 (数詞) はノイズ → number-grounding の extractNumbers と同基準。
function hasConcreteNumber(text) {
  return extractNumbers(text).length > 0;
}
function needsCitation(claimText) {
  const t = claimText || '';
  return hasConcreteNumber(t) || INSTITUTION_RE.test(t);
}

// ── G2 権威適格: 個人ブログ/フォーラムは一次情報源として棄却 ───────────────
function authorityOk(url) {
  return !isPersonalBlog(url) && classifyDomain(url) !== 'blog';
}

// ── G3 主題照合: 出典ブランドが記事主題と一致するか (決定論) ────────────────
// 既知ブランドの source で、そのブランド表記が主題文脈に一切現れなければ主題外 = 棄却。
// (例: 楽天記事の文脈に「三井住友」が皆無 → smbc-card.com は主題外)。
// media/gov/不明ドメインは中立 → 通過 (G4 の意味検証に委ねる)。
function subjectMatch(url, contextText) {
  const b = brandOfUrl(url);
  if (!b) return { ok: true, neutral: true };
  const ctx = contextText || '';
  const hit = b.tokens.some((tok) => ctx.includes(tok));
  return { ok: hit, neutral: false, brand: b.name };
}

// ── G5 出自整合: fact が source_url の snapshot に実在するか (決定論) ──────────
// Layer 0 で source_url は「その fact を持つ競合」に固定済 → 通常 true。
// plumbing バグで出自がズレた場合のみ false。factInSource は diff-runner が供給。
function provenanceOk(factText, sourceUrl, factInSource) {
  if (typeof factInSource !== 'function') return true; // チェック手段が無ければ通過 (Layer 0 を信頼)
  return factInSource(factText, sourceUrl);
}

// ── 出典 blockquote レンダリング (既存フォーマット踏襲) ──────────────────────
function renderCitation(url) {
  return `<!-- wp:quote -->
<blockquote class="wp-block-quote"><!-- wp:paragraph -->
<p><a href="${url}" target="_blank" rel="noopener">出典: ${siteName(url)}</a></p>
<!-- /wp:paragraph --></blockquote>
<!-- /wp:quote -->`;
}

// ── LLM が content_after に書いてしまった出典/URLを除去 (再構造の強制) ────────
// LLM には出典を書かせない方針だが、命令無視への決定論ガード。
// 出典を含む wp:quote ブロック / blockquote / 出典リンク / プレーン出典表記を剥がす。
function stripInlineCitations(html) {
  if (!html || typeof html !== 'string') return html;
  let out = html;
  // 出典を含む wp:quote ブロック (コメント区切りごと)
  out = out.replace(/<!--\s*wp:quote\s*-->[\s\S]*?出典[\s\S]*?<!--\s*\/wp:quote\s*-->\s*/g, '');
  // 裸の blockquote (出典入り)
  out = out.replace(/<blockquote[^>]*>[\s\S]*?出典[\s\S]*?<\/blockquote>\s*/g, '');
  // 出典リンク単体
  out = out.replace(/<a\b[^>]*>\s*出典[\s\S]*?<\/a>/g, '');
  return out.trim();
}

// ── G4 claim↔fact entailment (安価LLM=Haiku、バッチ1回、fail-safe) ───────────
const ENTAIL_SYSTEM = `あなたはYMYL記事の出典検証者。各項目は「本文の主張(claim)」と「出典元の事実(fact)」のペア。
claim が fact の範囲内で裏付けられているか判定する。
- 裏付けられる = fact が claim の内容を支持し、claim が fact を超えた過度な一般化・断定・極性反転をしていない。
- 裏付けられない = claim が fact に無い数値/対象/条件を述べる、fact と矛盾する、fact より強い断定をする。
判断に迷う場合は「裏付けられない (false)」に倒す (安全側)。
出力はJSONのみ: {"results":[{"i":<番号>,"entailed":<true|false>}]}`;

// @param {Array<{claim, fact}>} pairs
// @returns {{ entailedMap: Map<index, boolean>, usage }}
async function verifyEntailment(pairs) {
  if (!pairs || pairs.length === 0) return { entailedMap: new Map(), usage: null };
  const user = `# 検証対象 (各 i について claim が fact で裏付けられるか)\n${pairs.map((p, i) =>
    `[${i}]\n  claim: ${p.claim}\n  fact: ${p.fact}`
  ).join('\n\n')}\n\n各 i の entailed を上記スキーマJSONで返せ。`;
  const entailedMap = new Map();
  let usage = null;
  try {
    const res = await sendMessage({ model: GATE_MODEL, system: ENTAIL_SYSTEM, user, maxTokens: 1024 });
    usage = res.usage;
    let t = (res.text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const s = t.indexOf('{'); const e = t.lastIndexOf('}');
    if (s >= 0 && e > s) t = t.slice(s, e + 1);
    const results = JSON.parse(t).results || [];
    for (const r of results) {
      if (Number.isInteger(r.i)) entailedMap.set(r.i, r.entailed === true);
    }
    // 応答に無い i は安全側 = false
    for (let i = 0; i < pairs.length; i++) if (!entailedMap.has(i)) entailedMap.set(i, false);
  } catch (err) {
    console.warn(`[verifyEntailment] 失敗 (安全側で全 false): ${err.message}`);
    for (let i = 0; i < pairs.length; i++) entailedMap.set(i, false);
  }
  return { entailedMap, usage };
}

/**
 * diff 群に対し出典付与ゲートを適用する。
 *
 * @param {object} args
 * @param {Array} args.diffs                 accepted diffs (各 d は content_after, rationale を持つ)
 * @param {Array<{text, source_url}>} args.requiredAdditions  bundle.required_additions (Layer 0 で source_url 付き)
 * @param {string} args.subjectText          記事主題文脈 (target_query + title 等。G3 用)
 * @param {Function} [args.factInSource]     (factText, sourceUrl) => bool  G5 用 (省略可)
 * @returns {{ results: Array, usage }}  results[i] = { content_after, hold, holdReasons, cited, dropped }
 */
async function gateDiffCitations({ diffs, requiredAdditions, subjectText, factInSource }) {
  const ras = Array.isArray(requiredAdditions) ? requiredAdditions : [];
  const perDiff = diffs.map((d) => ({
    content_after: stripInlineCitations(d.content_after),
    hold: false,
    holdReasons: [],
    cited: [],   // 付与した出典 URL
    dropped: [], // ドロップ理由 (一般論等、held にしない)
  }));

  // 1) 決定論ゲート (G1/G2/G3/G5) を通し、G4 (LLM) 候補を収集。
  const entailCandidates = []; // { pi(diff index), url, factText }
  diffs.forEach((d, pi) => {
    let refIdxs = [];
    try {
      const r = typeof d.rationale === 'string' ? JSON.parse(d.rationale) : d.rationale;
      refIdxs = (r && r.bundle_refs && Array.isArray(r.bundle_refs.required_additions))
        ? r.bundle_refs.required_additions : [];
    } catch { refIdxs = []; }
    const claimText = textOf(perDiff[pi].content_after);
    const seenUrls = new Set();
    for (const idx of refIdxs) {
      const ra = ras[idx];
      if (!ra || !ra.source_url) continue;          // 出自URLが無い fact は出典化しない
      if (seenUrls.has(ra.source_url)) continue;
      seenUrls.add(ra.source_url);
      // G1 発火適格: 一般論 → 出典なし (主張は残す。held にしない)
      if (!needsCitation(claimText)) { perDiff[pi].dropped.push(`一般論:${idx}`); continue; }
      // G2 権威適格
      if (!authorityOk(ra.source_url)) { perDiff[pi].hold = true; perDiff[pi].holdReasons.push(`権威不適格:${hostOf(ra.source_url)}`); continue; }
      // G3 主題照合
      const sm = subjectMatch(ra.source_url, `${subjectText || ''} ${claimText} ${ra.text || ''}`);
      if (!sm.ok) { perDiff[pi].hold = true; perDiff[pi].holdReasons.push(`主題外出典:${sm.brand}`); continue; }
      // G5 出自整合
      if (!provenanceOk(ra.text, ra.source_url, factInSource)) { perDiff[pi].hold = true; perDiff[pi].holdReasons.push(`出自不整合:${idx}`); continue; }
      // → G4 (意味検証) 候補へ
      entailCandidates.push({ pi, url: ra.source_url, factText: ra.text, claim: claimText });
    }
  });

  // 2) G4 claim↔fact entailment を一括検証。
  const { entailedMap, usage } = await verifyEntailment(
    entailCandidates.map((c) => ({ claim: c.claim, fact: c.factText }))
  );

  // 3) 結果反映: 通過 → 出典付与、不通過 → held (一次情報主張)。
  entailCandidates.forEach((c, i) => {
    const pd = perDiff[c.pi];
    if (entailedMap.get(i)) {
      pd.content_after = `${pd.content_after}\n\n${renderCitation(c.url)}`;
      pd.cited.push(c.url);
    } else {
      pd.hold = true;
      pd.holdReasons.push(`裏付け不一致:${hostOf(c.url)}`);
    }
  });

  return { results: perDiff, usage };
}

// HTML からプレーンテキスト抽出 (タグ除去)。G1/G4 の判定対象本文。
function textOf(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  gateDiffCitations,
  needsCitation,
  authorityOk,
  subjectMatch,
  provenanceOk,
  renderCitation,
  stripInlineCitations,
  siteName,
  brandOfUrl,
  verifyEntailment,
  textOf,
  GATE_MODEL,
  BRANDS,
};
