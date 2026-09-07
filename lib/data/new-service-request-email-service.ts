import "server-only";
import { getApplicationBaseUrl } from "@/lib/config/application-url";
import {
  buildNewServiceRequestEmail,
  deliverEmailOnce,
  type EmailDeliveryStore,
  type MailResult,
} from "@/lib/email/delivery";
import { applicationEmailProvider } from "@/lib/email/mailer";
import { createAdminClient } from "@/lib/supabase/admin";

type NotificationRow = { id: string; recipient_user_id: string };
type MemberRow = {
  user_id: string;
  profiles: { email: string | null; is_active: boolean };
};
type RequestRow = {
  request_number: string;
  subject: string;
  customers: { name: string } | null;
};

const safeEmail = (value: string | null | undefined) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
};

const logDeliveryIssue = (message: string, code?: string) =>
  console.error(message, { code: code ?? "UNKNOWN" });

// This event is operationally enabled by default. A future preference resolver
// can replace this decision without changing event or transport code.
const isNewServiceRequestEmailEnabled = () => true;

export async function deliverNewServiceRequestNotificationEmails(input: {
  organizationId: string;
  serviceRequestId: string;
}): Promise<void> {
  if (!isNewServiceRequestEmailEnabled()) return;
  const baseUrl = getApplicationBaseUrl();
  if (!baseUrl) return;

  const admin = createAdminClient();
  const [notificationResult, requestResult] = await Promise.all([
    admin
      .from("notifications")
      .select("id,recipient_user_id")
      .eq("organization_id", input.organizationId)
      .eq("notification_type", "NEW_SERVICE_REQUEST_RECEIVED")
      .eq("source_domain", "SERVICE_REQUEST")
      .eq("source_entity_id", input.serviceRequestId)
      .eq("source_event_id", input.serviceRequestId),
    admin
      .from("service_requests")
      .select("request_number,subject,customers(name)")
      .eq("id", input.serviceRequestId)
      .eq("organization_id", input.organizationId)
      .maybeSingle(),
  ]);

  if (notificationResult.error || requestResult.error || !requestResult.data) {
    logDeliveryIssue(
      "New Service Request email lookup failed",
      notificationResult.error?.code ?? requestResult.error?.code,
    );
    return;
  }

  const notifications = (notificationResult.data ?? []) as NotificationRow[];
  if (!notifications.length) return;
  const recipientIds = [...new Set(notifications.map((item) => item.recipient_user_id))];
  const [memberResult, platformResult] = await Promise.all([
    admin
      .from("organization_members")
      .select("user_id,profiles!inner(email,is_active)")
      .eq("organization_id", input.organizationId)
      .eq("is_active", true)
      .in("user_id", recipientIds),
    admin
      .from("platform_user_roles")
      .select("user_id")
      .eq("role", "SUPER_ADMIN")
      .eq("is_active", true)
      .in("user_id", recipientIds),
  ]);

  if (memberResult.error || platformResult.error) {
    logDeliveryIssue(
      "New Service Request email recipient lookup failed",
      memberResult.error?.code ?? platformResult.error?.code,
    );
    return;
  }

  const members = new Map(
    ((memberResult.data ?? []) as unknown as MemberRow[]).map((member) => [
      member.user_id,
      member,
    ]),
  );
  const platformIds = new Set(
    ((platformResult.data ?? []) as { user_id: string }[]).map((role) => role.user_id),
  );
  const request = requestResult.data as unknown as RequestRow;
  if (!request.customers?.name) {
    logDeliveryIssue("New Service Request email customer lookup failed", "CUSTOMER_UNAVAILABLE");
    return;
  }
  const customerName = request.customers.name;

  await Promise.all(
    notifications.map(async (notification) => {
      if (platformIds.has(notification.recipient_user_id)) return;
      const member = members.get(notification.recipient_user_id);
      if (!member?.profiles.is_active) return;
      const recipientEmail = safeEmail(member.profiles.email);
      const subject = `New service request: ${request.request_number}`;

      const insertDelivery = async (status: "PENDING" | "FAILED", errorCode?: string) => {
        const result = await admin
          .from("service_request_communications" as never)
          .insert({
            organization_id: input.organizationId,
            service_request_id: input.serviceRequestId,
            communication_type: "EMAIL_NOTIFICATION",
            channel: "EMAIL",
            direction: "INBOUND",
            recipient_user_id: notification.recipient_user_id,
            notification_id: notification.id,
            subject,
            status,
            error_code: errorCode ?? null,
            error_summary: errorCode ? "Email notification could not be sent." : null,
          } as never)
          .select("id")
          .maybeSingle();
        if (result.error?.code === "23505") return null;
        if (result.error || !result.data) throw result.error ?? new Error("Delivery claim failed");
        return result.data as unknown as { id: string };
      };

      if (!recipientEmail) {
        try {
          await insertDelivery("FAILED", "RECIPIENT_EMAIL_UNAVAILABLE");
        } catch (error) {
          logDeliveryIssue(
            "New Service Request missing-email state could not be recorded",
            (error as { code?: string }).code,
          );
        }
        return;
      }

      const store: EmailDeliveryStore = {
        claim: () => insertDelivery("PENDING"),
        async complete(deliveryId: string, result: MailResult) {
          const update = await admin
            .from("service_request_communications" as never)
            .update({
              status: result.ok ? "SENT" : "FAILED",
              error_code: result.ok ? null : result.errorCode,
              error_summary: result.ok ? null : result.safeMessage,
              delivered_at: result.ok ? new Date().toISOString() : null,
            } as never)
            .eq("id", deliveryId)
            .eq("notification_id", notification.id);
          if (update.error) throw update.error;
        },
      };

      const delivery = await deliverEmailOnce(
        buildNewServiceRequestEmail({
          to: recipientEmail,
          customerName,
          requestNumber: request.request_number,
          requestSubject: request.subject,
          destinationUrl: `${baseUrl}/service-desk/${input.serviceRequestId}`,
        }),
        applicationEmailProvider,
        store,
      );
      if (!delivery.ok) {
        logDeliveryIssue("New Service Request email delivery failed", delivery.errorCode);
      }
    }),
  );
}
