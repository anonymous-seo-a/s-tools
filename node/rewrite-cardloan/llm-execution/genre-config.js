'use strict';
/**
 * ジャンル別設定。リライト対象ジャンル (cardloan / securities …) ごとに
 * ドメインラベル・YMYL NG 表現・master_rules カテゴリを切り替える。
 *
 * プロンプトの SYSTEM 定数は汎用のまま、ジャンル固有の制約は user プロンプトに注入する
 * (SYSTEM を関数化せず最小改修にするため)。
 */

const GENRES = {
  cardloan: {
    key: 'cardloan',
    label: '消費者金融カードローン',
    ruleCategory: 'cardloan',
    // content_after に絶対に含めない表現 (貸金業法 / 景表法)
    ngPhrases: [
      '「無審査」「審査が甘い」「審査なし」「無条件」',
      '「ブラック OK」「ブラックでも借りれる」「破産歴 OK」',
      '「必ず貸します」「100% 融資」「絶対借りれる」「誰でも借りられる」',
      '安易な借入を強調する表現、過度な借入意欲喚起',
    ],
  },
  securities: {
    key: 'securities',
    label: '証券・投資 (NISA / 投資信託 / 証券口座 等)',
    ruleCategory: 'securities',
    // 金融商品取引法 (断定的判断の提供の禁止) / 景表法 に抵触する表現
    ngPhrases: [
      '「絶対儲かる」「必ず儲かる」「確実に利益が出る」「100% 儲かる」(断定的判断の提供)',
      '「元本保証」(保証のない投資商品に対して)「リスクゼロ」「損失なし」「絶対に損しない」',
      '「必ず値上がり」「確実に増える」等、将来の価格・収益の断定',
      '誇大・著しく事実に相違する利回り訴求、過度な投資意欲の喚起',
    ],
  },
};

function genreConfig(name) {
  return GENRES[name] || GENRES.cardloan;
}

// user プロンプトに差し込む「ジャンル + YMYL 制約」セクション。
function renderGenreConstraints(cfg) {
  return [
    `# 対象ジャンル / YMYL 制約 (必須遵守)`,
    `ジャンル: ${cfg.label}`,
    `以下の表現は content_after に絶対に含めない:`,
    ...cfg.ngPhrases.map((p) => `- ${p}`),
  ].join('\n');
}

module.exports = { GENRES, genreConfig, renderGenreConstraints };
