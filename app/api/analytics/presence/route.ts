import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  decodeAnalyticsHeader,
  isExcludedAnalyticsGeo,
} from "@/lib/analytics";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type PresenceAction =
  | "heartbeat"
  | "sign_out";

function validSessionId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f-]{36}$/i.test(value)
  );
}

async function activeOrganizationId(
  userId: string,
) {
  const supabase = await createClient();

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
      "Analytics presence organization membership lookup failed",
      membershipError.message,
    );

    return null;
  }

  for (const membership of memberships ?? []) {
    const value = membership.organization;

    const organization = Array.isArray(value)
      ? value[0]
      : value;

    if (organization?.status === "ACTIVE") {
      return membership.organization_id;
    }
  }

  return null;
}

export async function POST(
  request: NextRequest,
) {
  let body: {
    action?: unknown;
    sessionId?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false },
      { status: 400 },
    );
  }

  const action =
    body.action === "heartbeat" ||
    body.action === "sign_out"
      ? (body.action as PresenceAction)
      : null;

  if (
    !action ||
    !validSessionId(body.sessionId)
  ) {
    return NextResponse.json(
      { ok: false },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  const userId =
    typeof claimsData?.claims?.sub === "string"
      ? claimsData.claims.sub
      : null;

  if (!userId) {
    return NextResponse.json(
      { ok: false },
      { status: 401 },
    );
  }

  const admin = createAdminClient();

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
    const { error: cleanupError } = await admin
      .from("analytics_live_sessions")
      .delete()
      .eq("session_id", body.sessionId)
      .eq("user_id", userId);

    if (cleanupError) {
      console.error(
        "Analytics excluded geography presence cleanup failed",
        cleanupError.message,
      );

      return NextResponse.json(
        { ok: false },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      ignored: true,
    });
  }

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
    const { error: cleanupError } = await admin
      .from("analytics_live_sessions")
      .delete()
      .eq("user_id", userId);

    if (cleanupError) {
      console.error(
        "Analytics SUPER_ADMIN presence cleanup failed",
        cleanupError.message,
      );

      return NextResponse.json(
        { ok: false },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      ignored: true,
    });
  }

  const now = new Date().toISOString();

  if (action === "sign_out") {
    const { error } = await admin
      .from("analytics_live_sessions")
      .update({
        signed_out_at: now,
        last_seen_at: now,
      })
      .eq("session_id", body.sessionId)
      .eq("user_id", userId);

    if (error) {
      console.error(
        "Analytics presence sign-out failed",
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

  const organizationId =
    await activeOrganizationId(userId);

  const { data: existingSession, error: lookupError } =
    await admin
      .from("analytics_live_sessions")
      .select("user_id")
      .eq("session_id", body.sessionId)
      .maybeSingle();

  if (lookupError) {
    console.error(
      "Analytics presence lookup failed",
      lookupError.message,
    );

    return NextResponse.json(
      { ok: false },
      { status: 500 },
    );
  }

  if (
    existingSession &&
    existingSession.user_id !== userId
  ) {
    return NextResponse.json(
      { ok: false },
      { status: 409 },
    );
  }

  const writeResult = existingSession
    ? await admin
        .from("analytics_live_sessions")
        .update({
          organization_id: organizationId,
          last_seen_at: now,
          signed_out_at: null,
        })
        .eq("session_id", body.sessionId)
        .eq("user_id", userId)
    : await admin
        .from("analytics_live_sessions")
        .insert({
          session_id: body.sessionId,
          user_id: userId,
          organization_id: organizationId,
          last_seen_at: now,
          signed_out_at: null,
        });

  if (writeResult.error) {
    console.error(
      "Analytics presence heartbeat failed",
      writeResult.error.message,
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
