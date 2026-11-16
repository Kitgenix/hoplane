import { KITGENIX } from '../shared/attribution';
import { VERSION, config, type Bindings } from './env';
import { ensureSchema } from './migrate';
import { toLink, type LinkRow } from './services/links';

/** Daily housekeeping. Runs from the cron trigger in wrangler.jsonc. */
export async function runMaintenance(env: Bindings, now = Date.now()) {
  await ensureSchema(env.DB);
  const cfg = config(env);
  const cutoff = now - cfg.retentionDays * 86_400_000;
  const today = new Date(now).toISOString().slice(0, 10);
  const report = { clicksDeleted: 0, backup: null as string | null };

  // Delete old click events in chunks to stay within D1 limits.
  for (let i = 0; i < 50; i++) {
    const res = await env.DB.prepare('DELETE FROM clicks WHERE id IN (SELECT id FROM clicks WHERE ts < ? LIMIT 10000)').bind(cutoff).run();
    report.clicksDeleted += res.meta.changes ?? 0;
    if ((res.meta.changes ?? 0) < 10000) break;
  }

  await env.DB.batch([
    // Discard previous days' visitor salts so hashes can never be linked again.
    env.DB.prepare("DELETE FROM settings WHERE key LIKE 'salt:%' AND key < ?").bind(`salt:${today}`),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now),
    env.DB.prepare('DELETE FROM audit_log WHERE ts < ?').bind(now - 2 * 365 * 86_400_000),
  ]);

  if (env.BACKUPS) {
    const { results } = await env.DB.prepare('SELECT * FROM links ORDER BY created_at').all<LinkRow>();
    const key = `backups/links-${today}.json`;
    await env.BACKUPS.put(
      key,
      JSON.stringify({ format: 'hoplane', version: 1, generator: `${KITGENIX.product} ${VERSION}`, exported_at: new Date(now).toISOString(), links: results.map((r) => toLink(r)) }),
      { httpMetadata: { contentType: 'application/json' } },
    );
    report.backup = key;
  }
  return report;
}
