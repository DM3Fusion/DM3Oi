import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customerMatchesFilters, normalizeCustomerQuery, normalizeCustomerStatus } from "../lib/customer-filters.ts";
const customer = {
  customer_number: "CUS-000001",
  name: "Jessica Jones",
  first_name: "Jessica",
  last_name: "Jones",
  street_address: "3412 N College Ave",
  city: "Indianapolis",
  state: "IN",
  postal_code: "46218",
  email: "jessica@aol.com",
  phone: "2405551212",
  type: "INDIVIDUAL",
  status: "ACTIVE",
};
test("customer search is trimmed partial case-insensitive and covers useful fields", () => {
  for (const query of [
    "jessica",
    "JONES",
    "000001",
    "3412",
    "college",
    "indianapolis",
    "IN",
    "46218",
    "aol",
    "240",
    "individual",
    "active",
  ]) assert.equal(customerMatchesFilters(customer, query, "all"), true);
  assert.equal(customerMatchesFilters(customer, "missing", "all"), false);
  assert.equal(customerMatchesFilters(customer, "   ", "all"), true);
  assert.equal(normalizeCustomerQuery("  Jessica  "), "Jessica");
});
test("customer status combines with search and invalid values become all", () => {
  assert.equal(customerMatchesFilters(customer, "jess", "active"), true);
  assert.equal(customerMatchesFilters(customer, "jess", "inactive"), false);
  assert.equal(normalizeCustomerStatus("inactive"), "inactive");
  assert.equal(normalizeCustomerStatus("banana"), "all");
  assert.equal(normalizeCustomerStatus(undefined), "all");
});
test("customer filter UI is URL driven debounced clearable and server authorized", () => {
  const controls = readFileSync("components/customer-filters.tsx", "utf8");
  const page = readFileSync("app/customers/page.tsx", "utf8");
  assert.match(controls, /setTimeout\(\(\)=>updateUrl\(value\),300\)/);
  assert.match(controls, /router\.replace\(destination\)/);
  assert.match(controls, /aria-label="Clear customer search"/);
  assert.match(controls, /placeholder="Search name, address, phone, email\.\.\."/);
  assert.match(controls, /<option value="active">Active<\/option><option value="inactive">Inactive<\/option>/);
  assert.match(page, /getCustomerRegisterData\(\)/);
  assert.doesNotMatch(page, /getLiveOrganizationData\(\)/);
  assert.match(page, /data\.customers\.filter\(\(customer\) =>/);
  assert.match(page, /No customers match the current filters\./);
  assert.match(page, /<ApplicationIcon name="add" \/>New Customer/);
});
