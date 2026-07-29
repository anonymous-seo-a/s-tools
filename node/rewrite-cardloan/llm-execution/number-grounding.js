'use strict';
/**
 * 数値 grounding (決定論)。
 *
 * 空BOX補完など「既存の根拠(context/fact)を構造化する」生成物に対し、
 * 生成された数値が根拠に実在するかを照合し、創作数値(ungrounded)を洗い出す。
 * YMYL: 誤った金額/利率は重大事故 → grounding されない数値を含む生成物は自動承認から外す。
 *
 * 注: 部分一致(数値コア)で照合するため「約4,500」↔「4500」等の表記揺れは grounding 扱い、
 *     1〜2桁の数詞核(「3つ」「5社」)はノイズとして除外する保守判定。
 *     creation を見逃すより、稀な誤判定で held に倒す方が安全 (監査で創作率は実測 0/24)。
 */

// 全角→半角 / ％→% / カンマ・空白除去
function normalize(s) {
  return (s || '')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
    .replace(/[．]/g, '.')
    .replace(/[％]/g, '%')
    .replace(/[,，]/g, '')
    .replace(/\s+/g, '');
}

// テキストから数値トークン(数字+任意単位)を抽出。1〜2桁単独(数詞核)はノイズ除外。
function extractNumbers(text) {
  const t = normalize(text);
  const re = /\d+(?:\.\d+)?(?:万|億|千)?(?:円|%|倍|銭|社|件|銘柄|株|本|名|歳|年|か月|ヶ月|日|ポイント|pt)?/g;
  const out = new Set();
  let m;
  while ((m = re.exec(t)) !== null) {
    const tok = m[0];
    if (/^\d{1,2}$/.test(tok)) continue; // 単独1-2桁(「3つ」「5社」)はノイズ
    out.add(tok);
  }
  return [...out];
}

// トークンの数値コア(digits)が haystack(正規化済み)に含まれるか
function isGrounded(token, normalizedHaystack) {
  const core = (token.match(/\d+(?:\.\d+)?/) || [])[0];
  if (!core) return true;
  return normalizedHaystack.includes(core);
}

/**
 * 生成テキストの数値が根拠(sources)に grounding されているか判定。
 * @param {string} generatedText  生成された中身(プレーンテキスト)
 * @param {string[]} sources      根拠テキスト群(context, fact content 等)
 * @returns {{ numbers: string[], ungrounded: string[], grounded: boolean }}
 */
function checkGrounding(generatedText, sources) {
  const hay = normalize((sources || []).join(' '));
  const numbers = extractNumbers(generatedText);
  const ungrounded = numbers.filter((n) => !isGrounded(n, hay));
  return { numbers, ungrounded, grounded: ungrounded.length === 0 };
}

module.exports = { normalize, extractNumbers, isGrounded, checkGrounding };
