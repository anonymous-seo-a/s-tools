'use strict';
/**
 * 空テンプレBOX 補完 (工程: 検出済みBOXに中身を生成して埋める)。
 *
 * 入力: detectEmptyTitleBoxes() の結果 + 記事タイトル。
 * 1回の LLM 呼び出しで記事内の全空BOXを一括生成 (JSON in/out)。
 * 出力: 各BOXに fillHtml(ul/table) と filledMarkup(中身入りBOX) を付与し、apply 用 ops を構築。
 *
 * YMYL: 揮発する具体数値(現在価格/当日値/時点件数)は生成しない。直後本文の要約を主とし、
 *       本文に無い数値を創作しない。
 */

const cheerio = require('cheerio');
const { sonnet } = require('../../shared/llm-adapters/anthropic-adapter');
const db = require('../db');
const { detectEmptyTitleBoxes } = require('../apply/empty-box-detector');
const { checkGrounding } = require('./number-grounding');

const SYSTEM_PROMPT = `あなたは YMYL 記事の「空のテンプレБOX」を埋める編集者。
各BOXは見出しラベル(例:「楽天証券の特徴」「料金体系」)だけで中身が空。ラベルと「直後の本文」を元に、
および「確認済みfact一覧」を元に、BOXに入れる中身を生成する。出力は JSON のみ。

# ルール
- format='list': <ul><li>…</li></ul> を生成 (3〜6項目、各項目は簡潔1行)。要点を箇条書きに構造化する。
  料金体系なら「50万円以下：無料」「100万円まで：1,100円」のように各段階を1項目で列挙する。
- format='table': <table> を生成 (2項目以上の対比=比較/違いを行で表現)。
- ラベルの語義・スコープに厳密: 「メリット」には利点のみ、「デメリット」には欠点のみ。
  「ボックスレートの料金体系」なら料金段階のみ (他制度の手数料特典は入れない)。ラベルの主題から外れる項目を足さない。
- **極性の厳守 (最重要)**: ラベルが「〜のメリット」なら利点だけを書く。直後本文に欠点・注意点・
  リスク・コスト・「ただし〜」「〜できない」「〜には不利」等の不利益情報があっても、メリットBOXには
  絶対に入れない。「〜のデメリット」ならその逆で、利点を入れない。
  - 悪い例 (メリットBOXに欠点が混入・禁止): 「為替ヘッジには年1〜2%のコストがかかる」
  - 良い例 (メリットBOXは利点のみ): 「為替変動の影響を抑え、金価格の動きに集中して投資できる」
  - 不利益情報を反転して利点に言い換えることもしない (例:「コストがかかる」→「コストは低い」等の捏造)。
    利点が直後本文に無ければ無理に作らず、確実な利点だけを列挙する。
- **具体数値(金額/利率/件数/段階)は『fact一覧』または『直後本文』に明記された値のみ使う**。
  そこに無い数値は絶対に創作しない (YMYL: 誤った金額は重大事故)。
- 揮発情報(現在価格・時価・当日の市況・「2026年X月時点で◯件」等)は入れない。普遍的な特徴/制度/分類のみ。
- 誇大表現・断定的おすすめ表現を入れない (YMYL)。
- 既存本文と全く同じ文を繰り返さない (要約・構造化する)。中身が作れない場合は html を空文字にする。

# 出力スキーマ (JSON のみ、コードフェンス不要)
{ "fills": [ { "index": 0, "html": "<ul><li>…</li></ul>" }, ... ] }`;

function buildUserPrompt({ title, boxes, facts }) {
  const items = boxes.map((b, i) => ({
    index: i,
    label: b.label,
    format: b.format,
    context: b.contextText || '',
  }));
  const factLines = (facts || []).map((f) => `- ${f.content}`).join('\n');
  return `# 記事タイトル
${title}

# 確認済み fact 一覧 (具体数値はここ or context にある値のみ使用可)
${factLines || '(なし)'}

# 空BOX一覧 (各BOXの label と format に従い、fact/context を構造化して中身を作る)
${JSON.stringify(items, null, 2)}

# 指示
各BOXの中身を生成し、上記スキーマの JSON で返せ。
fact にも context にも根拠が無く中身を作れないBOXは html を "" にする。`;
}

function parseFills(text) {
  let t = (text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const s = t.indexOf('{'); const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  const obj = JSON.parse(t);
  return Array.isArray(obj.fills) ? obj.fills : [];
}

// 生成された ul/table に house style の inline style を付ける
function styleFill(html) {
  if (!html || !html.trim()) return '';
  const $ = cheerio.load(html, { decodeEntities: false });
  $('ul, ol').each((_, el) => { if (!$(el).attr('style')) $(el).attr('style', 'padding-left:20px; margin:8px 0 0 0; line-height:1.8;'); });
  $('table').each((_, el) => { if (!$(el).attr('style')) $(el).attr('style', 'width:100%; border-collapse:collapse; margin:8px 0 0 0;'); });
  $('th, td').each((_, el) => { if (!$(el).attr('style')) $(el).attr('style', 'border:1px solid #ddd; padding:6px 8px; text-align:left;'); });
  const body = $('body').length ? $('body').html() : $.html();
  return (body || '').trim();
}

function rebuildBox(box, fillHtml) {
  const styled = styleFill(fillHtml);
  if (!styled) return null; // 中身が作れなければ埋めない
  const style = box.divStyle ? ` style="${box.divStyle}"` : '';
  return `<!-- wp:html -->\n<div${style}>\n${box.labelHtml}\n${styled}\n</div>\n<!-- /wp:html -->`;
}

/**
 * @returns {Array<{...box, fillHtml, filledMarkup}>}  (中身が作れた BOX のみ)
 */
// 生成HTMLの <li> テキスト配列 (li が無ければプレーンテキスト1要素)
function liTexts(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const items = $('li').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  return items.length ? items : [$.root().text().replace(/\s+/g, ' ').trim()].filter(Boolean);
}

// ラベルの極性: 'merit' | 'demerit' | null (メリット・デメリット混在BOXは null=対象外)
function labelPolarity(label) {
  const l = (label || '').replace(/\s+/g, '');
  if (l.endsWith('メリット・デメリット')) return null;
  if (l.endsWith('デメリット')) return 'demerit';
  if (l.endsWith('メリット')) return 'merit';
  return null;
}

const POLARITY_SYSTEM = `あなたはYMYL記事の校正者。各BOXは「メリット」か「デメリット」のラベルを持つ。
各項目がラベルの方向と一致するか判定する。
- meritBOX: 利点・長所のみが正。欠点・注意点・リスク・コスト発生・「〜できない」「〜に不利」「ただし〜」等の不利益情報は逆方向。
- demeritBOX: 欠点・注意点のみが正。利点・長所は逆方向。
逆方向の項目だけを badItems に挙げる。判断に迷う中立項目(対象者の説明等)は badItemsに入れない。
出力はJSONのみ: {"leaks":[{"box":<番号>,"badItems":[<項目index>,...]}]}`;

// メリット/デメリットBOX の極性混入を意味的に検証 (該当BOXのみ・1回呼び出し)。
// @returns {Map<filledIndex, boolean>} polarityLeak
async function verifyPolarity(filled) {
  const targets = [];
  filled.forEach((b, i) => {
    const pol = labelPolarity(b.label);
    if (pol) targets.push({ i, pol, label: b.label, items: liTexts(b.fillHtml) });
  });
  const leakMap = new Map();
  if (targets.length === 0) return { leakMap, usage: null };
  const user = `# 検証対象BOX\n${targets.map((t, n) =>
    `box ${n} (${t.pol === 'merit' ? 'メリット' : 'デメリット'}BOX「${t.label}」):\n` +
    t.items.map((it, k) => `  [${k}] ${it}`).join('\n')
  ).join('\n\n')}\n\n各boxの逆方向項目のindexを上記スキーマJSONで返せ。`;
  let usage = null;
  try {
    const res = await sonnet({ system: POLARITY_SYSTEM, user, maxTokens: 1024 });
    usage = res.usage;
    let t = (res.text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const s = t.indexOf('{'); const e = t.lastIndexOf('}');
    if (s >= 0 && e > s) t = t.slice(s, e + 1);
    const leaks = JSON.parse(t).leaks || [];
    for (const lk of leaks) {
      const tgt = targets[lk.box];
      if (tgt && Array.isArray(lk.badItems) && lk.badItems.length > 0) leakMap.set(tgt.i, true);
    }
  } catch (e) {
    // 検証失敗時は安全側 = 全極性BOXを leak 扱い (held に倒す)
    console.warn(`[verifyPolarity] 失敗 (安全側で held): ${e.message}`);
    for (const t of targets) leakMap.set(t.i, true);
  }
  return { leakMap, usage };
}

async function fillEmptyBoxes({ title, boxes, facts }) {
  if (!boxes || boxes.length === 0) return { filled: [], usage: null };
  const res = await sonnet({ system: SYSTEM_PROMPT, user: buildUserPrompt({ title, boxes, facts }), maxTokens: 4096 });
  let fills;
  try { fills = parseFills(res.text); } catch (e) { throw new Error(`empty-box fill JSON parse 失敗: ${e.message}`); }
  const byIndex = new Map(fills.map((f) => [f.index, f.html]));
  const factTexts = (facts || []).map((f) => f.content);
  const filled = [];
  boxes.forEach((box, i) => {
    const html = byIndex.get(i);
    const filledMarkup = html ? rebuildBox(box, html) : null;
    if (!filledMarkup) return;
    // 施策1: 数値 grounding (context + fact を根拠に創作数値を検出)
    const grounding = checkGrounding(cheerio.load(html, { decodeEntities: false }).text(), [box.contextText || '', ...factTexts]);
    filled.push({ ...box, fillHtml: html, filledMarkup, grounding, polarityLeak: false });
  });
  // 極性: メリット/デメリットBOX のみ意味的検証
  const pv = await verifyPolarity(filled);
  const leakMap = pv.leakMap || new Map();
  filled.forEach((b, i) => { if (leakMap.get(i)) b.polarityLeak = true; });
  const usage = res.usage;
  return { filled, usage, polarityUsage: pv.usage };
}

// apply 用 ops (raw オフセット置換)。rewrite diff ops と一緒に applyGutenbergOps へ。
function buildBoxFillOps(filledBoxes) {
  return filledBoxes.map((b) => ({ diff_id: `box:${b.start}`, start: b.start, end: b.end, markup: b.filledMarkup }));
}

async function fetchWpRawTitle(postId) {
  const raw = (process.env.WP_API_BASE_URL || '').replace(/\/$/, '');
  const apiRoot = /\/wp-json\/wp\/v\d+/.test(raw) ? raw : `${raw}/wp-json/wp/v2`;
  const auth = Buffer.from(`${process.env.WP_API_USERNAME}:${process.env.WP_API_APP_PASSWORD}`).toString('base64');
  const res = await fetch(`${apiRoot}/posts/${postId}?context=edit&_fields=title,content`, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WP REST ${res.status} for post ${postId}`);
  const p = await res.json();
  return { raw: p.content?.raw || '', title: p.title?.raw || p.title?.rendered || '' };
}

/**
 * 生成パイプラインの一段: セッションの記事から空タイトルBOXを検出し、fact を元に中身を生成して
 * fill_empty_box diff として master_rewrite_diff に挿入する。判定/自動承認フローに乗る。
 * @returns {{ detected:number, filled:number, usage }}
 */
async function runBoxFill({ session_id }) {
  if (!Number.isInteger(session_id)) throw new Error('runBoxFill: session_id required');
  const conn = db.open();
  const session = conn.prepare('SELECT id, post_id FROM master_rewrite_session WHERE id=?').get(session_id);
  if (!session) throw new Error(`session ${session_id} not found`);

  const { raw, title } = await fetchWpRawTitle(session.post_id);
  const boxes = detectEmptyTitleBoxes(raw);
  if (boxes.length === 0) return { detected: 0, filled: 0, usage: null };

  const facts = conn.prepare('SELECT content, source_url FROM master_fact_set WHERE post_id=? ORDER BY layer').all(session.post_id);
  const { filled, usage } = await fillEmptyBoxes({ title, boxes, facts });
  if (filled.length === 0) return { detected: boxes.length, filled: 0, usage };

  const maxOrder = conn.prepare('SELECT COALESCE(MAX(diff_order),0) m FROM master_rewrite_diff WHERE session_id=?').get(session_id).m;
  const ins = conn.prepare(
    `INSERT INTO master_rewrite_diff
       (session_id, diff_order, target_section, change_type, change_category,
        content_before, content_after, rationale, llm_confidence, risk_flag)
     VALUES (?, ?, ?, 'fill_empty_box', 'other', ?, ?, ?, ?, NULL)`
  );
  let held = 0;
  const tx = conn.transaction((rows) => {
    rows.forEach((b, i) => {
      // 施策1+極性: 創作数値あり or 極性混入 → confidence='low' で自動承認から除外(held)。
      //   clean は 'high' のまま自動承認対象を維持。compliance(誇大/優良誤認)は step6 で別途付与。
      const ungrounded = b.grounding ? b.grounding.ungrounded : [];
      const reasons = [];
      if (ungrounded.length) reasons.push(`創作疑い数値:${ungrounded.join(',')}`);
      if (b.polarityLeak) reasons.push('極性混入(メリ/デメ)');
      const confidence = reasons.length ? 'low' : 'high';
      if (reasons.length) held++;
      const rationale = JSON.stringify({
        primary_source: 'empty_box_fill',
        box_label: b.label,
        format: b.format,
        grounding_ungrounded: ungrounded,
        polarity_leak: !!b.polarityLeak,
        auto_hold_reasons: reasons,
      });
      ins.run(session_id, maxOrder + i + 1, `box:${b.label}`, b.boxMarkup, b.filledMarkup, rationale, confidence);
    });
  });
  tx(filled);
  return { detected: boxes.length, filled: filled.length, held, usage };
}

module.exports = { fillEmptyBoxes, buildBoxFillOps, runBoxFill, SYSTEM_PROMPT, verifyPolarity, labelPolarity };
