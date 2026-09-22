import { PageHeader } from "@/components/ui";
import {
  markAllNotificationsReadAction,
} from "@/lib/data/communications-actions";
import { getNotifications, getUnreadNotificationCount } from "@/lib/data/communications-repository";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requirePermission } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { startOfOrganizationDay } from "@/lib/organization-timezone";
import { CommunicationsFilters, type CommunicationsFilterValues } from "@/components/communications-filters";
import { cookies } from "next/headers";
import { CommunicationsViewToggle } from "@/components/communications-view-toggle";
import { communicationsViewCookie, normalizeCommunicationsView } from "@/lib/communications-view";
import { CommunicationsInbox } from "@/components/communications-inbox";

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
        description={organizationWide ? "Organization-wide notifications are visible here; read status still belongs to each recipient." : undefined}
        action={<div className="communications-header-actions">
          {unread ? <form action={markAllNotificationsReadAction}><PendingSubmitButton className="secondary-button" pendingLabel="Marking…" aria-label={organizationWide ? "Mark my notifications as read" : "Mark all as read"}><span className="communications-mark-label-full">{organizationWide ? "Mark my notifications as read" : "Mark all as read"}</span><span className="communications-mark-label-compact">{organizationWide ? "Mark mine read" : "Mark all read"}</span></PendingSubmitButton></form> : null}
          <CommunicationsViewToggle view={communicationsView} />
        </div>}
      />
      <CommunicationsFilters values={values} recipientStatus={organizationWide} />
      <CommunicationsInbox
        notifications={notifications}
        timezone={timezone}
        emptyMessage={values.q ? (hasStructuredFilters ? "No communications match your search and filters." : "No communications match your search.") : filtered ? "No communications match these filters." : "No communications yet."}
      />
    </div>
  );
}
