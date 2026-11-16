/**
 * Fixed-window rate limiter stored in D1, so it works on every Cloudflare plan
 * with no extra configuration. Returns true when the request is allowed.
 */
export async function rateLimit(db: D1Database, key: string, limit: number, windowMs: number): Promise<boolean> {
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
  return (row?.count ?? 0) <= limit;
}

export async function resetRateLimit(db: D1Database, key: string) {
  await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();
}
