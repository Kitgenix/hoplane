import { KITGENIX } from '../shared/attribution';
import { VERSION, config, type Bindings } from './env';
import { ensureSchema } from './migrate';
import { deleteLinks, toLink, type LinkRow } from './services/links';
import { runHealthChecks } from './services/health';
import { getSettings } from './services/settings';
import { checkForUpdate } from './services/updates';
import { emitLazily, linkEvent } from './services/webhooks';

/** Daily housekeeping. Runs from the cron trigger in wrangler.jsonc.
 * Keep enough per-invocation D1 query budget for migration checks, cleanup and R2.
 * Large retention backlogs are processed over successive daily runs.
 */
const MAX_DELETE_BATCHES = 20;
const DELETE_BATCH_SIZE = 5_000;
/** Expired links removed per daily run at most (batches × size); any backlog continues the next day. */
const MAX_LINK_CLEANUP_BATCHES = 10;
const LINK_CLEANUP_BATCH_SIZE = 100;
export async function runMaintenance(env: Bindings, now = Date.now()) {
  await ensureSchema(env.DB);
  const cfg = config(env);
  const cutoff = now - cfg.retentionDays * 86_400_000;
  const today = new Date(now).toISOString().slice(0, 10);
  const report = { clicksDeleted: 0, retentionBacklogPossible: false, protectedLinksInBackup: 0, backup: null as string | null, expiredLinksDeleted: 0, health: 'off' as 'off' | 'failed' | { checked: number; problems: number }, updateCheck: 'off' as 'off' | 'ok' | 'failed' };

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

  // Optional cleanup of long-expired links. Runs after the backup so that day's
  // snapshot still contains them. Links with a fallback URL keep redirecting
  // after expiry, so they are never removed here.
  if (cfg.expiredLinkRetentionDays !== null) {
    const expiredBefore = now - cfg.expiredLinkRetentionDays * 86_400_000;
    for (let i = 0; i < MAX_LINK_CLEANUP_BATCHES; i++) {
      const { results } = await env.DB.prepare(
        `SELECT id FROM links WHERE expires_at IS NOT NULL AND expires_at <= ? AND (expired_url IS NULL OR expired_url = '')
         ORDER BY expires_at LIMIT ?`,
      ).bind(expiredBefore, LINK_CLEANUP_BATCH_SIZE).all<{ id: string }>();
      if (!results.length) break;
      const removed = await deleteLinks(env, results.map((r) => r.id), null, 'link.cleanup');
      report.expiredLinksDeleted += removed.length;
      await emitLazily(env, 'link.deleted', () => removed.map(linkEvent.deleted));
      if (results.length < LINK_CLEANUP_BATCH_SIZE) break;
    }
  }

  // Destination health checks (opt-in). Failures here must not stop maintenance.
  if ((await getSettings(env.DB, true)).health_checks) {
    try {
      report.health = await runHealthChecks(env, cfg.healthCheckRequests, now);
    } catch (err) {
      console.warn('health checks failed', err);
      report.health = 'failed';
    }
  }

  // Last, and never fatal: an unreachable GitHub must not affect maintenance.
  if (cfg.updateCheck) {
    try {
      await checkForUpdate(env.DB);
      report.updateCheck = 'ok';
    } catch (err) {
      console.warn('update check failed', err);
      report.updateCheck = 'failed';
    }
  }
  return report;
}
