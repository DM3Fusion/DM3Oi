import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { selectRecentCaseCommunications } from "../lib/case-communications.ts";

const source = (path: string) => readFileSync(path, "utf8");
const page = source("app/cases/[caseId]/page.tsx");
const repository = source("lib/data/case-repository.ts");
const serviceRequestPage = source("app/service-desk/[serviceRequestId]/page.tsx");
const selector = source("lib/case-communications.ts");
const conversationMigration = source(
  "supabase/migrations/20260904180000_dm3iqcm_service_request_conversations.sql",
);
const foundation = source(
  "supabase/migrations/20260903150000_dm3iqcm_data_foundation.sql",
);
const privacyMigration = source(
  "supabase/migrations/20260906120000_dm3oi_organization_role_permissions.sql",
);

test("right rail contains Assignments, Customer Communications, and Case Readiness in order", () => {
  const assignments = page.indexOf("<h2>Assignments</h2>");
  const communications = page.indexOf("<h2>Customer Communications</h2>");
  const readiness = page.indexOf("<h3>Case Readiness</h3>");
  assert.ok(assignments >= 0);
  assert.ok(communications > assignments);
  assert.ok(readiness > communications);
  assert.doesNotMatch(page, /Attachments|Completion Review/);
  assert.match(
    page,
    /Readiness will summarize required questions, tasks, and blocking\s+work\./,
  );
});

test("Assignments preserves canonical private avatar presentation", () => {
  assert.match(page, /<UserAvatar displayName=\{displayName\(item\.manager\)\}/);
  assert.match(page, /src=\{item\.manager\.avatarUrl\}/);
  assert.match(page, /item\.assignedStaff\.map/);
  assert.match(page, /src=\{profile\.avatarUrl\}/);
  assert.match(page, /No manager assigned\./);
  assert.match(repository, /attachAuthorizedAvatarUrls/);
});

test("recent communications use only authoritative Case and Service Request relationships", () => {
  assert.match(
    foundation,
    /foreign key\(organization_id,case_id\) references public\.cases\(organization_id,id\)/,
  );
  assert.match(
    conversationMigration,
    /foreign key \(organization_id, service_request_id\)[\s\S]*references public\.service_requests\(organization_id, id\)/,
  );
  assert.match(repository, /request\.case_id === item\.id/);
  assert.match(repository, /from\("organization_service_request_messages"\)/);
  assert.match(repository, /\.eq\("organization_id", data\.organizationId\)/);
  assert.match(repository, /\.in\("service_request_id", linkedRequests\.map\(\(request\) => request\.id\)\)/);
  assert.match(repository, /caseCustomerId: item\.customer_id/);
});

test("query remains RLS-authorized, cross-tenant safe, and bounded", () => {
  assert.match(repository, /\.from\("organization_service_request_messages"\)/);
  assert.match(repository, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(repository, /\.limit\(5\)/);
  assert.match(
    conversationMigration,
    /service_request_messages_select[\s\S]*can_read_service_request_messages/,
  );
  assert.match(
    privacyMigration,
    /grant select on public\.organization_cases[\s\S]*public\.organization_service_request_messages[\s\S]*to authenticated/,
  );
});

test("participant display cannot reveal platform identity", () => {
  const querySelection = repository.match(
    /\.from\("organization_service_request_messages"\)[\s\S]*?\.limit\(5\)/,
  )?.[0] ?? "";
  assert.doesNotMatch(querySelection, /author_user_id|email|profiles/);
  assert.match(selector, /participantLabel: message\.author_type === "CUSTOMER" \? "Customer" : "DM3Oi team"/);
  assert.doesNotMatch(page, /author_user_id|author_display_name|recipient_email/);
});

test("communications show safe metadata, local timestamps, and a compact empty state", () => {
  assert.match(page, /communication\.direction === "INBOUND" \? "Inbound" : "Outbound"/);
  assert.match(page, /communication\.serviceRequestNumber/);
  assert.match(page, /communication\.summary/);
  assert.match(page, /communication\.participantLabel/);
  assert.match(
    page,
    /formatOrganizationDateTime\(communication\.createdAt, data\.timezone\)/,
  );
  assert.match(page, /No customer communications linked to this case yet\./);
  assert.match(selector, /normalized\.length > 160/);
});

test("the canonical opening request description participates as customer communication", () => {
  assert.match(serviceRequestPage, /id: "opening"[\s\S]*body: item\.description/);
  assert.match(
    conversationMigration,
    /The initial request description remains the opening communication/,
  );
  assert.match(selector, /id: `opening:\$\{request\.id\}`/);
  assert.match(selector, /summary: opening/);
  assert.match(
    conversationMigration,
    /author_type text not null check \(author_type in \('CUSTOMER', 'STAFF'\)\)/,
  );
});

test("no unsafe View All fallback is introduced", () => {
  assert.doesNotMatch(page, /View All Communications/);
  assert.doesNotMatch(page, /href=\{?`?\/communications\?q=/);
  assert.doesNotMatch(repository.slice(repository.indexOf("export async function getLiveCase")), /\.eq\("customer_id"/);
});

test("pre-existing conversation visibility follows authoritative Case linkage", () => {
  const request = {
    id: "request-x",
    organization_id: "organization-a",
    customer_id: "customer-x",
    case_id: null as string | null,
    request_number: "SR-2026-0003",
    description: "Opening customer request",
    created_at: "2026-09-07T10:00:00.000Z",
  };
  const messages = [
    {
      id: "existing-message",
      organization_id: "organization-a",
      service_request_id: request.id,
      author_type: "CUSTOMER",
      body: "Sent before the Case link existed",
      created_at: "2026-09-07T11:00:00.000Z",
    },
    {
      id: "cross-tenant",
      organization_id: "organization-b",
      service_request_id: request.id,
      author_type: "STAFF",
      body: "Must never appear",
      created_at: "2026-09-07T12:00:00.000Z",
    },
    ...[
      ["unlinked-message", "same-customer-unlinked"],
      ["different-case-message", "different-case"],
      ["different-customer-message", "different-customer"],
    ].map(([id, serviceRequestId]) => ({
      id,
      organization_id: "organization-a",
      service_request_id: serviceRequestId,
      author_type: "STAFF",
      body: "Excluded message",
      created_at: "2026-09-07T12:00:00.000Z",
    })),
  ];
  const select = (caseId: string) => selectRecentCaseCommunications({
    organizationId: "organization-a",
    caseId,
    caseCustomerId: "customer-x",
    requests: [
      request,
      { ...request, id: "same-customer-unlinked", case_id: null, request_number: "SR-UNLINKED" },
      { ...request, id: "different-case", case_id: "case-b", request_number: "SR-OTHER-CASE" },
      { ...request, id: "different-customer", customer_id: "customer-y", case_id: "case-a", request_number: "SR-OTHER-CUSTOMER" },
    ],
    messages,
  });

  assert.deepEqual(select("case-a"), []);
  request.case_id = "case-a";
  const linked = select("case-a");
  assert.ok(linked.some((communication) => communication.id === "existing-message"));
  assert.ok(linked.some((communication) => communication.id === "opening:request-x"));
  assert.doesNotMatch(JSON.stringify(linked), /cross-tenant|unlinked-message|different-case-message|different-customer-message|SR-UNLINKED|SR-OTHER-CASE|SR-OTHER-CUSTOMER/);
  assert.equal(new Set(linked.map((communication) => communication.id)).size, linked.length);
  request.case_id = "case-b";
  assert.doesNotMatch(JSON.stringify(select("case-a")), /existing-message/);
  assert.match(JSON.stringify(select("case-b")), /existing-message/);
  request.case_id = null;
  assert.doesNotMatch(JSON.stringify(select("case-b")), /existing-message/);
});
