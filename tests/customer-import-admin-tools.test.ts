import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20261006113000_dm3oi_customer_import_admin_tools.sql",
);
const page = source("app/admin/customer-import/page.tsx");
const workspace = source(
  "components/admin/customer-administrative-import.tsx",
);
const actions = source("app/admin/customer-import/actions.ts");
const historyActions = source(
  "app/admin/customer-import/history-actions.ts",
);
const queue = source(
  "components/admin/customer-import-submission-queue.tsx",
);
const rollback = source(
  "app/admin/customer-import/rollback-actions.ts",
);

test("administrative imports have durable provenance and remain organization-private", () => {
  assert.match(
    migration,
    /submission_origin text not null[\s\S]*ORGANIZATION_SUBMISSION[\s\S]*ADMINISTRATIVE/,
  );
  assert.match(
    migration,
    /submission_origin = 'ORGANIZATION_SUBMISSION'[\s\S]*has_organization_role/,
  );
  assert.match(
    migration,
    /new\.submission_origin is distinct from old\.submission_origin/,
  );
});

test("administrative import creates a real READY_TO_IMPORT submission", () => {
  assert.match(
    migration,
    /super_admin_create_administrative_import/,
  );
  assert.match(migration, /'READY_TO_IMPORT'/);
  assert.match(migration, /'ADMINISTRATIVE'/);

  assert.match(
    actions,
    /super_admin_create_administrative_import/,
  );
  assert.match(
    actions,
    /super_admin_import_customers/,
  );
});

test("administrative import uses the existing canonical parser and preview", () => {
  assert.match(actions, /parseCustomerImportCsv\(input\.csv\)/);
  assert.match(actions, /previewCustomerImport\(rows, customers\)/);
  assert.match(workspace, /Validate and preview/);
  assert.match(workspace, /Administrative Import/);
});

test("normal Import Customers excludes administrative submissions", () => {
  assert.match(
    page,
    /submission\.submissionOrigin !== "ADMINISTRATIVE"/,
  );
});

test("completed history identifies administrative imports", () => {
  assert.match(
    queue,
    /submission\.submissionOrigin === "ADMINISTRATIVE"/,
  );
  assert.match(queue, /Administrative Import/);
});

test("rollback operates in batches of one hundred", () => {
  assert.match(rollback, /const DELETE_BATCH_SIZE = 100/);
});

test("import record removal is SUPER_ADMIN-only and fails closed", () => {
  assert.match(
    migration,
    /super_admin_remove_customer_import_record/,
  );
  assert.match(
    migration,
    /submission\.status <> 'IMPORTED'/,
  );
  assert.match(
    migration,
    /submission\.source_file_deleted_at is null/,
  );
  assert.match(
    migration,
    /rollback imported Customers before removing this import record/,
  );

  assert.match(historyActions, /await requireSuperAdmin\(\)/);
  assert.match(
    historyActions,
    /confirmation !== "REMOVE IMPORT RECORD"/,
  );
});

test("removing an import record does not delete Customers", () => {
  const removeFunction = migration.slice(
    migration.indexOf(
      "create or replace function public.super_admin_remove_customer_import_record",
    ),
  );

  assert.match(
    removeFunction,
    /delete from public\.customer_import_submissions/,
  );
  assert.doesNotMatch(
    removeFunction,
    /delete from public\.customers/,
  );
});

test("administrative import adds no polling or realtime behavior", () => {
  const combined = `${workspace}\n${page}`;

  assert.doesNotMatch(
    combined,
    /setInterval|setTimeout|subscribe\(|channel\(|postgres_changes|realtime/i,
  );
});
