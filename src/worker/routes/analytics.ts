import { Hono } from 'hono';
import type { Dimension } from '../../shared/types';
import { DIMENSIONS } from '../../shared/types';
import { requireScope } from '../auth';
import type { AppEnv } from '../env';
import { badRequest } from '../lib/errors';
import { breakdown, exportClicksCsv, live, parseRange, summary, timeseries, type Range } from '../services/analytics';
import { requireLink } from '../services/links';

const routes = new Hono<AppEnv>();
routes.use('/analytics/*', requireScope('analytics:read'));

/** `link` may be an id or a slug. */
async function range(c: { req: { url: string }; env: AppEnv['Bindings'] }): Promise<Range> {
  const r = parseRange(new URL(c.req.url).searchParams);
  if (r.link) r.link = (await requireLink(c.env.DB, r.link)).id;
  return r;
}

routes.get('/analytics/summary', async (c) => c.json(await summary(c.env.DB, await range(c))));

routes.get('/analytics/timeseries', async (c) => {
  const interval = c.req.query('interval');
  return c.json(await timeseries(c.env.DB, await range(c), interval === 'hour' || interval === 'day' ? interval : undefined));
});

routes.get('/analytics/breakdown', async (c) => {
  const dim = c.req.query('dimension') as Dimension;
  if (!DIMENSIONS.includes(dim)) throw badRequest(`dimension must be one of: ${DIMENSIONS.join(', ')}`);
  return c.json({ dimension: dim, items: await breakdown(c.env.DB, await range(c), dim, Number(c.req.query('limit')) || 10) });
});

routes.get('/analytics/live', async (c) => {
  const link = c.req.query('link');
  return c.json({
    items: await live(c.env.DB, {
      since: Number(c.req.query('since')) || 0,
      link: link ? (await requireLink(c.env.DB, link)).id : null,
      limit: Number(c.req.query('limit')) || 30,
    }),
  });
});

routes.get('/analytics/export', async (c) => {
  const csv = await exportClicksCsv(c.env.DB, await range(c));
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="clicks-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' },
  });
});

export default routes;
