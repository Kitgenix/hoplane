/** Lightweight, dependency-free user-agent classification. */

const BOT_RE =
  /bot\b|bot\/|crawler|spider|crawling|slurp|facebookexternalhit|facebot|preview|monitor|curl\/|wget\/|python-requests|python-urllib|httpclient|go-http-client|okhttp|axios\/|node-fetch|headlesschrome|lighthouse|pingdom|uptime|scanner|phantomjs|feedfetcher|mediapartners|whatsapp|telegram|discord|slack|embedly|iframely|vkshare|skypeuripreview|bitlybot|validator/i;

const SOCIAL_RE =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|slack-imgproxy|discordbot|whatsapp|telegrambot|pinterest|redditbot|applebot|skypeuripreview|embedly|vkshare|iframely|mastodon|bluesky|cardyb|snapchat|line\/|viber|kakaotalk|google-pagerenderer|googlebot|bingbot|yandex|duckduckbot|xing-contenttabreceiver|tumblr|nuzzel|qwantify|bitlybot|outbrain|w3c_validator|flipboard|metainspector|microsoftpreview|teams|zoom/i;

export function isBot(ua: string): boolean {
  return !ua || BOT_RE.test(ua);
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

export function referrerHost(referer: string | null, selfHost: string): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname.replace(/^www\./, '').toLowerCase();
    if (!host || host === selfHost.replace(/^www\./, '').toLowerCase()) return null;
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
  // Use a utm_source / ref query param as the referrer when there is no Referer header (common for apps and email).
  const refParam = url.searchParams.get('ref') || url.searchParams.get('utm_source');
  return {
    country: str(cf?.country, 2),
    region: str(cf?.region),
    city: str(cf?.city),
    continent: str(cf?.continent, 2),
    // Rounded to ~11 km so that no precise location is ever stored.
    latitude: lat !== null && Number.isFinite(lat) ? Math.round(lat * 10) / 10 : null,
    longitude: lon !== null && Number.isFinite(lon) ? Math.round(lon * 10) / 10 : null,
    device: deviceOf(ua),
    os: osOf(ua),
    browser: browserOf(ua),
    language: languageOf(request.headers.get('accept-language')),
    referrer: referrerHost(request.headers.get('referer'), url.hostname) ?? (refParam ? refParam.toLowerCase().slice(0, 120) : null),
    bot: isBot(ua),
    ua,
    ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
  };
}
