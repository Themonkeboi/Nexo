const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

function defaultDataDir() {
  if (process.env.NEXO_DATA_DIR) return process.env.NEXO_DATA_DIR;
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || os.homedir(), 'NEXO-v2');
  return path.join(os.homedir(), '.nexo-v2');
}

const DATA_DIR = defaultDataDir();
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PFP_DIR = path.join(UPLOAD_DIR, 'pfp');
const MUSIC_DIR = path.join(UPLOAD_DIR, 'music');
for (const dir of [DATA_DIR, UPLOAD_DIR, PFP_DIR, MUSIC_DIR]) fs.mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'nexo.sqlite'));
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  PRAGMA busy_timeout=5000;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    email TEXT UNIQUE COLLATE NOCASE,
    email_verified INTEGER NOT NULL DEFAULT 0,
    bio TEXT NOT NULL DEFAULT '',
    pfp_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    browser_theme TEXT NOT NULL DEFAULT '{}',
    chat_theme TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE(sender_id, receiver_id)
  );

  CREATE TABLE IF NOT EXISTS friendships (
    user_low INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY(user_low, user_high)
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id TEXT PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dm_pair_time ON dm_messages(sender_id, receiver_id, created_at);

  CREATE TABLE IF NOT EXISTS chat_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL,
    PRIMARY KEY(group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(group_id, name COLLATE NOCASE)
  );

  CREATE TABLE IF NOT EXISTS channel_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_channel_messages ON channel_messages(channel_id, created_at);

  CREATE TABLE IF NOT EXISTS game_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    dead_signal_skin TEXT NOT NULL DEFAULT 'byte-fox',
    dead_signal_cash INTEGER NOT NULL DEFAULT 0,
    ds_backpack_level INTEGER NOT NULL DEFAULT 0,
    ds_speed_level INTEGER NOT NULL DEFAULT 0,
    ds_stamina_level INTEGER NOT NULL DEFAULT 0,
    ds_health_level INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime TEXT NOT NULL,
    duration REAL NOT NULL DEFAULT 0,
    size INTEGER NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'public',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_songs_recent ON songs(created_at DESC);
`);


// Safe additive migrations for older NEXO databases.
for (const migration of [
  `ALTER TABLE game_profiles ADD COLUMN dead_signal_cash INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE game_profiles ADD COLUMN ds_backpack_level INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE game_profiles ADD COLUMN ds_speed_level INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE game_profiles ADD COLUMN ds_stamina_level INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE game_profiles ADD COLUMN ds_health_level INTEGER NOT NULL DEFAULT 0`
]) {
  try { db.exec(migration); } catch (err) {
    if (!String(err && err.message || '').toLowerCase().includes('duplicate column')) throw err;
  }
}

function one(sql, params = []) { return db.prepare(sql).get(...params); }
function all(sql, params = []) { return db.prepare(sql).all(...params); }
function run(sql, params = []) { return db.prepare(sql).run(...params); }
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (err) { try { db.exec('ROLLBACK'); } catch {} throw err; }
}

module.exports = { db, one, all, run, tx, DATA_DIR, PFP_DIR, MUSIC_DIR };
