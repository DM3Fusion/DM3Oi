import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261008200000_dm3oi_customer_merge_dependency_handling.sql",
  "utf8",
);

test("Customer merge remains fail-closed for unreviewed foreign keys", () => {
  assert.match(
    migration,
    /and not public\.is_known_customer_foreign_key\(oid\)/,
  );
  assert.match(
    migration,
    /raise exception 'unhandled customer dependencies'/,
  );
});

test("reviewed Customer dependencies are identified by exact table constraint and columns", () => {
  for (const dependency of [
    [
      "case_document_confirmations",
      "case_document_confirmations_organization_id_customer_id_fkey",
    ],
    [
      "customer_geocodes",
      "customer_geocodes_organization_id_customer_id_fkey",
    ],
    [
      "email_deliveries",
      "email_deliveries_organization_id_customer_id_fkey",
    ],
  ]) {
    assert.match(
      migration,
      new RegExp(
        `public\\.${dependency[0]}[\\s\\S]*${dependency[1]}[\\s\\S]*organization_id[\\s\\S]*customer_id`,
      ),
    );
  }
});

test("durable document confirmation evidence is reparented to the survivor", () => {
  assert.match(
    migration,
    /update public\.case_document_confirmations[\s\S]*set customer_id = survivor\.id[\s\S]*customer_id = merged\.id/,
  );
  assert.match(
    migration,
    /case_document_confirmations', confirmation_count/,
  );
});

test("email delivery audit remains associated with the consolidated Customer", () => {
  assert.match(
    migration,
    /update public\.email_deliveries[\s\S]*set customer_id = survivor\.id[\s\S]*customer_id = merged\.id/,
  );
  assert.match(
    migration,
    /'email_deliveries', email_delivery_count/,
  );
});

test("losing Customer geocode remains disposable derived cache", () => {
  assert.doesNotMatch(
    migration,
    /update public\.customer_geocodes[\s\S]*set customer_id = survivor\.id/,
  );
  assert.match(
    migration,
    /customer_geocodes for the losing row is intentionally removed/,
  );
  assert.match(
    migration,
    /delete from public\.customers/,
  );
});

test("post-move guard covers every durable relationship added by this fix", () => {
  assert.match(
    migration,
    /from public\.case_document_confirmations[\s\S]*customer_id = merged\.id/,
  );
  assert.match(
    migration,
    /from public\.email_deliveries[\s\S]*customer_id = merged\.id/,
  );
});
