# Roadmap

## 1.0 (current)

- One-click Deploy to Cloudflare; the schema migrates itself at runtime
- Links: custom/nested slugs, tags, notes, redirect types, query forwarding, UTM builder
- Scheduling, expiry with fallback, click limits, passwords, safety warnings, domain blocklist
- Geo/device/OS/browser/language/referrer targeting and weighted A/B splits
- Open Graph previews with auto-fetch from the destination page
- QR designer (PNG/SVG) with separate QR-scan analytics
- Privacy-first analytics: summary, time series, 11 breakdowns, live feed, CSV export
- Teams with roles, scoped API keys, audit log
- REST API and built-in MCP server
- JSON/CSV import (including other shorteners' formats) and export, optional R2 backups
- Integration tests in workerd, with attribution checks

## Next

- Cloudflare Access single sign-on (map Access identities to users)
- Optional Workers Analytics Engine backend for very high-traffic instances
- Workers AI slug and description suggestions (optional binding)
- Dashboard translations (i18n)
- World map view and filter-by-click on analytics breakdowns
- Webhooks on click and on link changes
- Link health checks (scheduled destination status checks)
- Multiple custom domains per instance
- OpenAPI specification and generated docs page
- Folders/workspaces for larger teams
