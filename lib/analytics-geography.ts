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
  let provider: AnalyticsProviderGeography = {};

  try {
    provider = geolocation(request);
  } catch {
    // Malformed provider metadata must not prevent safe header fallbacks.
  }

  return normalizeAnalyticsGeography(request.headers, provider);
}
