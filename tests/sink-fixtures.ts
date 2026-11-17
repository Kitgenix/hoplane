const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Reproduces Sink's hashLinkPassword (github.com/miantiao-me/sink, server/utils/link-password.ts). */
export async function sinkHash(password: string, iterations = 10_000): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
  return `sink-pwd:v1:${iterations}:${b64u(salt)}:${b64u(hash)}:${b64u(enc.encode([...password].slice(-3).join('')))}`;
}
