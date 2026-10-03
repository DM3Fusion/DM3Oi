import "server-only";

import { getApplicationBaseUrl } from "@/lib/config/application-url";
import { sendTrackedTemplateEmail } from "@/lib/email/tracked-delivery";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  trialRequestUseCaseLabels,
  type TrialRequestUseCase,
} from "@/lib/trial-requests";

type TrialRequestRow = {
  id: string;
  request_number: number;
  business_name: string;
  contact_name: string;
  business_email: string;
  phone: string | null;
  primary_use_case: TrialRequestUseCase;
  estimated_users: number;
};

type PlatformRoleRow = {
  user_id: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  is_active: boolean;
};

const safeEmail = (value: string | null | undefined) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : null;
};

const displayName = (profile: ProfileRow) =>
  profile.display_name?.trim() ||
  [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
  profile.email?.trim() ||
  "Platform administrator";

const firstName = (profile: ProfileRow) =>
  profile.first_name?.trim() ||
  displayName(profile).split(/\s+/)[0] ||
  "Platform administrator";

async function deliverTrialRequestNotifications(
  trialRequestId: string,
): Promise<void> {
  const baseUrl = getApplicationBaseUrl();
  if (!baseUrl) return;

  const admin = createAdminClient();
  const [trialRequestResult, platformRolesResult] = await Promise.all([
    admin
      .from("trial_requests")
      .select(
        "id,request_number,business_name,contact_name,business_email,phone,primary_use_case,estimated_users",
      )
      .eq("id", trialRequestId)
      .maybeSingle(),
    admin
      .from("platform_user_roles")
      .select("user_id")
      .eq("role", "SUPER_ADMIN")
      .eq("is_active", true),
  ]);

  if (trialRequestResult.error || !trialRequestResult.data) {
    console.error("Trial request email source lookup failed", {
      trialRequestId,
      code: trialRequestResult.error?.code ?? "TRIAL_REQUEST_UNAVAILABLE",
      message: trialRequestResult.error?.message,
    });
    return;
  }

  if (platformRolesResult.error) {
    console.error("Trial request platform recipient lookup failed", {
      trialRequestId,
      code: platformRolesResult.error.code,
      message: platformRolesResult.error.message,
    });
    return;
  }

  const recipientIds = [
    ...new Set(
      ((platformRolesResult.data ?? []) as PlatformRoleRow[]).map(
        (role) => role.user_id,
      ),
    ),
  ];
  if (!recipientIds.length) {
    console.error("Trial request has no active platform recipient", {
      trialRequestId,
    });
    return;
  }

  const profilesResult = await admin
    .from("profiles")
    .select("id,email,first_name,last_name,display_name,is_active")
    .in("id", recipientIds)
    .eq("is_active", true);

  if (profilesResult.error) {
    console.error("Trial request platform profile lookup failed", {
      trialRequestId,
      code: profilesResult.error.code,
      message: profilesResult.error.message,
    });
    return;
  }

  const trialRequest = trialRequestResult.data as TrialRequestRow;
  const recipients = (profilesResult.data ?? []) as ProfileRow[];
  const actionUrl = `${baseUrl}/admin/trial-requests/${trialRequest.id}`;

  await Promise.all(
    recipients.map(async (recipient) => {
      const recipientEmail = safeEmail(recipient.email);
      if (!recipientEmail) {
        console.error("Trial request email recipient unavailable", {
          trialRequestId,
          recipientUserId: recipient.id,
        });
        return;
      }

      const delivery = await sendTrackedTemplateEmail({
        templateKey: "NEW_TRIAL_REQUEST_NOTIFICATION",
        recipientEmail,
        references: {
          recipientUserId: recipient.id,
          trialRequestId: trialRequest.id,
        },
        variables: {
          recipient_first_name: firstName(recipient),
          recipient_name: displayName(recipient),
          recipient_email: recipientEmail,
          trial_request_number: String(trialRequest.request_number),
          business_name: trialRequest.business_name,
          contact_name: trialRequest.contact_name,
          business_email: trialRequest.business_email,
          phone: trialRequest.phone ?? "Not provided",
          primary_use_case:
            trialRequestUseCaseLabels[trialRequest.primary_use_case],
          estimated_users: String(trialRequest.estimated_users),
          action_url: actionUrl,
        },
      });

      if (!delivery.ok) {
        console.error("Trial request administrative email delivery failed", {
          trialRequestId,
          recipientUserId: recipient.id,
          errorCode: delivery.errorCode,
        });
      }
    }),
  );
}

export async function notifyPlatformAdministratorsOfTrialRequest(
  trialRequestId: string,
): Promise<void> {
  try {
    await deliverTrialRequestNotifications(trialRequestId);
  } catch (error) {
    console.error("Trial request administrative notification failed", {
      trialRequestId,
      code: (error as { code?: string }).code ?? "UNKNOWN",
    });
  }
}
