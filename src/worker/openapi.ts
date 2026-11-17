/**
 * OpenAPI 3.1 description of the Hoplane REST API, served at /api/openapi.json.
 * https://kitgenix.com · https://github.com/Kitgenix/hoplane
 *
 * Link request bodies are generated from the same zod schemas that validate
 * them. tests/openapi.test.ts fails if a route is added without documenting it.
 */
import { z } from 'zod';
import { KITGENIX } from '../shared/attribution';
import { ROLES, RULE_FIELDS, SCOPES, WEBHOOK_EVENTS } from '../shared/types';
import { VERSION } from './env';
import { linkInput, linkPatch } from './services/links';

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const body = (schema: Schema, required = true) => ({ required, content: { 'application/json': { schema } } });
const ok = (schema: Schema, description = 'Success') => ({ description, content: { 'application/json': { schema } } });
const str = (description?: string, extra: Schema = {}): Schema => ({ type: 'string', ...(description ? { description } : {}), ...extra });
const int = (description?: string, extra: Schema = {}): Schema => ({ type: 'integer', ...(description ? { description } : {}), ...extra });
const bool = (description?: string): Schema => ({ type: 'boolean', ...(description ? { description } : {}) });
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] });
const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const arr = (items: Schema): Schema => ({ type: 'array', items });

function fromZod(schema: z.ZodType): Schema {
  // Describe what clients send (io: input); transforms are documented by their input type.
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Schema;
  return rest;
}

type Param = { name: string; in: 'path' | 'query'; required?: boolean; description?: string; schema: Schema };
const pathId = (description = 'Link id or slug'): Param => ({ name: 'id', in: 'path', required: true, description, schema: str() });
const q = (name: string, schema: Schema, description?: string, required = false): Param => ({ name, in: 'query', required, description, schema });

interface Op {
  tag: string;
  summary: string;
  description?: string;
  /** API-key scope, or "admin" for owner/admin dashboard sessions, or "public". */
  access: (typeof SCOPES)[number] | 'admin' | 'session' | 'any' | 'public';
  params?: Param[];
  body?: ReturnType<typeof body>;
  responses?: Record<string, unknown>;
}

const ERRORS = {
  '400': ok(ref('Error'), 'Invalid input'),
  '401': ok(ref('Error'), 'Missing or invalid credentials'),
  '403': ok(ref('Error'), 'The key or role lacks permission'),
  '404': ok(ref('Error'), 'Not found'),
};

function operation(o: Op) {
  const accessNote =
    o.access === 'public'
      ? 'No authentication.'
      : o.access === 'admin'
        ? 'Owner or admin, signed in to the dashboard (API keys cannot call this).'
        : o.access === 'session'
          ? 'Any signed-in dashboard user.'
          : o.access === 'any'
            ? 'Any API key or dashboard session.'
            : `API key scope \`${o.access}\`, or a dashboard session whose role allows it.`;
  return {
    tags: [o.tag],
    summary: o.summary,
    description: [o.description, `**Access:** ${accessNote}`].filter(Boolean).join('\n\n'),
    ...(o.access === 'public' ? { security: [] } : o.access === 'admin' || o.access === 'session' ? { security: [{ session: [] }] } : {}),
    ...(SCOPES.includes(o.access as (typeof SCOPES)[number]) ? { 'x-scope': o.access } : {}),
    ...(o.params?.length ? { parameters: o.params } : {}),
    ...(o.body ? { requestBody: o.body } : {}),
    responses: { ...(o.responses ?? { '200': ok({ type: 'object' }) }), ...(o.access === 'public' ? {} : ERRORS) },
  };
}

const rangeParams: Param[] = [
  q('from', str('Start (ISO 8601 or epoch milliseconds). Default: 7 days before `to`.')),
  q('to', str('End, exclusive (ISO 8601 or epoch milliseconds). Default: now.')),
  q('link', str('Limit to one link (id or slug).')),
  q('tz', int('Viewer UTC offset in minutes, used to align day buckets.', { minimum: -840, maximum: 840 })),
];

const linkStatus = { type: 'string', enum: ['active', 'disabled', 'expired', 'scheduled', 'limit'] };

const SCHEMAS: Record<string, Schema> = {
  Error: obj({ error: str(), details: {} }, ['error']),
  LinkHealth: obj(
    {
      status: str('Result of the latest destination check', { enum: ['ok', 'warning', 'unreachable', 'broken', 'flagged', 'skipped'] }),
      http_status: nullable(int()),
      target: nullable(str('The destination that produced this status')),
      error: nullable(str()),
      checked_at: int('Epoch milliseconds'),
    },
    ['status', 'checked_at'],
  ),
  Link: obj(
    {
      id: str(),
      slug: str(),
      short_url: str(),
      url: str('Destination URL'),
      title: str(),
      description: str(),
      image: str(),
      notes: str('Private notes'),
      tags: arr(str()),
      redirect_code: int(undefined, { enum: [301, 302, 307, 308] }),
      forward_query: bool(),
      utm: obj({ source: str(), medium: str(), campaign: str(), term: str(), content: str() }),
      rules: arr(obj({ field: str(undefined, { enum: RULE_FIELDS }), op: str(undefined, { enum: ['in', 'not_in'] }), values: arr(str()), url: str() })),
      variants: arr(obj({ url: str(), weight: int() })),
      has_password: bool('Passwords and their hashes are never returned'),
      warning: bool(),
      starts_at: nullable(int()),
      expires_at: nullable(int()),
      expired_url: nullable(str()),
      max_clicks: nullable(int()),
      disabled: bool(),
      clicks: int(),
      last_clicked_at: nullable(int()),
      created_by: nullable(str()),
      created_at: int(),
      updated_at: int(),
      health: nullable(ref('LinkHealth')),
      status: linkStatus,
    },
    ['id', 'slug', 'url'],
  ),
  LinkInput: fromZod(linkInput),
  LinkPatch: fromZod(linkPatch),
  LinkList: obj({ items: arr(ref('Link')), total: int(), page: int(), limit: int() }),
  LinkCounts: obj({ total: int(), active: int(), scheduled: int(), expired: int(), limit: int(), disabled: int() }),
  User: obj({ id: str(), email: str(), name: str(), role: str(undefined, { enum: ROLES }), created_at: int(), last_login_at: nullable(int()) }),
  ApiKey: obj({ id: str(), name: str(), prefix: str(), scopes: arr(str(undefined, { enum: SCOPES })), created_at: int(), last_used_at: nullable(int()), expires_at: nullable(int()) }),
  Settings: obj({ blocked_domains: arr(str()), warn_all: bool(), track_bots: bool(), safe_browsing: bool(), health_checks: bool() }),
  WebhookEndpoint: obj({
    id: str(),
    url: str(),
    description: str(),
    events: arr(str(undefined, { enum: WEBHOOK_EVENTS })),
    enabled: bool(),
    created_at: int(),
    secret_hint: str('First characters of the signing secret'),
    last_status: nullable(int()),
    last_error: nullable(str()),
    last_attempt_at: nullable(int()),
    failures: int('Consecutive failed deliveries'),
  }),
  UpdateStatus: obj({ enabled: bool(), current: str(), latest: nullable(str()), url: nullable(str()), checked_at: nullable(int()), update_available: bool() }),
};

const PATHS: Record<string, Record<string, Op>> = {
  '/api/openapi.json': { get: { tag: 'Meta', summary: 'This OpenAPI document', access: 'public' } },
  '/api/instance': { get: { tag: 'Meta', summary: 'Public instance information', access: 'public' } },

  '/api/auth/setup': { post: { tag: 'Auth', summary: 'Create the first owner account with SETUP_TOKEN', access: 'public', body: body(obj({ token: str(), email: str(), name: str(), password: str() }, ['token', 'email', 'password'])) } },
  '/api/auth/login': { post: { tag: 'Auth', summary: 'Sign in to the dashboard (sets a session cookie)', access: 'public', body: body(obj({ email: str(), password: str() }, ['email', 'password'])) } },
  '/api/auth/access': {
    get: {
      tag: 'Auth',
      summary: 'Sign in with Cloudflare Access',
      description: 'Verifies the Cloudflare Access JWT, starts a dashboard session and redirects to /dashboard. Configure ACCESS_TEAM_DOMAIN and ACCESS_AUD first.',
      access: 'public',
      responses: { '302': { description: 'Redirect to /dashboard, or to the login page with an access_error' } },
    },
  },
  '/api/auth/logout': { post: { tag: 'Auth', summary: 'Sign out', access: 'public' } },
  '/api/auth/me': { get: { tag: 'Auth', summary: 'The signed-in user or API key owner', access: 'any' } },
  '/api/auth/password': { post: { tag: 'Auth', summary: 'Change your own password', access: 'session', body: body(obj({ current: str('Current password'), next: str('New password, at least 10 characters') }, ['current', 'next'])) } },

  '/api/links': {
    get: {
      tag: 'Links',
      summary: 'List and search links',
      access: 'links:read',
      params: [
        q('q', str('Search slug, destination, title and notes')),
        q('tag', str()),
        q('status', { type: 'string', enum: ['all', 'active', 'disabled', 'expired', 'scheduled', 'limit'] }),
        q('health', { type: 'string', enum: ['problems'] }, 'Only links whose latest destination check found a problem'),
        q('sort', { type: 'string', enum: ['created_desc', 'created_asc', 'clicks_desc', 'slug_asc', 'recent_click'] }),
        q('page', int(undefined, { minimum: 1 })),
        q('limit', int(undefined, { minimum: 1, maximum: 200 })),
      ],
      responses: { '200': ok(ref('LinkList')) },
    },
    post: { tag: 'Links', summary: 'Create a link', access: 'links:write', body: body(ref('LinkInput')), responses: { '201': ok(ref('Link'), 'Created'), '409': ok(ref('Error'), 'Slug already taken') } },
  },
  '/api/links/check': { get: { tag: 'Links', summary: 'Check whether a slug is available', access: 'links:read', params: [q('slug', str(), undefined, true)], responses: { '200': ok(obj({ slug: str(), available: bool(), reason: nullable(str()) })) } } },
  '/api/links/count': { get: { tag: 'Links', summary: 'Count links by status', access: 'links:read', params: [q('q', str()), q('tag', str())], responses: { '200': ok(ref('LinkCounts')) } } },
  '/api/links/lookup': { get: { tag: 'Links', summary: 'Find a link by slug', access: 'links:read', params: [q('slug', str(), undefined, true)], responses: { '200': ok(ref('Link')) } } },
  '/api/links/{id}': {
    get: { tag: 'Links', summary: 'Get a link', access: 'links:read', params: [pathId()], responses: { '200': ok(ref('Link')) } },
    patch: { tag: 'Links', summary: 'Update a link (only the fields sent change)', access: 'links:write', params: [pathId()], body: body(ref('LinkPatch')), responses: { '200': ok(ref('Link')) } },
    delete: { tag: 'Links', summary: 'Delete a link and its analytics', access: 'links:write', params: [pathId()], responses: { '200': ok(obj({ ok: bool() })) } },
  },
  '/api/links/{id}/health': { post: { tag: 'Links', summary: "Check a link's destinations now", access: 'links:write', params: [pathId()], responses: { '200': ok(ref('Link')) } } },
  '/api/links/bulk': {
    post: {
      tag: 'Links',
      summary: 'Delete, enable, disable or tag many links',
      access: 'links:write',
      body: body(obj({ action: str(undefined, { enum: ['delete', 'disable', 'enable', 'tag'] }), ids: { ...arr(str()), maxItems: 500 }, tags: arr(str()) }, ['action', 'ids'])),
      responses: { '200': ok(obj({ ok: bool(), affected: int() })) },
    },
  },
  '/api/tags': { get: { tag: 'Links', summary: 'Tags with link counts', access: 'links:read', responses: { '200': ok(obj({ items: arr(obj({ tag: str(), count: int() })) })) } } },
  '/api/meta': { get: { tag: 'Links', summary: 'Fetch title, description and image from a destination page', access: 'links:write', params: [q('url', str(), undefined, true)] } },
  '/api/import': {
    post: {
      tag: 'Import and export',
      summary: 'Import up to 1,000 links (Hoplane, Sink, Bitly, Shlink or YOURLS fields)',
      access: 'links:write',
      body: body(obj({ links: { ...arr({ type: 'object' }), maxItems: 1000 }, on_conflict: str(undefined, { enum: ['skip', 'overwrite'] }) }, ['links'])),
      responses: {
        '200': ok(obj({ created: int(), updated: int(), skipped: int(), errors: arr(obj({ row: int(), slug: str(), error: str() })), warnings: arr(obj({ row: int(), slug: str(), warning: str() })) })),
      },
    },
  },
  '/api/export': { get: { tag: 'Import and export', summary: 'Export all links as JSON or CSV', access: 'links:read', params: [q('format', { type: 'string', enum: ['json', 'csv'] })] } },

  '/api/analytics/summary': { get: { tag: 'Analytics', summary: 'Totals with previous-period comparison', access: 'analytics:read', params: rangeParams } },
  '/api/analytics/timeseries': { get: { tag: 'Analytics', summary: 'Clicks and visitors over time', access: 'analytics:read', params: [...rangeParams, q('interval', { type: 'string', enum: ['hour', 'day'] })] } },
  '/api/analytics/breakdown': {
    get: {
      tag: 'Analytics',
      summary: 'Top values for one dimension',
      access: 'analytics:read',
      params: [...rangeParams, q('dimension', { type: 'string', enum: ['link', 'country', 'region', 'city', 'continent', 'referrer', 'device', 'os', 'browser', 'language', 'source'] }, undefined, true), q('limit', int(undefined, { minimum: 1, maximum: 250 }))],
    },
  },
  '/api/analytics/live': { get: { tag: 'Analytics', summary: 'Recent clicks', access: 'analytics:read', params: [q('since', int('Return clicks with a larger id')), q('link', str()), q('limit', int(undefined, { maximum: 100 }))] } },
  '/api/analytics/export': { get: { tag: 'Analytics', summary: 'Click-level CSV', access: 'analytics:read', params: rangeParams } },

  '/api/users': {
    get: { tag: 'Team', summary: 'List users', access: 'admin', responses: { '200': ok(obj({ items: arr(ref('User')) })) } },
    post: { tag: 'Team', summary: 'Add a user', access: 'admin', body: body(obj({ email: str(), name: str(), role: str(undefined, { enum: ROLES }), password: str() }, ['email', 'role', 'password'])) },
  },
  '/api/users/{id}': {
    patch: { tag: 'Team', summary: "Change a user's name, role or password", access: 'admin', params: [pathId('User id')], body: body(obj({ name: str(), role: str(undefined, { enum: ROLES }), password: str() })) },
    delete: { tag: 'Team', summary: 'Remove a user', access: 'admin', params: [pathId('User id')] },
  },
  '/api/keys': {
    get: { tag: 'API keys', summary: 'Your API keys', access: 'session', responses: { '200': ok(obj({ items: arr(ref('ApiKey')) })) } },
    post: { tag: 'API keys', summary: 'Create an API key (the key is returned once)', access: 'session', body: body(obj({ name: str(), scopes: arr(str(undefined, { enum: SCOPES })), expires_in_days: nullable(int()) }, ['name', 'scopes'])) },
  },
  '/api/keys/{id}': { delete: { tag: 'API keys', summary: 'Revoke an API key', access: 'session', params: [pathId('Key id')] } },
  '/api/settings': {
    get: { tag: 'Settings', summary: 'Security settings', access: 'admin', responses: { '200': ok(ref('Settings')) } },
    put: { tag: 'Settings', summary: 'Change security settings', access: 'admin', body: body(ref('Settings')), responses: { '200': ok(ref('Settings')) } },
  },
  '/api/updates': { get: { tag: 'Settings', summary: 'Running and latest release versions', access: 'admin', responses: { '200': ok(ref('UpdateStatus')) } } },
  '/api/updates/check': { post: { tag: 'Settings', summary: 'Check GitHub for a newer release now', access: 'admin', responses: { '200': ok(ref('UpdateStatus')) } } },
  '/api/audit': { get: { tag: 'Settings', summary: 'Audit log, newest first, 50 per page', access: 'admin', params: [q('page', int(undefined, { minimum: 1 }))] } },

  '/api/webhooks': {
    get: { tag: 'Webhooks', summary: 'List webhook endpoints', access: 'admin', responses: { '200': ok(obj({ items: arr(ref('WebhookEndpoint')), queue: bool('Whether a retry queue is configured') })) } },
    post: {
      tag: 'Webhooks',
      summary: 'Add an endpoint (the signing secret is returned once)',
      access: 'admin',
      body: body(obj({ url: str('HTTPS URL on a public hostname'), description: str(), events: arr(str(undefined, { enum: WEBHOOK_EVENTS })) }, ['url', 'events'])),
      responses: { '201': ok({ allOf: [ref('WebhookEndpoint'), obj({ secret: str() })] }, 'Created') },
    },
  },
  '/api/webhooks/{id}': {
    patch: { tag: 'Webhooks', summary: 'Change an endpoint', access: 'admin', params: [pathId('Webhook id')], body: body(obj({ url: str(), description: str(), events: arr(str(undefined, { enum: WEBHOOK_EVENTS })), enabled: bool() })), responses: { '200': ok(ref('WebhookEndpoint')) } },
    delete: { tag: 'Webhooks', summary: 'Remove an endpoint', access: 'admin', params: [pathId('Webhook id')] },
  },
  '/api/webhooks/{id}/rotate': { post: { tag: 'Webhooks', summary: 'Replace the signing secret (returned once)', access: 'admin', params: [pathId('Webhook id')] } },
  '/api/webhooks/{id}/test': { post: { tag: 'Webhooks', summary: 'Send a webhook.test event now', access: 'admin', params: [pathId('Webhook id')], responses: { '200': ok(obj({ ok: bool(), status: nullable(int()), error: nullable(str()) })) } } },

  '/api/mcp': {
    get: { tag: 'MCP', summary: 'Not supported (stateless POST only)', access: 'links:read', responses: { '405': ok(ref('Error'), 'Use POST') } },
    post: { tag: 'MCP', summary: 'Model Context Protocol endpoint (JSON-RPC over Streamable HTTP)', description: 'Tools are filtered by the API key scopes.', access: 'links:read', body: body({ type: 'object' }) },
  },
};

let cached: Schema | null = null;

export function openApiDocument(origin: string): Schema {
  cached ??= {
    openapi: '3.1.0',
    info: {
      title: `${KITGENIX.product} API`,
      version: VERSION,
      description: `REST API for ${KITGENIX.brand}. Authenticate with an API key (\`Authorization: Bearer hpl_…\`) created under Settings → API & MCP, or with a dashboard session. Timestamps are epoch milliseconds.`,
      license: { name: 'Hoplane Source-Available Licence', url: `${KITGENIX.repository}/blob/main/LICENSE` },
      contact: { name: KITGENIX.name, url: KITGENIX.website },
    },
    security: [{ apiKey: [] }, { session: [] }],
    tags: ['Links', 'Analytics', 'Import and export', 'Webhooks', 'Team', 'API keys', 'Settings', 'Auth', 'MCP', 'Meta'].map((name) => ({ name })),
    paths: Object.fromEntries(Object.entries(PATHS).map(([path, ops]) => [path, Object.fromEntries(Object.entries(ops).map(([m, o]) => [m, operation(o)]))])),
    components: {
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer', description: 'An API key (hpl_…) with the scopes the operation needs' },
        session: { type: 'apiKey', in: 'cookie', name: '__Host-hpl_session', description: 'Dashboard session' },
      },
      schemas: SCHEMAS,
    },
  };
  return { ...cached, servers: [{ url: origin }] };
}

/** Documented method + path pairs, for the drift test. */
export function documentedRoutes(): string[] {
  return Object.entries(PATHS).flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`));
}
