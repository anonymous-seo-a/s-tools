'use strict';

// WP SQL dump (mysqldump 形式 .sql.gz) から cardloan 記事の post_modified を抽出し、
// monitor.db.articles に upsert する。
//
// 入力:
//   design/data/cardloan_posts.md      … 434 件 (ID + title + URL)
//   node/data/soico_no1_*.sql.gz       … wp_posts INSERT を含む WP dump
// 出力:
//   node/data/monitor.db.articles      … category='cardloan' の 434 件 (upsert)
//
// ケースB スコープ: cardloan のみ。他カテゴリは Phase 2 で必要時に拡張。

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const Database = require('better-sqlite3');

const DUMP_PATH = process.env.WP_DUMP_PATH ||
  path.join(__dirname, '..', '..', 'data', 'soico_no1_20260421_183252.sql.gz');
const POSTS_MD_PATH = path.join(__dirname, '..', '..', '..', 'design', 'data', 'cardloan_posts.md');
const MONITOR_DB_PATH = process.env.MONITOR_DB_PATH ||
  path.join(__dirname, '..', '..', 'data', 'monitor.db');

const VALID_CATEGORIES = ['cardloan', 'cryptocurrency', 'securities', 'fx'];

function loadCardloanPosts() {
  const text = fs.readFileSync(POSTS_MD_PATH, 'utf8');
  const posts = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(https?:\/\/\S+?)\s*\|/);
    if (m) posts.push({ id: Number(m[1]), title: m[2].trim(), url: m[3].trim() });
  }
  return posts;
}

// mysqldump の VALUES タプルを 1 件パースするステートマシン。
// 数値 / 'string' (mysql escape) / NULL に対応。post_content / post_content_filtered
// (longtext) も同じ string ルールでスキップされる。
class TupleParser {
  constructor(s, pos) { this.s = s; this.pos = pos; }

  parseTuple() {
    if (this.s[this.pos] !== '(') throw new Error(`expected ( at ${this.pos}`);
    this.pos++;
    const fields = [];
    while (true) {
      this.skipSpace();
      fields.push(this.parseField());
      this.skipSpace();
      if (this.s[this.pos] === ',') { this.pos++; continue; }
      if (this.s[this.pos] === ')') { this.pos++; return fields; }
      throw new Error(`unexpected '${this.s[this.pos]}' at ${this.pos}`);
    }
  }

  skipSpace() {
    while (this.pos < this.s.length && /\s/.test(this.s[this.pos])) this.pos++;
  }

  parseField() {
    const c = this.s[this.pos];
    if (c === "'") return this.parseString();
    if (this.s.substr(this.pos, 4) === 'NULL') { this.pos += 4; return null; }
    return this.parseNumber();
  }

  parseString() {
    this.pos++;
    let result = '';
    while (this.pos < this.s.length) {
      const c = this.s[this.pos];
      if (c === '\\') {
        const n = this.s[this.pos + 1];
        if (n === 'n') result += '\n';
        else if (n === 'r') result += '\r';
        else if (n === 't') result += '\t';
        else if (n === '0') result += '\0';
        else if (n === 'Z') result += '\x1a';
        else if (n === "'") result += "'";
        else if (n === '"') result += '"';
        else if (n === '\\') result += '\\';
        else result += n;
        this.pos += 2;
      } else if (c === "'") {
        this.pos++;
        return result;
      } else {
        result += c;
        this.pos++;
      }
    }
    throw new Error('unterminated string');
  }

  parseNumber() {
    const start = this.pos;
    while (this.pos < this.s.length && /[\d\-+.eE]/.test(this.s[this.pos])) this.pos++;
    if (this.pos === start) throw new Error(`expected number at ${this.pos}`);
    return Number(this.s.substring(start, this.pos));
  }
}

async function extractFromDump(targetIds) {
  const targetSet = new Set(targetIds);
  const stream = fs.createReadStream(DUMP_PATH).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const found = new Map();
  let scanned = 0;

  const PREFIX = 'INSERT INTO `wp_posts` VALUES ';
  for await (const line of rl) {
    if (!line.startsWith(PREFIX)) continue;
    let pos = PREFIX.length;
    while (pos < line.length) {
      while (pos < line.length && /\s/.test(line[pos])) pos++;
      if (line[pos] !== '(') break;
      const parser = new TupleParser(line, pos);
      const fields = parser.parseTuple();
      pos = parser.pos;
      scanned++;
      // wp_posts 列順 (CREATE TABLE 順):
      // 0:ID 1:post_author 2:post_date 3:post_date_gmt 4:post_content
      // 5:post_title 6:post_excerpt 7:post_status 8:comment_status 9:ping_status
      // 10:post_password 11:post_name 12:to_ping 13:pinged 14:post_modified
      // 15:post_modified_gmt 16:post_content_filtered 17:post_parent 18:guid
      // 19:menu_order 20:post_type 21:post_mime_type 22:comment_count
      const id = fields[0];
      const post_status = fields[7];
      const post_type = fields[20];
      const post_modified = fields[14];
      if (post_type === 'post' && post_status === 'publish' && targetSet.has(id)) {
        found.set(id, { post_modified });
      }
      while (pos < line.length && /[,;\s]/.test(line[pos])) pos++;
    }
  }
  return { found, scanned };
}

function detectCategory(url) {
  for (const c of VALID_CATEGORIES) if (url.includes(`/${c}/`)) return c;
  return null;
}

async function main() {
  console.log('[wp-import] start');
  console.log('  dump        :', DUMP_PATH);
  console.log('  posts md    :', POSTS_MD_PATH);
  console.log('  monitor db  :', MONITOR_DB_PATH);

  if (!fs.existsSync(DUMP_PATH)) {
    console.error(`[FATAL] dump not found: ${DUMP_PATH}`);
    process.exit(2);
  }
  if (!fs.existsSync(POSTS_MD_PATH)) {
    console.error(`[FATAL] cardloan_posts.md not found: ${POSTS_MD_PATH}`);
    process.exit(2);
  }

  const posts = loadCardloanPosts();
  console.log(`  loaded posts: ${posts.length} from cardloan_posts.md`);

  const t0 = Date.now();
  const { found, scanned } = await extractFromDump(posts.map(p => p.id));
  const t1 = Date.now();
  console.log(`  scanned wp_posts tuples: ${scanned} in ${((t1 - t0) / 1000).toFixed(1)}s`);
  console.log(`  matched: ${found.size} / ${posts.length}`);

  fs.mkdirSync(path.dirname(MONITOR_DB_PATH), { recursive: true });
  const db = new Database(MONITOR_DB_PATH);
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
    CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
    CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
  `);

  const upsert = db.prepare(`
    INSERT INTO articles (post_id, url, title, category, wp_modified, first_seen, last_seen)
    VALUES (@post_id, @url, @title, @category, @wp_modified, @first_seen, @last_seen)
    ON CONFLICT(post_id) DO UPDATE SET
      url         = excluded.url,
      title       = COALESCE(excluded.title, articles.title),
      category    = COALESCE(excluded.category, articles.category),
      wp_modified = COALESCE(excluded.wp_modified, articles.wp_modified),
      last_seen   = excluded.last_seen
  `);

  const now = new Date().toISOString();
  let inserted = 0;
  let missingInDump = 0;
  let invalidCategory = 0;
  const tx = db.transaction(() => {
    for (const p of posts) {
      const dumpRow = found.get(p.id);
      const cat = detectCategory(p.url);
      if (!cat) { invalidCategory++; continue; }
      if (!dumpRow) { missingInDump++; }
      upsert.run({
        post_id: p.id,
        url: p.url,
        title: p.title,
        category: cat,
        wp_modified: dumpRow ? dumpRow.post_modified : null,
        first_seen: now,
        last_seen: now,
      });
      inserted++;
    }
  });
  tx();

  const stats = db.prepare(`
    SELECT category, COUNT(*) AS n,
           SUM(CASE WHEN wp_modified IS NULL THEN 1 ELSE 0 END) AS missing_modified
    FROM articles GROUP BY category ORDER BY category
  `).all();
  console.log('  result:');
  console.log(`    inserted/upserted   : ${inserted}`);
  console.log(`    missing in wp dump  : ${missingInDump}`);
  console.log(`    invalid category    : ${invalidCategory}`);
  console.log('    rows by category:');
  for (const r of stats) console.log(`      ${r.category}: ${r.n} (wp_modified missing: ${r.missing_modified})`);

  db.close();
  console.log('[wp-import] done');
}

main().catch((e) => { console.error('[FATAL]', e); process.exit(1); });
