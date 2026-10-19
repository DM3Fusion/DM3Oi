import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  analyticsBrowser,
  analyticsDeviceType,
  analyticsOperatingSystem,
} from "@/lib/analytics";
import { analyticsGeographyFromHeaders } from "@/lib/analytics-geography";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AuthenticationSecurityEventArgs = {
  target_event_type: "AUTHENTICATION_SUCCESS";
  target_user_id: string;
  target_authentication_method: "EMAIL_OTP";
  target_authentication_session_id: string;
  target_access_category: null;
  target_organization_id: null;
  target_application_role: null;
  target_country_code: string | null;
  target_region_code: string | null;
  target_city: string | null;
  target_postal_code: string | null;
  target_network_latitude: number | null;
  target_network_longitude: number | null;
  target_device_category: "DESKTOP" | "TABLET" | "MOBILE" | "OTHER";
  target_browser: string;
  target_operating_system: string;
  target_event_source: "EMAIL_OTP_SERVER_ACTION";
  target_analytics_session_id: null;
};

export async function recordAuthenticationSecuritySuccess(
  userId: string,
  sessionId: string,
  requestHeaders: Pick<Headers, 'get'>,
): Promise<void> {
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(sessionId)) {
    throw new Error("AUTHENTICATION_SECURITY_EVIDENCE_INVALID");
  }

  const userAgent = requestHeaders.get("user-agent") ?? "";
  const geography = analyticsGeographyFromHeaders(requestHeaders);

  const args: AuthenticationSecurityEventArgs = {
    target_event_type: "AUTHENTICATION_SUCCESS",
    target_user_id: userId,
    target_authentication_method: "EMAIL_OTP",
    target_authentication_session_id: sessionId,
    target_access_category: null,
    target_organization_id: null,
    target_application_role: null,
    target_country_code: geography.country,
    target_region_code: geography.region,
    target_city: geography.city,
    target_postal_code: geography.postalCode,
    target_network_latitude: geography.latitude,
    target_network_longitude: geography.longitude,
    target_device_category: analyticsDeviceType(userAgent),
    target_browser: analyticsBrowser(userAgent),
    target_operating_system: analyticsOperatingSystem(userAgent),
    target_event_source: "EMAIL_OTP_SERVER_ACTION",
    target_analytics_session_id: null,
  };

  const admin = createAdminClient();

  type SecurityAuditRpc = (
    name: "record_authentication_security_event",
    arguments_: AuthenticationSecurityEventArgs,
  ) => Promise<{
    data: string | null;
    error: {
      code: string;
      message: string;
    } | null;
  }>;

  const recordSecurityEvent = admin.rpc.bind(admin) as unknown as SecurityAuditRpc;

  const { error } = await recordSecurityEvent(
    "record_authentication_security_event",
    args,
  );

  if (error) {
    console.error("Authentication security audit write failed", {
      code: error.code,
      message: error.message,
    });

    throw new Error("AUTHENTICATION_SECURITY_AUDIT_WRITE_FAILED");
  }
}
