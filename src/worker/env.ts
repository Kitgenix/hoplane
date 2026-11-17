import type { Role, Scope } from '../shared/types';
import { safeUrl } from './lib/url';
import type { WebhookMessage } from './services/webhooks';

export interface Bindings {
  DB: D1Database;
  CACHE?: KVNamespace;
  ASSETS?: Fetcher;
  BACKUPS?: R2Bucket;
  /** Optional Cloudflare Queue for webhook deliveries with retries (see wrangler.jsonc). */
  WEBHOOK_QUEUE?: Queue<WebhookMessage>;
  SETUP_TOKEN?: string;
  SITE_NAME?: string;
  HOME_URL?: string;
  SLUG_LENGTH?: string;
  CASE_SENSITIVE?: string;
  RETENTION_DAYS?: string;
  NOT_FOUND_URL?: string;
  EXPIRED_LINK_RETENTION_DAYS?: string;
  UPDATE_CHECK?: string;
  HEALTH_CHECK_REQUESTS?: string;
  /** Cloudflare Access sign-in: team domain (<team>.cloudflareaccess.com) and application AUD tag. */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Role for Access users without a Hoplane account: "viewer" or "editor". Empty: no automatic accounts. */
  ACCESS_AUTO_ROLE?: string;
}

export interface Principal {
  userId: string;
  email: string;
  name: string;
  role: Role;
  /** API-key requests are limited to these scopes; session requests have every scope their role allows. */
  scopes: Scope[];
  via: 'session' | 'api_key';
  sessionId?: string;
}

export type AppEnv = { Bindings: Bindings; Variables: { principal: Principal } };

export const VERSION = '1.0.0';

export function config(env: Bindings) {
  const slugLength = Number.parseInt(env.SLUG_LENGTH || '6', 10);
  const retention = Number.parseInt(env.RETENTION_DAYS || '365', 10);
  // Empty disables expired-link cleanup; 0 deletes links on the first run after they expire.
  const expiredRetention = /^\d+$/.test((env.EXPIRED_LINK_RETENTION_DAYS ?? '').trim()) ? Number(env.EXPIRED_LINK_RETENTION_DAYS!.trim()) : null;
  return {
    siteName: (env.SITE_NAME || 'Hoplane').slice(0, 60),
    homeUrl: env.HOME_URL || '',
    slugLength: Number.isFinite(slugLength) ? Math.min(32, Math.max(4, slugLength)) : 6,
    caseSensitive: env.CASE_SENSITIVE === 'true',
    retentionDays: Number.isFinite(retention) && retention > 0 ? retention : 365,
    /** Where unknown short links redirect (302). Empty shows the "Link not found" page. */
    notFoundUrl: safeUrl(env.NOT_FOUND_URL ?? '') ?? '',
    expiredLinkRetentionDays: expiredRetention !== null && expiredRetention <= 36_500 ? expiredRetention : null,
    /** Daily check for a newer Hoplane release on GitHub. */
    updateCheck: env.UPDATE_CHECK !== 'false',
    /** Outbound requests the daily health check may make (Workers Free allows 50 subrequests per run). */
    accessAutoRole: env.ACCESS_AUTO_ROLE === 'viewer' || env.ACCESS_AUTO_ROLE === 'editor' ? env.ACCESS_AUTO_ROLE : null,
    healthCheckRequests: Math.min(5_000, Math.max(1, Number.parseInt(env.HEALTH_CHECK_REQUESTS || '30', 10) || 30)),
  };
}
