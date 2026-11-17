# Hoplane Support

**Hoplane by [Kitgenix](https://kitgenix.com)**  
**Project:** [github.com/Kitgenix/hoplane](https://github.com/Kitgenix/hoplane)

Hoplane is a source-available, self-hosted URL shortener built for Cloudflare Workers, D1 and KV. This guide explains where to get help with installation, configuration, updates and day-to-day operation.

Hoplane is deployed into **your own Cloudflare account**. Kitgenix maintains the project code but does not automatically administer, monitor or support individual deployments as a managed hosting provider.

## Choose the right support channel

| What you need | Where to go |
| --- | --- |
| Setup, configuration or troubleshooting | Read the [README](README.md), especially **Deploy**, **Configuration**, **Updating** and **Troubleshooting**; then search [existing issues](https://github.com/Kitgenix/hoplane/issues) |
| A reproducible bug in Hoplane | Open a [GitHub issue](https://github.com/Kitgenix/hoplane/issues/new) after searching existing reports |
| A feature or improvement proposal | Open a [GitHub issue](https://github.com/Kitgenix/hoplane/issues/new) and explain the use case |
| A security vulnerability in Hoplane | Follow [SECURITY.md](SECURITY.md) and use [private vulnerability reporting](https://github.com/Kitgenix/hoplane/security/advisories/new); **never post exploit details publicly** |
| A community conduct concern | Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and contact Kitgenix privately through a method listed at [kitgenix.com](https://kitgenix.com) |
| Help contributing code or documentation | Read [CONTRIBUTING.md](CONTRIBUTING.md) |
| Cloudflare billing, account access, platform outages or service-specific limits | Use [Cloudflare Support](https://developers.cloudflare.com/support/) or the appropriate Cloudflare account support channel |
| Licence, attribution or project enquiries | Review [LICENSE](LICENSE) and [NOTICE](NOTICE); use the contact information available at [kitgenix.com](https://kitgenix.com) |

GitHub Issues are a public project tracker, **not a private help desk**. Do not use them for account-specific information or sensitive data.

## Before asking for help

1. **Identify your version.** Note the Hoplane release or Git commit and whether your installation came from a one-click Cloudflare deploy, command-line deployment or a modified fork.
2. **Check the documentation.** Start with the [README](README.md), including the troubleshooting and updating sections.
3. **Check existing reports.** Search [open and closed issues](https://github.com/Kitgenix/hoplane/issues) for your exact error or symptom.
4. **Check the deployment.** Confirm the Worker is deployed, required D1/KV bindings exist, and any required secrets have been configured. Check Cloudflare's Worker logs and deployment history where appropriate.
5. **Try to reproduce safely.** If possible, test with a fresh or local development installation rather than altering a live production instance.
6. **Sanitise everything you share.** Remove credentials, tokens, cookies, private URLs, personal data and customer records from logs, screenshots and configuration snippets.

### Include this in a support request

Copy and fill in the following when submitting a technical issue:

```text
Summary:
What happened, and what did you expect instead?

Hoplane version or commit:
Deployment method: One-click / CLI / Other
Hosting: Cloudflare Workers
Affected component: Deploy / Dashboard / Redirects / D1 / KV / R2 / API / MCP / Other
Browser and operating system (if relevant):

Steps to reproduce:
1.
2.
3.

Actual result:
Expected result:

Error message or sanitised log excerpt:

What I have already tried:

Does this also happen on an unmodified installation? Yes / No / Not tested
```

Include minimal reproduction code or screenshots when useful. **Never attach an unredacted database export** or paste your `SETUP_TOKEN`, `.dev.vars`, session cookies, API keys, Cloudflare API tokens or other secrets.

## Common problems and where to look

### Deployment will not complete

Check the build/deployment output, the Cloudflare account's Worker configuration, and the D1/KV resources required by your selected deployment method. Follow the relevant **Deploy** section in the [README](README.md). For one-click installations, check the connected repository's deployment history; for CLI installations, examine the output of `npm run deploy`.

If the error concerns Cloudflare infrastructure, permissions, billing or service availability rather than Hoplane code, consult [Cloudflare's documentation and support](https://developers.cloudflare.com/).

### Owner setup is unavailable

Check that `SETUP_TOKEN` exists as a **Worker secret**, not a public configuration value. The README documents how to set it. Never post the token in an issue. If an owner already exists, initial setup is intentionally closed.

### You cannot sign in

Wait for any login rate limit to expire before retrying. An authorised admin or owner may be able to reset another user's password in the dashboard, subject to the role permissions described in the README.

If you are the sole owner and have lost access, read the **Troubleshooting** section of the README carefully. Its documented owner-recovery procedure is **destructive to user-account records**, can revoke access credentials and should not be attempted without verifying a suitable backup and understanding the consequences. Kitgenix cannot recover credentials or access a deployment hosted solely in your Cloudflare account.

### A link change is not visible immediately

Hoplane uses Cloudflare KV for cached link lookups. The README notes that edits may take approximately **60 seconds** to reach all locations because KV is eventually consistent. Confirm the change persists after that interval before reporting a cache issue.

### Analytics appear incomplete

According to the README, bot traffic is excluded by default and browsers may cache **301/308** redirects, preventing repeat requests from reaching Hoplane. A **302** redirect is generally preferable when repeat-visit analytics matter. Review analytics retention, filters, and the instance's bot-counting setting.

### A custom domain does not work

Check that the hostname is in the correct Cloudflare account, that the custom domain is assigned to the intended Worker, and that conflicting DNS records do not exist. See **Use your own domain** in the README and the Cloudflare dashboard's deployment information.

### API or MCP access fails

Confirm you are using the correct endpoint, a current API key, and the least-privileged scopes needed by the requested operation. Check whether Cloudflare Access or WAF policies are blocking requests. Do not publish API keys or authenticated request headers.

### Backups or imports fail

Check that any optional R2 bucket and binding are present and that the backup format matches the documented import process. The current README describes **link-only R2 backups**, not full account, credential or analytics backups. Test restoration using a safe, non-production environment.

## Updates and compatibility

Each self-hosted operator is responsible for applying updates to their deployment. A change pushed to the official Hoplane repository **does not automatically update third-party forks or installations**.

Before upgrading:

- Read the [changelog](CHANGELOG.md) and relevant [releases](https://github.com/Kitgenix/hoplane/releases).
- Back up the data and configuration necessary for your recovery requirements.
- Check for database, binding, environment-variable or API changes.
- Test significant changes outside production where practical.
- Review and merge upstream changes carefully, particularly if your fork has customised `wrangler.jsonc` or application code.

For upgrade instructions, see **Updating** in the [README](README.md).

## Scope and availability of support

Hoplane is maintained as a source-available software project. Public GitHub support and contributions are handled on a **best-effort basis**; there is no guaranteed response or resolution time for ordinary issues, feature requests or individual deployment assistance.

Project maintainers may prioritise confirmed bugs, security problems and issues affecting the current supported release. They may request additional reproduction details, close duplicate reports or redirect questions to Cloudflare where appropriate.

Unless expressly agreed otherwise, **Kitgenix does not provide**:

- Managed hosting, deployment administration or monitoring for third-party installations.
- Guaranteed uptime, backup recovery, data restoration or emergency response.
- Direct access to Cloudflare accounts or self-hosted Hoplane databases.
- Support for changes made only in private forks or incompatible third-party integrations.
- Legal, regulatory, privacy-compliance or security-certification advice for an operator's deployment.

Security reports follow the separate response process in [SECURITY.md](SECURITY.md).

## Security and privacy when requesting help

Before sharing material publicly, check for:

- `SETUP_TOKEN`, passwords, session cookies, bearer/API keys, Cloudflare tokens and `.dev.vars` contents.
- Private short URLs, destination URLs, contact information and customer data.
- D1 database exports, R2 backups, analytics records and unredacted Worker logs.
- Screenshots containing sensitive browser tabs, account information or QR codes linked to private destinations.

If you think a credential has been exposed, revoke or rotate it promptly. For a suspected vulnerability in Hoplane, use [private vulnerability reporting](https://github.com/Kitgenix/hoplane/security/advisories/new) instead of opening an issue.

## Related project resources

- [README — installation, configuration and troubleshooting](README.md)
- [Roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Licence](LICENSE) and [NOTICE](NOTICE)

---

**Hoplane - Every link has a destination.**  
Developed and maintained by [Kitgenix](https://kitgenix.com).  
Original repository: [github.com/Kitgenix/hoplane](https://github.com/Kitgenix/hoplane).
