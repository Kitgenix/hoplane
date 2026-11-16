#!/usr/bin/env node
/**
 * Optional one-time setup for manual (non-button) deploys.
 * Creates the D1 database and KV namespace in your Cloudflare account,
 * writes their IDs into wrangler.jsonc, and generates a SETUP_TOKEN.
 *
 * Hoplane: https://kitgenix.com · https://github.com/Kitgenix
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const CONFIG = 'wrangler.jsonc';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (args) => execFileSync(npx, ['wrangler', ...args], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });

let config = readFileSync(CONFIG, 'utf8');
const dbName = config.match(/"database_name":\s*"([^"]+)"/)?.[1] ?? 'hoplane';

console.log('\n  Hoplane setup\n  https://kitgenix.com · https://github.com/Kitgenix\n');

if (/"database_id"/.test(config)) {
  console.log('✓ D1 database_id already set, skipping');
} else {
  console.log(`→ Creating D1 database "${dbName}"…`);
  const out = run(['d1', 'create', dbName]);
  const id = out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!id) throw new Error(`Could not read the database id from Wrangler output:\n${out}`);
  config = config.replace(/("database_name":\s*"[^"]+",)/, `$1\n      "database_id": "${id}",`);
  console.log(`✓ D1 database ${id}`);
}

if (/"binding":\s*"CACHE",\s*"id"/.test(config)) {
  console.log('✓ KV namespace id already set, skipping');
} else {
  console.log('→ Creating KV namespace "CACHE"…');
  const out = run(['kv', 'namespace', 'create', 'CACHE']);
  const id = out.match(/\b[0-9a-f]{32}\b/i)?.[0];
  if (!id) throw new Error(`Could not read the KV namespace id from Wrangler output:\n${out}`);
  config = config.replace(/("binding":\s*"CACHE")/, `$1,\n      "id": "${id}"`);
  console.log(`✓ KV namespace ${id}`);
}

writeFileSync(CONFIG, config);
const token = randomBytes(24).toString('base64url');

console.log(`
✓ wrangler.jsonc updated.

Next steps:
  1. npm run deploy
  2. Set your one-time setup token (keep it private):
       npx wrangler secret put SETUP_TOKEN
     Suggested value:  ${token}
  3. Open https://<your-worker>.workers.dev/dashboard and create your owner account.
`);
