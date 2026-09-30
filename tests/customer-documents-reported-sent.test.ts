import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = source(
  "supabase/migrations/20260930010000_dm3oi_customer_documents_reported_sent.sql",
);
const actions = source("lib/data/customer-portal-actions.ts");
const repository = source(
  "lib/data/customer-portal-case-repository.ts",
);
const summaries = source("components/portal-case-summaries.tsx");
const confirmation = source(
  "components/portal-documents-sent-confirmation.tsx",
);

test("customer document confirmation stores only a reported-sent event", () => {
  assert.match(
    migration,
    /create table public\.case_document_confirmations/,
  );
  assert.match(migration, /reported_sent_at timestamptz not null/);
  assert.match(
    migration,
    /unique index case_document_confirmations_task_uidx[\s\S]*\(task_id\)/,
  );

  assert.doesNotMatch(migration, /\bbytea\b/i);
  assert.doesNotMatch(migration, /\bstorage\.objects\b/i);
  assert.doesNotMatch(migration, /\bservice_requests\b/i);
  assert.doesNotMatch(migration, /update public\.case_tasks/);

  assert.doesNotMatch(confirmation, /type=["']file["']/);
  assert.doesNotMatch(actions, /form\.get\(["'](file|document|upload)/);
});

test("customer confirmation derives tenant and customer identity from portal access", () => {
  assert.match(
    migration,
    /create or replace function public\.report_customer_case_documents_sent\(\s*target_portal_access_id uuid,\s*target_task_id uuid\s*\)/,
  );
  assert.match(migration, /actor uuid := auth\.uid\(\)/);
  assert.match(
    migration,
    /access\.id=target_portal_access_id[\s\S]*access\.user_id=actor[\s\S]*access\.is_active/,
  );
  assert.match(
    migration,
    /item\.organization_id=access_row\.organization_id[\s\S]*item\.customer_id=access_row\.customer_id/,
  );

  assert.match(
    actions,
    /target_portal_access_id:\s*context\.access\.id/,
  );
  assert.match(actions, /target_task_id:\s*taskId/);

  assert.doesNotMatch(
    actions,
    /target_(organization|customer|case|recipient|staff|user)_id/,
  );
});

test("only the active Guided Intake missing-document Task can be reported sent", () => {
  assert.match(
    migration,
    /task\.intake_follow_up_id is not null/,
  );
  assert.match(
    migration,
    /task\.intake_question_definition_id is not null/,
  );
  assert.match(
    migration,
    /task\.intake_requirement_context->'missing_option_labels'/,
  );
  assert.match(
    migration,
    /jsonb_array_length\([\s\S]*missing_option_labels[\s\S]*\)>0/,
  );
  assert.match(
    migration,
    /case_row\.status in \('COMPLETED','CLOSED','CANCELLED'\)[\s\S]*task_row\.status <> 'IN_PROGRESS'/,
  );
});

test("documents reported sent is idempotent and does not complete the Task", () => {
  assert.match(
    migration,
    /on conflict \(task_id\) do nothing/,
  );
  assert.match(
    migration,
    /where existing\.task_id=task_row\.id/,
  );
  assert.match(
    migration,
    /A repeat submission returns the original durable confirmation/,
  );
  assert.doesNotMatch(
    migration,
    /set status\s*=\s*'COMPLETED'/i,
  );
  assert.doesNotMatch(
    migration,
    /completed_at\s*=/i,
  );
});

test("current Case Manager and Staff assignees receive the Inbox event", () => {
  assert.match(
    migration,
    /from public\.case_assignments assignment/,
  );
  assert.match(
    migration,
    /assignment\.case_id=case_row\.id/,
  );
  assert.match(
    migration,
    /assignment\.is_active/,
  );
  assert.match(
    migration,
    /assignment\.assignment_role in \('MANAGER','STAFF'\)/,
  );
  assert.match(
    migration,
    /member\.is_active/,
  );
  assert.match(
    migration,
    /profile\.is_active/,
  );

  assert.match(
    migration,
    /perform public\.create_notification\(/,
  );
  assert.match(
    migration,
    /'DOCUMENTS_REPORTED_SENT'/,
  );
  assert.match(
    migration,
    /'TASK',\s*task_row\.id,\s*confirmation\.id/,
  );
  assert.match(
    migration,
    /'\/cases\/' \|\| case_row\.id::text \|\| '#task-' \|\| task_row\.id::text/,
  );
});

test("unrelated Staff are not selected for the document confirmation notification", () => {
  assert.match(
    migration,
    /assignment\.organization_id=case_row\.organization_id/,
  );
  assert.match(
    migration,
    /assignment\.case_id=case_row\.id/,
  );
  assert.doesNotMatch(
    migration,
    /from public\.organization_members member[\s\S]*where member\.organization_id=case_row\.organization_id[\s\S]*for recipient/,
  );
});

test("portal requirement projection exposes only the action identity and reported state", () => {
  assert.match(
    migration,
    /returns table\(\s*task_id uuid,\s*case_number text,\s*missing_documents jsonb,\s*reported_sent_at timestamptz\s*\)/,
  );
  assert.match(
    migration,
    /left join public\.case_document_confirmations confirmation[\s\S]*confirmation\.task_id=task\.id/,
  );

  assert.match(repository, /task_id: string/);
  assert.match(repository, /reported_sent_at: string \| null/);
  assert.match(repository, /task_id: row\.task_id/);
  assert.match(
    repository,
    /reported_sent_at: row\.reported_sent_at/,
  );

  assert.doesNotMatch(repository, /assigned_user_id/);
  assert.doesNotMatch(repository, /intake_requirement_context/);
});

test("portal confirmation requires explicit customer confirmation", () => {
  assert.match(
    confirmation,
    /I&apos;ve Sent the Documents/,
  );
  assert.match(
    confirmation,
    /Confirm Documents Sent/,
  );
  assert.match(
    confirmation,
    /DM3Oi does not receive or verify the uploaded documents\./,
  );
  assert.match(
    confirmation,
    /reportCustomerCaseDocumentsSentAction/,
  );
  assert.match(confirmation, /if \(pending\) return/);
});

test("portal switches from Documents Needed to Documents Reported Sent", () => {
  assert.match(
    summaries,
    /requirement\.reported_sent_at[\s\S]*"Documents Reported Sent"[\s\S]*"Documents Needed"/,
  );
  assert.match(
    summaries,
    /organizationName\} will verify receipt in its secure[\s\S]*document system/,
  );
  assert.match(
    summaries,
    /!requirement\.reported_sent_at && secureDocumentSystemUrl/,
  );
  assert.match(
    summaries,
    /PortalDocumentsSentConfirmation/,
  );
  assert.match(
    summaries,
    /formatOrganizationDateTime\([\s\S]*requirement\.reported_sent_at[\s\S]*timezone[\s\S]*"medium"/,
  );
});

test("Inbox destination targets the exact workflow Task on the Case", () => {
  const casePage = source("app/cases/[caseId]/page.tsx");

  assert.match(
    casePage,
    /id=\{`task-\$\{task\.id\}`\}/,
  );
  assert.match(
    migration,
    /'\/cases\/' \|\| case_row\.id::text \|\| '#task-' \|\| task_row\.id::text/,
  );
});

test("documents-sent confirmation creates no Service Request", () => {
  const sentDocumentsAction =
    actions.slice(
      actions.indexOf(
        "export async function reportCustomerCaseDocumentsSentAction",
      ),
    );

  assert.match(
    sentDocumentsAction,
    /report_customer_case_documents_sent/,
  );
  assert.doesNotMatch(
    sentDocumentsAction,
    /create_customer_service_request|serviceRequestId|service_requests/i,
  );
  assert.doesNotMatch(
    confirmation,
    /service-request|service_requests|New Service Request/i,
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.service_requests/i,
  );
});
