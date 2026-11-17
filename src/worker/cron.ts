import { KITGENIX } from '../shared/attribution';
import { VERSION, config, type Bindings } from './env';
import { ensureSchema } from './migrate';
import { toLink, type LinkRow } from './services/links';

/** Daily housekeeping. Runs from the cron trigger in wrangler.jsonc.
 * Keep enough per-invocation D1 query budget for migration checks, cleanup and R2.
 * Large retention backlogs are processed over successive daily runs.
 */
const MAX_DELETE_BATCHES = 20;
const DELETE_BATCH_SIZE = 5_000;
export async function runMaintenance(env: Bindings, now = Date.now()) {
  await ensureSchema(env.DB);
  const cfg = config(env);
  const cutoff = now - cfg.retentionDays * 86_400_000;
  const today = new Date(now).toISOString().slice(0, 10);
  const report = { clicksDeleted: 0, retentionBacklogPossible: false, protectedLinksInBackup: 0, backup: null as string | null };

  // Delete old click events in chunks to stay within D1 limits.
  for (let i = 0; i < MAX_DELETE_BATCHES; i++) {
    const res = await env.DB.prepare(
      'DELETE FROM clicks WHERE id IN (SELECT id FROM clicks WHERE ts < ? ORDER BY ts LIMIT ?)',
    ).bind(cutoff, DELETE_BATCH_SIZE).run();
    const deleted = res.meta.changes ?? 0;
    report.clicksDeleted += deleted;
    if (deleted < DELETE_BATCH_SIZE) break;
    if (i === MAX_DELETE_BATCHES - 1) report.retentionBacklogPossible = true;
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
    // This is a link-configuration export, NOT a full disaster-recovery snapshot.
    // Password hashes are deliberately excluded by toLink(). Restoring a protected
    // link requires assigning a new password (enforced by the import route).
    report.protectedLinksInBackup = results.filter((row) => !!row.password_hash).length;
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
