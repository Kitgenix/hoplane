# Contributing to Hoplane

Thank you for your interest in improving **Hoplane by [Kitgenix](https://kitgenix.com)**.

Hoplane is a source-available, self-hosted URL shortener built for Cloudflare Workers, D1 and KV. Contributions that improve its reliability, security, accessibility, documentation and ease of deployment are welcome.

**Please read this guide before opening an issue or pull request.** The project's [LICENSE](LICENSE) and [NOTICE](NOTICE) govern its use and redistribution. Hoplane uses a custom **source-available** licence, not an OSI-approved open-source licence.

## Ways to contribute

You can help by:

- Reporting reproducible bugs and deployment problems.
- Proposing improvements and discussing their trade-offs.
- Fixing bugs, improving tests and addressing accessibility issues.
- Improving documentation, examples and troubleshooting instructions.
- Testing Cloudflare deployments and upgrades on your own account.
- Reviewing pull requests and helping other users.

See the [roadmap](ROADMAP.md) for planned work. Roadmap inclusion does not mean a feature has been approved for implementation.

## Before you start

1. Read the [README](README.md), [roadmap](ROADMAP.md) and relevant existing issues.
2. Search [open issues](https://github.com/Kitgenix/hoplane/issues) and [pull requests](https://github.com/Kitgenix/hoplane/pulls) to avoid duplicate work.
3. For substantial features, changes to authentication or permissions, database changes, licence-related changes or architectural changes, **open an issue first** and agree on the approach with maintainers.
4. For small, well-scoped fixes and documentation changes, you may submit a pull request directly.

Maintainers may close or decline proposals that are out of scope, insufficiently tested, difficult to maintain or inconsistent with Hoplane's goals.

## Report bugs and request features

Use [GitHub Issues](https://github.com/Kitgenix/hoplane/issues) for non-security bugs and feature requests. Include enough context for someone else to reproduce or evaluate the report.

**Bug reports should include**, where relevant:

- A clear summary of the problem and the expected behaviour.
- Reproduction steps and the actual result.
- Hoplane version or commit, deployment method and browser/runtime information.
- Relevant Cloudflare Workers, D1, KV and R2 configuration **without secrets or private data**.
- Sanitised logs, error messages and screenshots.
- Whether the issue also occurs on a fresh deployment.

**Feature requests should include** the problem being solved, a proposed approach, possible alternatives and any privacy, security, cost or compatibility implications.

### Security vulnerabilities

**Do not file public issues or pull requests containing exploitable security details.** Follow [SECURITY.md](SECURITY.md) and use [private vulnerability reporting](https://github.com/Kitgenix/hoplane/security/advisories/new) instead.

Never publish passwords, API keys, `SETUP_TOKEN`, session cookies, production database exports or visitor data in issues, logs, commits or screenshots.

## Development environment

### Prerequisites

- Git.
- Node.js **22.12 or newer**, as documented in the README (check `package.json` for any more restrictive engine requirement).
- npm.
- A Cloudflare account **only when testing remote deployments or managed services**.

### Set up a local copy

1. Fork [Kitgenix/hoplane](https://github.com/Kitgenix/hoplane) on GitHub.
2. Clone your fork and configure the original repository as `upstream`:

```bash
git clone https://github.com/YOUR_USERNAME/hoplane.git
cd hoplane
git remote add upstream https://github.com/Kitgenix/hoplane.git
```

3. Install dependencies. Prefer the lockfile-based install when `package-lock.json` is present:

```bash
npm ci
```

If the repository does not contain a compatible lockfile, use `npm install` instead and explain any resulting lockfile changes in your PR.

4. Create the local development secrets file and set a **development-only** token:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` to provide `SETUP_TOKEN`. Use a strong random token and **never commit `.dev.vars`** or copy secrets from production.

5. Start the local environment:

```bash
npm run dev
```

According to the project README, the dashboard is available at `http://localhost:5173/dashboard`. The first visit presents the owner-account setup screen. Local D1/KV state is stored under `.wrangler/state`.

If any command differs from the checked-out version, consult `package.json` and the [README](README.md); scripts in the source tree are authoritative.

### Project structure

| Path | Purpose |
| --- | --- |
| `src/worker/` | Cloudflare Worker, redirects, API, MCP and scheduled tasks |
| `src/client/` | React dashboard (Vite and Tailwind) |
| `src/shared/` | Shared types and attribution implementation |
| `migrations/` | D1 database schema and migrations |
| `tests/` | Unit and integration tests using the Workers runtime |
| `wrangler.jsonc` | Cloudflare Worker configuration and bindings |

## Branches and commits

Create a branch from the current upstream default branch (`main` unless the repository changes it):

```bash
git fetch upstream
git switch main
git merge --ff-only upstream/main
git switch -c fix/short-description
```

Choose descriptive branch names, such as `fix/redirect-query`, `feat/link-health-checks` or `docs/setup-guide`. Keep each pull request focused on one change; avoid unrelated formatting or dependency updates.

Use clear commit messages. Conventional Commit prefixes are welcome, for example:

- `fix: handle expired link fallback correctly`
- `feat: add optional webhook delivery`
- `docs: clarify Cloudflare deployment steps`
- `test: cover scoped API key permissions`

Do not rewrite or force-push shared branches without coordinating with collaborators.

## Coding and design guidelines

- Follow the conventions of the code you are changing; keep TypeScript types explicit and avoid unnecessary dependencies.
- Preserve the Cloudflare-native architecture and avoid introducing mandatory external servers or paid services for core functionality.
- Keep changes compatible with the documented Workers, D1 and KV integration unless a breaking change has been explicitly discussed.
- Validate all untrusted inputs, especially redirect destinations, import payloads, API requests and external metadata fetched from destination websites.
- Enforce authentication, authorisation and API-key scopes **on the server**, not only in the dashboard UI.
- Avoid recording visitor IP addresses or introducing new visitor tracking without prior discussion and appropriate documentation.
- Treat session tokens, API keys and `SETUP_TOKEN` as secrets. Do not include secrets or personal data in logs or tests.
- Keep UI changes accessible, responsive and usable in light and dark mode. Explain keyboard and screen-reader considerations for new interactive components.
- Document new environment variables, Cloudflare bindings, feature flags and operational requirements in the README and relevant files.
- Prefer small, reviewable changes with a clear explanation of trade-offs.

### D1 migrations and persistence

Database changes deserve extra care because Hoplane deployments are independently operated and the README describes automatic schema migration on first request.

- Make schema changes compatible with existing installations where practicable.
- Never modify an already-shipped migration without discussing the upgrade implications.
- Add or update tests covering both a fresh installation and an upgrade path.
- Avoid data loss and document any manual migration or backup requirements.
- **Never run destructive commands against another person's Cloudflare account or production D1 database.**

### Redirects, caching and analytics

Changes to redirect behaviour should consider HTTP caching, nested slugs, query-string forwarding, redirect status codes, passwords, expiry rules, click limits, routing rules and link safety warnings.

Changes to analytics should preserve its privacy design, retention behaviour, bot filtering and separation between QR scans and ordinary link clicks. Consider KV cache propagation and browser caching when writing tests or documentation.

### Attribution and branding

Hoplane is distributed under a **custom source-available licence**. Contributors must respect the [LICENSE](LICENSE) and [NOTICE](NOTICE).

- Keep required, working, visible attribution links to **[Kitgenix](https://kitgenix.com)** and the **[original Hoplane repository](https://github.com/Kitgenix/hoplane)** on covered HTML pages, as specified in the applicable licence.
- Do not remove, hide, disable or circumvent the attribution implementation or its tests.
- Changes to `src/shared/attribution.ts`, branding or attribution-related tests require particular review for licence compatibility.
- Modified or unofficial versions must not be presented as official Kitgenix releases.

The full licence text, not this contributing guide, determines legal obligations.

## Tests and quality checks

Before opening a pull request, run the project's documented checks:

```bash
npm run typecheck
npm run build
npm test
```

If you cannot run a check, state **which check was not run and why** in your pull request. Do not claim that unexecuted tests have passed.

For behaviour changes, add or update focused tests. Where relevant, cover:

- Successful and failed authentication, permissions and API-key scopes.
- Redirect edge cases, security warnings and routing rules.
- D1 migration safety and KV cache behaviour.
- Analytics privacy, retention and bot handling.
- MCP/REST integration compatibility.
- Required Kitgenix attribution.

Changes involving deployment should be validated against a **non-production** Cloudflare environment where practical. Include the tested configuration and any known limitations.

## Submit a pull request

1. Push your topic branch to your fork.
2. Open a pull request targeting `Kitgenix/hoplane`'s `main` branch.
3. Give the PR a descriptive title and explain **what changed, why and how it was tested**.
4. Link related issues with `Fixes #123` or `Related to #123`, as appropriate.
5. Include screenshots or short recordings for visible UI changes, with sensitive information removed.
6. Describe compatibility implications, new permissions/bindings, database changes, upgrade steps and documentation updates.
7. Respond to maintainer feedback; keep discussion constructive and focused.

### Pull request checklist

- [ ] The change has a clear purpose and is reasonably scoped.
- [ ] I have checked related issues and pull requests.
- [ ] I have followed the project's coding patterns.
- [ ] I have added or updated tests where appropriate.
- [ ] `npm run typecheck`, `npm run build` and `npm test` pass, or I have explained exceptions.
- [ ] I have not committed credentials, personal data or local state.
- [ ] I have updated documentation for any user-facing or operational changes.
- [ ] I have considered security, privacy, accessibility and Cloudflare costs.
- [ ] I have preserved required attribution and applicable licence notices.
- [ ] I have identified third-party code or assets and their licences.

## Review and merge process

Maintainers review contributions for usefulness, maintainability, code quality, test coverage, security, licence compatibility and alignment with Hoplane's roadmap. Additional reviews may be requested for authentication, licensing, deployment automation and database changes.

Submitting a pull request does **not** guarantee acceptance or a specific review timeframe. Maintainers may request revisions, defer a proposal or decline it with an explanation. Only authorised maintainers merge changes or publish official releases.

Please do not publish a release or imply an endorsement on behalf of Kitgenix without authorisation.

## Contribution rights and third-party materials

Contribute only work you own or are authorised to submit. If code, documentation, images, fonts or other materials originate elsewhere, disclose their source, licence and applicable notices.

Accepted contributions must be suitable for distribution under Hoplane's [LICENSE](LICENSE). Do not submit material that conflicts with that licence or introduces obligations the maintainers have not approved.

Submitting a pull request does **not** transfer ownership of your copyright to Kitgenix. The project does not currently specify a separate contributor licence agreement (CLA) or Developer Certificate of Origin (DCO) sign-off requirement in this guide; maintainers may request clarification of contribution rights before accepting a change. If you have concerns about the licence, discuss them **before** submitting substantial work.

## Communication and conduct

Be respectful, inclusive and constructive. Assume good faith, criticise ideas rather than people and respect contributors' time. Harassment, threats, discriminatory behaviour and disclosure of private information are not acceptable.

Use public issues and pull requests for ordinary technical discussion, and the channels in [SECURITY.md](SECURITY.md) for confidential security reports.

## Useful links

- [Hoplane repository](https://github.com/Kitgenix/hoplane)
- [README and deployment guide](README.md)
- [Development roadmap](ROADMAP.md)
- [Security policy](SECURITY.md)
- [Licence](LICENSE) and [NOTICE](NOTICE)
- [GitHub Issues](https://github.com/Kitgenix/hoplane/issues)
- [Pull Requests](https://github.com/Kitgenix/hoplane/pulls)
- [Kitgenix website](https://kitgenix.com)

---

**Hoplane - Every link has a destination.**  
Developed and maintained by [Kitgenix](https://kitgenix.com).
