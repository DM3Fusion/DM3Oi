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
    sessionId?: unknown;
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

  const sessionId =
    typeof body.sessionId === "string" &&
    /^[0-9a-f-]{36}$/i.test(body.sessionId)
      ? body.sessionId
      : null;

  if (!path || !path.startsWith("/") || !sessionId) {
    return NextResponse.json(
      { ok: false },
      { status: 400 },
    );
  }

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

  const { error } = await admin
    .from("analytics_page_views")
    .insert({
      session_id: sessionId,
      user_id: userId,
      organization_id: organizationId,
      path,
      normalized_path: normalizeAnalyticsPath(path),
      referrer_host: analyticsReferrerHost(referrer),
      device_type: analyticsDeviceType(
        userAgent,
        platform,
        maxTouchPoints,
      ),
      device_model: analyticsDeviceModel(
        userAgent,
        platform,
        maxTouchPoints,
      ),
      browser: analyticsBrowser(userAgent),
      operating_system:
        analyticsOperatingSystem(
          userAgent,
          platform,
          maxTouchPoints,
        ),
      country_code: countryCode,
      region_code: regionCode,
      city,
      traffic_type: trafficType,
      traffic_signal: trafficSignal,
    });

  if (error) {
    console.error(
      "Analytics page-view insert failed",
      error.message,
    );

    return NextResponse.json(
      { ok: false },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
