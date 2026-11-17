/**
 * Fixed-window rate limiter stored in D1. The UPSERT is atomic for a given key
 * across Worker isolates; unlike a read-then-write limiter it cannot be raced.
 * Returns true only when D1 confirms the request is within the window's limit.
 *
 * Callers must use privacy-safe keys; never store raw IP addresses here.
 */
export async function rateLimit(db: D1Database, key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!key || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new RangeError('Invalid rate-limit key or limits');
  }
  const now = Date.now();
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.reset_at <= ?3 THEN 1 ELSE rate_limits.count + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at <= ?3 THEN ?2 ELSE rate_limits.reset_at END
       RETURNING count`,
    )
    .bind(key, now + windowMs, now)
    .first<{ count: number }>();
  // Fail closed if a database driver unexpectedly returns no row.
  return row !== null && row !== undefined && row.count <= limit;
}

export async function resetRateLimit(db: D1Database, key: string) {
  await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();
}
