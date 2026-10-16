import { DatabaseSync } from 'node:sqlite';

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_key BLOB NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      label TEXT,
      created_at TEXT,
      last_used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      challenge TEXT NOT NULL,
      name TEXT,
      user_id TEXT,
      ref TEXT,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS enroll_tokens (
      hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      expires_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      caught_at TEXT NOT NULL,
      species TEXT NOT NULL,
      length_cm REAL,
      weight_g REAL,
      lure TEXT,
      note TEXT,
      photo_path TEXT,
      lake_name TEXT,
      weather_json TEXT,
      visibility TEXT NOT NULL DEFAULT 'private'
    );
    CREATE INDEX IF NOT EXISTS catches_user ON catches(user_id, caught_at DESC);
  `);
  for (const [table, col] of [
    ['credentials', 'label TEXT'], ['credentials', 'created_at TEXT'],
    ['credentials', 'last_used_at TEXT'], ['challenges', 'ref TEXT'],
  ]) {
    const name = col.split(' ')[0];
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`);
    }
  }
  return db;
}
