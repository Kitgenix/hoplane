-- Hoplane: destination health checks.
-- https://kitgenix.com · https://github.com/Kitgenix/hoplane
--
-- One row per checked link, kept apart from `links` so a check never changes a
-- link's updated_at (which versions the KV cache). Rows are removed when the
-- link is deleted or its destinations change.

CREATE TABLE IF NOT EXISTS link_health (
  link_id     TEXT PRIMARY KEY,
  status      TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'unreachable', 'broken', 'flagged', 'skipped')),
  http_status INTEGER,
  target      TEXT,     -- the destination URL that produced this status
  error       TEXT,
  checked_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_link_health_checked ON link_health(checked_at);
CREATE INDEX IF NOT EXISTS idx_link_health_status ON link_health(status);
