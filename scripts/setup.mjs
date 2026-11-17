#!/usr/bin/env node
/**
 * Optional manual resource setup for Hoplane.
 * Creates and pins the D1 (DB) and KV (CACHE) IDs in this checkout's wrangler.jsonc.
 * Normally unnecessary: current Wrangler can provision ID-less resources on deploy.
 *
 * This script must be run after `npm ci` or `npm install` and `wrangler login`.
 * It does NOT deploy Hoplane, apply D1 migrations, or create the owner account.
 *
 * Hoplane by Kitgenix: https://kitgenix.com
 * Original project: https://github.com/Kitgenix/hoplane
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'wrangler.jsonc');
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const KV_ID = /\b[0-9a-f]{32}\b/i;

function loadConfig() {
  const source = readFileSync(CONFIG_PATH, 'utf8');
  const parsed = ts.parseConfigFileTextToJson(CONFIG_PATH, source);
  if (parsed.error) {
    throw new Error('wrangler.jsonc could not be parsed; fix its syntax before running setup.');
  }
  return { source, data: parsed.config };
}

function binding(data, collection, name) {
  const matches = (data[collection] ?? []).filter((entry) => entry.binding === name);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${collection} entry with binding "${name}".`);
  }
  return matches[0];
}

/**
 * Make a minimal, in-place edit to the single matching binding object.
 * We do not reserialize JSONC, which would remove the project's comments.
 */
function pinId(collection, bindingName, key, id) {
  const { source, data } = loadConfig();
  if (binding(data, collection, bindingName)[key]) {
    throw new Error(`${collection}/${bindingName} already has ${key}; refusing to overwrite it.`);
  }

  const section = new RegExp(`"${collection}"\\s*:\\s*\\[([\\s\\S]*?)\\]`).exec(source);
  if (!section) throw new Error(`Cannot locate ${collection} in wrangler.jsonc`);

  const objects = [...section[1].matchAll(/\{[^{}]*\}/g)];
  const matches = objects.filter((m) => new RegExp(`"binding"\\s*:\\s*"${bindingName}"`).test(m[0]));
  if (matches.length !== 1) throw new Error(`Cannot safely locate the ${bindingName} object for editing.`);

  const obj = matches[0][0];
  const objOffset = section.index + section[0].indexOf(section[1]) + matches[0].index;
  const closingIndent = /\n([ \t]*)\}$/.exec(obj)?.[1] ?? '    ';
  const fieldIndent = /\n([ \t]*)"binding"/.exec(obj)?.[1] ?? `${closingIndent}  `;
  const body = obj.slice(0, -1).trimEnd();
  const separator = body.endsWith(',') ? '' : ',';
  const updated = `${body}${separator}\n${fieldIndent}"${key}": "${id}"\n${closingIndent}}`;
  const output = source.slice(0, objOffset) + updated + source.slice(objOffset + obj.length);

  const parsed = ts.parseConfigFileTextToJson(CONFIG_PATH, output);
  if (parsed.error || binding(parsed.config, collection, bindingName)[key] !== id) {
    throw new Error(`Refusing to write an invalid ${key} update.`);
  }
  writeFileSync(CONFIG_PATH, output, 'utf8');
}

function wrangler(args) {
  try {
    return execFileSync(NPX, ['--no-install', 'wrangler', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = String(error.stderr ?? error.message ?? '').trim();
    throw new Error(`Wrangler failed (${args.join(' ')}). ${detail}\nCheck Cloudflare for resources created before retrying.`);
  }
}

function run() {
  console.log('\nHoplane manual resource setup — by Kitgenix\n');
  console.log('This changes your local wrangler.jsonc and creates resources in YOUR Cloudflare account.');
  console.log('For normal one-click deployment, you do not need to run this script.\n');

  let { data } = loadConfig();
  const db = binding(data, 'd1_databases', 'DB');
  binding(data, 'kv_namespaces', 'CACHE');
  if (!db.database_name || typeof db.database_name !== 'string') {
    throw new Error('DB requires a database_name in wrangler.jsonc');
  }

  if (db.database_id) {
    console.log('✓ DB already has a pinned database_id; leaving it unchanged.');
  } else {
    console.log(`→ Creating D1 database "${db.database_name}"`);
    const output = wrangler(['d1', 'create', db.database_name]);
    const id = output.match(/database_id\s*[=:]\s*["']?([0-9a-f-]{36})/i)?.[1] ?? output.match(UUID)?.[0];
    if (!id || !UUID.test(id)) {
      throw new Error('D1 was created but its ID could not be parsed. Locate the new database in Cloudflare and add database_id manually before rerunning.');
    }
    pinId('d1_databases', 'DB', 'database_id', id);
    console.log('✓ Pinned D1 database ID in wrangler.jsonc.');
  }

  ({ data } = loadConfig());
  const kv = binding(data, 'kv_namespaces', 'CACHE');
  if (kv.id) {
    console.log('✓ CACHE already has a pinned id; leaving it unchanged.');
  } else {
    console.log('→ Creating KV namespace for binding "CACHE"');
    const output = wrangler(['kv', 'namespace', 'create', 'CACHE']);
    const id = output.match(/\bid\s*[=:]\s*["']?([0-9a-f]{32})/i)?.[1] ?? output.match(KV_ID)?.[0];
    if (!id || !KV_ID.test(id)) {
      throw new Error('KV namespace was created but its ID could not be parsed. Locate it in Cloudflare and add its id manually before rerunning.');
    }
    pinId('kv_namespaces', 'CACHE', 'id', id);
    console.log('✓ Pinned KV namespace ID in wrangler.jsonc.');
  }

  const token = randomBytes(32).toString('base64url');
  console.log(`
✓ Resource setup completed.

NEXT STEPS
  1. Review the updated wrangler.jsonc and keep account-specific IDs out of the
     shared upstream template. Commit them only in your private deployment repo
     if that suits your deployment process.
  2. Deploy: npm run deploy
  3. Store a secret: npx wrangler secret put SETUP_TOKEN
     Suggested randomly generated value (shown only now):
     ${token}
     Store it privately; it may also be needed for owner recovery.
  4. Verify the database migration mechanism before first sign-in. If Hoplane's
     runtime migrator is not implemented/verified, apply migrations explicitly:
     npm run db:migrate
  5. Visit your Worker URL + /dashboard to create the first owner account.

WARNING: This command does not apply database migrations or test the deployed app.
`);
}

try {
  run();
} catch (error) {
  console.error(`\nSetup stopped: ${error.message}`);
  process.exitCode = 1;
}