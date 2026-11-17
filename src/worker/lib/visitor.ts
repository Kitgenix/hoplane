/**
 * Hoplane visitor classification and privacy-aware request context.
 * https://kitgenix.com · https://github.com/Kitgenix/hoplane
 *
 * User-Agent classification is heuristic and MUST NOT be used to enforce
 * authentication, security policies, or strict click limits.
 */

const BOT_RE =
  /bot\b|bot\/|crawler|spider|crawling|slurp|facebookexternalhit|facebot|preview|monitor|curl\/|wget\/|python-requests|python-urllib|httpclient|go-http-client|okhttp|axios\/|node-fetch|headlesschrome|lighthouse|pingdom|uptime|scanner|phantomjs|feedfetcher|mediapartners|whatsapp|telegram|discord|slack|embedly|iframely|vkshare|skypeuripreview|bitlybot|validator/i;

const SOCIAL_RE =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|slack-imgproxy|discordbot|whatsapp|telegrambot|pinterest|redditbot|applebot|skypeuripreview|embedly|vkshare|iframely|mastodon|bluesky|cardyb|snapchat|line\/|viber|kakaotalk|google-pagerenderer|googlebot|bingbot|yandex|duckduckbot|xing-contenttabreceiver|tumblr|nuzzel|qwantify|bitlybot|outbrain|w3c_validator|flipboard|metainspector|microsoftpreview|teams|zoom/i;

/** Preview fetchers are also treated as automated clients in analytics. */
export function isBot(ua: string): boolean {
  return !ua || BOT_RE.test(ua) || isSocialCrawler(ua);
}

/** Crawlers that build link previews (Open Graph cards) for chat and social apps. */
export function isSocialCrawler(ua: string): boolean {
  return SOCIAL_RE.test(ua);
}

export function deviceOf(ua: string): string {
  if (isBot(ua)) return 'bot';
  if (/ipad|tablet|kindle|silk|playbook|nexus (7|9|10)/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/i.test(ua)) return 'mobile';
  if (/smart-?tv|hbbtv|appletv|googletv|roku|playstation|xbox|nintendo/i.test(ua)) return 'tv';
  return 'desktop';
}

export function osOf(ua: string): string {
  if (/windows phone/i.test(ua)) return 'Windows Phone';
  if (/windows nt|win64|win32/i.test(ua)) return 'Windows';
  if (/iphone|ipod/i.test(ua)) return 'iOS';
  if (/ipad/i.test(ua)) return 'iPadOS';
  if (/cros/i.test(ua)) return 'ChromeOS';
  if (/android/i.test(ua)) return 'Android';
  if (/mac os x|macintosh/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Other';
}

export function browserOf(ua: string): string {
  if (isBot(ua)) return 'Bot';
  if (/edg(e|a|ios)?\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/samsungbrowser/i.test(ua)) return 'Samsung Internet';
  if (/yabrowser/i.test(ua)) return 'Yandex';
  if (/vivaldi/i.test(ua)) return 'Vivaldi';
  if (/brave/i.test(ua)) return 'Brave';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/chrome|crios|chromium/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}

export function languageOf(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null;
  const first = acceptLanguage.split(',')[0]?.split(';')[0]?.trim().toLowerCase();
  return first && /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(first) ? first.slice(0, 2) : null;
}

/** Only HTTP(S) Referer header values are treated as referrer hosts.
 * The Referer header is itself spoofable; never use it for access control. */
export function referrerHost(referer: string | null, selfHost: string): string | null {
  if (!referer) return null;
  try {
    const parsed = new URL(referer);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const normalise = (host: string) => host.replace(/^www\./i, '').replace(/\.$/, '').toLowerCase();
    const host = normalise(parsed.hostname);
    if (!host || host === normalise(selfHost)) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

export interface VisitorContext {
  country: string | null;
  region: string | null;
  city: string | null;
  continent: string | null;
  latitude: number | null;
  longitude: number | null;
  device: string;
  os: string;
  browser: string;
  language: string | null;
  referrer: string | null;
  bot: boolean;
  ua: string;
  ip: string;
}

export function visitorFrom(request: Request): VisitorContext {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  const ua = request.headers.get('user-agent') || '';
  const url = new URL(request.url);
  const lat = cf?.latitude ? Number(cf.latitude) : null;
  const lon = cf?.longitude ? Number(cf.longitude) : null;
  const str = (v: unknown, max = 80) => (typeof v === 'string' && v ? v.slice(0, max) : null);

  // In Cloudflare, use CF-Connecting-IP. An arbitrary X-Forwarded-For header is
  // caller-controlled and MUST NOT influence production visitor identifiers or
  // password rate limits. Retain XFF fallback only for local development/tests.
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const ip = request.headers.get('cf-connecting-ip')
    || (local ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '' : '');

  return {
    country: str(cf?.country, 2),
    region: str(cf?.region),
    city: str(cf?.city),
    continent: str(cf?.continent, 2),
    // ~0.1 degrees: longitude distance varies considerably with latitude.
    latitude: lat !== null && Number.isFinite(lat) ? Math.round(lat * 10) / 10 : null,
    longitude: lon !== null && Number.isFinite(lon) ? Math.round(lon * 10) / 10 : null,
    device: deviceOf(ua),
    os: osOf(ua),
    browser: browserOf(ua),
    language: languageOf(request.headers.get('accept-language')),
    // Do not use ?ref= or ?utm_source= as a claimed referrer. These are
    // attacker-controlled and must not influence referrer-based routing.
    referrer: referrerHost(request.headers.get('referer'), url.hostname),
    bot: isBot(ua),
    ua,
    ip,
  };
}
