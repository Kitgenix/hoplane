import type { Role, Scope } from '../shared/types';

export interface Bindings {
  DB: D1Database;
  CACHE?: KVNamespace;
  ASSETS?: Fetcher;
  BACKUPS?: R2Bucket;
  SETUP_TOKEN?: string;
  SITE_NAME?: string;
  HOME_URL?: string;
  SLUG_LENGTH?: string;
  CASE_SENSITIVE?: string;
  RETENTION_DAYS?: string;
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
  return {
    siteName: (env.SITE_NAME || 'Hoplane').slice(0, 60),
    homeUrl: env.HOME_URL || '',
    slugLength: Number.isFinite(slugLength) ? Math.min(32, Math.max(4, slugLength)) : 6,
    caseSensitive: env.CASE_SENSITIVE === 'true',
    retentionDays: Number.isFinite(retention) && retention > 0 ? retention : 365,
  };
}
