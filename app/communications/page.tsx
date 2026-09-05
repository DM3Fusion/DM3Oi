import { PageHeader } from "@/components/ui";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
  openNotificationAction,
} from "@/lib/data/communications-actions";
import { getNotifications, getUnreadNotificationCount } from "@/lib/data/communications-repository";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireInternalContext } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatOrganizationDateTime, startOfOrganizationDay } from "@/lib/organization-timezone";
import { CommunicationsFilters, type CommunicationsFilterValues } from "@/components/communications-filters";

const statuses = new Set(["all", "unread", "read", "archived"]);
const sources = new Set(["all", "service-request", "case", "task", "other"]);
const ranges = new Set(["all", "today", "7d", "30d"]);

export default async function CommunicationsPage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const context = await requireInternalContext();
  const query = await searchParams;
  const values: CommunicationsFilterValues = {
    status: (statuses.has(query?.status ?? "") ? query?.status : "all") as CommunicationsFilterValues["status"],
    source: (sources.has(query?.source ?? "") ? query?.source : "all") as CommunicationsFilterValues["source"],
    range: (ranges.has(query?.range ?? "") ? query?.range : "all") as CommunicationsFilterValues["range"],
  };
  const settings = await createAdminClient().from("organization_settings").select("timezone").eq("organization_id", context.activeOrganization.id).maybeSingle();
  const timezone = settings.data?.timezone ?? "UTC";
  const now = new Date();
  const createdAfter = values.range === "today" ? startOfOrganizationDay(now, timezone).toISOString() : values.range === "7d" ? new Date(now.getTime() - 7 * 86400000).toISOString() : values.range === "30d" ? new Date(now.getTime() - 30 * 86400000).toISOString() : undefined;
  const [notifications, unread] = await Promise.all([
    getNotifications({ status: values.status, source: values.source, createdAfter }),
    getUnreadNotificationCount(),
  ]);
  const filtered = values.status !== "all" || values.source !== "all" || values.range !== "all";
  return (
    <>
      <PageHeader
        eyebrow="Shared Communications"
        title="Communications"
        description="Notifications from customer conversations and DM3iQCM workflows."
        action={unread ? <form action={markAllNotificationsReadAction}><PendingSubmitButton className="secondary-button" pendingLabel="Marking…">Mark all as read</PendingSubmitButton></form> : undefined}
      />
      <CommunicationsFilters values={values} />
      <section className="panel communications-center" aria-label="Notification inbox">
        {notifications.length ? (
          <div className="notification-list">
            {notifications.map((item) => (
              <article className={`notification-item${item.read_at ? "" : " unread"}`} key={item.id}>
                <form action={openNotificationAction} className="notification-open-form">
                  <input type="hidden" name="notificationId" value={item.id} />
                  <input type="hidden" name="destination" value={item.destination_path} />
                  <PendingSubmitButton className="notification-open" pendingLabel="Opening…">
                    <span className="notification-state" aria-label={item.read_at ? "Read" : "Unread"} />
                    <span className="notification-copy">
                      <strong>{item.title}</strong>
                      <span>{item.message}</span>
                      <small>{item.category.replaceAll("_", " ")} · {formatOrganizationDateTime(item.created_at, timezone, "medium")}</small>
                    </span>
                    <span aria-hidden>→</span>
                  </PendingSubmitButton>
                </form>
                <form action={item.read_at ? markNotificationUnreadAction : markNotificationReadAction} className="notification-state-form">
                  <input type="hidden" name="notificationId" value={item.id} />
                  <PendingSubmitButton pendingLabel="Updating…">Mark as {item.read_at ? "unread" : "read"}</PendingSubmitButton>
                </form>
              </article>
            ))}
          </div>
        ) : <div className="no-results">{filtered ? "No communications match these filters." : "No communications yet."}</div>}
      </section>
    </>
  );
}
