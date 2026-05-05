'use strict';

// Dev-only fixture: monitor.db に最小のサンプルデータを投入する。
// 本物の monitor 収集パイプラインと無関係、計算ロジックの動作確認専用。
// MONITOR_DB_PATH に既存の monitor.db がある場合は中断する。

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const MONITOR_DB_PATH = process.env.MONITOR_DB_PATH || path.join(__dirname, '..', '..', 'data', 'monitor.db');

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      post_id     INTEGER PRIMARY KEY,
      url         TEXT UNIQUE NOT NULL,
      title       TEXT,
      category    TEXT,
      wp_modified TEXT,
      top_kw      TEXT,
      first_seen  TEXT,
      last_seen   TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_metrics (
      post_id     INTEGER NOT NULL,
      date        TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'gsc_ga4',
      rank        REAL,
      gsc_click   INTEGER,
      impressions INTEGER,
      ctr         REAL,
      pv          INTEGER,
      aff_click   INTEGER,
      PRIMARY KEY (post_id, date, source)
    );
  `);
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function main() {
  if (fs.existsSync(MONITOR_DB_PATH)) {
    console.error(`monitor.db already exists at ${MONITOR_DB_PATH}`);
    console.error('Refusing to overwrite. Delete it manually if you want a fresh fixture.');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(MONITOR_DB_PATH), { recursive: true });
  const db = new Database(MONITOR_DB_PATH);
  ensureSchema(db);

  const now = new Date();
  const articles = [
    { post_id: 11077, url: 'https://www.soico.jp/no1/news/cardloan/11077', title: 'カードローンのおすすめはどこ？', category: 'cardloan', monthsAgo: 18 },
    { post_id: 13149, url: 'https://www.soico.jp/no1/news/cardloan/13149', title: 'カードローンのおすすめはどこ？10社', category: 'cardloan', monthsAgo: 8 },
    { post_id: 14669, url: 'https://www.soico.jp/no1/news/cardloan/14669', title: 'お金借りる方法10選', category: 'cardloan', monthsAgo: 3 },
    { post_id: 16933, url: 'https://www.soico.jp/no1/news/cardloan/16933', title: 'アコム審査に通るコツ', category: 'cardloan', monthsAgo: 14 },
    { post_id: 17023, url: 'https://www.soico.jp/no1/news/cardloan/17023', title: 'プロミスの審査は厳しい？', category: 'cardloan', monthsAgo: 24 },
  ];

  const insertA = db.prepare(`
    INSERT INTO articles (post_id, url, title, category, wp_modified, top_kw, first_seen, last_seen)
    VALUES (@post_id, @url, @title, @category, @wp_modified, NULL, @first_seen, @last_seen)
  `);
  for (const a of articles) {
    const wp = new Date(now);
    wp.setMonth(wp.getMonth() - a.monthsAgo);
    insertA.run({
      post_id: a.post_id,
      url: a.url,
      title: a.title,
      category: a.category,
      wp_modified: wp.toISOString(),
      first_seen: isoDate(now),
      last_seen: isoDate(now),
    });
  }

  // 日次メトリクス: 過去 70 日分（28 日窓 × 2 + バッファ）。
  // post 別にプロファイルを変えて、軸2 / 軸4 双方の検証に使えるようにする。
  const profiles = {
    11077: { recentRank: 4,  prevRank: 8,  recentImpr: 1200, prevImpr: 3500, recentClick: 110, prevClick: 380 }, // decay 大
    13149: { recentRank: 12, prevRank: 14, recentImpr: 800,  prevImpr: 850,  recentClick: 60,  prevClick: 65  }, // 安定
    14669: { recentRank: 2,  prevRank: 2,  recentImpr: 5000, prevImpr: 4900, recentClick: 700, prevClick: 690 }, // 上位安定
    16933: { recentRank: 25, prevRank: 18, recentImpr: 600,  prevImpr: 750,  recentClick: 18,  prevClick: 30  }, // decay
    17023: { recentRank: 60, prevRank: 55, recentImpr: 200,  prevImpr: 220,  recentClick: 2,   prevClick: 3   }, // 低位
  };

  const insertM = db.prepare(`
    INSERT INTO daily_metrics (post_id, date, source, rank, gsc_click, impressions, ctr, pv, aff_click)
    VALUES (@post_id, @date, @source, @rank, @gsc_click, @impressions, @ctr, @pv, @aff_click)
  `);
  const tx = db.transaction(() => {
    for (let i = 69; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const isRecent = i < 28;
      for (const [pidStr, p] of Object.entries(profiles)) {
        const post_id = Number(pidStr);
        const rank = isRecent ? p.recentRank : p.prevRank;
        const impr = isRecent ? p.recentImpr / 28 : p.prevImpr / 42;
        const click = isRecent ? p.recentClick / 28 : p.prevClick / 42;
        insertM.run({
          post_id,
          date: isoDate(d),
          source: 'gsc_ga4',
          rank,
          gsc_click: Math.round(click),
          impressions: Math.round(impr),
          ctr: impr > 0 ? click / impr : null,
          pv: null,
          aff_click: null,
        });
      }
    }
  });
  tx();

  const counts = {
    articles: db.prepare('SELECT count(*) AS n FROM articles').get().n,
    daily_metrics: db.prepare('SELECT count(*) AS n FROM daily_metrics').get().n,
  };
  console.log('[dev-seed-monitor-fixture]');
  console.log('  path :', MONITOR_DB_PATH);
  console.log('  rows :', counts);
  db.close();
}

main();
