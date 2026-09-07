import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatPhone } from "../lib/format-phone.ts";

test("customer phone display formatting is safe and presentation-only", () => {
  assert.equal(formatPhone("2401234321"), "(240) 123-4321");
  assert.equal(formatPhone("13015551212"), "+1 (301) 555-1212");
  assert.equal(formatPhone(null), "—");
  assert.equal(formatPhone("legacy phone"), "legacy phone");
});

test("customer creation exposes only valid types and required contact fields", () => {
  const page = readFileSync("app/customers/new/page.tsx", "utf8");
  const form = readFileSync("components/customer-form.tsx", "utf8");
  const action = readFileSync("lib/data/case-actions.ts", "utf8");
  assert.match(form, /INDIVIDUAL/);
  assert.match(form, /BUSINESS/);
  assert.doesNotMatch(form, /ORGANIZATION/);
  assert.match(form, /name=\{key\} type=\{type\} required/);
  assert.match(form, /field\("email","Email","email"\)/);
  assert.match(form, /field\("phone","Phone","tel"\)/);
  assert.match(page, /CustomerForm/);
  assert.match(action, /type !== "INDIVIDUAL" && type !== "BUSINESS"/);
  assert.match(action, /customerEmailPattern/);
  assert.match(action, /normalizeCustomerPhone/);
  assert.match(action, /supabase\.rpc\(\s*"create_customer_record"/);
  assert.doesNotMatch(action, /target_customer_number/);
  assert.doesNotMatch(action, /target_created_by_user_id/);
});

test("customer register uses full-row navigation and detail preserves historical identity", () => {
  const register = readFileSync("app/customers/page.tsx", "utf8");
  const detail = readFileSync("app/customers/[customerId]/page.tsx", "utf8");
  assert.match(register, /NavigableRow/);
  assert.match(register, /`\/customers\/\$\{customer\.id\}`/);
  assert.match(detail, /customer\.customer_number/);
  assert.match(detail, /customer\.type/);
  assert.match(detail, /customer\.created_at/);
  assert.match(detail, /created_by_user_id/);
  assert.match(detail, /Unknown user/);
  assert.match(detail, /customer\.updated_at/);
});
test("customer editing exposes only mutable fields and tenant-scopes updates", () => {
  const detail = readFileSync("app/customers/[customerId]/page.tsx", "utf8");
  const edit = readFileSync("app/customers/[customerId]/edit/page.tsx", "utf8");
  const action = readFileSync("lib/data/customer-actions.ts", "utf8");
  assert.match(detail, /Edit Customer/);
  assert.match(detail, /customers\/\$\{customer\.id\}\/edit/);
  assert.match(edit, /customer\.customer_number/);
  assert.match(edit, /customer\.type/);
  assert.match(edit, /CustomerEditForm/);
  assert.match(action, /\.eq\("id"/);
  assert.match(action, /\.eq\("organization_id",context\.activeOrganization\.id\)/);
  assert.doesNotMatch(action, /customer_number/);
  assert.doesNotMatch(action, /created_by_user_id/);
  assert.doesNotMatch(action, /organization_id:/);
});

test("customer editing follows the shared dirty and save-state pattern", () => {
  const form = readFileSync("components/customer-edit-form.tsx", "utf8");
  const action = readFileSync("lib/data/customer-actions.ts", "utf8");
  assert.match(form, /normalizeCustomerPhone/);
  assert.match(form, /canonical\s*=|canonical=/);
  assert.match(form, /JSON\.stringify\(canonical\(values\)\)!==JSON\.stringify\(canonical\(saved\)\)/);
  assert.match(form, /license-save-button/);
  assert.match(form, /pending\?"Saving…":justSaved\?"Changes Saved":"Save changes"/);
  assert.match(form, /setSaved\(values\)/);
  assert.match(form, /setJustSaved\(false\)/);
  assert.match(action, /return \{ok:true as const\}/);
  assert.doesNotMatch(action, /redirect\(/);
});

test("customer create and edit forms visibly mark invalid controls", () => {
  const create = readFileSync("components/customer-form.tsx", "utf8");
  const edit = readFileSync("components/customer-edit-form.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  for (const form of [create, edit]) {
    assert.match(form, /aria-invalid/);
    assert.match(form, /field-error/);
    assert.match(form, /Correct the highlighted fields|summary/);
  }
  assert.match(css, /input\[aria-invalid="true"\]/);
  assert.match(css, /select\[aria-invalid="true"\]/);
  assert.match(css, /textarea\[aria-invalid="true"\]/);
  assert.match(css, /border-color:#be123c/);
  assert.match(css, /:focus/);
});
