import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261008210000_dm3oi_customer_merge_qualified_constraint.sql",
  "utf8",
);

test("Customer merge keeps an empty SECURITY DEFINER search path", () => {
  assert.match(
    migration,
    /security definer[\s\S]*set search_path = ''/,
  );
  assert.doesNotMatch(
    migration,
    /set search_path\s*=\s*public/i,
  );
});

test("deferred requester constraint is schema-qualified", () => {
  assert.match(
    migration,
    /set constraints[\s\S]*public\.service_requests_organization_id_customer_id_requester_use_fkey[\s\S]*deferred;/,
  );
});

test("immediate requester constraint is schema-qualified", () => {
  assert.match(
    migration,
    /set constraints[\s\S]*public\.service_requests_organization_id_customer_id_requester_use_fkey[\s\S]*immediate;/,
  );
});

test("no unqualified requester SET CONSTRAINTS reference remains", () => {
  const matches = [
    ...migration.matchAll(
      /service_requests_organization_id_customer_id_requester_use_fkey/g,
    ),
  ];

  assert.equal(matches.length, 2);

  for (const match of matches) {
    const prefix = migration.slice(
      Math.max(0, (match.index ?? 0) - 7),
      match.index,
    );
    assert.equal(prefix, "public.");
  }
});

test("the dependency-preserving merge behavior remains present", () => {
  assert.match(
    migration,
    /update public\.case_document_confirmations[\s\S]*set customer_id = survivor\.id/,
  );
  assert.match(
    migration,
    /update public\.email_deliveries[\s\S]*set customer_id = survivor\.id/,
  );
  assert.match(
    migration,
    /and not public\.is_known_customer_foreign_key\(oid\)/,
  );
});
