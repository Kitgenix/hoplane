# Changelog

All notable changes to **Hoplane by [Kitgenix](https://kitgenix.com)** will be documented in this file.

This changelog follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/). Entries are intended for people deploying, maintaining, and contributing to Hoplane—not as a raw list of Git commits.

> **Release status:** This file starts with an **Unreleased** section. The initial capabilities below are drawn from Hoplane's project documentation; they should be checked against the actual code and release tests before publishing a first stable release. No release version or publication date is asserted here.

## [Unreleased]

### Added — initial documented feature set

**Deployment and infrastructure**
- Cloudflare-native deployment using Workers, D1, and KV, with an optional R2 backup integration.
- Deploy-to-Cloudflare workflow and command-line deployment instructions.
- Automatic D1 schema migration at runtime.
- Workers-hosted React dashboard, REST API, and redirect handler.

**Short links and routing**
- Automatically generated, custom, and nested short-link slugs.
- Link tags, private notes, search, filtering, sorting, and bulk actions.
- Configurable 301, 302, 307, and 308 redirects; optional query-string forwarding; and a UTM builder.
- Scheduled activation, expiry and fallback destinations, click limits, and password-protected links.
- Optional redirect warning pages and destination-domain blocking.
- Destination targeting by geography, device, operating system, browser, language, and referrer.
- Weighted A/B destination variants.
- Custom social previews and destination metadata fetching.

**QR codes and analytics**
- Customisable QR code design and PNG/SVG exports.
- Separate reporting of QR scans and short-link clicks.
- Click and visitor summaries, time-series charts, detailed breakdowns, a live feed, and CSV export.
- Documented privacy-conscious analytics: no visitor analytics cookies or stored visitor IP addresses, daily rotation of unique-visitor salts, configurable retention, and bot filtering.

**Administration and integrations**
- Team accounts with owner, admin, editor, and viewer roles.
- Scoped API keys with optional expiry and an administrative audit log.
- REST API and an MCP endpoint for compatible AI tools and clients.
- JSON/CSV import and export, including support for formats used by other shorteners.
- Optional scheduled link backups to Cloudflare R2.
- Responsive dashboard with light and dark themes.
- Tests that run in the Cloudflare Workers runtime, including attribution checks.

### Added

- **`NOT_FOUND_URL`:** redirect unknown short links to a URL of your choice instead of showing the "Link not found" page.
- **`EXPIRED_LINK_RETENTION_DAYS`:** optionally delete links a set number of days after they expire, during the daily maintenance run. Links with a fallback URL are kept. Off by default.
- **`X-Link-Password` header:** command-line and API clients can open password-protected links without the HTML form.
- **MCP tools `count_links` and `upsert_link`**, and a matching `GET /api/links/count` endpoint.
- **Settings → About** shows the unknown-link and expired-link-cleanup settings.
- **Malware and phishing check (Settings → Security, off by default):** new and edited links are checked with Cloudflare's security DNS (`1.1.1.2`) and refused if it blocks the destination, including routing-rule, A/B and fallback URLs. Lookups that fail allow the link.
- **Cloudflare Access sign-in:** with `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` set, the login page offers **Continue with Cloudflare Access**. Hoplane verifies the Access JWT (RS256 signature, issuer, audience and expiry) and maps the email to a Hoplane account. It can optionally create viewer or editor accounts (`ACCESS_AUTO_ROLE`). Sessions end no later than the Access token.
- **OpenAPI 3.1 description** at `/api/openapi.json`. Link request schemas are generated from the validation schemas, and a test fails if a route is added without being documented.
- **Webhooks (Settings → Webhooks):** signed `link.created`, `link.updated`, `link.deleted` and `link.clicked` events in the Standard Webhooks format, with one-time secrets, rotation and test sends. Add an optional Cloudflare Queue (`WEBHOOK_QUEUE`) for retries with backoff. Click events contain no IPs, user agents or coordinates. Adds migration `0003_webhooks.sql`.
- **Link health checks (Settings → Security, off by default):** the daily maintenance run checks link destinations, including rule, A/B and fallback URLs, and flags broken, unreachable or erroring ones. Flagged links appear under **Links → Needs attention**, and each link page has a **Check now** button. With malware blocking on, existing links are rechecked against it. `HEALTH_CHECK_REQUESTS` caps outbound requests per run. Adds migration `0002_link_health.sql`.
- **Translated visitor pages:** link error, password and warning pages are served in English, German, Spanish, French, Italian, Dutch, Polish, Brazilian Portuguese, Japanese or Simplified Chinese, based on the visitor's `Accept-Language` header. The attribution footer is unchanged.
- **"Update available" banner:** the daily maintenance run asks GitHub for the latest release, and owners and admins see a banner when a newer one exists. **Settings → About → Updates** has a **Check now** button. Turn it off with `UPDATE_CHECK=false`.

### Changed

- **Faster redirects for links without a click limit.** The redirect no longer waits for a write to the D1 primary. Previously every counted redirect waited for a click-counter update, which costs a cross-region round trip for visitors far from the database. The counter and the click record are now written together in the background, so a link's click total appears a moment after the redirect. Links with a click limit still reserve each click atomically before redirecting, so the limit stays exact.

### Fixed

- **Bulk actions failed for more than about 50 links.** `POST /api/links/bulk` accepts up to 500 ids, but delete and enable/disable put every id into one query, past D1's limit of 100 bound parameters, so the request failed with an error. Bulk actions now run in chunks.

- **Sink imports kept only the basic fields.** Importing a [Sink](https://github.com/miantiao-me/sink) JSON export now keeps:
  - country routing (`geo`) and App Store / Play Store targets (`apple`, `google`), converted to routing rules with device targets first, as Sink does;
  - `unsafe` (as the warning page) and `redirectWithQuery`. Sink links no longer start forwarding query strings, because Sink's default is off.
- **Imported Sink passwords locked visitors out.** Password hashes in Sink exports (`sink-pwd:v1:…`) were stored as if they were plaintext passwords, so no real password could open the link. They are now converted to Hoplane's PBKDF2 format and the original passwords keep working. Masked passwords are rejected with a request for a new password.
- **One bad field failed the whole import row.** Rows with a relative preview image (such as Sink's `/_assets/…` uploads) or over-long title, description or notes now import with that field dropped or shortened, and the import result reports each change. Sink cloaking and reverse-proxy settings are reported as unsupported.

### Release verification

Before moving these items into a dated release, maintainers should verify:
- Clean deployment and upgrade paths, including D1 migrations and configuration compatibility.
- Authentication, authorisation, API key handling, redirect safety, and abuse protections.
- Accuracy and retention behaviour of analytics and backup/restore operations.
- Current licence terms, required Kitgenix attribution, dependency notices, and supporting documentation.
- Successful build, type checks, and automated tests against the release commit.

---

## Maintaining this changelog

- Keep the newest version at the top, immediately below **Unreleased**.
- Use the headings **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, and **Security** as applicable; omit empty headings.
- Include changes relevant to operators, contributors, and API consumers. Call out breaking API changes, required configuration updates, and database migration considerations.
- Link security fixes to a public advisory once disclosure is appropriate; report vulnerabilities privately under [SECURITY.md](SECURITY.md).
- On a tagged release, move confirmed changes from **Unreleased** into a heading such as `## [1.0.0] - YYYY-MM-DD`. Use the actual publication date, and add the corresponding release link.
- Never mark a feature, fix, version, or release date as shipped until it is verified and published.

For published versions and release notes, visit [Hoplane Releases](https://github.com/Kitgenix/hoplane/releases). For upcoming work, see the [Roadmap](ROADMAP.md).

[Unreleased]: https://github.com/Kitgenix/hoplane/commits/main

---

Hoplane is developed and maintained by [Kitgenix](https://kitgenix.com). Original repository: [github.com/Kitgenix/hoplane](https://github.com/Kitgenix/hoplane).
