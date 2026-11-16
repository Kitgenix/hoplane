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

export interface InstanceInfo {
  site_name: string;
  version: string;
  setup_required: boolean;
  setup_enabled: boolean;
  case_sensitive: boolean;
  slug_length: number;
  retention_days: number;
  cache: boolean;
  backups: boolean;
}
