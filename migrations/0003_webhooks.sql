-- Hoplane: outgoing webhooks.
-- https://kitgenix.com · https://github.com/Kitgenix/hoplane
--
-- Each row is one endpoint. The signing secret is stored so deliveries can be
-- signed; the API only reveals it when it is created or rotated.

CREATE TABLE IF NOT EXISTS webhooks (
  id              TEXT PRIMARY KEY,
  url             TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  secret          TEXT NOT NULL,             -- whsec_<base64>, Standard Webhooks format
  events          TEXT NOT NULL,             -- JSON array of event types
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_by      TEXT,
  created_at      INTEGER NOT NULL,
  last_status     INTEGER,                   -- HTTP status of the latest recorded attempt (null: network error)
  last_error      TEXT,
  last_attempt_at INTEGER,
  failures        INTEGER NOT NULL DEFAULT 0 -- consecutive failed deliveries
);
