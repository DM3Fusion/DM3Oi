import {
  geolocation,
  type Geo,
} from "@vercel/functions";

export type AnalyticsGeography = {
  city: string | null;
  region: string | null;
  country: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
};

export type AnalyticsProviderGeography = Pick<
  Geo,
  | "city"
  | "country"
  | "countryRegion"
  | "latitude"
  | "longitude"
  | "postalCode"
> & {
  timezone?: string;
};

type HeaderReader = Pick<Headers, "get">;

type DiagnosticGeography = Pick<
  AnalyticsGeography,
  "city" | "region" | "country" | "latitude" | "longitude"
>;

export type AnalyticsGeographySource =
  | "vercel_adapter"
  | "vercel_header"
  | "cloudflare_header_unverified"
  | "none";

export type AnalyticsGeographyEvaluation = {
  geography: AnalyticsGeography;
  diagnostic: {
    candidates: {
      vercelAdapter: DiagnosticGeography;
      vercelHeaders: DiagnosticGeography;
      cloudflareHeadersUnverified: DiagnosticGeography;
    };
    selectedSources: Record<keyof DiagnosticGeography, AnalyticsGeographySource>;
  };
};

function decodeHeader(value: string | null) {
  if (!value) return null;

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function firstPresent(...values: unknown[]) {
  return values.find(
    (value) => String(value ?? "").trim() !== "",
  );
}

function normalizedText(
  value: unknown,
  maximumLength: number,
) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (
    !normalized ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }

  return normalized.slice(0, maximumLength);
}

function normalizedCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
) {
  if (String(value ?? "").trim() === "") return null;

  const coordinate = Number(value);

  if (
    !Number.isFinite(coordinate) ||
    coordinate < minimum ||
    coordinate > maximum
  ) {
    return null;
  }

  const rounded = Number(coordinate.toFixed(2));

  return Object.is(rounded, -0) ? 0 : rounded;
}

function decodedHeader(
  headers: HeaderReader,
  ...names: string[]
) {
  for (const name of names) {
    const value = headers.get(name);

    if (String(value ?? "").trim()) {
      return decodeHeader(value);
    }
  }

  return null;
}

function diagnosticGeography(values: {
  city?: unknown;
  region?: unknown;
  country?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}): DiagnosticGeography {
  return {
    city: normalizedText(values.city, 120),
    region: normalizedText(values.region, 100),
    country: normalizedText(values.country, 8),
    latitude: normalizedCoordinate(values.latitude, -90, 90),
    longitude: normalizedCoordinate(values.longitude, -180, 180),
  };
}

function rawGeographyCandidates(
  headers: HeaderReader,
  provider: AnalyticsProviderGeography,
) {
  return {
    vercelAdapter: {
      city: provider.city,
      region: provider.countryRegion,
      country: provider.country,
      latitude: provider.latitude,
      longitude: provider.longitude,
    },
    vercelHeaders: {
      city: decodedHeader(headers, "x-vercel-ip-city"),
      region: decodedHeader(
        headers,
        "x-vercel-ip-country-region",
        "x-vercel-ip-region",
      ),
      country: decodedHeader(headers, "x-vercel-ip-country"),
      latitude: decodedHeader(headers, "x-vercel-ip-latitude"),
      longitude: decodedHeader(headers, "x-vercel-ip-longitude"),
    },
    cloudflareHeadersUnverified: {
      city: decodedHeader(headers, "cf-ipcity"),
      region: decodedHeader(headers, "cf-region"),
      country: decodedHeader(headers, "cf-ipcountry"),
      latitude: decodedHeader(headers, "cf-iplatitude"),
      longitude: decodedHeader(headers, "cf-iplongitude"),
    },
  };
}

function selectedDiagnosticSources(
  geography: AnalyticsGeography,
  candidates: ReturnType<typeof rawGeographyCandidates>,
): Record<keyof DiagnosticGeography, AnalyticsGeographySource> {
  const fields = [
    "city",
    "region",
    "country",
    "latitude",
    "longitude",
  ] as const;

  return Object.fromEntries(fields.map((field) => {
    if (geography[field] === null) return [field, "none"];

    if (String(candidates.vercelAdapter[field] ?? "").trim()) {
      return [field, "vercel_adapter"];
    }

    if (String(candidates.vercelHeaders[field] ?? "").trim()) {
      return [field, "vercel_header"];
    }

    if (String(candidates.cloudflareHeadersUnverified[field] ?? "").trim()) {
      return [field, "cloudflare_header_unverified"];
    }

    return [field, "none"];
  })) as Record<keyof DiagnosticGeography, AnalyticsGeographySource>;
}

export function normalizeAnalyticsGeography(
  headers: HeaderReader,
  provider: AnalyticsProviderGeography = {},
): AnalyticsGeography {
  const city = firstPresent(
    provider.city,
    decodedHeader(headers, "x-vercel-ip-city"),
    decodedHeader(headers, "cf-ipcity"),
  );
  const region = firstPresent(
    provider.countryRegion,
    decodedHeader(
      headers,
      "x-vercel-ip-country-region",
      "x-vercel-ip-region",
    ),
    decodedHeader(headers, "cf-region"),
  );
  const country = firstPresent(
    provider.country,
    decodedHeader(headers, "x-vercel-ip-country"),
    decodedHeader(headers, "cf-ipcountry"),
  );
  const postalCode = firstPresent(
    provider.postalCode,
    decodedHeader(headers, "x-vercel-ip-postal-code"),
    decodedHeader(headers, "cf-postal-code"),
  );
  const latitude = firstPresent(
    provider.latitude,
    decodedHeader(headers, "x-vercel-ip-latitude"),
    decodedHeader(headers, "cf-iplatitude"),
  );
  const longitude = firstPresent(
    provider.longitude,
    decodedHeader(headers, "x-vercel-ip-longitude"),
    decodedHeader(headers, "cf-iplongitude"),
  );
  const timezone = firstPresent(
    provider.timezone,
    decodedHeader(headers, "x-vercel-ip-timezone"),
    decodedHeader(headers, "cf-timezone"),
  );

  return {
    city: normalizedText(city, 120),
    region: normalizedText(region, 100),
    country: normalizedText(country, 8),
    postalCode: normalizedText(postalCode, 32),
    latitude: normalizedCoordinate(latitude, -90, 90),
    longitude: normalizedCoordinate(longitude, -180, 180),
    timezone: normalizedText(timezone, 120),
  };
}

export function analyticsGeographyFromHeaders(
  headers: HeaderReader,
): AnalyticsGeography {
  return analyticsGeographyFromRequest({ headers });
}

export function analyticsGeographyFromRequest(
  request: { headers: HeaderReader },
): AnalyticsGeography {
  return evaluateAnalyticsGeographyRequest(request).geography;
}

export function evaluateAnalyticsGeographyRequest(
  request: { headers: HeaderReader },
): AnalyticsGeographyEvaluation {
  let provider: AnalyticsProviderGeography = {};

  try {
    provider = geolocation(request);
  } catch {
    // Malformed provider metadata must not prevent safe header fallbacks.
  }

  const geography = normalizeAnalyticsGeography(request.headers, provider);
  const rawCandidates = rawGeographyCandidates(request.headers, provider);

  return {
    geography,
    diagnostic: {
      candidates: {
        vercelAdapter: diagnosticGeography(rawCandidates.vercelAdapter),
        vercelHeaders: diagnosticGeography(rawCandidates.vercelHeaders),
        cloudflareHeadersUnverified: diagnosticGeography(
          rawCandidates.cloudflareHeadersUnverified,
        ),
      },
      selectedSources: selectedDiagnosticSources(geography, rawCandidates),
    },
  };
}
