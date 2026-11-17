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
