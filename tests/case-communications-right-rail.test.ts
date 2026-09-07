import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const page = source("app/cases/[caseId]/page.tsx");
const repository = source("lib/data/case-repository.ts");
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
  assert.match(repository, /service_requests!inner\(request_number,case_id\)/);
  assert.match(repository, /\.eq\("organization_id", data\.organizationId\)/);
  assert.match(repository, /\.eq\("service_requests\.case_id", item\.id\)/);
  assert.doesNotMatch(repository.slice(repository.indexOf("export async function getLiveCase")), /customer_id/);
});

test("query remains RLS-authorized, cross-tenant safe, and bounded", () => {
  assert.match(repository, /\.from\("service_request_messages"\)/);
  assert.match(repository, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(repository, /\.limit\(5\)/);
  assert.match(
    conversationMigration,
    /service_request_messages_select[\s\S]*can_read_service_request_messages/,
  );
  assert.match(
    privacyMigration,
    /grant select\(id,organization_id,service_request_id,author_type,body,created_at\) on public\.service_request_messages/,
  );
});

test("participant display cannot reveal platform identity", () => {
  const querySelection = repository.match(
    /\.from\("service_request_messages"\)[\s\S]*?\.limit\(5\)/,
  )?.[0] ?? "";
  assert.doesNotMatch(querySelection, /author_user_id|email|profiles/);
  assert.match(repository, /participantLabel: message\.author_type === "CUSTOMER" \? "Customer" as const : "DM3Oi team" as const/);
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
  assert.match(repository, /normalized\.length > 160/);
});

test("no unsafe View All fallback is introduced", () => {
  assert.doesNotMatch(page, /View All Communications/);
  assert.doesNotMatch(page, /href=\{?`?\/communications\?q=/);
  assert.doesNotMatch(repository.slice(repository.indexOf("export async function getLiveCase")), /\.eq\("customer_id"/);
});
