import { timingSafeEqual } from "node:crypto";

import type { AnalyticsGeographyEvaluation } from "./analytics-geography";

const DIAGNOSTIC_HEADER = "x-analytics-geography-diagnostic-token";
const TOKEN_ENV = "ANALYTICS_GEOGRAPHY_DIAGNOSTIC_TOKEN";
const NOT_BEFORE_ENV = "ANALYTICS_GEOGRAPHY_DIAGNOSTIC_NOT_BEFORE";
const EXPIRES_AT_ENV = "ANALYTICS_GEOGRAPHY_DIAGNOSTIC_EXPIRES_AT";
const MAXIMUM_DIAGNOSTIC_WINDOW_MS = 2 * 60 * 60 * 1000;
const MINIMUM_TOKEN_LENGTH = 43;

type HeaderReader = Pick<Headers, "get">;
type DiagnosticEnvironment = Partial<Record<
  | typeof TOKEN_ENV
  | typeof NOT_BEFORE_ENV
  | typeof EXPIRES_AT_ENV,
  string
>>;

type DiagnosticOptions = {
  environment?: DiagnosticEnvironment;
  logger?: (label: string, payload: string) => void;
  now?: Date;
};

function safeTokenMatch(provided: string, expected: string) {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);

  return providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes);
}

function diagnosticAuthorized(
  headers: HeaderReader,
  environment: DiagnosticEnvironment,
  now: Date,
) {
  const expectedToken = environment[TOKEN_ENV]?.trim() ?? "";
  const providedToken = headers.get(DIAGNOSTIC_HEADER)?.trim() ?? "";
  const notBefore = Date.parse(environment[NOT_BEFORE_ENV]?.trim() ?? "");
  const expiresAt = Date.parse(environment[EXPIRES_AT_ENV]?.trim() ?? "");
  const nowMilliseconds = now.getTime();

  if (
    expectedToken.length < MINIMUM_TOKEN_LENGTH ||
    providedToken.length < MINIMUM_TOKEN_LENGTH ||
    !Number.isFinite(notBefore) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= notBefore ||
    expiresAt - notBefore > MAXIMUM_DIAGNOSTIC_WINDOW_MS ||
    nowMilliseconds < notBefore ||
    nowMilliseconds >= expiresAt
  ) {
    return false;
  }

  return safeTokenMatch(providedToken, expectedToken);
}

function vercelIngressRegion(headers: HeaderReader) {
  const region = headers.get("x-vercel-id")?.split(":", 1)[0]?.trim() ?? "";
  return /^[a-z0-9-]{2,32}$/i.test(region) ? region : null;
}

/**
 * TEMPORARY: remove this module and its page-view call after controlled
 * Arlington/Clinton production testing. It logs no request identifiers.
 */
export function logAnalyticsGeographyDiagnostic(
  headers: HeaderReader,
  evaluation: AnalyticsGeographyEvaluation,
  options: DiagnosticOptions = {},
) {
  const now = options.now ?? new Date();
  const environment: DiagnosticEnvironment = options.environment ?? {
    [TOKEN_ENV]: process.env[TOKEN_ENV],
    [NOT_BEFORE_ENV]: process.env[NOT_BEFORE_ENV],
    [EXPIRES_AT_ENV]: process.env[EXPIRES_AT_ENV],
  };

  if (!diagnosticAuthorized(headers, environment, now)) return false;

  const payload = {
    application: "DM3Oi",
    timestamp: now.toISOString(),
    vercelIngressRegion: vercelIngressRegion(headers),
    candidates: evaluation.diagnostic.candidates,
    selected: {
      city: evaluation.geography.city,
      region: evaluation.geography.region,
      country: evaluation.geography.country,
      latitude: evaluation.geography.latitude,
      longitude: evaluation.geography.longitude,
    },
    selectedSources: evaluation.diagnostic.selectedSources,
  };

  const logger = options.logger ?? console.info;
  logger("ANALYTICS_GEOGRAPHY_DIAGNOSTIC", JSON.stringify(payload));
  return true;
}
