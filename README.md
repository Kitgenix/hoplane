<div align="center">

# Hoplane

### by [Kitgenix](https://kitgenix.com)

**Every link has a destination.**

The self-hosted URL shortener for Cloudflare: fast, private, and packed with analytics.

Short links · QR codes · Privacy-first analytics · Geo & device targeting · A/B splits · Teams · API & MCP

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kitgenix/hoplane)

[Website](https://kitgenix.com/hoplane) · [Kitgenix.com](https://kitgenix.com) · [GitHub](https://github.com/Kitgenix)

</div>

---

Hoplane is a self-hosted URL shortener you deploy to **your own Cloudflare account**. It needs no servers, no external database and no third-party analytics, and it fits comfortably inside Cloudflare's free plan for most individuals and small teams.

## Features

**Links**
- Custom or auto-generated slugs, including nested paths such as `/promo/summer`
- Tags, private notes, search, filters, sorting and bulk actions
- 301 / 302 / 307 / 308 redirects, with optional query-string forwarding
- UTM builder that never overwrites parameters already in the destination
- Scheduled go-live, expiry date, click limits and a fallback URL after expiry
- Password-protected links (rate-limited against guessing)
- Optional "you are leaving" safety warning per link or for the whole instance
- Custom social previews (Open Graph and Twitter cards) for Slack, WhatsApp, LinkedIn, iMessage and more
- One-click fetch of title, description and image from the destination page

**Smart routing**
- Targeting rules by country, continent, device, OS, browser, language or referrer
- Weighted A/B splits across multiple destinations, recorded per variant

**QR codes**
- Designer with colours, rounded or dot styles and error-correction levels
- PNG export up to 4096px, plus SVG
- QR scans tracked separately from link clicks

**Analytics**
- Clicks, unique visitors and QR scans, with comparison to the previous period
- Time-series chart aligned to your local timezone
- Breakdowns by link, referrer, country, city, region, continent, device, browser, OS and language
- Live feed of recent clicks
- CSV export of click-level data
- **Privacy by design:** no cookies on visitors, no IP addresses stored, and coordinates rounded to about 11 km. Unique visitors use a hash whose salt is replaced daily, so people can't be tracked across days.
- Bots and crawlers excluded by default
- Configurable retention, cleaned up automatically every day

**Teams & security**
- Multiple users with **owner / admin / editor / viewer** roles
- API keys with scopes (`links:read`, `links:write`, `analytics:read`) and optional expiry
- Audit log of every change
- Domain blocklist to stop abuse
- PBKDF2 password hashing, revocable server-side sessions, `HttpOnly`/`SameSite=Strict` cookies, CSRF protection, strict Content Security Policy, and login rate limiting

**Developer friendly**
- REST API (see below)
- **MCP server** built in, so Claude, Cursor or any MCP client can create links and read analytics
- Import from JSON or CSV, including exports from other shorteners (Bitly-style, Shlink, YOURLS, Sink and others); export to JSON or CSV
- Optional nightly backups to R2
- Light and dark mode, responsive down to phone screens
- Integration tests that run inside the real Workers runtime

## How it works

```
                ┌──────────────────── Your Cloudflare account ────────────────────┐
Visitor ──▶ /:slug ──▶ Worker ──▶ KV (edge cache) ──miss──▶ D1 (links, users, clicks)
                         │
Team ─────▶ /dashboard ──┤  React dashboard (Workers Static Assets)
Scripts ──▶ /api/*  ─────┤  REST API (session cookie or API key)
AI ───────▶ /api/mcp ────┘  MCP server (API key)
                         Cron (daily): retention, salt rotation, session cleanup, R2 backup
                └─────────────────────────────────────────────────────────────────┘
```

- **Workers** serve redirects, the API and the dashboard from one deployment.
- **D1** (SQLite) is the source of truth. The schema migrates itself on first request, so there is no manual migration step.
- **KV** caches link lookups at the edge, so redirects stay fast worldwide.
- Analytics are written in the background after the redirect has been sent, so they never slow a visitor down.

## Before you start

You will need:

- **A Cloudflare account.** The free plan is enough. If you have never used Workers before, open **Workers & Pages** in the Cloudflare dashboard once and choose your free `workers.dev` subdomain.
- **For the one-click deploy (Option A):** a GitHub or GitLab account.
- **For the command line (Option B):** [Node.js](https://nodejs.org) 22.12 or newer and `git`.
- **Optional:** a domain that is already on Cloudflare, if you want short links such as `go.example.com/launch`.

### Make a setup token

The setup token is a one-time password that proves you own the deployment. Without it, nobody (including you) can create the first account. Generate a long random value with any of these:

```bash
openssl rand -base64 32                                                     # macOS / Linux
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # anywhere Node is installed
```

A password manager's generator works too. It must be at least 8 characters; 32 or more is recommended. **Save it in your password manager.** After setup you only need it again to recover a locked-out owner account (see [Troubleshooting](#troubleshooting)).

## Deploy

### Option A: one click (recommended)

1. Click **Deploy to Cloudflare** at the top of this page and sign in to Cloudflare.
2. Connect your GitHub or GitLab account and choose a name for the new repository. Cloudflare creates a copy of Hoplane in your account. It is a new repository, not a fork, and it is the code your deployment builds from.
3. Review the resources Cloudflare will create for you: a **Worker**, a **D1 database** and a **KV namespace**, each called `hoplane` by default. You can rename them.
4. When asked for **`SETUP_TOKEN`**, paste the token you made above.
5. Click **Create and deploy**. The first build takes a minute or two.
6. When it finishes, Cloudflare shows your Worker URL, for example `https://hoplane.<your-subdomain>.workers.dev`. Continue with [First sign-in](#first-sign-in).

From now on, every push to your repository's default branch rebuilds and redeploys automatically. You can follow builds under **Workers & Pages → hoplane → Deployments**.

### Option B: from the command line

```bash
# 1. Get the code (or clone your own fork)
git clone https://github.com/kitgenix/hoplane.git
cd hoplane

# 2. Install dependencies
npm install

# 3. Sign in to Cloudflare (opens your browser)
npx wrangler login

# 4. Build and deploy. The first deploy creates the D1 database and KV namespace for you.
npm run deploy

# 5. Set your setup token (paste it when prompted). It takes effect immediately.
npx wrangler secret put SETUP_TOKEN
```

The deploy prints your Worker URL. Continue with [First sign-in](#first-sign-in).

> **Prefer resource IDs written into the config?** Run `npm run setup` before step 4. It creates the D1 database and KV namespace, writes their IDs into `wrangler.jsonc`, and suggests a setup token. This is useful if you deploy from CI or want the IDs under version control.

## First sign-in

1. Open `https://<your-worker-url>/dashboard`.
2. On **Create your owner account**, enter your **setup token**, your name, your email and a password of at least 10 characters.
3. You are signed in as the **owner**. Setup closes for good as soon as this account exists, so the token cannot be used to create a second owner. Keep it private anyway, because it is your recovery route.
4. **Create your first link** under **Links**, then visit `https://<your-worker-url>/<slug>` to check that it redirects. The click appears under **Analytics** within a few seconds.

### Add your team

Go to **Settings → Team → Add team member** and enter their email, name, role and a temporary password. Hoplane does not send emails, so share the password with them securely and ask them to change it under **Settings → Account → Change password**.

| Role | Can do |
|---|---|
| **Owner** | Everything, including managing admins and other owners. There is always at least one owner. |
| **Admin** | Manage editors and viewers, security settings and the audit log, plus everything an editor can do |
| **Editor** | Create, edit, delete and import links, plus everything a viewer can do |
| **Viewer** | View links and analytics, export, and create read-only API keys |

### API keys and AI assistants

Under **Settings → API & MCP**, create a key, choose its permissions and an optional expiry. The key is shown **only once**, so copy it straight away. The same page shows the exact MCP config to paste into Claude, Cursor or another MCP client. See [API](#api) below.

## Use your own domain

Your domain must already be on your Cloudflare account, with its DNS managed by Cloudflare. A subdomain such as `go.example.com` or a whole short domain both work.

1. In the Cloudflare dashboard, open **Workers & Pages → hoplane → Settings → Domains & Routes**.
2. Click **Add → Custom domain**, enter the hostname (for example `go.example.com`) and confirm.
3. Cloudflare creates the DNS record and the HTTPS certificate for you, usually within a few minutes. If a DNS record already exists for that exact hostname, delete it first, or adding the custom domain will fail.
4. Open the dashboard on the new domain (`https://go.example.com/dashboard`). Short links are always shown with the domain you are viewing the dashboard on.

Optional extras:

- **Turn off the `workers.dev` address** so links only work on your domain: on the same page, disable **workers.dev**. If you deploy from the command line or Git, also add `"workers_dev": false` to `wrangler.jsonc`, or the next deploy turns it back on.
- **Keep the domain in code:** instead of the dashboard, add `"routes": [{ "pattern": "go.example.com", "custom_domain": true }]` to `wrangler.jsonc` and redeploy.
- **Send visitors who open the bare domain somewhere useful:** set `HOME_URL` (see below).

## Configuration

### Variables

These live in the `vars` block of [`wrangler.jsonc`](wrangler.jsonc):

| Variable | Default | Purpose |
|---|---|---|
| `SITE_NAME` | `Hoplane` | Name shown in the dashboard and on public pages |
| `HOME_URL` | *(empty)* | If set, `/` redirects here instead of showing the landing page |
| `SLUG_LENGTH` | `6` | Length of auto-generated slugs (4–32) |
| `CASE_SENSITIVE` | `false` | Treat `/Abc` and `/abc` as different links. Decide this before you create links. |
| `RETENTION_DAYS` | `365` | How long click-level analytics are kept. Link click totals are kept forever. |

**To change them:**

- **Option A:** edit `wrangler.jsonc` in your repository (the GitHub or GitLab web editor is fine) and commit. Cloudflare redeploys automatically.
- **Option B:** edit `wrangler.jsonc` and run `npm run deploy`.

> **Don't change variables only in the Cloudflare dashboard.** The next deploy replaces them with the values in `wrangler.jsonc`. **Settings → About** shows the values your instance is actually using.

### Secrets

| Secret | Purpose |
|---|---|
| `SETUP_TOKEN` | Needed to create the first owner account, and to recover from a lost owner account. Setup is impossible without it, so nobody else can claim a fresh deployment. |

Change it with `npx wrangler secret put SETUP_TOKEN`, or in the dashboard under **Workers & Pages → hoplane → Settings → Variables and Secrets**. Unlike variables, deploys do not overwrite secrets.

### In-app settings

Admins and owners can change these at any time under **Settings → Security**, with no redeploy needed:

- **Warning page for every link:** show a "you are leaving" page before every redirect.
- **Count bots and crawlers:** off by default, so analytics reflect real visitors.
- **Blocked domains:** destinations nobody on your instance can link to.

## Optional: nightly backups to R2

1. In the Cloudflare dashboard, open **R2 Object Storage** and enable R2. Backups fit well inside the free tier, but Cloudflare may ask you to add a payment method before R2 can be enabled.
2. In `wrangler.jsonc`, uncomment the `r2_buckets` block.
3. Redeploy (commit for Option A, `npm run deploy` for Option B). The `hoplane-backups` bucket is created on deploy. You can also create it yourself with `npx wrangler r2 bucket create hoplane-backups`.
4. Check **Settings → About**: **Nightly backups (R2)** should say **Enabled**.

Every night at 03:17 UTC, all your links are saved to `backups/links-YYYY-MM-DD.json` in the bucket. The backup includes links only, not users or click analytics. Old backups are never deleted automatically, so add a lifecycle rule to the bucket (**R2 → hoplane-backups → Settings → Object lifecycle rules**) if you only want to keep, say, 30 days.

**To restore:** download a backup file from the bucket, then upload it under **Import & export → Import links**.

## Updating

Database changes are applied automatically on the first request after a deploy, so updating is just a redeploy of the new code. Your version number is shown under **Settings → About**.

**Option A (one-click):** pull the latest Hoplane into your own repository and push:

```bash
git clone https://github.com/<you>/<your-repo>.git && cd <your-repo>
git remote add upstream https://github.com/kitgenix/hoplane.git
git pull upstream main    # the first time, you may need: --allow-unrelated-histories
git push                  # Cloudflare redeploys automatically
```

If there are conflicts in `wrangler.jsonc`, keep your own values.

**Option B (command line):**

```bash
git pull
npm install
npm run deploy
```

## Troubleshooting

| You see | What to do |
|---|---|
| *Setup is disabled. Set the SETUP_TOKEN secret…* | The secret is missing or shorter than 8 characters. Set it (see [Secrets](#secrets)) and reload the page. |
| *Setup token is incorrect* | It must match exactly. Watch for spaces or line breaks added when pasting. After 10 failed attempts from one network, wait 15 minutes. |
| *This instance is already set up* | An owner account already exists, so sign in instead. If you didn't create it, follow the lost-owner steps below immediately. |
| *Too many sign-in attempts* | Wait 15 minutes and try again. |
| A link edit hasn't taken effect | Edits reach every location within about 60 seconds. |
| Clicks are missing | 301 and 308 redirects are cached by browsers, so repeat visits aren't counted. Use 302. Bots are excluded unless you turn them on. |
| Custom domain doesn't load | The domain must be on the same Cloudflare account, and no other DNS record may exist for that hostname. |

**Forgotten password:** another owner or admin can set a new one under **Settings → Team**. Admins can reset editors and viewers; only an owner can reset admins and owners.

**Locked out, and you were the only owner:** delete all accounts and run setup again. Links, analytics and settings are kept; every user account, session and API key is removed.

```bash
npx wrangler d1 execute hoplane --remote --command "DELETE FROM users"
```

You can also run `DELETE FROM users;` from the Cloudflare dashboard under **Storage & databases → D1 → hoplane → Console**. Replace `hoplane` if you renamed the database. Then open `/dashboard`, create the owner account again with your `SETUP_TOKEN`, and re-add your team.

## Uninstalling

Export your links first (**Import & export → Export**). Then, in the Cloudflare dashboard, delete the **hoplane** Worker, the **hoplane** D1 database, the KV namespace and, if you set up backups, the **hoplane-backups** R2 bucket. From the command line:

```bash
npx wrangler delete
npx wrangler d1 delete hoplane
npx wrangler kv namespace list                     # find the CACHE namespace id
npx wrangler kv namespace delete --namespace-id <id>
```

## Local development

```bash
cp .dev.vars.example .dev.vars   # then set SETUP_TOKEN to any value of 8+ characters
npm install
npm run dev                      # open http://localhost:5173/dashboard
```

The first visit shows the setup screen, just like a real deployment; use the token from `.dev.vars`. Local data (D1 and KV) is stored in `.wrangler/state`. Delete that folder to start fresh.

| Command | What it does |
|---|---|
| `npm run dev` | Dashboard with hot reload plus the Worker running locally in `workerd` |
| `npm test` | Unit and integration tests in the Workers runtime (run `npm run build` first) |
| `npm run typecheck` | TypeScript checks for the Worker and the dashboard |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run setup` | Create D1 and KV and pin their IDs in `wrangler.jsonc` (optional) |
| `npm run db:migrate` | Apply migrations with Wrangler manually (optional, since the Worker migrates itself) |

**Project layout**

```
src/worker/     Cloudflare Worker: redirects, API, MCP, cron
src/client/     React dashboard (Vite + Tailwind)
src/shared/     Types and the Kitgenix attribution module shared by both
migrations/     D1 schema
tests/          Vitest suites running in workerd
```

## API

Authenticate with a session cookie (the dashboard) or `Authorization: Bearer hpl_…`. Create API keys under **Settings → API & MCP**.

```bash
curl -X POST https://go.example.com/api/links \
  -H "Authorization: Bearer $HPL_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/launch","slug":"launch","tags":["q4"],"utm":{"source":"newsletter"}}'
```

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/api/links?q=&tag=&status=&sort=&page=&limit=` | links:read | List and search links |
| POST | `/api/links` | links:write | Create a link |
| GET | `/api/links/:id` | links:read | Get a link |
| GET | `/api/links/lookup?slug=` | links:read | Get a link by slug |
| PATCH | `/api/links/:id` | links:write | Update fields |
| DELETE | `/api/links/:id` | links:write | Delete a link and its analytics |
| POST | `/api/links/bulk` | links:write | `{action: delete\|disable\|enable\|tag, ids, tags?}` |
| GET | `/api/links/check?slug=` | links:read | Slug availability |
| GET | `/api/tags` | links:read | Tags with counts |
| GET | `/api/meta?url=` | links:write | Fetch title, description and image from a page |
| POST | `/api/import` | links:write | `{links: [...], on_conflict: skip\|overwrite}` (max 1000 per call) |
| GET | `/api/export?format=json\|csv` | links:read | Export all links |
| GET | `/api/analytics/summary` | analytics:read | Totals vs the previous period |
| GET | `/api/analytics/timeseries?interval=hour\|day` | analytics:read | Clicks and visitors over time |
| GET | `/api/analytics/breakdown?dimension=` | analytics:read | `country, city, region, continent, referrer, device, os, browser, language, link, source` |
| GET | `/api/analytics/live?since=` | analytics:read | Most recent clicks |
| GET | `/api/analytics/export` | analytics:read | Click-level CSV |
| POST | `/api/mcp` | per tool | MCP server (JSON-RPC over Streamable HTTP) |

All analytics endpoints accept `from`, `to` (ms or ISO 8601), `link` (id or slug) and `tz` (UTC offset in minutes).

**Link fields:** `url`, `slug`, `title`, `description`, `image`, `notes`, `tags[]`, `redirect_code`, `forward_query`, `utm{source,medium,campaign,term,content}`, `rules[{field,op,values[],url}]`, `variants[{url,weight}]`, `password`, `warning`, `starts_at`, `expires_at`, `expired_url`, `max_clicks`, `disabled`.

### MCP (AI assistants)

```json
{
  "mcpServers": {
    "hoplane": {
      "type": "http",
      "url": "https://go.example.com/api/mcp",
      "headers": { "Authorization": "Bearer hpl_your_key" }
    }
  }
}
```

Tools: `list_links`, `get_link`, `create_link`, `update_link`, `delete_link`, `list_tags`, `get_analytics`. Tools are filtered by the key's scopes.

## Limits & notes

- **Free plan:** 100,000 Worker requests per day, plus D1 and KV free allowances. Each redirect costs one Worker request, one KV read (or one D1 read on a cache miss) and two D1 writes for analytics. For heavier traffic, the $5/month Workers Paid plan raises these limits substantially.
- **Edits propagate within about 60 seconds** to every location, because the KV cache is eventually consistent. Click limits always read fresh data.
- **301/308 redirects** are cached by browsers, so repeat visits from the same browser may not be counted. Use 302 (the default) for accurate analytics.
- Unique visitors are counted per day; a visitor who returns on another day counts again.
- `RETENTION_DAYS` applies to click-level rows. Link click totals are kept forever.

## Attribution & licence

Hoplane is free to use, fork, modify and self-host, including commercially, under the [Hoplane Licence](LICENSE). The one condition: **every deployment must keep visible, working links to [Kitgenix.com](https://kitgenix.com) and [github.com/Kitgenix](https://github.com/Kitgenix)** on its HTML pages. They are already in the dashboard footer and sidebar, the sign-in page, and all public pages.

The links live in one place, [`src/shared/attribution.ts`](src/shared/attribution.ts), and the test suite fails if they are removed. Restyle them however you like; just keep them visible.

## Contributing

Issues and pull requests are welcome. Please run `npm run typecheck && npm run build && npm test` before opening a PR. Security problems: see [SECURITY.md](SECURITY.md).

---

<div align="center">
Made by <a href="https://kitgenix.com">Kitgenix</a> · <a href="https://github.com/Kitgenix">GitHub</a>
</div>
