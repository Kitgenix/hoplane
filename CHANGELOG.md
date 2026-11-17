# Changelog

All notable changes to **Hoplane by [Kitgenix](https://kitgenix.com)** will be documented in this file.

This changelog follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/). Entries are intended for people deploying, maintaining, and contributing to Hoplane—not as a raw list of Git commits.

## [1.0.0] - 2026-11-17

The first release of Hoplane.

### Added

**Deployment and infrastructure**
- Cloudflare-native deployment using Workers, D1, and KV, with an optional R2 backup integration.
- Deploy-to-Cloudflare workflow and command-line deployment instructions.
- Automatic D1 schema migration at runtime (migrations `0001_init`, `0002_link_health` and `0003_webhooks`).
- Workers-hosted React dashboard, REST API, and redirect handler.
- Fast redirects: links without a click limit record the click in the background instead of waiting for a D1 write. Links with a click limit reserve each click atomically, so the limit stays exact.
- Optional cleanup of long-expired links (`EXPIRED_LINK_RETENTION_DAYS`). Links with a fallback URL are kept.
- "Update available" banner for owners and admins, plus **Settings → About → Updates**. It checks GitHub once a day; turn it off with `UPDATE_CHECK=false`.

**Short links and routing**
- Automatically generated, custom, and nested short-link slugs.
- Link tags, private notes, search, filtering, sorting, and bulk actions on up to 500 links at once.
- Configurable 301, 302, 307, and 308 redirects; optional query-string forwarding; and a UTM builder.
- Scheduled activation, expiry and fallback destinations, click limits, and password-protected links. Protected links are never cached publicly.
- `X-Link-Password` header so scripts and API clients can open protected links without the HTML form.
- Optional redirect warning pages and destination-domain blocking.
- Optional redirect for unknown short links (`NOT_FOUND_URL`).
- Destination targeting by geography, device, operating system, browser, language, and referrer.
- Weighted A/B destination variants.
- Custom social previews and destination metadata fetching.
- Visitor pages (link errors, password form, warning page) in English, German, Spanish, French, Italian, Dutch, Polish, Brazilian Portuguese, Japanese and Simplified Chinese, chosen from the visitor's `Accept-Language` header.

**Safety and monitoring**
- Optional malware and phishing check (**Settings → Security**): new and edited links are checked with Cloudflare's security DNS (`1.1.1.2`) and refused if it blocks the destination. Failed lookups allow the link.
- Optional daily link health checks (**Settings → Security**) of every destination, including rule, A/B and fallback URLs. Problems appear under **Links → Needs attention**, and each link page has a **Check now** button. `HEALTH_CHECK_REQUESTS` caps outbound requests per run.

**QR codes and analytics**
- Customisable QR code design and PNG/SVG exports.
- Separate reporting of QR scans and short-link clicks.
- Click and visitor summaries, time-series charts, detailed breakdowns, a live feed, and CSV export.
- Privacy-conscious analytics: no visitor analytics cookies or stored visitor IP addresses, daily rotation of unique-visitor salts, configurable retention, and bot filtering.

**Administration and integrations**
- Team accounts with owner, admin, editor, and viewer roles.
- Optional Cloudflare Access sign-in (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`). Hoplane verifies the Access JWT's signature, issuer, audience and expiry, maps the email to a Hoplane account, and can create viewer or editor accounts automatically (`ACCESS_AUTO_ROLE`).
- Scoped API keys with optional expiry and an administrative audit log.
- REST API with an OpenAPI 3.1 description at `/api/openapi.json`.
- MCP endpoint for compatible AI tools and clients, including tools to list, search, count, create, update, upsert and delete links and to read analytics.
- Signed webhooks (**Settings → Webhooks**) for `link.created`, `link.updated`, `link.deleted` and `link.clicked`, in the Standard Webhooks format, with optional Cloudflare Queues retries (`WEBHOOK_QUEUE`). Click events contain no IPs, user agents or coordinates.
- JSON/CSV import and export, including formats used by other shorteners. Sink imports keep country and app-store routing, warning pages, query forwarding and original passwords. Rows with an unusable field import without it, and the result lists each change.
- Optional scheduled link backups to Cloudflare R2.
- Responsive dashboard with light and dark themes.
- Tests that run in the Cloudflare Workers runtime, including attribution checks.

---

## Maintaining this changelog

- Add an **Unreleased** section above the newest version for changes that have not been released yet, and keep the newest version at the top.
- Use the headings **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, and **Security** as applicable; omit empty headings.
- Include changes relevant to operators, contributors, and API consumers. Call out breaking API changes, required configuration updates, and database migration considerations.
- Link security fixes to a public advisory once disclosure is appropriate; report vulnerabilities privately under [SECURITY.md](SECURITY.md).
- When tagging a release, set its date to the actual publication date and add the corresponding release link below.
- Before tagging, verify clean deployment and upgrade paths (including D1 migrations), authentication and authorisation, redirect safety, analytics and backup behaviour, licence and attribution requirements, and a passing build, type check and test run on the release commit.

For published versions and release notes, visit [Hoplane Releases](https://github.com/Kitgenix/hoplane/releases). For upcoming work, see the [Roadmap](ROADMAP.md).

[1.0.0]: https://github.com/Kitgenix/hoplane/releases/tag/v1.0.0

---

Hoplane is developed and maintained by [Kitgenix](https://kitgenix.com). Original repository: [github.com/Kitgenix/hoplane](https://github.com/Kitgenix/hoplane).
