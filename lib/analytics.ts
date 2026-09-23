export type AnalyticsDeviceType =
  | "DESKTOP"
  | "TABLET"
  | "MOBILE"
  | "OTHER";

export type AnalyticsTrafficType =
  | "HUMAN"
  | "LIKELY_BOT"
  | "UNKNOWN";

export type AnalyticsTrafficClassification = {
  trafficType: AnalyticsTrafficType;
  trafficSignal:
    | "authenticated"
    | "known_bot_user_agent"
    | "browser_automation"
    | "browser_interaction"
    | "insufficient_evidence";
};

export function analyticsTrafficClassification(
  userAgent: string,
  authenticated: boolean,
  webdriver = false,
): AnalyticsTrafficClassification {
  if (authenticated) {
    return {
      trafficType: "HUMAN",
      trafficSignal: "authenticated",
    };
  }

  if (webdriver) {
    return {
      trafficType: "LIKELY_BOT",
      trafficSignal: "browser_automation",
    };
  }

  const ua = userAgent.toLowerCase();

  const knownBotPattern =
    /(?:googlebot|bingbot|duckduckbot|baiduspider|yandexbot|yandeximages|slurp|applebot|facebookexternalhit|twitterbot|linkedinbot|discordbot|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|gptbot|chatgpt-user|oai-searchbot|claudebot|perplexitybot|crawler|spider|headlesschrome|phantomjs|selenium|puppeteer|playwright|curl\/|wget\/|python-requests|python-urllib|go-http-client|okhttp)/i;

  if (knownBotPattern.test(ua)) {
    return {
      trafficType: "LIKELY_BOT",
      trafficSignal: "known_bot_user_agent",
    };
  }

  return {
    trafficType: "UNKNOWN",
    trafficSignal: "insufficient_evidence",
  };
}

export function isExcludedAnalyticsGeo(
  countryCode: string | null,
  regionCode: string | null,
  city: string | null,
) {
  if (!countryCode || !regionCode || !city) {
    return false;
  }

  const requestGeo = [
    countryCode,
    regionCode,
    city,
  ]
    .map((value) => value.trim().toLowerCase())
    .join(":");

  const excluded = new Set(
    (process.env.ANALYTICS_EXCLUDED_GEOS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  return excluded.has(requestGeo);
}

export function normalizeAnalyticsPath(path: string) {
  const clean = path.split("?")[0]?.split("#")[0] || "/";

  return clean
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi,
      "/[id]",
    )
    .replace(
      /\/\d+(?=\/|$)/g,
      "/[number]",
    );
}

export function analyticsReferrerHost(
  value: string | null | undefined,
) {
  if (!value) return null;

  try {
    return new URL(value).hostname.slice(0, 500);
  } catch {
    return null;
  }
}

export function analyticsDeviceType(
  userAgent: string,
  platform = "",
  maxTouchPoints = 0,
): AnalyticsDeviceType {
  const ua = userAgent.toLowerCase();

  if (
    (
      platform === "MacIntel" &&
      maxTouchPoints > 1
    ) ||
    /ipad|tablet|kindle|silk/.test(ua) ||
    (
      /android/.test(ua) &&
      !/mobile/.test(ua)
    )
  ) {
    return "TABLET";
  }

  if (
    /iphone|ipod|android.*mobile|windows phone/.test(ua)
  ) {
    return "MOBILE";
  }

  if (
    /macintosh|windows nt|x11|linux/.test(ua)
  ) {
    return "DESKTOP";
  }

  return "OTHER";
}

export function analyticsDeviceModel(
  userAgent: string,
  platform = "",
  maxTouchPoints = 0,
) {
  const ua = userAgent;
  const lower = ua.toLowerCase();

  if (/iPhone|iPod/.test(ua)) {
    return "iPhone";
  }

  if (
    /iPad/.test(ua) ||
    (
      platform === "MacIntel" &&
      maxTouchPoints > 1
    )
  ) {
    return "iPad";
  }

  if (/Surface Duo/i.test(ua)) {
    return "Microsoft Surface Duo";
  }

  if (
    /SM-F9\d{2}/i.test(ua) ||
    /Galaxy Z Fold/i.test(ua)
  ) {
    return "Samsung Galaxy Z Fold";
  }

  if (
    /SM-F7\d{2}/i.test(ua) ||
    /Galaxy Z Flip/i.test(ua)
  ) {
    return "Samsung Galaxy Z Flip";
  }

  if (/Pixel/i.test(ua)) {
    return "Google Pixel";
  }

  if (
    /Samsung|SM-[A-Z0-9-]+/i.test(ua)
  ) {
    return "Samsung Galaxy";
  }

  if (/Android/.test(ua)) {
    return /mobile/i.test(ua)
      ? "Android Phone"
      : "Android Tablet";
  }

  if (/Macintosh|Mac OS X/.test(ua)) {
    return "Mac";
  }

  if (/Windows NT/.test(ua)) {
    return "Windows PC";
  }

  if (/Linux/.test(ua)) {
    return "Linux PC";
  }

  if (/iphone|ipad|ipod/.test(lower)) {
    return "Apple Mobile Device";
  }

  return "Other";
}

export function analyticsBrowser(userAgent: string) {
  const ua = userAgent;

  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/CriOS\//.test(ua)) return "Chrome";
  if (/FxiOS\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";

  if (
    /Safari\//.test(ua) &&
    !/Chrome|Chromium|CriOS|Edg|OPR/.test(ua)
  ) {
    return "Safari";
  }

  return "Other";
}

export function analyticsOperatingSystem(
  userAgent: string,
  platform = "",
  maxTouchPoints = 0,
) {
  const ua = userAgent;

  if (
    /iPhone|iPad|iPod/.test(ua) ||
    (
      platform === "MacIntel" &&
      maxTouchPoints > 1
    )
  ) {
    return "iOS / iPadOS";
  }

  if (/Android/.test(ua)) {
    return "Android";
  }

  if (/Macintosh|Mac OS X/.test(ua)) {
    return "macOS";
  }

  if (/Windows NT/.test(ua)) {
    return "Windows";
  }

  if (/Linux/.test(ua)) {
    return "Linux";
  }

  return "Other";
}

export function decodeAnalyticsHeader(
  value: string | null,
) {
  if (!value) return null;

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function analyticsLiveActivityCutoffMs(
  nowMs = Date.now(),
  windowMinutes = 5,
) {
  return nowMs - windowMinutes * 60 * 1000;
}

export function analyticsLiveActivityCutoffIso(
  nowMs = Date.now(),
  windowMinutes = 5,
) {
  return new Date(
    analyticsLiveActivityCutoffMs(
      nowMs,
      windowMinutes,
    ),
  ).toISOString();
}
