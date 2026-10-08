import { NextRequest, NextResponse } from "next/server";
import {
  analyticsBrowser,
  analyticsDeviceModel,
  analyticsDeviceType,
  analyticsOperatingSystem,
  analyticsReferrerHost,
  analyticsTrafficClassification,
  coarseAnalyticsNetworkCoordinate,
  decodeAnalyticsHeader,
  isExcludedAnalyticsGeo,
  normalizeAnalyticsPath,
} from "@/lib/analytics";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateAnalyticsSessionId } from "@/lib/analytics-session";

function requestIp(request: NextRequest) {
  return (
    request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

function isExcludedIp(ip: string | null) {
  if (!ip) return false;

  const excluded = new Set(
    (process.env.ANALYTICS_EXCLUDED_IPS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  return excluded.has(ip);
}

function validAnalyticsCookieUuid(
  value: string | undefined,
) {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}


export async function POST(request: NextRequest) {
  if (isExcludedIp(requestIp(request))) {
    return NextResponse.json({
      ok: true,
      ignored: true,
    });
  }

  let body: {
    path?: unknown;
    referrer?: unknown;
    platform?: unknown;
    maxTouchPoints?: unknown;
    webdriver?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false },
      { status: 400 },
    );
  }

  const path =
    typeof body.path === "string"
      ? body.path.slice(0, 1000)
      : null;

  if (!path || !path.startsWith("/")) {
    return NextResponse.json(
      { ok: false },
      { status: 400 },
    );
  }

  const normalizedPath =
    normalizeAnalyticsPath(path);

  const { sessionId } = await getOrCreateAnalyticsSessionId();

  const supabase = await createClient();
  const { data: claimsData } =
    await supabase.auth.getClaims();

  const claims = claimsData?.claims;
  const userId =
    typeof claims?.sub === "string"
      ? claims.sub
      : null;

  if (userId) {
    const {
      data: isSuperAdmin,
      error: superAdminError,
    } = await supabase.rpc("is_super_admin");

    if (superAdminError) {
      console.error(
        "Analytics SUPER_ADMIN check failed",
        superAdminError.message,
      );
    }

    if (isSuperAdmin === true) {
      return NextResponse.json({
        ok: true,
        ignored: true,
      });
    }
  }

  let organizationId: string | null = null;
  let accessType = userId
    ? "AUTHENTICATED_UNCLASSIFIED"
    : "PUBLIC";
  let accessRole: string | null = null;

  if (userId) {
    const selectedOrganizationId =
      validAnalyticsCookieUuid(
        request.cookies.get(
          "dm3iqcm-active-organization",
        )?.value,
      );
    const selectedPortalAccessId =
      validAnalyticsCookieUuid(
        request.cookies.get(
          "dm3iqcm-active-portal-access",
        )?.value,
      );
    const { data: identityRows, error: identityError } =
      await supabase.rpc(
        "get_my_analytics_identity_context",
        {
          target_organization_id:
            selectedOrganizationId,
          target_portal_access_id:
            selectedPortalAccessId,
        },
      );

    if (identityError) {
      console.error(
        "Analytics identity context lookup failed",
        identityError.message,
      );

      return NextResponse.json(
        { ok: false },
        { status: 500 },
      );
    }

    const identity = (
      Array.isArray(identityRows)
        ? identityRows[0]
        : identityRows
    ) as
      | {
          access_type?: unknown;
          access_role?: unknown;
          organization_id?: unknown;
        }
      | null;

    accessType =
      typeof identity?.access_type === "string"
        ? identity.access_type
        : "AUTHENTICATED_UNCLASSIFIED";
    accessRole =
      typeof identity?.access_role === "string"
        ? identity.access_role
        : null;
    organizationId =
      typeof identity?.organization_id === "string"
        ? identity.organization_id
        : null;
  }

  const userAgent =
    request.headers.get("user-agent") ?? "";

  const platform =
    typeof body.platform === "string"
      ? body.platform.slice(0, 100)
      : "";

  const maxTouchPoints =
    typeof body.maxTouchPoints === "number" &&
    Number.isFinite(body.maxTouchPoints)
      ? Math.max(
          0,
          Math.min(20, Math.trunc(body.maxTouchPoints)),
        )
      : 0;

  const referrer =
    typeof body.referrer === "string"
      ? body.referrer
      : null;

  const webdriver =
    body.webdriver === true;

  const {
    trafficType,
    trafficSignal,
  } = analyticsTrafficClassification(
    userAgent,
    Boolean(userId),
    webdriver,
  );

  const countryCode =
    request.headers.get("x-vercel-ip-country");
  const regionCode =
    request.headers.get("x-vercel-ip-country-region");
  const city = decodeAnalyticsHeader(
    request.headers.get("x-vercel-ip-city"),
  );
  const postalCode =
    decodeAnalyticsHeader(
      request.headers.get("x-vercel-ip-postal-code"),
    )
      ?.trim()
      .slice(0, 32) || null;
  const networkLatitude =
    coarseAnalyticsNetworkCoordinate(
      request.headers.get("x-vercel-ip-latitude"),
      -90,
      90,
    );
  const networkLongitude =
    coarseAnalyticsNetworkCoordinate(
      request.headers.get("x-vercel-ip-longitude"),
      -180,
      180,
    );

  if (
    isExcludedAnalyticsGeo(
      countryCode,
      regionCode,
      city,
    )
  ) {
    return NextResponse.json({
      ok: true,
      ignored: true,
    });
  }

  const admin = createAdminClient();

  const referrerHost =
    analyticsReferrerHost(referrer);
  const deviceType =
    analyticsDeviceType(
      userAgent,
      platform,
      maxTouchPoints,
    );
  const deviceModel =
    analyticsDeviceModel(
      userAgent,
      platform,
      maxTouchPoints,
    );
  const browser =
    analyticsBrowser(userAgent);
  const operatingSystem =
    analyticsOperatingSystem(
      userAgent,
      platform,
      maxTouchPoints,
    );

  const { data: accepted, error } =
    await admin.rpc(
      "record_analytics_page_view_guarded",
      {
        target_session_id: sessionId,
        target_user_id: userId,
        target_organization_id: organizationId,
        target_access_type: accessType,
        target_access_role: accessRole,
        target_path: path,
        target_normalized_path: normalizedPath,
        target_referrer_host: referrerHost,
        target_device_type: deviceType,
        target_device_model: deviceModel,
        target_browser: browser,
        target_operating_system: operatingSystem,
        target_country_code: countryCode,
        target_region_code: regionCode,
        target_city: city,
        target_postal_code: postalCode,
        target_network_latitude: networkLatitude,
        target_network_longitude: networkLongitude,
        target_traffic_type: trafficType,
        target_traffic_signal: trafficSignal,
      },
    );

  if (error) {
    console.error(
      "Analytics page-view ingestion failed",
      error.message,
    );

    return NextResponse.json(
      { ok: false },
      { status: 500 },
    );
  }

  if (accepted !== true) {
    return NextResponse.json({
      ok: true,
      ignored: true,
    });
  }

  return NextResponse.json({ ok: true });
}
