import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isRowNavigationKey,
  ROW_INTERACTIVE_SELECTOR,
} from "../lib/navigation/row-navigation.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("Enter and Space activate a focused navigable row", () => {
  assert.equal(isRowNavigationKey("Enter"), true);
  assert.equal(isRowNavigationKey(" "), true);
  assert.equal(isRowNavigationKey("Tab"), false);
});

test("nested controls and alternate links are excluded from row navigation", () => {
  for (const control of [
    "a",
    "button",
    "input",
    "select",
    "textarea",
    "summary",
    "details",
    "label",
  ]) {
    assert.match(ROW_INTERACTIVE_SELECTOR, new RegExp(`\\b${control}\\b`));
  }
  const row = source("components/navigable-row.tsx");
  assert.match(row, /closest\(ROW_INTERACTIVE_SELECTOR\)/);
  assert.match(
    row,
    /if \(!originatedFromInteractiveControl\(event\.target\)\)/,
  );
});

test("Users register uses row navigation and removes the redundant Open action", () => {
  const users = source("app/admin/users/page.tsx");
  assert.match(users, /<NavigableRow/);
  assert.match(users, /admin\/users\/\$\{user\.id\}/);
  assert.doesNotMatch(users, /Open →/);
});

test("organization user rows navigate by membership ID and isolate invitation controls", () => {
  const users = source("app/users/page.tsx");
  assert.match(users, /<NavigableRow/);
  assert.match(users, /href={`\/users\/\$\{m\.id\}`}/);
  assert.doesNotMatch(users, /href={`\/users\/\$\{m\.user_id\}`}/);
  assert.doesNotMatch(users, /href={`\/admin\/users/);
  assert.match(users, /rows\.map/);
  assert.match(users, /<ResendInviteButton/);
  assert.match(source("components/resend-invite-button.tsx"), /<button type="submit"/);
  assert.match(ROW_INTERACTIVE_SELECTOR, /button/);
});

test("Organizations and cases use the shared navigable-row pattern", () => {
  const organizations = source("app/admin/organizations/page.tsx");
  const cases = source("components/cases/case-table.tsx");
  assert.match(organizations, /<NavigableRow/);
  assert.match(organizations, /admin\/organizations\/\$\{o\.id\}/);
  assert.doesNotMatch(organizations, /Open →/);
  assert.match(cases, /<NavigableRow/);
  assert.match(cases, /cases\/\$\{item\.id\}/);
});

test("membership controls remain nested within navigable entity rows", () => {
  const organization = source(
    "app/admin/organizations/[organizationId]/page.tsx",
  );
  const user = source("app/admin/users/[userId]/page.tsx");
  assert.match(organization, /<NavigableRow/);
  assert.match(organization, /className="membership-form"/);
  assert.match(user, /<NavigableRow/);
  assert.match(user, /className="membership-form"/);
});

test("registers use navigation only where detail destinations exist", () => {
  assert.match(source("app/customers/page.tsx"), /NavigableRow/);
  assert.doesNotMatch(source("app/questions/page.tsx"), /NavigableRow/);
  assert.match(source("app/service-desk/page.tsx"), /NavigableRow/);
});

test("the shared row keeps a real accessible link and visible row focus", () => {
  const row = source("components/navigable-row.tsx");
  const css = source("app/globals.css");
  assert.match(row, /tabIndex={0}/);
  assert.match(row, /aria-label={label}/);
  assert.match(css, /\.navigable-row:focus-visible/);
  assert.match(css, /\.navigable-row:hover/);
  assert.match(css, /cursor:pointer/);
});
