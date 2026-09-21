import { PageHeader } from "@/components/ui";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
  openNotificationAction,
} from "@/lib/data/communications-actions";
import { getNotifications, getUnreadNotificationCount } from "@/lib/data/communications-repository";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requirePermission } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatOrganizationDateTime, startOfOrganizationDay } from "@/lib/organization-timezone";
import { CommunicationsFilters, type CommunicationsFilterValues } from "@/components/communications-filters";
import Link from "next/link";
import { cookies } from "next/headers";
import { CommunicationsViewToggle } from "@/components/communications-view-toggle";
import { communicationsDestination, communicationsViewCookie, normalizeCommunicationsView } from "@/lib/communications-view";
import { ApplicationIcon } from "@/components/application-icon";

const statuses = new Set(["all", "unread", "read", "archived"]);
const sources = new Set(["all", "service-request", "case", "task", "other"]);
const ranges = new Set(["all", "today", "7d", "30d"]);

export default async function CommunicationsPage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const [context, query, cookieStore] = await Promise.all([requirePermission("VIEW_COMMUNICATIONS"), searchParams, cookies()]);
  const communicationsView = normalizeCommunicationsView(cookieStore.get(communicationsViewCookie)?.value);
  const values: CommunicationsFilterValues = {
    status: (statuses.has(query?.status ?? "") ? query?.status : "all") as CommunicationsFilterValues["status"],
    source: (sources.has(query?.source ?? "") ? query?.source : "all") as CommunicationsFilterValues["source"],
    range: (ranges.has(query?.range ?? "") ? query?.range : "all") as CommunicationsFilterValues["range"],
    q: (query?.q ?? "").trim().slice(0, 200),
  };
  const settings = await createAdminClient().from("organization_settings").select("timezone").eq("organization_id", context.activeOrganization.id).maybeSingle();
  const timezone = settings.data?.timezone ?? "UTC";
  const organizationWide = !context.isSuperAdmin && context.activeOrganization.role === "BUSINESS_OWNER";
  const now = new Date();
  const createdAfter = values.range === "today" ? startOfOrganizationDay(now, timezone).toISOString() : values.range === "7d" ? new Date(now.getTime() - 7 * 86400000).toISOString() : values.range === "30d" ? new Date(now.getTime() - 30 * 86400000).toISOString() : undefined;
  const [notifications, unread] = await Promise.all([
    getNotifications({ status: values.status, source: values.source, createdAfter, search: values.q }),
    getUnreadNotificationCount(),
  ]);
  const hasStructuredFilters = values.status !== "all" || values.source !== "all" || values.range !== "all";
  const filtered = hasStructuredFilters || Boolean(values.q);
  return (
    <div className={`communications-workspace communications-view-${communicationsView}`}>
      <PageHeader
        eyebrow="Shared Communications"
        title="Communications"
        description={organizationWide ? "Organization-wide notifications from customer conversations and DM3Oi workflows. Read status belongs to each intended recipient." : "Notifications from customer conversations and DM3Oi workflows."}
        action={<div className="communications-header-actions">
          {unread ? <form action={markAllNotificationsReadAction}><PendingSubmitButton className="secondary-button" pendingLabel="Marking…" aria-label={organizationWide ? "Mark my notifications as read" : "Mark all as read"}><span className="communications-mark-label-full">{organizationWide ? "Mark my notifications as read" : "Mark all as read"}</span><span className="communications-mark-label-compact">{organizationWide ? "Mark mine read" : "Mark all read"}</span></PendingSubmitButton></form> : null}
          <CommunicationsViewToggle view={communicationsView} />
        </div>}
      />
      <CommunicationsFilters values={values} recipientStatus={organizationWide} />
      <section className="panel communications-center" aria-label="Notification inbox">
        {notifications.length ? (
          <div className="notification-list">
            {notifications.map((item) => (
              <article className={`notification-item${item.read_at ? "" : " unread"}${item.is_personal ? "" : " observed"}`} key={item.id}>
                {item.is_personal ? <form action={openNotificationAction} className="notification-open-form">
                  <input type="hidden" name="notificationId" value={item.id} />
                  <input type="hidden" name="destination" value={item.destination_path} />
                  <PendingSubmitButton className="notification-open" pendingLabel="Opening…">
                    <span className="notification-state" aria-hidden />
                    <span className="notification-copy">
                      <strong>{item.title}</strong>
                      <span>{item.message}</span>
                      <small><span className="notification-read-label">{item.read_at ? "Read" : "Unread"}</span> · <span className="notification-source">{item.source_domain.replaceAll("_", " ")}</span><span className={`notification-category${item.source_domain === item.category ? " duplicate" : ""}`}> · <span className="notification-category-label">Category: </span>{item.category.replaceAll("_", " ")}</span> · {formatOrganizationDateTime(item.created_at, timezone, "medium")}</small>
                    </span>
                    <ApplicationIcon name="forward" />
                  </PendingSubmitButton>
                </form> : <Link href={communicationsDestination(item.destination_path)} className="notification-open">
                  <span className="notification-state" aria-hidden />
                  <span className="notification-copy">
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                    <small><span className="notification-read-label">{item.read_at ? "Recipient read" : "Recipient unread"}</span> · <span className="notification-source">{item.source_domain.replaceAll("_", " ")}</span><span className={`notification-category${item.source_domain === item.category ? " duplicate" : ""}`}> · <span className="notification-category-label">Category: </span>{item.category.replaceAll("_", " ")}</span> · {formatOrganizationDateTime(item.created_at, timezone, "medium")}</small>
                    <small className="notification-recipient">Recipient: {item.recipient_display_name}</small>
                  </span>
                  <ApplicationIcon name="forward" />
                </Link>}
                {item.is_personal ? <form action={item.read_at ? markNotificationUnreadAction : markNotificationReadAction} className="notification-state-form">
                  <input type="hidden" name="notificationId" value={item.id} />
                  <PendingSubmitButton pendingLabel="Updating…">Mark as {item.read_at ? "unread" : "read"}</PendingSubmitButton>
                </form> : null}
              </article>
            ))}
          </div>
        ) : <div className="no-results">{values.q ? (hasStructuredFilters ? "No communications match your search and filters." : "No communications match your search.") : filtered ? "No communications match these filters." : "No communications yet."}</div>}
      </section>
    </div>
  );
}
