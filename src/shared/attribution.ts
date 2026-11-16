/**
 * Kitgenix attribution: REQUIRED by the licence (see LICENSE §2).
 *
 * Every HTML page served by this application (landing page, dashboard,
 * login/setup, password, warning, error and social-preview pages) must show
 * working, visible links to Kitgenix.com and the Kitgenix GitHub. All of the
 * app's HTML surfaces read from this one module, and the test suite fails if
 * the links go missing. Change the styling as you like, but keep the links.
 */
export const KITGENIX = Object.freeze({
  name: 'Kitgenix',
  product: 'Hoplane',
  /** Full product branding, e.g. for titles and generator tags. */
  brand: 'Hoplane by Kitgenix',
  /** npm package name. */
  packageName: '@kitgenix/hoplane',
  tagline: 'Every link has a destination.',
  /** One-line description of what the product is. */
  description: 'The self-hosted URL shortener for Cloudflare',
  /** Developer website (required attribution link). */
  website: 'https://kitgenix.com',
  /** Developer GitHub (required attribution link). */
  github: 'https://github.com/Kitgenix',
  /** Product website. */
  productWebsite: 'https://kitgenix.com/hoplane',
  /** Source repository. */
  repository: 'https://github.com/kitgenix/hoplane',
});

/** HTTP `Link` header advertising authorship on every response. */
export const ATTRIBUTION_LINK_HEADER = `<${KITGENIX.website}>; rel="author", <${KITGENIX.github}>; rel="code-repository"`;

/** Plain-HTML footer used by server-rendered pages. */
export function attributionHtml(): string {
  return `<footer class="kg-attribution" data-kitgenix-attribution>
  <span><a href="${KITGENIX.repository}" target="_blank" rel="noopener">${KITGENIX.product}</a> by Kitgenix</span>
  <span aria-hidden="true">·</span>
  <a href="${KITGENIX.website}" target="_blank" rel="noopener">Kitgenix.com</a>
  <span aria-hidden="true">·</span>
  <a href="${KITGENIX.github}" target="_blank" rel="noopener">GitHub</a>
</footer>`;
}
