import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  findDuplicateCustomerPairs,
  parseCustomerImportCsv,
  previewCustomerImport,
  type CustomerIdentity,
} from "../lib/customer-data-management.ts";

const migration = readFileSync("supabase/migrations/20260926230000_dm3oi_customer_data_management.sql", "utf8");

test("CSV parsing enforces the exact contract and supports quoted commas", () => {
  const rows = parseCustomerImportCsv(
    'firstName,lastName,StreetAddress,City,State,ZipCode,Email,Phone\nAva,Stone,"12 Main St, Apt 2",Austin,TX,78701,AVA@example.com,(512) 555-0100\n',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].street_address, "12 Main St, Apt 2");
  assert.equal(rows[0].email, "ava@example.com");
  assert.equal(rows[0].phone, "5125550100");
  assert.throws(() => parseCustomerImportCsv("first,last\nA,B\n"), /headers must be exactly/);
});

test("preview holds exact matches, strong candidates, intra-file duplicates, and invalid rows", () => {
  const existing: CustomerIdentity[] = [{
    id: "existing",
    customer_number: "I2026001",
    first_name: "Ava",
    last_name: "Stone",
    name: "Ava Stone",
    email: "ava@example.com",
    phone: "5125550100",
    street_address: "12 Main St",
    city: "Austin",
    state: "TX",
    postal_code: "78701",
  }];
  const rows = parseCustomerImportCsv(
    "firstName,lastName,StreetAddress,City,State,ZipCode,Email,Phone\n" +
    "Ava,Stone,12 Main St,Austin,TX,78701,ava@example.com,512-555-0100\n" +
    "Ava,Stone,12 Main St,Austin,TX,78701,other@example.com,512-555-0101\n" +
    "Mia,Reed,4 Pine Rd,Dallas,TX,75201,mia@example.com,214-555-0100\n" +
    "Mia,Reed,4 Pine Rd,Dallas,TX,75201,mia2@example.com,214-555-0102\n" +
    "Bad,State,9 Road,Town,XX,123,bad,abc\n",
  );
  const preview = previewCustomerImport(rows, existing);
  assert.deepEqual(preview.summary, { total: 5, validNew: 0, exactMatches: 1, duplicateCandidates: 3, invalid: 1 });
});

test("duplicate detection never matches name alone", () => {
  const base = {
    first_name: null,
    last_name: null,
    name: "Same Name",
    email: null,
    phone: null,
    street_address: null,
    city: null,
    state: null,
    postal_code: null,
  };
  assert.equal(findDuplicateCustomerPairs([{ ...base, id: "a" }, { ...base, id: "b" }]).length, 0);
  assert.equal(findDuplicateCustomerPairs([
    { ...base, id: "a", email: "same@example.com" },
    { ...base, id: "b", email: "SAME@example.com" },
  ]).length, 1);
});

test("merge is SUPER_ADMIN-only, same-org, atomic, audited, and fail-closed", () => {
  assert.match(migration, /not public\.is_super_admin\(actor\)/);
  assert.match(migration, /organization_id=target_organization_id for update/);
  assert.match(migration, /unhandled customer dependencies/);
  assert.match(migration, /both customers have portal identities/);
  assert.match(migration, /set constraints service_requests_organization_id_customer_id_requester_use_fkey deferred/);
  assert.match(migration, /insert into public\.customer_merge_history/);
  assert.match(migration, /customer still has references after reparenting/);
  assert.match(migration, /delete from public\.customers where id=merged\.id/);
  assert.doesNotMatch(migration, /on delete cascade as the merge/i);
});

test("direct Customer updates are least-privilege and require effective EDIT_CUSTOMER permission", () => {
  assert.match(migration, /drop policy if exists customers_effective_update on public\.customers/);
  assert.match(migration, /create policy customers_effective_update[\s\S]*for update to authenticated[\s\S]*using\(public\.has_effective_organization_permission\(organization_id,'EDIT_CUSTOMER'\)\)[\s\S]*with check\(public\.has_effective_organization_permission\(organization_id,'EDIT_CUSTOMER'\)\)/);
  assert.match(migration, /revoke update\([\s\S]*organization_id[\s\S]*customer_number[\s\S]*created_by_user_id[\s\S]*\) on public\.customers from authenticated/);
  assert.match(migration, /grant update\([\s\S]*type,name,email,phone,status,notes[\s\S]*first_name,last_name,street_address,city,state,postal_code[\s\S]*\) on public\.customers to authenticated/);
});

test("import classifies every row before canonical-number allocation or Customer writes", () => {
  const validationPhase = migration.indexOf("PHASE A1:");
  const classificationPhase = migration.indexOf("PHASE A2:");
  const writePhase = migration.indexOf("PHASE B:");
  const customerInsert = migration.indexOf("insert into public.customers(", writePhase);
  assert.ok(validationPhase >= 0 && classificationPhase > validationPhase);
  assert.ok(writePhase > classificationPhase && customerInsert > writePhase);
  assert.doesNotMatch(migration.slice(validationPhase, writePhase), /insert into public\.customers|next_customer_number/);
  assert.match(migration.slice(classificationPhase, writePhase), /classified_rows:=classified_rows/);
  assert.match(migration, /public\.next_customer_number\(target_organization_id,'INDIVIDUAL'\)/);
  assert.match(migration, /target organization is not active/);
});

test("known Customer FKs are constraint and column exact, including the portal requester FK prerequisite", () => {
  for (const constraint of [
    "cases_organization_id_customer_id_fkey",
    "service_requests_organization_id_customer_id_fkey",
    "guided_case_intake_drafts_organization_id_customer_id_fkey",
    "customer_portal_users_organization_id_customer_id_fkey",
  ]) assert.match(migration, new RegExp(constraint));
  assert.match(migration, /source_columns=array\['organization_id','customer_id'\]::name\[\]/);
  assert.match(migration, /target_columns=array\['organization_id','id'\]::name\[\]/);
  assert.match(migration, /not public\.is_known_customer_foreign_key\(oid\)/g);
  assert.match(migration, /foreign key\(organization_id,customer_id,requester_user_id\)[\s\S]*references public\.customer_portal_users\(organization_id,customer_id,user_id\)[\s\S]*deferrable initially immediate/);
});

test("structured normalization preserves legacy and explicit names while deriving on structured identity changes", () => {
  assert.match(migration, /if tg_op='INSERT'/);
  assert.match(migration, /new\.first_name is distinct from old\.first_name/);
  assert.match(migration, /Preserve an explicit display-name choice and legacy name-only records/);
  assert.match(migration, /apply[\s\S]*explicit choice in a name-only update after structured normalization/i);
  assert.match(migration, /phone_source !~ '\^\(\[0-9\]\{10\}\|1\[0-9\]\{10\}/);
  assert.match(migration, /new\.phone:=nullif\(regexp_replace\(coalesce\(phone_source,''\),'\[\^0-9\]'/);
});
