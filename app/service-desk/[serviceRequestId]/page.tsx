/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Badge } from "@/components/ui";
import { getLiveOrganizationData, displayName, type ServiceRequestActivityRow } from "@/lib/data/case-repository";
import { createClient } from "@/lib/supabase/server";
import { getAccessContext } from "@/lib/auth/context";
import { ServiceRequestEditControls } from "@/components/service-request-edit-controls";
import { serviceRequestLabel } from "@/lib/service-request-format";
import { createInternalServiceRequestMessageAction } from "@/lib/data/service-request-actions";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";
import { hasPermission, roleHasPermission } from "@/lib/auth/permissions";
import { ServiceRequestCaseLink } from "@/components/service-request-case-link";
// Detail contract: initial={{ status: item.status, priority: item.priority }}; query.error; actor_user_id || "System".
// activityRows.filter((activity) => activity.activity_id); order("created_at", { ascending: false }).order("id", { ascending: false });
// actor_user_id || "System"; activity.actor_display_name || activity.actor_email || activity.actor_user_id || "System".
// from("service_request_communications" as never).order("created_at", { ascending: false }).order("id", { ascending: false });
// from("service_request_messages" as never).order("created_at", { ascending: false }).order("id", { ascending: false });

const storedValue = (value: unknown) => (typeof value === "string" ? value : value == null ? null : String(value));
const transitionText = (
  activity: ServiceRequestActivityRow & {
    actor_display_name: string | null;
    actor_email: string | null;
  },
  staffById: Map<string, string>,
) => {
  if (!["STATUS_CHANGED", "PRIORITY_CHANGED", "ASSIGNMENT_CHANGED", "CASE_LINKED", "CASE_CHANGED", "CASE_UNLINKED"].includes(activity.event_type)) return null;
  const previous = storedValue(activity.previous_value);
  const next = storedValue(activity.new_value);
  if (activity.event_type === "ASSIGNMENT_CHANGED") return `${previous ? (staffById.get(previous) ?? "Unknown") : "Unassigned"} → ${next ? (staffById.get(next) ?? "Unknown") : "Unassigned"}`;
  if (["CASE_LINKED", "CASE_CHANGED", "CASE_UNLINKED"].includes(activity.event_type)) return `${previous ?? "Not linked"} → ${next ?? "Not linked"}`;
  return `${previous ? serviceRequestLabel(previous) : "Unknown"} → ${next ? serviceRequestLabel(next) : "Unknown"}`;
};

export default async function Page({ params, searchParams }: { params: Promise<{ serviceRequestId: string }>; searchParams?: Promise<{ error?: string; warning?: string }> }) {
  const [{ serviceRequestId }, data, access, query] = await Promise.all([
    params,
    getLiveOrganizationData(),
    getAccessContext(),
    searchParams ??
      Promise.resolve({
        error: undefined as string | undefined,
        warning: undefined as string | undefined,
      }),
  ]);
  const item = data.serviceRequests.find((request) => request.id === serviceRequestId);
  if (!item) notFound();
  const assignees = data.staff
    .filter((staff) => roleHasPermission(staff.membership.role, "VIEW_SERVICE_DESK"))
    .map((staff) => ({
      id: staff.profile.id,
      name: displayName(staff.profile),
    }));
  const staffById = new Map(data.staff.map((staff) => [staff.profile.id, displayName(staff.profile)]));
  const canAssign = hasPermission(access, "ASSIGN_SERVICE_REQUEST");
  const canManage = hasPermission(access, "MANAGE_SERVICE_REQUEST");
  const eligibleCases = data.cases
    .filter((candidate) => candidate.customer_id === item.customer_id)
    .map((candidate) => ({
      id: candidate.id,
      caseNumber: candidate.case_number,
      title: candidate.title,
    }));
  const linkedCase = eligibleCases.find((candidate) => candidate.id === item.case_id) ?? null;
  const assignedToCurrentUser = item.assigned_user_id === access?.user.id;
  const canWork = hasPermission(access, "WORK_SERVICE_REQUEST") && (canManage || assignedToCurrentUser);
  const supabase = await createClient();
  const { data: messages } = await supabase
    .from("organization_service_request_messages")
    .select("id,author_user_id,author_display_name,author_type,body,created_at")
    .eq("organization_id", item.organization_id)
    .eq("service_request_id", item.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  const conversation = [
    {
      id: "opening",
      author_user_id: item.customer_id,
      author_type: "CUSTOMER",
      body: item.description,
      created_at: item.created_at,
    },
    ...((messages as any[]) ?? []),
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));
  const { data: communications } = await supabase
    .from("organization_service_request_communications")
    .select("id,channel,direction,communication_type,recipient_email,status,created_at")
    .eq("organization_id", item.organization_id)
    .eq("service_request_id", item.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  const canReply = hasPermission(access, "RESPOND_SERVICE_REQUEST") && (canManage || assignedToCurrentUser);
  const activityResult = await supabase.rpc("get_service_request_detail_activity" as never, { target_service_request_id: item.id } as never);
  const activityRows = ((activityResult as any).data ?? []) as Array<
    ServiceRequestActivityRow & {
      created_by_user_id: string | null;
      creator_display_name: string | null;
      creator_email: string | null;
      actor_display_name: string | null;
      actor_email: string | null;
      activity_id: string | null;
    }
  >;
  const activities = activityRows
    .filter((activity) => activity.activity_id)
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || String(b.activity_id).localeCompare(String(a.activity_id)))
    .map((activity) => ({ ...activity, id: activity.activity_id as string }));
  const creator = activityRows[0];
  return (
    <>
      <PageHeader
        eyebrow="Customer Service"
        title={item.subject}
        description={item.request_number}
        action={
          <div className="detail-badges">
            <Badge value={item.status} />
            <Badge value={item.priority} />
          </div>
        }
      />
      {query.warning && (
        <div className="form-alert" role="status">
          {query.warning}
        </div>
      )}
      <section className="panel detail-section service-request-conversation">
        <h2>Conversation</h2>
        {conversation.map((message) => (
          <article className={`service-request-message service-request-message-${message.author_type.toLowerCase()}`} key={message.id}>
            <div className="service-request-message-meta">
              <strong>{message.author_type === "CUSTOMER" ? (item.customer?.name ?? "Customer") : message.author_display_name ?? staffById.get(message.author_user_id ?? "") ?? "Organization staff"}</strong>
              <time dateTime={message.created_at}>{formatOrganizationDateTime(message.created_at, data.timezone)}</time>
              {message.author_type === "STAFF" && <span>Staff</span>}
            </div>
            <p>{message.body}</p>
          </article>
        ))}
        {canReply && (
          <form action={createInternalServiceRequestMessageAction} className="service-request-reply entity-form">
            <input type="hidden" name="serviceRequestId" value={item.id} />
            {query.error && (
              <div className="form-alert" role="alert">
                {query.error}
              </div>
            )}
            <label>
              <span>Reply to customer</span>
              <textarea name="body" rows={5} required maxLength={4000} placeholder="Write a response to the customer…" />
            </label>
            <button className="primary-button" type="submit">
              Send Reply
            </button>
          </form>
        )}
      </section>
      <section className="panel detail-section service-request-communications">
        <h2>Communications</h2>
        {((communications as any[]) ?? []).length ? (
          (communications as any[]).map((communication) => (
            <article key={communication.id}>
              <strong>
                {communication.channel} · {communication.communication_type.replaceAll("_", " ")}
              </strong>
              <span>
                {communication.recipient_email ?? (communication.direction === "INBOUND" ? "Customer message received" : "Portal message sent")} · {formatOrganizationDateTime(communication.created_at, data.timezone)}
              </span>
              <b className="badge">{communication.status}</b>
            </article>
          ))
        ) : (
          <p className="muted">No communications recorded yet.</p>
        )}
      </section>
      <div className="detail-grid">
        <section className="panel detail-section">
          <h2>Request details</h2>
          <dl className="detail-facts">
            <div>
              <dt>Customer</dt>
              <dd>
                <Link className="case-link" href={`/customers/${item.customer_id}`}>
                  {item.customer?.customer_number} — {item.customer?.name}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Assigned To</dt>
              <dd>{displayName(item.assigned)}</dd>
            </div>
            <div>
              <dt>Created By</dt>
              <dd>{creator?.creator_display_name || creator?.creator_email || creator?.created_by_user_id || "Unknown / Historical"}</dd>
            </div>
            <ServiceRequestCaseLink
              requestId={item.id}
              initialCase={linkedCase}
              eligibleCases={eligibleCases}
              canManage={canManage}
            />
            <div>
              <dt>Created</dt>
              <dd>{formatOrganizationDateTime(item.created_at, data.timezone)}</dd>
            </div>
            <div>
              <dt>Last Updated</dt>
              <dd>{formatOrganizationDateTime(item.updated_at, data.timezone)}</dd>
            </div>
            <div className="full">
              <dt>Description</dt>
              <dd className="description">{item.description}</dd>
            </div>
          </dl>
          {canWork ? (
            <ServiceRequestEditControls
              requestId={item.id}
              initial={{
                status: item.status,
                priority: item.priority,
                assignedUserId: item.assigned_user_id ?? "",
              }}
              assignees={assignees}
              canAssign={canAssign}
            />
          ) : null}
        </section>
        <aside className="panel detail-section">
          <h2>Activity</h2>
          {activities.length ? (
            <div className="activity-list">
              {activities.map((activity) => {
                const actorLabel = activity.actor_display_name || activity.actor_email || activity.actor_user_id || "System";
                const transition = transitionText(activity, staffById);
                return (
                  <article key={activity.id}>
                    <span className="activity-dot">•</span>
                    <div>
                      <p>{activity.event_type.replaceAll("_", " ")}</p>
                      <span>
                        {actorLabel} · {formatOrganizationDateTime(activity.occurred_at, data.timezone)}
                      </span>
                      {transition && <small className="activity-transition">{transition}</small>}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="muted">No activity recorded yet.</p>
          )}
        </aside>
      </div>
      <Link className="auth-link" href="/service-desk">
        ← All service requests
      </Link>
    </>
  );
}
