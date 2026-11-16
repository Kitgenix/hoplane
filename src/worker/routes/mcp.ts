/**
 * Model Context Protocol server (Streamable HTTP, stateless JSON responses).
 * Point Claude, Cursor or any MCP client at  https://<your-domain>/api/mcp
 * with header  Authorization: Bearer hpl_…  (create a key under Settings → API keys).
 */
import { Hono } from 'hono';
import type { Scope } from '../../shared/types';
import { KITGENIX } from '../../shared/attribution';
import { VERSION, type AppEnv, type Bindings, type Principal } from '../env';
import { HttpError } from '../lib/errors';
import { breakdown, summary } from '../services/analytics';
import { allTags, createLink, deleteLinks, listLinks, requireLink, statusOf, toLink, updateLink } from '../services/links';

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const str = (description: string) => ({ type: 'string', description });
const linkFields = {
  url: str('Destination URL (http or https)'),
  slug: str('Custom short path, e.g. "launch". Omit to auto-generate.'),
  title: str('Title, also used for social previews'),
  description: str('Description for social previews'),
  notes: str('Private notes'),
  tags: { type: 'array', items: { type: 'string' }, description: 'Tags for organising links' },
  expires_at: str('ISO 8601 date-time after which the link stops working'),
  max_clicks: { type: 'integer', description: 'Disable the link after this many clicks' },
  password: str('Require this password before redirecting'),
  disabled: { type: 'boolean', description: 'Turn the link off' },
  redirect_code: { type: 'integer', enum: [301, 302, 307, 308] },
  utm: {
    type: 'object',
    description: 'UTM parameters appended to the destination',
    properties: { source: { type: 'string' }, medium: { type: 'string' }, campaign: { type: 'string' }, term: { type: 'string' }, content: { type: 'string' } },
  },
};

interface Tool {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  readOnly: boolean;
  inputSchema: Record<string, unknown>;
  run(env: Bindings, args: Record<string, unknown>, p: Principal, origin: string): Promise<unknown>;
}

const DAY = 86_400_000;

const TOOLS: Tool[] = [
  {
    name: 'list_links',
    title: 'List links',
    description: 'Search and list short links. Returns 25 per page by default.',
    scope: 'links:read',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: str('Text to search in slug, destination, title and notes'),
        tag: str('Only links with this tag'),
        status: { type: 'string', enum: ['all', 'active', 'disabled', 'expired', 'scheduled', 'limit'] },
        sort: { type: 'string', enum: ['created_desc', 'created_asc', 'clicks_desc', 'slug_asc', 'recent_click'] },
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
    run: async (env, a, _p, origin) => {
      const r = await listLinks(env.DB, { q: a.query as string, tag: a.tag as string, status: a.status as never, sort: a.sort as never, page: Number(a.page) || 1, limit: Number(a.limit) || 25 }, origin);
      return { ...r, items: r.items.map((l) => ({ slug: l.slug, short_url: l.short_url, url: l.url, title: l.title, tags: l.tags, clicks: l.clicks, status: statusOf(l), id: l.id })) };
    },
  },
  {
    name: 'get_link',
    title: 'Get link',
    description: 'Get every setting of one link by slug or id.',
    scope: 'links:read',
    readOnly: true,
    inputSchema: { type: 'object', properties: { link: str('Slug or id') }, required: ['link'] },
    run: async (env, a, _p, origin) => {
      const l = toLink(await requireLink(env.DB, String(a.link)), origin);
      return { ...l, status: statusOf(l) };
    },
  },
  {
    name: 'create_link',
    title: 'Create link',
    description: 'Create a new short link and return its short URL.',
    scope: 'links:write',
    readOnly: false,
    inputSchema: { type: 'object', properties: linkFields, required: ['url'] },
    run: (env, a, p, origin) => createLink(env, a, p, origin),
  },
  {
    name: 'update_link',
    title: 'Update link',
    description: 'Change one or more settings of an existing link. Only the fields you pass are changed.',
    scope: 'links:write',
    readOnly: false,
    inputSchema: { type: 'object', properties: { link: str('Slug or id of the link to change'), ...linkFields }, required: ['link'] },
    run: async (env, a, p, origin) => {
      const { link, ...patch } = a;
      return updateLink(env, String(link), patch, p, origin);
    },
  },
  {
    name: 'delete_link',
    title: 'Delete link',
    description: 'Permanently delete a link and its analytics.',
    scope: 'links:write',
    readOnly: false,
    inputSchema: { type: 'object', properties: { link: str('Slug or id') }, required: ['link'] },
    run: async (env, a, p) => ({ deleted: await deleteLinks(env, [String(a.link)], p) }),
  },
  {
    name: 'list_tags',
    title: 'List tags',
    description: 'All tags with how many links use each.',
    scope: 'links:read',
    readOnly: true,
    inputSchema: { type: 'object', properties: {} },
    run: async (env) => ({ tags: await allTags(env.DB) }),
  },
  {
    name: 'get_analytics',
    title: 'Get analytics',
    description: 'Click analytics for the whole workspace or one link: totals, plus top countries, referrers, devices, browsers and links.',
    scope: 'analytics:read',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        link: str('Optional slug or id to limit to one link'),
        days: { type: 'integer', minimum: 1, maximum: 1095, description: 'Look-back window in days (default 30)' },
      },
    },
    run: async (env, a) => {
      const to = Date.now();
      const r = { from: to - (Number(a.days) || 30) * DAY, to, link: a.link ? (await requireLink(env.DB, String(a.link))).id : null };
      const [totals, countries, referrers, devices, browsers, links] = await Promise.all([
        summary(env.DB, r),
        breakdown(env.DB, r, 'country', 10),
        breakdown(env.DB, r, 'referrer', 10),
        breakdown(env.DB, r, 'device', 5),
        breakdown(env.DB, r, 'browser', 5),
        r.link ? Promise.resolve([]) : breakdown(env.DB, r, 'link', 10),
      ]);
      return { range: { from: new Date(r.from).toISOString(), to: new Date(r.to).toISOString() }, totals, countries, referrers, devices, browsers, top_links: links };
    },
  },
];

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const ok = (id: RpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
const fail = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handle(msg: RpcRequest, env: Bindings, p: Principal, origin: string) {
  switch (msg.method) {
    case 'initialize': {
      const requested = String(msg.params?.protocolVersion ?? '');
      return ok(msg.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'hoplane', title: KITGENIX.brand, version: VERSION, websiteUrl: KITGENIX.productWebsite },
        instructions: `Manage short links and read click analytics for this ${KITGENIX.product} instance. Built by Kitgenix: ${KITGENIX.website}`,
      });
    }
    case 'ping':
      return ok(msg.id, {});
    case 'tools/list':
      return ok(msg.id, {
        tools: TOOLS.filter((t) => p.scopes.includes(t.scope)).map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: t.readOnly, destructiveHint: t.name === 'delete_link', openWorldHint: false },
        })),
      });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return fail(msg.id, -32602, `Unknown tool: ${String(msg.params?.name)}`);
      if (!p.scopes.includes(tool.scope)) return ok(msg.id, { isError: true, content: [{ type: 'text', text: `Permission "${tool.scope}" is required` }] });
      try {
        const result = await tool.run(env, (msg.params?.arguments as Record<string, unknown>) ?? {}, p, origin);
        return ok(msg.id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result });
      } catch (err) {
        return ok(msg.id, { isError: true, content: [{ type: 'text', text: err instanceof Error ? err.message : 'Tool failed' }] });
      }
    }
    default:
      return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

const routes = new Hono<AppEnv>();

routes.get('/mcp', () => {
  throw new HttpError(405, 'This MCP server uses stateless POST requests only');
});

routes.post('/mcp', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json(fail(null, -32700, 'Parse error'), 400);
  const p = c.get('principal');
  const origin = new URL(c.req.url).origin;
  const messages: RpcRequest[] = Array.isArray(body) ? body : [body];
  const responses = [];
  for (const m of messages) {
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
      responses.push(fail(m?.id, -32600, 'Invalid request'));
      continue;
    }
    if (m.id === undefined) continue; // notification
    responses.push(await handle(m, c.env, p, origin));
  }
  if (!responses.length) return c.body(null, 202);
  return c.json(Array.isArray(body) ? responses : responses[0]);
});

export default routes;
