/**
 * Server-rendered public pages. Each one includes the Kitgenix attribution footer
 * (required by the licence; see src/shared/attribution.ts).
 */
import { ATTRIBUTION_LINK_HEADER, KITGENIX, attributionHtml } from '../../shared/attribution';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Powered-By': KITGENIX.product,
    Link: ATTRIBUTION_LINK_HEADER,
    ...extra,
  };
}

const PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; form-action *; frame-ancestors 'none'; base-uri 'none'";

const STYLE = `
:root{--bg:#f5f9ff;--card:#fff;--ink:#071b3a;--muted:#64748b;--line:#dde6f3;--brand:#214bff;--brand-fg:#214bff;--brand-ink:#fff;--warn:#b45309;--warn-bg:#fef3c7;--err:#dc2626;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#04122a;--card:#071b3a;--ink:#f5f9ff;--muted:#94a3b8;--line:#16335f;--brand-fg:#42b3ff;--warn:#f59e0b;--warn-bg:#2b2106;--err:#f87171}}
*{box-sizing:border-box}html,body{margin:0}
body{min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
main{flex:1;display:grid;place-items:center;padding:32px 16px}
.card{width:100%;max-width:440px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:32px;box-shadow:0 1px 2px rgba(7,27,58,.04),0 12px 40px -12px rgba(33,75,255,.18)}
.accent::before{content:"";display:block;height:5px;margin:-32px -32px 28px;border-radius:18px 18px 0 0;background:linear-gradient(135deg,#42b3ff 0%,#214bff 55%,#071b3a 100%)}
.mark{width:44px;height:44px;margin-bottom:20px}
.mark img{display:block;width:100%;height:100%}
.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600}
h1{font-size:24px;line-height:1.25;margin:6px 0 10px;letter-spacing:-.01em}
p{color:var(--muted);margin:0 0 20px}
.dest{display:block;word-break:break-all;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 14px;font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);margin-bottom:20px}
.notice{background:var(--warn-bg);color:var(--warn);border-radius:10px;padding:12px 14px;font-size:14px;margin-bottom:20px}
label{display:block;font-size:14px;font-weight:600;margin-bottom:6px}
input{width:100%;font:inherit;padding:11px 14px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);margin-bottom:14px}
input:focus{outline:2px solid var(--brand);outline-offset:1px}
.btn:hover{filter:brightness(1.08)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 18px;border-radius:10px;border:0;background:var(--brand);color:var(--brand-ink);font-family:inherit;font-weight:600;font-size:15px;line-height:1.2;text-decoration:none;cursor:pointer}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line);margin-top:10px}
.err{color:var(--err);font-size:14px;margin:-4px 0 14px}
.kg-attribution{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:20px 16px 28px;font-size:13px;color:var(--muted)}
.kg-attribution a{color:inherit;text-decoration:underline;text-underline-offset:3px}
.kg-attribution a:hover{color:var(--brand-fg)}
`;

/** The logo is public/favicon.svg (served as a static asset): replace that file to rebrand everywhere. */
const MARK = '<img src="/favicon.svg" alt="" width="44" height="44">';

export function page(opts: { title: string; siteName: string; body: string; head?: string; status?: number; noindex?: boolean }): Response {
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)} · ${esc(opts.siteName)}</title>
<meta name="generator" content="${KITGENIX.brand}"><link rel="author" href="${KITGENIX.website}">
${opts.noindex === false ? '' : '<meta name="robots" content="noindex,nofollow">'}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${opts.head || ''}
<style>${STYLE}</style></head>
<body><main>${opts.body}</main>
${attributionHtml()}
</body></html>`;
  return new Response(html, {
    status: opts.status ?? 200,
    headers: baseHeaders({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': PAGE_CSP,
      'X-Frame-Options': 'DENY',
    }),
  });
}

export function messagePage(siteName: string, status: number, title: string, message: string, action?: { href: string; label: string }) {
  return page({
    siteName,
    status,
    title,
    body: `<div class="card"><div class="mark">${MARK}</div><div class="eyebrow">${esc(siteName)}</div><h1>${esc(title)}</h1><p>${esc(message)}</p>${
      action ? `<a class="btn" href="${esc(action.href)}">${esc(action.label)}</a>` : ''
    }</div>`,
  });
}

export function passwordPage(siteName: string, slug: string, error?: string, status = 200) {
  return page({
    siteName,
    status,
    title: 'Protected link',
    body: `<form class="card" method="post" action="/${esc(slug)}">
<div class="mark">${MARK}</div><div class="eyebrow">Protected link</div>
<h1>This link needs a password</h1><p>Enter the password you were given to continue.</p>
<label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="off" required autofocus>
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
<button class="btn" type="submit">Continue</button></form>`,
  });
}

export function warningPage(siteName: string, destination: string) {
  let host = destination;
  try {
    host = new URL(destination).hostname;
  } catch {}
  return page({
    siteName,
    title: 'You are leaving',
    body: `<div class="card"><div class="mark">${MARK}</div><div class="eyebrow">Check before you continue</div>
<h1>You are about to visit ${esc(host)}</h1>
<div class="notice">This link goes to an external website. Only continue if you trust where it is going.</div>
<code class="dest">${esc(destination)}</code>
<a class="btn" href="${esc(destination)}" rel="noopener noreferrer nofollow">Continue to site</a>
<a class="btn ghost" href="/">Cancel</a></div>`,
  });
}

/** Served to link-preview crawlers so chat/social apps render a custom card. */
export function previewPage(siteName: string, opts: { title: string; description: string; image: string; url: string; canonical: string }) {
  const t = esc(opts.title || siteName);
  const d = esc(opts.description);
  const img = esc(opts.image);
  const head = `<meta property="og:type" content="website"><meta property="og:title" content="${t}"><meta property="og:url" content="${esc(opts.canonical)}">
${d ? `<meta name="description" content="${d}"><meta property="og:description" content="${d}">` : ''}
${img ? `<meta property="og:image" content="${img}"><meta name="twitter:image" content="${img}">` : ''}
<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${t}">${d ? `<meta name="twitter:description" content="${d}">` : ''}
<meta http-equiv="refresh" content="0;url=${esc(opts.url)}">`;
  const res = page({
    siteName,
    title: opts.title || siteName,
    head,
    noindex: true,
    body: `<div class="card"><h1>${t}</h1>${d ? `<p>${d}</p>` : ''}<a class="btn" href="${esc(opts.url)}">Open link</a></div>`,
  });
  return res;
}

export function landingPage(siteName: string, origin: string) {
  const isDefault = siteName === KITGENIX.product;
  return page({
    siteName,
    title: isDefault ? 'URL shortener by Kitgenix' : siteName,
    noindex: false,
    head: `<meta name="description" content="${esc(siteName)}: a fast, private link shortener with built-in analytics. Runs entirely on Cloudflare.">`,
    body: `<div class="card accent" style="max-width:560px">
<div class="mark">${MARK}</div><div class="eyebrow">${esc(new URL(origin).host)}</div>
<h1>${esc(siteName)}</h1>${isDefault ? `<p style="margin:-6px 0 14px;font-weight:600;color:var(--brand-fg)">${KITGENIX.tagline}</p>` : ''}
<p>Short links, QR codes and privacy-friendly analytics, served from Cloudflare's global network. No cookies or IP addresses are stored for visitors.</p>
<a class="btn" href="/dashboard">Open dashboard</a>
<a class="btn ghost" href="${KITGENIX.repository}" target="_blank" rel="noopener">Deploy your own: it's free on Cloudflare</a>
</div>`,
  });
}
