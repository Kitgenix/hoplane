<div align="center">

# Hoplane

### by [Kitgenix](https://kitgenix.com)

**Every link has a destination.**

A self-hosted URL shortener and link management platform built for Cloudflare.

**Short links · QR codes · Privacy-first analytics · Smart redirects · Teams · REST API · MCP**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Kitgenix/hoplane)

[Get started](#quick-start) · [Features](#features) · [Documentation](#documentation) · [Roadmap](ROADMAP.md) · [Security](SECURITY.md) · [Kitgenix](https://kitgenix.com)

</div>

---

## Overview

**Hoplane** lets you create and manage short links, generate branded QR codes, analyse traffic, and automate link workflows-while running the application in **your own Cloudflare account**.

There is no traditional server to maintain and no separate database provider to configure. Hoplane uses **Cloudflare Workers**, **D1**, and **Workers KV**, with optional **R2** backups. The dashboard, redirects, REST API, and MCP endpoint are served by the same Worker deployment.

Hoplane is designed for individuals, developers, organisations, and teams that want control over their links and data. It can be deployed on Cloudflare's Free plan **subject to that plan's current usage and resource limits**. Larger installations may require a paid plan.

> [!IMPORTANT]
> **Before using Hoplane in production:** test a fresh deployment, secure your Cloudflare account, configure `SETUP_TOKEN`, verify that redirects and backups work, and review the [Security Policy](SECURITY.md). The features and commands below describe the supplied project documentation; operators should verify them against the version they deploy.

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [First sign-in](#first-sign-in)
- [Custom domain](#custom-domain)
- [Configuration](#configuration)
- [Optional R2 backups](#optional-r2-backups)
- [Updating and maintaining your deployment](#updating-and-maintaining-your-deployment)
- [Troubleshooting and account recovery](#troubleshooting-and-account-recovery)
- [Local development](#local-development)
- [API reference](#api-reference)
- [MCP integration](#mcp-integration)
- [Limits and operational notes](#limits-and-operational-notes)
- [Uninstalling](#uninstalling)
- [Security, licence, and attribution](#security-licence-and-attribution)
- [Contributing](#contributing)

## Features

<details open>
<summary><strong>Links and campaigns</strong></summary>

- Custom or automatically generated slugs, including nested paths such as `/promo/summer`.
- Tags, private notes, search, filtering, sorting, and bulk actions.
- HTTP `301`, `302`, `307`, and `308` redirects, with optional query-string forwarding.
- UTM campaign builder that preserves parameters already present in the destination.
- Scheduled activation, expiry, fallback destinations, and click limits.
- Password-protected links with rate limiting against guessing.
- Optional redirect warning pages on individual links or the whole instance.
- Custom Open Graph and social preview metadata, including automatic destination-page metadata fetching.

</details>

<details open>
<summary><strong>Smart redirects</strong></summary>

- Destination targeting by country, continent, device, operating system, browser, language, or referrer.
- Weighted A/B splits across multiple destinations, with analytics recorded by variant.

</details>

<details open>
<summary><strong>QR codes</strong></summary>

- QR code designer with configurable colours, shapes, and error-correction levels.
- PNG exports up to 4096 px and scalable SVG exports.
- QR scans tracked separately from ordinary link clicks.

</details>

<details open>
<summary><strong>Privacy-conscious analytics</strong></summary>

- Clicks, unique visitors, and QR scans, including previous-period comparisons.
- Time-series charts aligned with the selected local timezone.
- Breakdowns by link, referrer, country, city, region, continent, device, browser, operating system, and language; the API also supports `source`.
- Recent-click activity feed and click-level CSV exports.
- Application analytics designed not to store visitor IP addresses or require visitor tracking cookies.
- Approximate location coordinates (rounded to roughly 11 km, according to the project specification).
- Daily salt rotation for unique-visitor hashes, preventing continuity of that identifier across days.
- Bots and crawlers excluded by default; configurable retention and scheduled cleanup.

> [!NOTE]
> Hoplane's analytics privacy controls do not govern all data that Cloudflare, browser vendors, or network providers may process or retain independently. Review your deployment and applicable privacy obligations.

</details>

<details open>
<summary><strong>Teams and security</strong></summary>

- Owner, admin, editor, and viewer roles.
- Scoped API keys (`links:read`, `links:write`, and `analytics:read`) with optional expiry.
- Administrative audit log and destination-domain blocklist.
- Password hashing, revocable sessions, secured session cookies, origin checks, browser security headers, and login rate limiting as described in [SECURITY.md](SECURITY.md).

</details>

<details open>
<summary><strong>Developer tools and operations</strong></summary>

- REST API and integrated MCP server for supported AI assistants and other clients.
- JSON and CSV import/export, including common shortener export formats (such as Bitly-style, Shlink, YOURLS, and Sink data).
- Optional nightly link backups to Cloudflare R2.
- Light/dark dashboard and responsive layouts.
- Unit and integration tests using the Workers runtime.

</details>

For proposed functionality, see the [Roadmap](ROADMAP.md). Listed features should be validated in the specific version being deployed.

## Architecture

```text
                      YOUR CLOUDFLARE ACCOUNT

Visitor ──> /:slug ────────┐
Team ─────> /dashboard ────┤       ┌────────────────────────┐
Apps ─────> /api/* ────────┼──────>│ Cloudflare Worker      │
MCP ──────> /api/mcp ──────┘       │ redirects + API + UI   │
                                   └───────────┬────────────┘
                                              │
                                  ┌───────────┴────────────┐
                                  │                        │
                              Workers KV                 D1
                              link cache       links / users / clicks

Daily scheduled tasks: retention cleanup, visitor-salt rotation,
session cleanup, and optional link backup to Cloudflare R2.
```

| Component | Responsibility |
|---|---|
| **Cloudflare Workers** | Handles redirects, API requests, MCP, and application logic. |
| **Workers Static Assets** | Serves the React dashboard from the deployment. |
| **D1** | Stores links, users, settings, and click data. |
| **Workers KV** | Caches link lookups across Cloudflare locations. |
| **R2 (optional)** | Stores scheduled JSON exports of links. |
| **Cron Triggers** | Runs periodic maintenance jobs and optional backups. |

The project documentation describes automatic schema migration on the first request following deployment. **Test initial migrations and upgrades before relying on this behaviour for production data.** Analytics writes are designed to run in the background rather than block the redirect response.

## Quick start

### Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/). If necessary, activate Workers and choose your `workers.dev` subdomain.
- **One-click deployment:** a GitHub or GitLab account for Cloudflare to create a repository copy.
- **CLI deployment:** [Node.js](https://nodejs.org/) **22.12+**, Git, and access to Wrangler.
- **Optional:** a domain managed in the same Cloudflare account, for example `go.example.com`.

### 1. Generate a setup token

`SETUP_TOKEN` is needed to create the initial owner account and is also used by the documented recovery process. Generate a strong, unique secret and keep it in a password manager.

**macOS / Linux:**

```bash
openssl rand -base64 32
```

**Node.js:**

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The application documentation specifies a minimum of eight characters; **32 random bytes or equivalent is strongly recommended**. Never commit this token to source control, add it to a plaintext `vars` block, or paste it into an issue.

### 2A. Deploy to Cloudflare (recommended)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Kitgenix/hoplane)

1. Open the deployment button and sign in to Cloudflare.
2. Connect GitHub or GitLab and review the new repository name. Cloudflare creates a **new copy**, not necessarily a GitHub fork.
3. Review the Worker and the D1/KV resources being provisioned. The project uses `hoplane` as the default resource name; the deployment UI may allow changes.
4. Supply `SETUP_TOKEN` as a **secret** if prompted during setup. If no secret prompt is presented, create it under **Workers & Pages → your Worker → Settings → Variables and Secrets** after deployment. Choose the **Secret** type, not plaintext.
5. Confirm the build and deployment. If a step fails, inspect the build log and the provisioned bindings.
6. Open the Worker URL provided by Cloudflare and continue with [First sign-in](#first-sign-in).

Cloudflare's deploy-button workflow can provision supported bindings and connect the new repository to Workers Builds. **Confirm the actual repository and deployment branch in Cloudflare before relying on automatic deployments.**

### 2B. Deploy with the CLI

```bash
# Clone the main project (or replace with your own fork URL).
git clone https://github.com/Kitgenix/hoplane.git
cd hoplane

# Install the project dependencies.
npm install

# Authenticate with Cloudflare.
npx wrangler login

# Build and deploy using the project's script.
npm run deploy

# Set the private setup token (you will be prompted for its value).
npx wrangler secret put SETUP_TOKEN
```

The deployment should display a Worker URL. Verify that D1 and KV bindings were created and attached, then continue with [First sign-in](#first-sign-in).

**Optional resource setup:** `npm run setup` is documented to create D1 and KV resources and write their IDs to `wrangler.jsonc`. Use it before deployment if you want explicit resource IDs in your configuration. Review and protect repository-specific settings before committing them.

> [!TIP]
> Check the latest [Cloudflare deploy-button documentation](https://developers.cloudflare.com/workers/platform/deploy-buttons/) if the UI or resource-provisioning prompts differ from these instructions.

## First sign-in

1. Open `https://YOUR-WORKER-URL/dashboard` (replace `YOUR-WORKER-URL` with your actual hostname).
2. On **Create your owner account**, enter the saved `SETUP_TOKEN`, name, email, and a password of at least **10 characters**.
3. Confirm you can sign in as the **owner**. Initial account setup closes after an owner is created; keep the token secure for the documented recovery process.
4. Create a link under **Links** and test its short URL in a separate browser session.
5. Open **Analytics** and confirm that activity appears as expected.
6. Before sharing the instance, review **Settings → Security**, your domain policy, and team access.

### Team roles

Add team members under **Settings → Team → Add team member**. Hoplane does not send invitation email, according to the supplied documentation, so share initial passwords through a secure channel and require the user to change theirs.

| Role | Documented permissions |
|---|---|
| **Owner** | Full access, including management of admins and owners; at least one owner must exist in normal operation. |
| **Admin** | Manages editors/viewers, security settings, and audit records; inherits editor capabilities. |
| **Editor** | Creates, edits, deletes, and imports links; inherits viewer capabilities. |
| **Viewer** | Views links and analytics, exports data, and can create read-only API keys. |

### API keys

Go to **Settings → API & MCP**, create a key with the minimum necessary scopes, and optionally set its expiration. **Copy the key immediately:** it is displayed only once. Avoid using a privileged key in a public browser application or committed configuration file.

## Custom domain

A custom hostname such as `go.example.com` must be managed by Cloudflare in the appropriate account.

1. Open **Cloudflare → Workers & Pages → your Worker → Settings → Domains & Routes** (labels can vary).
2. Add a **Custom domain**, enter the hostname, and confirm.
3. Review conflicting existing DNS records for that exact hostname. Do not delete records without first checking whether they serve another application.
4. Allow Cloudflare to configure DNS and HTTPS, then visit `https://go.example.com/dashboard`.
5. Create a test link and confirm the redirect works on the new hostname.

**Options:**

- To disable the default `workers.dev` endpoint, change the Worker setting and, if deploying from configuration, set `"workers_dev": false` in `wrangler.jsonc` so later deployments preserve your intention.
- To manage a custom domain in code, the original project documentation uses:

```json
"routes": [{ "pattern": "go.example.com", "custom_domain": true }]
```

- To send visits to the root path `/` to a separate website, configure `HOME_URL`.

> [!NOTE]
> The documentation describes link URLs using the hostname on which you access the dashboard. Test this behaviour if you intend to use multiple hostnames. Multi-domain instance management is listed as planned work in [ROADMAP.md](ROADMAP.md).

## Configuration

### Non-secret variables

These project variables are documented in the `vars` section of [`wrangler.jsonc`](wrangler.jsonc):

| Variable | Documented default | Purpose |
|---|---|---|
| `SITE_NAME` | `Hoplane` | Name displayed by the application. |
| `HOME_URL` | empty | If populated, redirect visits to `/` instead of showing the landing page. |
| `SLUG_LENGTH` | `6` | Auto-generated slug length, from 4 to 32 characters. |
| `CASE_SENSITIVE` | `false` | Whether differently cased paths represent different links. Set before creating production links. |
| `RETENTION_DAYS` | `365` | Retention period for click-level analytics; cumulative link click totals are retained separately. |

Edit `wrangler.jsonc` in your connected repository and commit the change, or change it locally and run `npm run deploy`.

**Configuration as code:** dashboard-only changes to variables may be replaced by subsequent deployments. Check **Settings → About** in Hoplane to see which values the deployed application is using.

### Secrets

| Secret | Purpose |
|---|---|
| `SETUP_TOKEN` | First-owner creation and the documented owner-recovery workflow. |

Use the Cloudflare dashboard's **Secret** type or Wrangler:

```bash
npx wrangler secret put SETUP_TOKEN
```

Cloudflare treats Worker secrets differently from ordinary plaintext environment variables. Never put secrets in `wrangler.jsonc`, commit `.dev.vars`, or share them in support screenshots. See [Cloudflare's secret-management guide](https://developers.cloudflare.com/workers/configuration/secrets/).

### In-app security settings

Owners and admins can use **Settings → Security** to configure:

- **Warning page for every link**: visitors see a safety/interstitial page before redirection.
- **Count bots and crawlers**: disabled by default in the supplied documentation.
- **Blocked domains**: restrict destinations that may be created on the instance.

For a community/public instance, consider enabling the global warning page, maintaining the blocklist, and applying additional Cloudflare protections. See [SECURITY.md](SECURITY.md).

## Optional R2 backups

The project documents optional nightly **link-only** backups to Cloudflare R2.

1. Enable **R2 Object Storage** in Cloudflare. Depending on your account, a payment method may be required.
2. Uncomment and review the `r2_buckets` binding in `wrangler.jsonc`.
3. Deploy. If the bucket is not automatically provisioned, create it using the documented name:

   ```bash
   npx wrangler r2 bucket create hoplane-backups
   ```

4. Verify that **Settings → About → Nightly backups (R2)** indicates the feature is enabled.
5. Check the bucket for a backup after the next scheduled run.

The project describes daily backups at **03:17 UTC** under `backups/links-YYYY-MM-DD.json`. Configure an **R2 object lifecycle rule** if you want old backups deleted automatically.

**Restoring links:** download a backup JSON file and use **Import & export → Import links**. Test the process on a separate deployment before using it to recover production data.

> [!WARNING]
> **R2 backups are not full disaster-recovery backups.** The documented export includes links, **not** user accounts, API keys, sessions, or analytics. Maintain an additional recovery strategy for your D1 data and configuration.

## Updating and maintaining your deployment

**Back up and test upgrades first.** Database schema changes are described as being applied automatically after deployment; code rollback may not reverse database migrations.

### If you created a conventional GitHub fork

GitHub offers a **Sync fork** action for eligible forks. You can also add the Kitgenix repository as an upstream remote:

```bash
git clone https://github.com/YOU/YOUR-FORK.git
cd YOUR-FORK

git remote add upstream https://github.com/Kitgenix/hoplane.git
git fetch upstream

# Review upstream changes before merging them.
git log --oneline HEAD..upstream/main

# Work in a separate branch to protect production.
git switch -c maintenance/upstream-update

# Merge after checking the changes; resolve any conflicts.
git merge upstream/main

# Validate the merged application.
npm install
npm run typecheck
npm run build
npm test

# Push for review, then merge to your deployment branch when ready.
git push -u origin maintenance/upstream-update
```

Review and resolve conflicts in project configuration before merging to your production deployment branch. **Do not assume an upstream release will automatically be applied to your fork.**

### If Cloudflare created a separate repository copy

The deploy button may create a **new repository, not a GitHub fork**. You can add the upstream remote as above, but **review history before merging**:

```bash
git remote add upstream https://github.com/Kitgenix/hoplane.git
git fetch upstream
```

Do not blindly run `git pull upstream main --allow-unrelated-histories` against a production deployment. It may cause broad merge conflicts or overwrite deployment configuration. Compare the code and configuration, prepare a tested update branch, and integrate the desired release deliberately.

### CLI-managed deployments

After reviewing the release notes and making a backup:

```bash
git pull
npm install
npm run typecheck
npm run build
npm test
npm run deploy
```

Confirm that the tests, database changes, login, redirects, API authentication, and custom domain behave correctly. Check **Settings → About** for the deployed application version.

Keep production-specific changes to `wrangler.jsonc`, domain configuration, and secrets in view when updating. Consult [Releases](https://github.com/Kitgenix/hoplane/releases) and [ROADMAP.md](ROADMAP.md).

## Troubleshooting and account recovery

| Symptom | Recommended action |
|---|---|
| **Setup is disabled / SETUP_TOKEN is missing** | Configure the secret using the dashboard or Wrangler, ensure it meets the documented minimum length, then reload. |
| **Setup token is incorrect** | Check for spaces or line breaks. The original documentation specifies a temporary lockout after repeated failures. |
| **Instance is already set up** | An owner account exists. Sign in or use an authorised recovery process; investigate if you did not create that account. |
| **Too many sign-in attempts** | Wait for the login rate-limit window, which the source documentation specifies as 15 minutes. |
| **A link edit has not propagated** | Workers KV is eventually consistent; the source documentation specifies approximately 60 seconds for propagation. |
| **A repeat click is absent from analytics** | Browsers can cache permanent `301`/`308` redirects. Use `302` where repeat analytics are important. |
| **Custom domain does not load** | Confirm the custom-domain binding, ownership, DNS conflict status, and issued HTTPS certificate. |
| **Build or binding failure** | Check Workers Builds logs, Wrangler configuration, D1/KV bindings, and secret availability. |

### Forgotten password

If another authorised owner or admin can manage your account, request a password reset under **Settings → Team**. According to the supplied documentation, admins can reset editor/viewer passwords, while an owner is needed to reset admin/owner passwords.

### Last owner locked out

The original project documentation proposes deleting user records in D1 and running owner setup again. **This is a destructive emergency procedure, not an ordinary password reset.** It may remove accounts, sessions, API keys, and related records; consequences depend on the actual database schema and foreign-key behaviour.

Before attempting any database-level recovery:

1. Confirm that no other authorised owner can restore access.
2. Record the exact D1 database binding and identify the correct environment.
3. Export or otherwise back up the **entire D1 database**, not only the links.
4. Examine the current schema and the release's recovery documentation.
5. Test the recovery procedure against a copy before changing production data.

The original command is preserved here **only for reference**, not as a universally safe instruction:

```bash
# DESTRUCTIVE: examine foreign-key effects and back up D1 first.
npx wrangler d1 execute hoplane --remote --command "DELETE FROM users"
```

If the command applies to your tested release, open `/dashboard`, complete owner setup using the saved `SETUP_TOKEN`, recreate required users, and reissue API credentials. Verify links, analytics, settings, and audit records afterward. **Do not run it unless you understand the potential data loss.**

## Local development

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars and set a local-only SETUP_TOKEN.

npm install
npm run dev
```

Open the local dashboard at `http://localhost:5173/dashboard` as described by the original project. The first visit should present the initial setup flow. Local D1/KV state is stored under `.wrangler/state` according to the source documentation; removing that folder resets your **local** environment, not production.

### Development commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dashboard hot reload with a local Worker runtime. |
| `npm run typecheck` | Check Worker and dashboard TypeScript. |
| `npm run build` | Build the application. |
| `npm test` | Run unit/integration tests (build first as documented). |
| `npm run deploy` | Build and deploy to Cloudflare. |
| `npm run setup` | Optionally create D1/KV and write resource IDs to `wrangler.jsonc`. |
| `npm run db:migrate` | Run migrations manually when appropriate. |

### Project structure

```text
src/
  worker/       Cloudflare Worker: redirects, API, MCP and scheduled jobs
  client/       React dashboard (Vite + Tailwind)
  shared/       Shared types and Kitgenix attribution module
migrations/     D1 database schema
tests/          Vitest suites running in workerd
```

Before contributing changes, run:

```bash
npm run typecheck
npm run build
npm test
```

## API reference

The dashboard uses a session cookie; other clients may use an API key in the `Authorization` header. Create keys under **Settings → API & MCP**.

### Example: create a link

```bash
# Set HPL_KEY securely in your shell before running this example.
curl -X POST "https://go.example.com/api/links" \
  -H "Authorization: Bearer $HPL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/launch","slug":"launch","tags":["q4"],"utm":{"source":"newsletter"}}'
```

### Endpoints

| Method | Endpoint | API key scope | Purpose |
|---|---|---|---|
| `GET` | `/api/links?q=&tag=&status=&sort=&page=&limit=` | `links:read` | List, search, and filter links. |
| `POST` | `/api/links` | `links:write` | Create a link. |
| `GET` | `/api/links/:id` | `links:read` | Retrieve a link by ID. |
| `GET` | `/api/links/lookup?slug=` | `links:read` | Find a link by slug. |
| `PATCH` | `/api/links/:id` | `links:write` | Update a link. |
| `DELETE` | `/api/links/:id` | `links:write` | Delete a link and its analytics. |
| `POST` | `/api/links/bulk` | `links:write` | Perform `delete`, `disable`, `enable`, or `tag` actions. |
| `GET` | `/api/links/check?slug=` | `links:read` | Check slug availability. |
| `GET` | `/api/tags` | `links:read` | List tags and counts. |
| `GET` | `/api/meta?url=` | `links:write` | Fetch destination metadata. |
| `POST` | `/api/import` | `links:write` | Import links with `skip` or `overwrite` conflict handling (up to 1,000 links per request, per source documentation). |
| `GET` | `/api/export?format=json\|csv` | `links:read` | Export links. |
| `GET` | `/api/analytics/summary` | `analytics:read` | Totals and prior-period comparison. |
| `GET` | `/api/analytics/timeseries?interval=hour\|day` | `analytics:read` | Trend data. |
| `GET` | `/api/analytics/breakdown?dimension=` | `analytics:read` | Breakdown by dimension. |
| `GET` | `/api/analytics/live?since=` | `analytics:read` | Recent events. |
| `GET` | `/api/analytics/export` | `analytics:read` | Click-level CSV. |
| `POST` | `/api/mcp` | Per tool | MCP server using JSON-RPC over Streamable HTTP. |

**Analytics query parameters:** `from`, `to` (ISO 8601 or milliseconds), `link` (ID or slug), and `tz` (UTC offset in minutes).

**Breakdown dimensions:** `country`, `city`, `region`, `continent`, `referrer`, `device`, `os`, `browser`, `language`, `link`, and `source`.

**Link fields:** `url`, `slug`, `title`, `description`, `image`, `notes`, `tags[]`, `redirect_code`, `forward_query`, `utm{source,medium,campaign,term,content}`, `rules[{field,op,values[],url}]`, `variants[{url,weight}]`, `password`, `warning`, `starts_at`, `expires_at`, `expired_url`, `max_clicks`, and `disabled`.

For a future machine-readable specification and generated documentation, see the [Roadmap](ROADMAP.md).

## MCP integration

Hoplane includes an MCP endpoint for compatible clients. Create a **dedicated, narrowly scoped API key** and configure your client with the Worker hostname.

An example client configuration from the original documentation:

```json
{
  "mcpServers": {
    "hoplane": {
      "type": "http",
      "url": "https://go.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer hpl_your_key"
      }
    }
  }
}
```

> [!CAUTION]
> The credential above is a placeholder. Use your own generated API key, keep configuration files containing credentials private, and verify the exact settings supported by your MCP client.

**Documented MCP tools:** `list_links`, `get_link`, `create_link`, `update_link`, `delete_link`, `list_tags`, and `get_analytics`. Available tools are filtered by the key's permissions.

## Limits and operational notes

- **Cloudflare pricing:** Workers Free currently includes **100,000 Worker requests per day**, but Workers, D1, KV, R2, and associated operations each have their own limits. Check the live [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) pages before deployment. Usage and billing depend on traffic and your implementation.
- **Cache propagation:** KV is eventually consistent; the project documentation estimates up to approximately 60 seconds for edits to propagate. The documentation states that click-limit checks use fresh data.
- **Permanent redirects:** browsers may cache `301` and `308`, so repeat requests may not reach Hoplane. Choose `302` when you need repeat-visit analytics.
- **Unique visitors:** measured per day; the same person returning on another day can count again.
- **Retention:** `RETENTION_DAYS` controls retention of click-level rows, not cumulative link totals.
- **Security and abuse:** operating a public shortener carries phishing and misuse risks. Restrict link creation and monitor abuse.
- **Backups and upgrades:** link-only R2 exports do not replace a full D1 backup or a rollback plan.

## Uninstalling

1. Export the links you want to keep using **Import & export → Export**.
2. Back up D1 separately if you need accounts, analytics, configuration, or audit history.
3. Identify the Worker, D1 database, KV namespace, routes, and optional R2 bucket associated with this particular deployment.
4. Delete only the resources that belong to Hoplane, using Cloudflare's dashboard or the relevant Wrangler commands.

Examples from the original documentation:

```bash
# WARNING: destructive operations - verify the target account and names.
npx wrangler delete
npx wrangler d1 delete hoplane

# Identify the correct KV namespace before deleting it.
npx wrangler kv namespace list
npx wrangler kv namespace delete --namespace-id <id>
```

If configured, separately delete the `hoplane-backups` R2 bucket **only after** verifying that you do not need its contents. Removing a Worker does not necessarily remove every attached storage resource.

## Security, licence, and attribution

### Security

Please report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md). **Do not open public issues containing exploit details, private credentials, or other sensitive information.**

### Licence

Hoplane is distributed under the repository's custom [Hoplane Licence](LICENSE). Refer to that file for the authoritative terms of use, modification, redistribution, and deployment.

The supplied project documentation specifies that deployments must retain **visible, working links to both [Kitgenix.com](https://kitgenix.com) and [github.com/Kitgenix](https://github.com/Kitgenix)** on their HTML pages. These links appear in the application's public and administrative interfaces. Attribution is maintained in [`src/shared/attribution.ts`](src/shared/attribution.ts) and is covered by the project's attribution checks.

You can adapt Hoplane to your needs **within the terms of the actual licence**. If you fork, redistribute, or deploy a modified version, preserve the required attribution and review the licence carefully. GitHub's ability to fork a repository is not itself a substitute for licensing permission.

> [!NOTE]
> A custom licence with mandatory on-page branding may not meet every formal definition of an **OSI-approved open-source licence**. Describe Hoplane as *source-available under the Hoplane Licence* unless the licence has been reviewed for the specific terminology you wish to use.

## Contributing

Bug reports, feature suggestions, documentation improvements, and pull requests are welcome. For non-security issues, use [GitHub Issues](https://github.com/Kitgenix/hoplane/issues); review the [Roadmap](ROADMAP.md) before proposing substantial features.

Before submitting a pull request:

1. Explain the change and link to any related issue.
2. Keep changes focused and document any new configuration or migration requirements.
3. Run `npm run typecheck`, `npm run build`, and `npm test`.
4. Preserve project attribution and comply with [LICENSE](LICENSE).
5. Report vulnerabilities privately through [SECURITY.md](SECURITY.md), not in the PR.

### Project links

- **Website:** [Kitgenix](https://kitgenix.com)
- **Source repository:** [Kitgenix/hoplane](https://github.com/Kitgenix/hoplane)
- **Releases:** [GitHub Releases](https://github.com/Kitgenix/hoplane/releases)
- **Roadmap:** [ROADMAP.md](ROADMAP.md)
- **Security:** [SECURITY.md](SECURITY.md)
- **Issues:** [GitHub Issues](https://github.com/Kitgenix/hoplane/issues)

---

<div align="center">

**Hoplane - Every link has a destination.**

Made by [Kitgenix](https://kitgenix.com) · [GitHub](https://github.com/Kitgenix)

</div>
