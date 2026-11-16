/**
 * Hoplane: a self-hosted link shortener that runs entirely on Cloudflare.
 * © Kitgenix. https://kitgenix.com · https://github.com/Kitgenix
 * Licensed under the Kitgenix Attribution Licence: see LICENSE.
 */
import { Hono } from 'hono';
import { ATTRIBUTION_LINK_HEADER, KITGENIX } from '../shared/attribution';
import { authenticate } from './auth';
import { runMaintenance } from './cron';
import { VERSION, config, type AppEnv, type Bindings } from './env';
import { HttpError } from './lib/errors';
import { baseHeaders, landingPage, messagePage } from './lib/html';
import { ensureSchema } from './migrate';
import { handleRedirect } from './redirect';
import adminRoutes from './routes/admin';
import analyticsRoutes from './routes/analytics';
import authRoutes from './routes/auth';
import linkRoutes from './routes/links';
import mcpRoutes from './routes/mcp';

const app = new Hono<AppEnv>();

// Attribution header on every response, then make sure the database schema is current.
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('Link', ATTRIBUTION_LINK_HEADER);
  c.res.headers.set('X-Powered-By', KITGENIX.product);
});

app.get('/health', (c) => c.json({ ok: true, product: KITGENIX.product, version: VERSION, by: KITGENIX.website }));
app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /dashboard\nDisallow: /api/\n'));

app.use('*', async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

/* ------------------------------------------------------------------ API */

const api = new Hono<AppEnv>();
api.use('*', async (c, next) => {
  await next();
  c.res.headers.set('Cache-Control', 'no-store');
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
});
api.route('/', authRoutes); // public: /instance, /auth/setup, /auth/login, /auth/logout (+ /auth/me guarded inside)
api.use('*', authenticate);
api.route('/', linkRoutes);
api.route('/', analyticsRoutes);
api.route('/', adminRoutes);
api.route('/', mcpRoutes);
api.all('*', () => {
  throw new HttpError(404, 'API endpoint not found');
});
api.onError((err, c) => {
  if (err instanceof HttpError) {
    if (err.status === 401) c.header('WWW-Authenticate', 'Bearer realm="hoplane"');
    return c.json({ error: err.message, details: err.details }, err.status as 400);
  }
  console.error('API error', err);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});
app.route('/api', api);

/* ------------------------------------------------------------------ dashboard (React SPA) */

const DASHBOARD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

async function dashboard(c: { req: { raw: Request }; env: Bindings }) {
  if (!c.env.ASSETS) return new Response('Dashboard assets are not built. Run `npm run build`.', { status: 500 });
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(baseHeaders())) out.headers.set(k, v);
  out.headers.set('X-Frame-Options', 'DENY');
  out.headers.set('Cache-Control', 'no-store');
  // Vite's dev server injects inline scripts for hot reload, so the strict CSP is production-only.
  if (!import.meta.env?.DEV) out.headers.set('Content-Security-Policy', DASHBOARD_CSP);
  return out;
}
app.get('/dashboard', dashboard);
app.get('/dashboard/*', dashboard);

/* ------------------------------------------------------------------ public */

app.get('/', (c) => {
  const cfg = config(c.env);
  if (cfg.homeUrl) return c.redirect(cfg.homeUrl, 302);
  return landingPage(cfg.siteName, new URL(c.req.url).origin);
});

app.on(['GET', 'HEAD', 'POST'], '/:slug{.+}', (c) => handleRedirect(c.req.raw, c.env, c.executionCtx, c.req.param('slug')));

app.notFound((c) => messagePage(config(c.env).siteName, 404, 'Page not found', 'We could not find that page.', { href: '/', label: 'Go to homepage' }));

app.onError((err, c) => {
  console.error('Unhandled error', err);
  return messagePage(config(c.env).siteName, 500, 'Something went wrong', 'Please try again in a moment.');
});

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runMaintenance(env).then((r) => console.log('maintenance', JSON.stringify(r))));
  },
} satisfies ExportedHandler<Bindings>;

export { app };
