const fs = require("fs");
const path = require("path");

const usePostgres = Boolean(process.env.DATABASE_URL);

let sqlite3;
let sqliteDb;
let Pool;
let pgPool;

if (usePostgres) {
  ({ Pool } = require("pg"));
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
  });
} else {
  sqlite3 = require("sqlite3").verbose();
  const dbPath = process.env.DB_PATH || path.join(__dirname, "exam.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sqliteDb = new sqlite3.Database(dbPath);
}

function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function runSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function runPostgres(sql, params = []) {
  const trimmed = sql.trim();
  const isInsert = /^insert\s+/i.test(trimmed);
  const hasReturning = /\breturning\b/i.test(trimmed);

  let queryText = toPgSql(trimmed);
  if (isInsert && !hasReturning) {
    queryText = `${queryText} RETURNING id`;
  }

  const result = await pgPool.query(queryText, params);
  const id = isInsert && result.rows[0] && result.rows[0].id ? Number(result.rows[0].id) : null;
  return { id, changes: result.rowCount || 0 };
}

async function getPostgres(sql, params = []) {
  const result = await pgPool.query(toPgSql(sql), params);
  return result.rows[0];
}

async function allPostgres(sql, params = []) {
  const result = await pgPool.query(toPgSql(sql), params);
  return result.rows;
}

function run(sql, params = []) {
  return usePostgres ? runPostgres(sql, params) : runSqlite(sql, params);
}

function get(sql, params = []) {
  return usePostgres ? getPostgres(sql, params) : getSqlite(sql, params);
}

function all(sql, params = []) {
  return usePostgres ? allPostgres(sql, params) : allSqlite(sql, params);
}

async function initDbSqlite() {
  await run(`
    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      pass_mark INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);

  const testColumns = await all(`PRAGMA table_info(tests)`);
  const hasPassMark = testColumns.some((col) => col.name === "pass_mark");
  if (!hasPassMark) {
    await run(`ALTER TABLE tests ADD COLUMN pass_mark INTEGER NOT NULL DEFAULT 1`);
  }

  await run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_index INTEGER NOT NULL,
      FOREIGN KEY(test_id) REFERENCES tests(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL,
      student_name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      submitted_at INTEGER,
      score INTEGER,
      total INTEGER,
      answers_json TEXT,
      FOREIGN KEY(test_id) REFERENCES tests(id)
    )
  `);
}

async function initDbPostgres() {
  await run(`
    CREATE TABLE IF NOT EXISTS tests (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      pass_mark INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL
    )
  `);

  const testColumns = await all(`
    SELECT column_name AS name
    FROM information_schema.columns
    WHERE table_name = 'tests'
  `);
  const hasPassMark = testColumns.some((col) => col.name === "pass_mark");
  if (!hasPassMark) {
    await run(`ALTER TABLE tests ADD COLUMN pass_mark INTEGER NOT NULL DEFAULT 1`);
  }

  await run(`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_index INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      student_name TEXT NOT NULL,
      started_at BIGINT NOT NULL,
      submitted_at BIGINT,
      score INTEGER,
      total INTEGER,
      answers_json TEXT
    )
  `);
}

async function initDb() {
  if (usePostgres) {
    await initDbPostgres();
  } else {
    await initDbSqlite();
  }
}

module.exports = {
  run,
  get,
  all,
  initDb,
};
