import "server-only";

import { getApplicationBaseUrl } from "@/lib/config/application-url";
import { sendTrackedTemplateEmail } from "@/lib/email/tracked-delivery";
import { createAdminClient } from "@/lib/supabase/admin";

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

const formatSubmittedAt = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));

export async function notifyPlatformAdministratorsOfCustomerDataSubmission(
  input: {
    submissionId: string;
    organizationId: string;
    organizationName: string;
    uploaderUserId: string;
    uploaderName: string;
    uploaderEmail: string;
    originalFilename: string;
    submittedAt: string;
  },
): Promise<void> {
  const admin = createAdminClient();

  const platformRoles = await admin
    .from("platform_user_roles")
    .select("user_id")
    .eq("role", "SUPER_ADMIN")
    .eq("is_active", true);

  if (platformRoles.error) {
    console.error("Customer data submission platform recipient lookup failed", {
      submissionId: input.submissionId,
      organizationId: input.organizationId,
      code: platformRoles.error.code,
      message: platformRoles.error.message,
    });
    return;
  }

  const recipientIds = [
    ...new Set(
      ((platformRoles.data ?? []) as PlatformRoleRow[]).map(
        (role) => role.user_id,
      ),
    ),
  ];

  if (!recipientIds.length) {
    console.error("Customer data submission has no active platform recipient", {
      submissionId: input.submissionId,
      organizationId: input.organizationId,
    });
    return;
  }

  const profiles = await admin
    .from("profiles")
    .select("id,email,first_name,last_name,display_name,is_active")
    .in("id", recipientIds)
    .eq("is_active", true);

  if (profiles.error) {
    console.error("Customer data submission platform profile lookup failed", {
      submissionId: input.submissionId,
      organizationId: input.organizationId,
      code: profiles.error.code,
      message: profiles.error.message,
    });
    return;
  }

  const recipients = (profiles.data ?? []) as ProfileRow[];
  const submittedAt = formatSubmittedAt(input.submittedAt);
  const title = `Customer data submitted — ${input.organizationName}`;
  const message =
    `${input.uploaderName} (${input.uploaderEmail}) submitted ` +
    `${input.originalFilename} for platform administrator review.`;

  await Promise.all(
    recipients.map(async (recipient) => {
      const notification = await admin.from("notifications").insert({
        organization_id: input.organizationId,
        recipient_user_id: recipient.id,
        notification_type: "CUSTOMER_DATA_SUBMISSION_RECEIVED",
        category: "CUSTOMER_DATA",
        title,
        message,
        source_domain: "CUSTOMER_IMPORT_SUBMISSION",
        source_entity_id: input.submissionId,
        source_event_id: input.submissionId,
        destination_path: "/admin/customer-import",
      });

      if (notification.error && notification.error.code !== "23505") {
        console.error("Customer data submission notification creation failed", {
          submissionId: input.submissionId,
          organizationId: input.organizationId,
          recipientUserId: recipient.id,
          code: notification.error.code,
          message: notification.error.message,
        });
      }

      const recipientEmail = safeEmail(recipient.email);
      if (!recipientEmail) {
        console.error("Customer data submission email recipient unavailable", {
          submissionId: input.submissionId,
          recipientUserId: recipient.id,
        });
        return;
      }

      const baseUrl = getApplicationBaseUrl();
      if (!baseUrl) return;

      const delivery = await sendTrackedTemplateEmail({
        templateKey: "CUSTOMER_DATA_SUBMISSION_NOTIFICATION",
        recipientEmail,
        references: {
          organizationId: input.organizationId,
          recipientUserId: recipient.id,
        },
        variables: {
          organization_name: input.organizationName,
          recipient_first_name: firstName(recipient),
          recipient_name: displayName(recipient),
          recipient_email: recipientEmail,
          uploader_name: input.uploaderName,
          uploader_email: input.uploaderEmail,
          filename: input.originalFilename,
          submitted_at: submittedAt,
          action_url: `${baseUrl}/admin/customer-import`,
        },
      });

      if (!delivery.ok) {
        console.error("Customer data submission email delivery failed", {
          submissionId: input.submissionId,
          organizationId: input.organizationId,
          recipientUserId: recipient.id,
          errorCode: delivery.errorCode,
        });
      }
    }),
  );
}
