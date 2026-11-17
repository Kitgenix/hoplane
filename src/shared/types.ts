/** Types shared between the Worker API and the dashboard. */

export type Role = 'owner' | 'admin' | 'editor' | 'viewer';
export const ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer'];

export type Scope = 'links:read' | 'links:write' | 'analytics:read';
export const SCOPES: Scope[] = ['links:read', 'links:write', 'analytics:read'];

export type RuleField = 'country' | 'continent' | 'device' | 'os' | 'browser' | 'language' | 'referrer';
export const RULE_FIELDS: RuleField[] = ['country', 'continent', 'device', 'os', 'browser', 'language', 'referrer'];

export interface RoutingRule {
  field: RuleField;
  /** Matches when the visitor's value is (or is not) in `values`. Comparisons are case-insensitive. */
  op: 'in' | 'not_in';
  values: string[];
  url: string;
}

export interface Variant {
  url: string;
  weight: number;
}

export interface Utm {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

/** Outcome of the most recent destination check (see services/health.ts). */
export type HealthStatus = 'ok' | 'warning' | 'unreachable' | 'broken' | 'flagged' | 'skipped';

export interface LinkHealth {
  status: HealthStatus;
  http_status: number | null;
  /** The destination that produced this status (the worst one, if a link has several). */
  target: string | null;
  error: string | null;
  checked_at: number;
}

export interface Link {
  id: string;
  slug: string;
  url: string;
  title: string;
  description: string;
  image: string;
  notes: string;
  tags: string[];
  redirect_code: 301 | 302 | 307 | 308;
  forward_query: boolean;
  utm: Utm;
  rules: RoutingRule[];
  variants: Variant[];
  has_password: boolean;
  warning: boolean;
  starts_at: number | null;
  expires_at: number | null;
  expired_url: string | null;
  max_clicks: number | null;
  disabled: boolean;
  clicks: number;
  last_clicked_at: number | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  /** Null until the link has been checked. */
  health: LinkHealth | null;
  short_url?: string;
}

export type LinkStatus = 'active' | 'disabled' | 'expired' | 'scheduled' | 'limit';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  created_at: number;
  last_login_at: number | null;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
}

export type Dimension =
  | 'country' | 'region' | 'city' | 'continent' | 'referrer' | 'device'
  | 'os' | 'browser' | 'language' | 'link' | 'source';
export const DIMENSIONS: Dimension[] = [
  'country', 'region', 'city', 'continent', 'referrer', 'device', 'os', 'browser', 'language', 'link', 'source',
];

export interface Summary {
  clicks: number;
  visitors: number;
  qr: number;
  links: number;
  active_links: number;
  previous: { clicks: number; visitors: number };
}

export interface SeriesPoint { t: number; clicks: number; visitors: number }
export interface BreakdownRow { key: string; label?: string; clicks: number; visitors: number }

export interface LiveEvent {
  id: number;
  ts: number;
  slug: string;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  source: 'qr' | 'link';
  latitude: number | null;
  longitude: number | null;
}

export const WEBHOOK_EVENTS = ['link.created', 'link.updated', 'link.deleted', 'link.clicked'] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

/** A webhook endpoint as the API returns it. The signing secret is only revealed on create or rotate. */
export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string;
  events: WebhookEventType[];
  enabled: boolean;
  created_at: number;
  /** The first characters of the secret, to tell secrets apart. */
  secret_hint: string;
  last_status: number | null;
  last_error: string | null;
  last_attempt_at: number | null;
  /** Consecutive failed deliveries; 0 when the latest attempt succeeded. */
  failures: number;
}

/** Result of the daily "is a newer Hoplane release available?" check (admin only). */
export interface UpdateStatus {
  /** False when UPDATE_CHECK is "false". */
  enabled: boolean;
  current: string;
  latest: string | null;
  url: string | null;
  checked_at: number | null;
  update_available: boolean;
}

export interface InstanceInfo {
  site_name: string;
  version: string;
  setup_required: boolean;
  setup_enabled: boolean;
  case_sensitive: boolean;
  slug_length: number;
  retention_days: number;
  /** Days after expiry before a link is deleted; null when cleanup is off. */
  expired_link_retention_days: number | null;
  not_found_url: string | null;
  /** Cloudflare Access sign-in is configured (ACCESS_TEAM_DOMAIN and ACCESS_AUD). */
  access_login: boolean;
  cache: boolean;
  backups: boolean;
}
