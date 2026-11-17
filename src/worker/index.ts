/**
 * Hoplane: a self-hosted link shortener that runs entirely on Cloudflare.
 * Copyright (c) 2026 Kitgenix.
 * https://kitgenix.com · https://github.com/Kitgenix/hoplane
 * See LICENSE and NOTICE for source-available licensing and attribution terms.
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

// Keep project attribution on Worker-generated responses. This header is
// supplemental: it does not replace the visible links required in HTML pages.
app.use('*', async (c, next) => {
  await next();
  c.header('Link', ATTRIBUTION_LINK_HEADER);
  c.header('X-Powered-By', KITGENIX.product);
});

// A liveness endpoint should remain usable when the D1 database is unavailable.
// It is not a database-readiness check.
app.get('/health', (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({ ok: true, product: KITGENIX.product, version: VERSION, by: KITGENIX.website });
});

app.get('/robots.txt', (c) =>
  c.text('User-agent: *\nDisallow: /dashboard\nDisallow: /api/\n'),
);

/* ------------------------------------------------------------------ API */

const api = new Hono<AppEnv>();

// The API needs D1 for authentication, setup and data operations. Do not
// initialise the schema just to serve static pages or health checks.
// IMPORTANT: ensureSchema's caching, concurrency and migration behaviour must
// be verified in src/worker/migrate.ts before production release.
api.use('*', async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

api.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
});

// Public authentication routes implement their own access checks where needed.
api.route('/', authRoutes);

// All remaining API routes require an authenticated session or scoped API key.
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

/* ------------------------------------------------------------------ Dashboard (React SPA) */

const DASHBOARD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

async function dashboard(c: { req: { raw: Request }; env: Bindings }) {
  if (!c.env.ASSETS) {
    return new Response('Dashboard assets are not built. Run `npm run build`.', { status: 500 });
  }

  const res = await c.env.ASSETS.fetch(c.req.raw);
  const out = new Response(res.body, res);
  for (const [key, value] of Object.entries(baseHeaders())) out.headers.set(key, value);
  out.headers.set('X-Frame-Options', 'DENY');
  out.headers.set('Cache-Control', 'no-store');

  // Vite injects inline scripts for hot reload in local development.
  if (!import.meta.env?.DEV) out.headers.set('Content-Security-Policy', DASHBOARD_CSP);
  return out;
}

app.get('/dashboard', dashboard);
app.get('/dashboard/*', dashboard);

/* ------------------------------------------------------------------ Public pages and redirects */

app.get('/', (c) => {
  const cfg = config(c.env);
  if (cfg.homeUrl) return c.redirect(cfg.homeUrl, 302);
  return landingPage(cfg.siteName, new URL(c.req.url).origin);
});

// Keep POST support until src/worker/redirect.ts has been checked: password-
// protected links may submit a form to the same short URL. In particular,
// verify that 307/308 redirects cannot unintentionally forward POST bodies.
app.on(['GET', 'HEAD', 'POST'], '/:slug{.+}', async (c) => {
  await ensureSchema(c.env.DB);
  return handleRedirect(c.req.raw, c.env, c.executionCtx, c.req.param('slug'));
});

app.notFound((c) =>
  messagePage(config(c.env).siteName, 404, 'Page not found', 'We could not find that page.', {
    href: '/',
    label: 'Go to homepage',
  }),
);

app.onError((err, c) => {
  console.error('Unhandled error', err);
  return messagePage(config(c.env).siteName, 500, 'Something went wrong', 'Please try again in a moment.');
});

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    // Maintenance is intentionally kept separate from request handling.
    // Review runMaintenance() and ensureSchema() before changing migration
    // behaviour for scheduled events.
    ctx.waitUntil(runMaintenance(env).then((result) => console.log('maintenance', JSON.stringify(result))));
  },
} satisfies ExportedHandler<Bindings>;

export { app };
