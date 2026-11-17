const enc = new TextEncoder();
const b64u = (data: Uint8Array | string) =>
  btoa(String.fromCharCode(...(typeof data === 'string' ? enc.encode(data) : data))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const TEAM = 'hoplane-test.cloudflareaccess.com';
export const AUD = 'a1b2c3d4e5f6';

/** An RSA key pair standing in for a Cloudflare Access team signing key. */
export async function accessKey(kid = 'key-1') {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = { ...((await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey), kid, alg: 'RS256', use: 'sig' };
  return { kid, privateKey: pair.privateKey, jwk };
}

/** Sign a token shaped like the ones Access issues. */
export async function accessJwt(key: { kid: string; privateKey: CryptoKey }, claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...header }));
  const p = b64u(JSON.stringify({ aud: [AUD], email: 'person@example.com', exp: now + 3600, iat: now, nbf: now, iss: `https://${TEAM}`, sub: 'user-1', type: 'app', ...claims }));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, enc.encode(`${h}.${p}`)));
  return `${h}.${p}.${b64u(sig)}`;
}
