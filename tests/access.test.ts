import { beforeEach, describe, expect, it } from 'vitest';
import { accessConfig, clearAccessKeyCache, verifyAccessJwt } from '../src/worker/lib/access';
import { AUD, TEAM, accessJwt, accessKey } from './access-fixtures';

describe('Cloudflare Access configuration', () => {
  it('needs a cloudflareaccess.com team domain and an AUD tag', () => {
    expect(accessConfig({ ACCESS_TEAM_DOMAIN: `https://${TEAM}/`, ACCESS_AUD: AUD })).toEqual({ issuer: `https://${TEAM}`, aud: AUD });
    expect(accessConfig({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: '' })).toBeNull();
    expect(accessConfig({ ACCESS_TEAM_DOMAIN: 'evil.example.com', ACCESS_AUD: AUD })).toBeNull();
    expect(accessConfig({})).toBeNull();
  });
});

describe('Cloudflare Access tokens', () => {
  const cfg = accessConfig({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD })!;
  let key: Awaited<ReturnType<typeof accessKey>>;
  let certCalls = 0;
  const certs = async (url: string) => {
    expect(url).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
    certCalls++;
    return Response.json({ keys: [key.jwk] });
  };
  beforeEach(async () => {
    clearAccessKeyCache();
    certCalls = 0;
    key ??= await accessKey();
  });

  it('accepts a valid token', async () => {
    const claims = await verifyAccessJwt(await accessJwt(key, { email: 'Person@Example.com' }), cfg, certs);
    expect(claims).toMatchObject({ email: 'person@example.com', sub: 'user-1' });
  });

  it('rejects tokens for another application, issuer, or time', async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const claims of [{ aud: ['other-app'] }, { iss: 'https://other.cloudflareaccess.com' }, { exp: now - 600 }, { nbf: now + 600 }]) {
      expect(await verifyAccessJwt(await accessJwt(key, claims), cfg, certs), JSON.stringify(claims)).toBeNull();
    }
  });

  it('rejects forged, unsigned and service tokens', async () => {
    const attacker = await accessKey('key-1'); // same kid, different key
    expect(await verifyAccessJwt(await accessJwt(attacker), cfg, certs)).toBeNull();
    const valid = await accessJwt(key);
    const [h, , s] = valid.split('.');
    const tampered = `${h}.${btoa(JSON.stringify({ aud: [AUD], email: 'admin@example.com', exp: 9e9, iss: `https://${TEAM}` })).replace(/=+$/, '')}.${s}`;
    expect(await verifyAccessJwt(tampered, cfg, certs)).toBeNull();
    expect(await verifyAccessJwt(await accessJwt(key, {}, { alg: 'none' }), cfg, certs)).toBeNull();
    expect(await verifyAccessJwt(await accessJwt(key, {}, { alg: 'HS256' }), cfg, certs)).toBeNull();
    expect(await verifyAccessJwt(await accessJwt(key, { email: undefined, common_name: 'svc.access' }), cfg, certs)).toBeNull();
    expect(await verifyAccessJwt('not-a-jwt', cfg, certs)).toBeNull();
  });

  it('caches keys and limits refreshes for unknown key ids', async () => {
    await verifyAccessJwt(await accessJwt(key), cfg, certs);
    await verifyAccessJwt(await accessJwt(key), cfg, certs);
    expect(certCalls).toBe(1);
    for (let i = 0; i < 5; i++) await verifyAccessJwt(await accessJwt(key, {}, { kid: `forged-${i}` }), cfg, certs);
    expect(certCalls).toBe(1); // within a minute of the last fetch, unknown kids do not refetch
  });
});
