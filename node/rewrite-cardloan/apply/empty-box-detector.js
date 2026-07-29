'use strict';
/**
 * 空テンプレBOX 検出 (決定論)。
 *
 * 対象 = 「体言止めタイトル(特徴/違い/メリット/料金体系 等)」ラベル + 本体が空のBOX のみ。
 * 一文ポイントBOX (「郵送物なしで契約できる」等) は対象外 (誤検出ゼロを優先した保守判定)。
 *
 * 返り値: 各BOXの { label, format, start, end, boxMarkup, labelHtml, divOpen, contextText }
 *   start/end = content.raw 中の <!-- wp:html --> ブロックのオフセット (apply の置換キー)
 *   format    = 'table' | 'list' (ラベル末尾で判定。料金体系/比較/違い→table、特徴/メリット等→list)
 *   contextText = BOX 直後の本文 (次の見出し/BOX まで)。要約生成の入力。
 */

const cheerio = require('cheerio');

const TITLE_ENDINGS = [
  '特徴', '違い', 'メリット', 'デメリット', '料金体系', '料金表', '手数料体系',
  '比較', '一覧', 'まとめ', 'ポイント', '種類', '手順', '流れ', '早見表',
  'ランキング', 'チェックリスト', '注意点', '条件', '基準', '仕組み', '概要',
  'スペック', '内訳', '対応表', 'メリット・デメリット',
  // recall 監査(2026-06-25)で取りこぼしが判明した体言止め末尾を追加。
  // callout化しやすい 率/水準/リスク 等は足さない (precision 防御を維持)。
  '項目', '対策', '方法', '機能', 'ツール', '要件', '限度額', '優遇', '使い分け',
  // 2026-06-26 securities/8735: デメリット下の「対処法」boxが空のまま残存。
  // 「対処方法」は既存「方法」で拾えるが「対処法」(末尾=法)は未捕捉だった。
  '対処法',
];
// table 形式 = 2項目以上の対比 (比較/違い/対応表/早見表)。
// 料金体系/料金表/手数料体系/一覧 は soico の house style では箇条書き (Daiki 指定)。
const TABLE_ENDINGS = ['比較', '違い', '対応表', '早見表'];
const SENTENCE_END = /(です|ます|ません|でした|ない|だ|た|る|い|ね|よ|か|。|！|？|\?|!|でしょう|ください|ましょう|できる|できます|あります|なります|されます|可能|不可|無料|注意|推奨)\s*$/;

const jaLen = (s) => (s || '').replace(/\s+/g, '').length;

// 「中身が抜けるテンプレBOX」の固定タグ署名 (Daiki 指摘 2026-06-26: ドロップするboxの
// タグは毎回同じ)。securities 実記事で空BOXは全てこの黄色callout署名を持ち、
// #eef6fb(概要カード)/#007BFF(青ヘッダ)等の充填済box とは署名で峻別できる。
// ラベル語彙(TITLE_ENDINGS)に依存せず構造で捕捉する主シグナル。
const TEMPLATE_SIGNATURE_RE = /background-color:\s*#fffbe6|border-left:\s*\d+px\s+solid\s+#f5a623/i;

function classifyFormat(label) {
  return TABLE_ENDINGS.some((t) => label.endsWith(t)) ? 'table' : 'list';
}

// raw 中の全 <!-- wp:html -->…<!-- /wp:html --> をオフセット付きで列挙
function* iterHtmlBlocks(raw) {
  const re = /<!--\s*wp:html\s*-->([\s\S]*?)<!--\s*\/wp:html\s*-->/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    yield { start: m.index, end: m.index + m[0].length, inner: m[1], full: m[0] };
  }
}

// BOX 直後の本文テキスト (次の heading / html / block ref まで) を抜く
function followingContext(raw, endOffset, maxChars = 600) {
  const after = raw.slice(endOffset, endOffset + 3000);
  const stop = after.search(/<!--\s*wp:(heading|html|block)\b/);
  const seg = stop >= 0 ? after.slice(0, stop) : after;
  const $ = cheerio.load(seg);
  return $.text().replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

// BOX 直前の本文テキスト (直前の heading or 別 box から BOX まで) を抜く。
// 「○○の特徴」箱がセクション末尾に置かれる場合 (直後が見出し=followingが空) に、
// 箱が要約すべき本文は直前にあるため、こちらを文脈に使う。
function precedingContext(raw, startOffset, maxChars = 600) {
  const before = raw.slice(Math.max(0, startOffset - 3000), startOffset);
  const hPos = before.lastIndexOf('<!-- wp:heading');
  const closeTag = '<!-- /wp:html -->';
  const hClosePos = before.lastIndexOf(closeTag);
  const cut = Math.max(hPos, hClosePos >= 0 ? hClosePos + closeTag.length : -1);
  const seg = cut >= 0 ? before.slice(cut) : before;
  const $ = cheerio.load(seg);
  return $.text().replace(/\s+/g, ' ').trim().slice(-maxChars); // 箱に近い末尾側を優先
}

// BOX が属するセクションの本文 = 後方 + 前方 (箱が先頭/末尾どちらに置かれても拾う)
function sectionContext(raw, startOffset, endOffset) {
  const following = followingContext(raw, endOffset);
  const preceding = precedingContext(raw, startOffset);
  // 後方を主、無ければ前方。両方あれば結合 (中間配置の箱も網羅)。
  const combined = [following, preceding].filter((s) => s && s.length > 0).join(' ');
  return combined.slice(0, 800);
}

function detectEmptyTitleBoxes(raw) {
  if (typeof raw !== 'string' || !raw) return [];
  const out = [];
  for (const blk of iterHtmlBlocks(raw)) {
    const $ = cheerio.load(blk.inner);
    const div = $('div').first();
    if (!div.length) continue;
    const style = (div.attr('style') || '') + ' ' + (div.attr('class') || '');
    if (!/border|background|box-/.test(style)) continue;

    const labelEl = $('p, strong, b, h1, h2, h3, h4, h5, h6').first();
    const label = labelEl.text().replace(/\s+/g, ' ').trim();
    if (!label) continue;

    const hasMedia = div.find('table, ul, ol, img').length > 0;
    const bodyLen = jaLen(div.text()) - jaLen(label);
    if (hasMedia || bodyLen >= 8) continue;

    const clean = label.replace(/[　\s]+$/, '');
    // 捕捉条件は「固定タグ署名」を主とし、語彙(TITLE_ENDINGS)は genre 横断の補助とする。
    // どちらかが positive なら候補 (例: 「対処法」「使い分けの具体例」は語彙に無いが署名で捕捉)。
    const sigMatch = TEMPLATE_SIGNATURE_RE.test(div.attr('style') || '');
    const endsTitle = TITLE_ENDINGS.some((t) => clean.endsWith(t));
    // 精度ガード: 体言止めでなく文(節助詞/句読点/文末/長文)に見えるものは除外 (一文ポイントBOX保護)。
    const hasClauseParticle = /[がはも]/.test(clean);
    const looksSentence = SENTENCE_END.test(clean) || /[、，]/.test(clean) || clean.length > 28;
    if ((!sigMatch && !endsTitle) || hasClauseParticle || looksSentence) continue;

    out.push({
      label: clean,
      format: classifyFormat(clean),
      start: blk.start,
      end: blk.end,
      boxMarkup: blk.full,
      divStyle: div.attr('style') || '',
      labelHtml: $.html(labelEl) || `<p>${clean}</p>`,
      contextText: sectionContext(raw, blk.start, blk.end),
    });
  }
  return out;
}

module.exports = { detectEmptyTitleBoxes, classifyFormat, TITLE_ENDINGS, TABLE_ENDINGS };
