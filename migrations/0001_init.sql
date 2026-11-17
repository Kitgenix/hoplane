-- Hoplane initial D1 schema.
-- https://kitgenix.com · https://github.com/Kitgenix/hoplane
-- All timestamps use Unix epoch milliseconds (INTEGER).
--
-- This SQL file is applied by `wrangler d1 migrations apply` (tracked in
-- `d1_migrations`). Automatic first-request migration is an APPLICATION
-- feature and must be verified in the Worker source; Wrangler provisioning
-- a new database does not apply this SQL by itself.
-- Avoid editing this file after it has been applied to a deployment.
-- Add a new numbered migration for future schema changes.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,           -- SHA-256 of the session token; the token itself is never stored
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,            -- first characters, shown in the UI to identify the key
  key_hash     TEXT NOT NULL UNIQUE,     -- SHA-256 of the full key
  scopes       TEXT NOT NULL,            -- comma-separated
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at   INTEGER
);

CREATE TABLE IF NOT EXISTS links (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  url             TEXT NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  image           TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  tags            TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  redirect_code   INTEGER NOT NULL DEFAULT 302,
  forward_query   INTEGER NOT NULL DEFAULT 1,
  utm             TEXT NOT NULL DEFAULT '{}',   -- JSON object
  rules           TEXT NOT NULL DEFAULT '[]',   -- JSON array of routing rules
  variants        TEXT NOT NULL DEFAULT '[]',   -- JSON array of weighted A/B destinations
  password_hash   TEXT,
  warning         INTEGER NOT NULL DEFAULT 0,
  starts_at       INTEGER,
  expires_at      INTEGER,
  expired_url     TEXT,
  max_clicks      INTEGER,
  disabled        INTEGER NOT NULL DEFAULT 0,
  clicks          INTEGER NOT NULL DEFAULT 0,
  last_clicked_at INTEGER,
  created_by      TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_created ON links(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_clicks ON links(clicks DESC);

-- One row per redirect. No raw IP address column is present. The visitor
-- value is intended to be a daily salted hash of IP + user agent; actual
-- rotation, deletion, and data-handling guarantees depend on Worker code.
CREATE TABLE IF NOT EXISTS clicks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id     TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  visitor     TEXT,
  country     TEXT,
  region      TEXT,
  city        TEXT,
  continent   TEXT,
  latitude    REAL,
  longitude   REAL,
  referrer    TEXT,
  device      TEXT,
  os          TEXT,
  browser     TEXT,
  language    TEXT,
  source      TEXT NOT NULL DEFAULT 'link',  -- 'link' | 'qr'
  variant     INTEGER,
  destination TEXT
);
CREATE INDEX IF NOT EXISTS idx_clicks_ts ON clicks(ts);
CREATE INDEX IF NOT EXISTS idx_clicks_link_ts ON clicks(link_id, ts);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  user_id TEXT,
  actor   TEXT NOT NULL DEFAULT '',
  action  TEXT NOT NULL,
  target  TEXT NOT NULL DEFAULT '',
  detail  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
