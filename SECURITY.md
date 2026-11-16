# Security

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Email the Kitgenix team through the contact details at [kitgenix.com](https://kitgenix.com), with steps to reproduce. We aim to reply within 5 working days.

## Hardening your deployment

- Use a long random `SETUP_TOKEN` and keep it in a password manager. Once your owner account exists it cannot create another account, but it is how you recover if the only owner is locked out (see the README's Troubleshooting section). You can rotate it at any time; deleting it removes that recovery route.
- Give teammates the lowest role they need, and give API keys only the scopes they need, with an expiry.
- For a public or community instance, enable **Settings → Security → Warning page for every link** and keep the domain blocklist up to date.
- Optionally put `/dashboard*` and `/api/*` behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) for single sign-on and an extra layer in front of the login.
- Optionally add a [WAF rate-limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/) for `POST /api/auth/login` on top of the built-in limiter.

## What the application does

- Passwords are hashed with PBKDF2-SHA256 (100,000 iterations). Sessions and API keys are stored only as SHA-256 hashes.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Strict` and use the `__Host-` prefix. Cookie-authenticated writes are rejected unless they come from the same origin.
- The dashboard is served with a strict Content Security Policy and `X-Frame-Options: DENY`.
- Destinations must be `http(s)` URLs without embedded credentials, and cannot point back at the shortener itself.
- No visitor IP addresses are stored. Unique-visitor hashes use a random salt that is replaced daily and then deleted.
