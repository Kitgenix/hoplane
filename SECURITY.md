Security Policy
===============

**Hoplane by** [**Kitgenix**](https://kitgenix.com/)

Security, privacy, and responsible disclosure are important to the Hoplane project. We aim to provide a secure, reliable, and privacy-conscious URL shortening platform that individuals and organisations can deploy within their own Cloudflare accounts.

We welcome responsible security research and appreciate the contributions of researchers and developers who help keep Hoplane and its users safe.

1\. Supported Versions
----------------------

Security updates are prioritised for the latest stable release of Hoplane.

| Version | Security Support |
| Latest stable release | Supported |
| Previous stable releases | Best effort |
| Development branches | Not guaranteed |
| Modified or third-party forks | Maintained by their respective operators |

Users should deploy the latest stable release and apply security updates promptly.

Security fixes may be released separately from regular feature updates when appropriate.

2\. Reporting a Vulnerability
-----------------------------

**Please do not disclose security vulnerabilities through public GitHub issues, pull requests, discussions, or social media.**

If you discover a potential vulnerability, report it privately so the Kitgenix maintainers can investigate and address it before public disclosure.

### Preferred Method: GitHub Private Vulnerability Reporting

Submit a confidential security report through:

[**Report a Security Vulnerability**](https://github.com/Kitgenix/hoplane/security/advisories/new)

This allows security researchers to communicate privately with the Hoplane maintainers.

### Alternative Contact

If GitHub private vulnerability reporting is unavailable, contact Kitgenix through:

**Website:** [https://kitgenix.com](https://kitgenix.com/)

Please clearly identify the report as a security vulnerability affecting Hoplane.

### Information to Include

Where possible, provide:

-   A description of the vulnerability and its potential impact.

-   The affected Hoplane version or commit.

-   The affected component, endpoint, or feature.

-   Clear steps to reproduce the issue.

-   A proof of concept, if available.

-   Any relevant logs, screenshots, or error messages.

-   Suggested mitigations or remediation, if known.

Do not include real user credentials, private API keys, access tokens, or personal information.

3\. Vulnerability Response Process
----------------------------------

Kitgenix aims to acknowledge security reports within **5 working days**.

Our general response process is:

1.  **Acknowledgement:** Confirm receipt of the vulnerability report.

2.  **Assessment:** Review the evidence, reproduce the issue where possible, and determine its severity and scope.

3.  **Remediation:** Develop and validate an appropriate security fix or mitigation.

4.  **Release:** Publish a security update when a fix is available.

5.  **Disclosure:** Coordinate public disclosure and issue a GitHub Security Advisory where appropriate.

Resolution times depend on the complexity and severity of the issue. No fixed remediation deadline is guaranteed.

We ask researchers to allow reasonable time for investigation and remediation before publicly disclosing vulnerabilities.

4\. Responsible Security Research
---------------------------------

We welcome good-faith research that improves Hoplane's security.

Researchers should:

-   Use their own Hoplane deployments or environments for testing.

-   Avoid accessing, modifying, or deleting data belonging to others.

-   Avoid disrupting services or causing unnecessary resource consumption.

-   Refrain from denial-of-service attacks, phishing, social engineering, and credential harvesting.

-   Avoid attempting to compromise Cloudflare infrastructure or third-party services.

-   Stop testing if unexpected access to sensitive information occurs, and report the issue privately.

-   Allow reasonable time for a coordinated security response.

Testing installations belonging to other individuals or organisations requires their explicit authorisation.

This policy does not grant permission to test systems, infrastructure, or accounts not owned by the researcher.

5\. Built-in Security Controls
------------------------------

Hoplane includes multiple application-level security measures designed to protect deployments, administrative access, and user information.

### Authentication and Session Security

-   User passwords are hashed using PBKDF2-SHA256 with 100,000 iterations.

-   Session tokens and API keys are stored as SHA-256 hashes rather than plaintext values.

-   Authentication sessions can be revoked server-side.

-   Session cookies use the `HttpOnly`, `Secure`, and `SameSite=Strict` attributes.

-   Session cookies use the `__Host-` prefix.

-   Cookie-authenticated state-changing requests are subject to same-origin validation.

-   Login attempts are subject to application-level rate limiting.

### Access Control

Hoplane provides role-based access control with four roles:

-   **Owner:** Full administrative access.

-   **Admin:** Administrative access subject to role restrictions.

-   **Editor:** Link and content management permissions.

-   **Viewer:** Read-only access to permitted resources.

API keys support scoped permissions and optional expiration dates.

Administrators should follow the principle of least privilege when assigning roles and issuing API credentials.

### Application and Browser Security

-   The dashboard is served with a Content Security Policy (CSP).

-   `X-Frame-Options: DENY` helps protect against clickjacking.

-   Redirect destinations must use HTTP or HTTPS.

-   URLs containing embedded credentials are rejected.

-   Redirects to the shortener's own origin are rejected.

-   Domain blocking and optional redirect warning pages help reduce malicious link abuse.

### Privacy and Analytics

Hoplane is designed to minimise unnecessary collection of visitor information.

-   Visitor IP addresses are not stored in Hoplane's analytics database.

-   Visitor tracking does not require analytics cookies.

-   Unique-visitor calculations use a random salt that is rotated daily.

-   Previous daily salts are deleted to prevent linking visitor identifiers across days.

-   Analytics retention is configurable.

-   Automated cleanup reduces the retention of historical click-level data.

These protections relate to Hoplane's application-level data handling. Cloudflare, browsers, network operators, and other infrastructure components may process or retain additional information under their respective configurations and policies.

**These controls provide defence in depth but do not guarantee that an installation is free from vulnerabilities.**

6\. Securing Your Cloudflare Deployment
---------------------------------------

Each Hoplane deployment runs within the operator's own Cloudflare account.

The operator is responsible for securing that account, configuring the deployment appropriately, and keeping the application updated.

### Protect Your Setup Token

The `SETUP_TOKEN` is a sensitive deployment secret used during initial owner account creation and recovery.

We recommend:

-   Generating a cryptographically random token containing at least 32 characters.

-   Storing the token in a trusted password manager.

-   Configuring it as a Cloudflare Worker secret.

-   Never committing the token to GitHub or application source code.

-   Never placing production secrets in `wrangler.jsonc` or other tracked configuration files.

-   Rotating the token if it is suspected to have been exposed.

-   Retaining access to the token if you may need owner-account recovery.

After an owner account has been created, the token cannot be used to create additional accounts through initial setup.

However, it remains relevant to the documented recovery process. Removing it may prevent recovery through that process.

See the [README troubleshooting guide](https://github.com/Kitgenix/hoplane#troubleshooting).

### Secure Your Cloudflare Account

Deployment operators should:

-   Enable multifactor authentication (MFA) for Cloudflare accounts.

-   Use strong, unique passwords.

-   Limit Cloudflare account access to trusted individuals.

-   Grant the minimum permissions required for deployment and maintenance.

-   Review API tokens and remove unused credentials.

-   Protect deployment credentials used by GitHub Actions or other CI/CD systems.

-   Review Cloudflare account activity and security events periodically.

### Protect Dashboard and API Access

Where appropriate, consider placing administrative interfaces behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/).

Relevant paths include:

-   `/dashboard` and `/dashboard/*`

-   `/api/*`

Before protecting API routes, review any external integrations, automation, or MCP clients that require access.

Cloudflare Access policies must be configured so they do not unintentionally interrupt public short-link redirects or legitimate API integrations.

### Configure Rate Limiting

Hoplane includes application-level login rate limiting.

Operators may apply additional [Cloudflare WAF rate-limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/) to sensitive endpoints, including:

`POST /api/auth/login`

Additional rate limiting may help reduce automated password guessing and abusive traffic.

Rule availability and behaviour depend on Cloudflare plan features and configuration.

### Prevent Malicious Link Abuse

For public-facing or community-operated installations, we recommend:

-   Enabling **Settings → Security → Warning page for every link**.

-   Maintaining an appropriate destination-domain blocklist.

-   Restricting link creation to authorised users.

-   Monitoring unusual link creation and redirect activity.

-   Reviewing potentially abusive links promptly.

-   Disabling or removing links associated with phishing, malware, or other malicious activity.

A redirect warning page and domain blocklist reduce certain risks but are not substitutes for ongoing abuse prevention and moderation.

7\. API Keys and Integrations
-----------------------------

API keys provide programmatic access to Hoplane and must be treated as sensitive credentials.

Recommended practices include:

-   Creating separate keys for individual applications or integrations.

-   Granting only the required API scopes.

-   Setting expiration dates wherever practical.

-   Storing keys in secure secret-management systems.

-   Avoiding credentials in source code, client-side applications, screenshots, and logs.

-   Revoking credentials that are unused, exposed, or suspected to be compromised.

-   Reviewing integrations periodically.

For MCP integrations and external clients, use dedicated credentials with the minimum necessary permissions.

Never expose privileged API keys in publicly accessible applications.

8\. Backups and Disaster Recovery
---------------------------------

Hoplane supports optional link backups using Cloudflare R2.

Deployment operators are encouraged to maintain an appropriate backup and recovery strategy.

Recommended practices include:

-   Enabling backups where appropriate.

-   Restricting access to backup storage.

-   Configuring R2 retention and lifecycle rules.

-   Periodically testing the restoration process.

-   Protecting database exports and backup files.

-   Keeping a secure record of deployment configuration and recovery procedures.

**Important:** Hoplane's documented R2 backup feature backs up links only. It does not provide a complete backup of user accounts, API keys, sessions, or analytics.

Operators requiring full disaster recovery should implement additional safeguards appropriate to their deployment.

9\. Security Updates
--------------------

Security-related changes may be published through:

-   [GitHub Releases](https://github.com/Kitgenix/hoplane/releases)

-   [GitHub Security Advisories](https://github.com/Kitgenix/hoplane/security/advisories)

-   [Repository Commit History](https://github.com/Kitgenix/hoplane/commits/main)

We recommend watching the repository for important updates.

Operators using forks or independent deployments are responsible for integrating upstream security fixes into their own installations.

Updating a fork or deployment may require manual intervention, particularly where configuration files or application code have been modified.

10\. Security Incident Response
-------------------------------

If you believe your Hoplane deployment has been compromised:

1.  Restrict access to the affected administrative interfaces where practical.

2.  Revoke suspected compromised sessions and API keys.

3.  Rotate potentially exposed deployment credentials.

4.  Review Cloudflare security events and Hoplane audit logs.

5.  Preserve relevant evidence securely.

6.  Investigate unauthorised changes to links, users, and configuration.

7.  Apply available security updates or mitigations.

8.  Restore affected data from a known-good backup where necessary.

9.  Notify affected parties when legally required or otherwise appropriate.

If the incident appears to involve a vulnerability in Hoplane itself, report the issue privately to Kitgenix.

11\. Third-Party Services and Dependencies
------------------------------------------

Hoplane uses Cloudflare infrastructure and open-source software dependencies.

While we aim to maintain secure and up-to-date dependencies, vulnerabilities may occur in upstream services or packages.

Security issues affecting Cloudflare infrastructure should be reported through Cloudflare's official security reporting channels.

Issues affecting Hoplane's implementation, configuration, or integration with those services may be reported to Kitgenix.

12\. Self-Hosted Deployment Responsibility
------------------------------------------

Hoplane is distributed as open-source software for independent deployment.

Each deployment operator is responsible for:

-   Securing their hosting account and associated resources.

-   Maintaining appropriate access controls.

-   Applying application and dependency updates.

-   Monitoring and preventing misuse of their service.

-   Protecting personal information and sensitive data.

-   Maintaining suitable backups.

-   Complying with applicable laws and regulations.

Kitgenix does not automatically administer, monitor, update, or secure third-party deployments.

13\. Security Contact and Project Information
---------------------------------------------

**Project:** Hoplane\
**Maintainer:** Kitgenix\
**Website:** [https://kitgenix.com](https://kitgenix.com/)\
**Repository:** <https://github.com/Kitgenix/hoplane>\
**Private Vulnerability Reporting:** <https://github.com/Kitgenix/hoplane/security/advisories/new>

For general questions, feature requests, or non-security bugs, use the repository's [GitHub Issues](https://github.com/Kitgenix/hoplane/issues).

For security vulnerabilities, always use the private reporting channels described above.

* * * * *

**Hoplane - Every link has a destination.**

Developed and maintained by [Kitgenix](https://kitgenix.com/).