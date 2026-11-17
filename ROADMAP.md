Hoplane Roadmap
===============

**Hoplane - Every link has a destination.**

An open-source, Cloudflare-native URL shortener developed and maintained by [Kitgenix](https://kitgenix.com/).

This roadmap outlines Hoplane's current capabilities, upcoming improvements, and longer-term development direction.

Our goal is to build a powerful, secure, privacy-conscious link management platform that anyone can deploy, customise, and maintain within their own Cloudflare account.

**Repository:** [github.com/Kitgenix/hoplane](https://github.com/Kitgenix/hoplane)

* * * * *

Project Principles
------------------

Hoplane's development is guided by six principles:

1.  **Cloudflare-native:** Built for Cloudflare Workers and its associated services, without requiring traditional server infrastructure.

2.  **Open-source:** Source code remains available for inspection, modification, contribution, and independent deployment under the project's licence.

3.  **Self-hosted:** Operators retain control over their own deployments, configuration, and application data.

4.  **Privacy-conscious:** Collect only the information needed to provide useful functionality and analytics.

5.  **Secure by design:** Prioritise authentication, access controls, secure defaults, and responsible vulnerability management.

6.  **Easy to maintain:** Make deployment, upgrades, documentation, and upstream changes as straightforward as possible.

* * * * *

Version 1.0.0 - Current Feature Set
---------------------------------

The initial Hoplane feature set establishes a complete foundation for URL shortening, link management, analytics, collaboration, and automation.

### Cloudflare Deployment

-   One-click deployment to Cloudflare.

-   Serverless architecture using Cloudflare Workers, D1, and KV.

-   Automatic database schema migration at runtime.

-   Independent, self-hosted deployments.

-   Integration tests using Cloudflare's `workerd` runtime.

-   Automated checks for required project attribution.

### Link Management

-   Short URLs with custom and nested slugs.

-   Link organisation using tags and internal notes.

-   Configurable HTTP redirect types.

-   Query-parameter forwarding.

-   Built-in UTM campaign builder.

-   Scheduled link activation.

-   Link expiration with configurable fallback destinations.

-   Maximum click limits.

-   Password-protected links.

-   Optional redirect safety warning pages.

-   Destination-domain blocklists.

-   Redirects for unknown links to a URL of your choice.

-   Optional automatic cleanup of long-expired links.

-   Password access for scripts and API clients via the `X-Link-Password` header.

### Intelligent Redirects

-   Geographic targeting.

-   Device targeting.

-   Operating system targeting.

-   Browser targeting.

-   Language targeting.

-   Referrer-based targeting.

-   Weighted A/B destination splitting.

### Link Previews

-   Open Graph metadata for link sharing.

-   Automatic metadata retrieval from destination pages.

-   Customisable link preview information.

### QR Code Management

-   QR code generation for short links.

-   Customisable QR code designer.

-   PNG and SVG exports.

-   Separate QR scan analytics.

### Privacy-First Analytics

-   Link performance summaries.

-   Time-series analytics.

-   Eleven analytics breakdowns.

-   Live activity feed.

-   CSV analytics export.

-   Privacy-conscious visitor measurement.

### Teams and Access Management

-   Multi-user team management.

-   Role-based permissions.

-   Scoped API keys.

-   Administrative audit logging.

-   Optional Cloudflare Access single sign-on.

### Developer Tools and Integrations

-   REST API for programmatic link management.

-   Built-in Model Context Protocol (MCP) server.

-   JSON and CSV imports.

-   Support for importing data from other URL shortening platforms.

-   Data export capabilities.

-   Optional Cloudflare R2 link backups.

-   Signed webhooks (Standard Webhooks format) with optional Cloudflare Queues retries.

-   OpenAPI 3.1 specification served by every deployment.

-   Faithful imports from Sink, including routing rules and original passwords.

### Safety and Monitoring

-   Optional malware and phishing checks using Cloudflare's security DNS.

-   Optional daily destination health checks, with a "Needs attention" view.

-   Dashboard notice when a newer Hoplane release is available.

### Internationalisation

-   Visitor-facing pages in ten languages, chosen from the visitor's browser language.

* * * * *

Planned Development
-------------------

The following improvements are planned or under consideration for future releases.

Features are grouped by functionality rather than assigned to fixed release dates. Their scope and delivery order may change as development progresses.

### Authentication and Collaboration

-   [ ] **Folders and Workspaces:** Introduce improved link organisation and collaboration tools for larger teams.

-   [ ] **Multiple Custom Domains:** Allow a single Hoplane installation to manage links across multiple domains.

### Analytics and Performance

-   [ ] **Workers Analytics Engine:** Introduce an optional analytics backend for high-traffic installations.

-   [ ] **Geographic Visualisation:** Add an interactive world map displaying geographic click activity.

-   [ ] **Advanced Analytics Filtering:** Enable click-level filtering and drill-down from analytics breakdowns.

### Artificial Intelligence

-   [ ] **Workers AI Integration:** Introduce optional AI-assisted slug and link-description suggestions through Cloudflare Workers AI.

-   [ ] **Optional AI Configuration:** Keep AI functionality opt-in and avoid making it a requirement for core deployment.

### Accessibility and Internationalisation

-   [ ] **Dashboard Translations:** Introduce internationalisation (i18n) support for multiple languages.

-   [ ] **Community Translations:** Establish a contribution workflow for additional languages.

* * * * *

Long-Term Development Direction
-------------------------------

Beyond the currently planned features, Hoplane will continue to evolve around the needs of its users and contributors.

Areas of interest include:

-   Improved scalability for high-volume installations.

-   Enhanced accessibility and dashboard usability.

-   More flexible link organisation and administration.

-   Additional developer integrations.

-   Stronger deployment automation and upgrade tooling.

-   Greater visibility into operational health and performance.

-   Continued security improvements and dependency maintenance.

These are strategic areas of interest rather than confirmed feature commitments.

* * * * *

Versioning and Releases
-----------------------

Hoplane follows the principles of [Semantic Versioning](https://semver.org/).

| Release Type | Example | Purpose |
| Major | v2.0.0 | Changes that may introduce breaking compatibility |
| Minor | v1.1.0 | New backwards-compatible functionality |
| Patch | v1.0.1 | Backwards-compatible bug fixes and maintenance |
| Pre-release | v1.1.0-beta.1 | Features available for testing before stable release |

A roadmap milestone is not considered a published release until an appropriate version is tagged and made available through GitHub Releases.

**Latest releases:** [GitHub Releases](https://github.com/Kitgenix/hoplane/releases)

Where possible, releases will include a changelog, compatibility information, upgrade guidance, and any necessary migration instructions.

* * * * *

Forks and Upstream Compatibility
--------------------------------

Hoplane is designed to be independently deployed and maintained.

We want users to be able to fork Hoplane, customise their installation, and benefit from future improvements made by Kitgenix.

Development will aim to:

-   Maintain a clear and predictable upstream repository structure.

-   Minimise unnecessary breaking changes.

-   Document configuration and database changes.

-   Provide clear migration instructions.

-   Make upstream updates easier to integrate into existing forks.

-   Preserve required project attribution in accordance with the applicable licence and project requirements.

**Important:** Updates made to the original repository do not automatically update independently maintained forks or Cloudflare deployments.

Fork maintainers are responsible for synchronising upstream changes and deploying the resulting updates.

* * * * *

Community Contributions
-----------------------

Hoplane welcomes contributions from developers, designers, translators, security researchers, and users.

Community members can help by:

-   Reporting bugs and unexpected behaviour.

-   Suggesting new features.

-   Improving documentation.

-   Contributing code and tests.

-   Improving accessibility.

-   Reviewing translations.

-   Testing releases and deployment procedures.

Before submitting a substantial feature, consider opening an issue to discuss its design and compatibility with the project's goals.

**Get involved:**

-   [GitHub Issues](https://github.com/Kitgenix/hoplane/issues)

-   [Pull Requests](https://github.com/Kitgenix/hoplane/pulls)

-   [Security Policy](https://github.com/Kitgenix/hoplane/blob/main/SECURITY.md)

Security vulnerabilities must be reported privately using the process described in `SECURITY.md`.

* * * * *

Roadmap Disclaimer
------------------

This roadmap is a living document and may change based on technical feasibility, security considerations, community feedback, and project priorities.

Planned features do not have guaranteed delivery dates.

Inclusion on this roadmap does not guarantee that a feature will be implemented or included in a specific release.

Kitgenix reserves the ability to adjust development priorities to maintain Hoplane's stability, security, and long-term sustainability.

* * * * *

About Hoplane
-------------

Hoplane is an open-source project developed and maintained by **Kitgenix**.

**Website:** [kitgenix.com](https://kitgenix.com/)\
**Repository:** [github.com/Kitgenix/hoplane](https://github.com/Kitgenix/hoplane)\
**Releases:** [Hoplane Releases](https://github.com/Kitgenix/hoplane/releases)

**Hoplane - Every link has a destination.**

Made by [Kitgenix](https://kitgenix.com/).