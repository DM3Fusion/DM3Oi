import { NextRequest, NextResponse } from "next/server";
import {
  analyticsBrowser,
  analyticsDeviceModel,
  analyticsDeviceType,
  analyticsOperatingSystem,
  analyticsReferrerHost,
  analyticsTrafficClassification,
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

  if (userId) {
    const {
      data: memberships,
      error: membershipError,
    } = await supabase
      .from("organization_members")
      .select(
        "organization_id,organization:organizations(id,status)",
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("status", "ACTIVE");

    if (membershipError) {
      console.error(
        "Analytics organization membership lookup failed",
        membershipError.message,
      );

      return NextResponse.json(
        { ok: false },
        { status: 500 },
      );
    }

    for (const membership of memberships ?? []) {
      const value = membership.organization;
      const organization = Array.isArray(value)
        ? value[0]
        : value;

      if (organization?.status === "ACTIVE") {
        organizationId = membership.organization_id;
        break;
      }
    }
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

  const normalizedPath =
    normalizeAnalyticsPath(path);
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
      "record_analytics_page_view_guarded" as never,
      {
        target_session_id: sessionId,
        target_user_id: userId,
        target_organization_id: organizationId,
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
        target_traffic_type: trafficType,
        target_traffic_signal: trafficSignal,
      } as never,
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
