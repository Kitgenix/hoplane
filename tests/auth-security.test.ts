import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../src/worker/env';
import { protectAuthWrite, requireJson } from '../src/worker/auth';
import { HttpError } from '../src/worker/lib/errors';

function testApp() {
  const app = new Hono<AppEnv>();
  app.use('/auth/*', protectAuthWrite);
  app.onError((err, c) => err instanceof HttpError ? c.json({ error: err.message }, err.status as 400) : c.json({ error: 'Unexpected error' }, 500));
  app.post('/auth/login', (c) => { requireJson(c); return c.json({ ok: true }); });
  app.post('/auth/logout', (c) => c.json({ ok: true }));
  return app;
}

const url = 'https://go.example.org/auth/login';
const jsonHeaders = { 'Content-Type': 'application/json' };

describe('authentication CSRF and content-type checks', () => {
  it('permits a same-origin JSON request', async () => {
    const r = await testApp().request(url, { method: 'POST', headers: { ...jsonHeaders, Origin: 'https://go.example.org', 'Sec-Fetch-Site': 'same-origin' }, body: '{}' });
    expect(r.status).toBe(200);
  });
  it('rejects cross-origin credentials POST', async () => {
    const r = await testApp().request(url, { method: 'POST', headers: { ...jsonHeaders, Origin: 'https://evil.example.org' }, body: '{}' });
    expect(r.status).toBe(403);
  });
  it('rejects same-site sibling domains', async () => {
    const r = await testApp().request(url, { method: 'POST', headers: { ...jsonHeaders, 'Sec-Fetch-Site': 'same-site' }, body: '{}' });
    expect(r.status).toBe(403);
  });
  it('rejects HTML form posts even without Origin headers', async () => {
    const r = await testApp().request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a' });
    expect(r.status).toBe(415);
  });
  it('allows non-browser JSON clients without origin headers', async () => {
    const r = await testApp().request(url, { method: 'POST', headers: jsonHeaders, body: '{}' });
    expect(r.status).toBe(200);
  });
  it('rejects cross-origin logout requests', async () => {
    const r = await testApp().request('https://go.example.org/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example.org' } });
    expect(r.status).toBe(403);
  });
});
