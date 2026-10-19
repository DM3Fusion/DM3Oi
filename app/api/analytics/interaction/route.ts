import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  analyticsTrafficClassification,
  isExcludedAnalyticsGeo,
} from "@/lib/analytics";
import { analyticsGeographyFromRequest } from "@/lib/analytics-geography";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnalyticsSessionId } from "@/lib/analytics-session";


export async function POST(
  request: NextRequest,
) {
  let body: {
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

  const sessionId = await getAnalyticsSessionId();

  if (!sessionId) {
    return NextResponse.json(
      { ok: true, ignored: true },
    );
  }

  const geography = analyticsGeographyFromRequest(request);

  if (
    isExcludedAnalyticsGeo(
      geography.country,
      geography.region,
      geography.city,
    )
  ) {
    return NextResponse.json({
      ok: true,
      ignored: true,
    });
  }

  const userAgent =
    request.headers.get("user-agent") ?? "";

  const classification =
    analyticsTrafficClassification(
      userAgent,
      false,
      body.webdriver === true,
    );

  // Never allow interaction evidence to override a
  // positive automation/bot classification.
  if (
    classification.trafficType ===
    "LIKELY_BOT"
  ) {
    return NextResponse.json({
      ok: true,
      ignored: true,
    });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("analytics_page_views")
    .update({
      traffic_type: "HUMAN",
      traffic_signal:
        "browser_interaction",
    })
    .eq("session_id", sessionId)
    .eq("traffic_type", "UNKNOWN");

  if (error) {
    console.error(
      "Analytics interaction update failed",
      error.message,
    );

    return NextResponse.json(
      { ok: false },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
  });
}
