import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomerPortalContext } from "@/lib/auth/customer-portal";
import { createClient } from "@/lib/supabase/server";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";
import { CustomerReplyForm } from "@/components/customer-reply-form";

export default async function PortalRequestDetail({ params }: { params: Promise<{ serviceRequestId: string }> }) {
  const context = await requireCustomerPortalContext();
  const { serviceRequestId } = await params;
  const supabase = await createClient();
  const { data: request } = await supabase.from("organization_service_requests").select("id,request_number,subject,description,status,created_at,updated_at").eq("id", serviceRequestId).eq("organization_id", context.organization.id).eq("customer_id", context.customer.id).maybeSingle();
  if (!request) notFound();

  const { data: messages } = await supabase.from("organization_service_request_messages").select("id,author_user_id,author_type,body,created_at").eq("service_request_id", request.id).order("created_at", { ascending: false }).order("id", { ascending: false });
  const timezone = context.settings?.timezone ?? "UTC";
  const chronology = [
    { id: "opening", author_type: "CUSTOMER", body: request.description, created_at: request.created_at },
    ...(messages ?? []),
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));

  return <section className="portal-panel portal-detail-panel">
    <div className="portal-detail-heading"><p className="eyebrow">{request.request_number}</p><div className="portal-badges"><span className="badge">{request.status.replaceAll("_", " ")}</span></div></div>
    <h1>{request.subject}</h1>
    <section className="portal-conversation" aria-labelledby="conversation-heading">
      <h2 id="conversation-heading">Conversation</h2>
      {chronology.map((message) => <article className={`portal-message portal-message-${message.author_type.toLowerCase()}`} key={message.id}>
        <div className="portal-message-meta"><strong>{message.author_type === "CUSTOMER" ? context.customer.name : "Organization staff"}</strong><time dateTime={message.created_at}>{formatOrganizationDateTime(message.created_at, timezone)}</time></div>
        <p>{message.body}</p>
      </article>)}
    </section>
    <section className="portal-reply" aria-labelledby="reply-heading"><h2 id="reply-heading">Reply to this request</h2><CustomerReplyForm serviceRequestId={request.id} /></section>
    <details className="portal-request-details"><summary>Request Details</summary><dl><dt>Status</dt><dd>{request.status.replaceAll("_", " ")}</dd><dt>Created</dt><dd>{formatOrganizationDateTime(request.created_at, timezone)}</dd><dt>Last Updated</dt><dd>{formatOrganizationDateTime(request.updated_at, timezone)}</dd></dl></details>
    <Link className="portal-back-link" href="/portal/service-requests">← Service Requests</Link>
  </section>;
}
