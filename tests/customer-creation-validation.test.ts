import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateCustomerCreation } from "../lib/customer-validation.ts";

const completeCustomer = () => ({
  type: "INDIVIDUAL",
  name: "",
  firstName: " Ada ",
  lastName: " Lovelace ",
  streetAddress: " 123 Computing Way ",
  city: " London ",
  state: " md ",
  postalCode: " 20850 ",
  email: " ADA@EXAMPLE.COM ",
  phone: " (301) 555-1212 ",
  notes: "  First programmer  ",
});

for (const [field, label] of [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["streetAddress", "Street address"],
  ["city", "City"],
  ["state", "State"],
  ["postalCode", "Postal code"],
] as const) {
  test(`${label} is required for direct customer creation`, () => {
    const result = validateCustomerCreation({ ...completeCustomer(), [field]: "   " });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.fieldErrors[field] ?? "", /required/i);
  });
}

test("Customer Type is required and restricted to supported values", () => {
  for (const type of ["", "   ", "ORGANIZATION"]) {
    const result = validateCustomerCreation({ ...completeCustomer(), type });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.fieldErrors.type ?? "", /valid customer type/i);
  }
});

test("Business/display name and Notes remain optional", () => {
  const result = validateCustomerCreation({
    ...completeCustomer(),
    type: "BUSINESS",
    name: "   ",
    notes: "   ",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.name, "Ada Lovelace");
    assert.equal(result.value.notes, "");
  }
});

test("a complete customer is trimmed, normalized, and derives its display name", () => {
  const result = validateCustomerCreation(completeCustomer());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    type: "INDIVIDUAL",
    name: "Ada Lovelace",
    firstName: "Ada",
    lastName: "Lovelace",
    streetAddress: "123 Computing Way",
    city: "London",
    state: "MD",
    postalCode: "20850",
    email: "ada@example.com",
    phone: "3015551212",
    notes: "First programmer",
  });
});

test("CSV import retains its separate validation path", () => {
  const importValidation = readFileSync("lib/customer-data-management.ts", "utf8");
  assert.doesNotMatch(importValidation, /validateCustomerCreation/);
  assert.match(importValidation, /function validateImportRow/);
  assert.match(importValidation, /previewCustomerImport/);
});
