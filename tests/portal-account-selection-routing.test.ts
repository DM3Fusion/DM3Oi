import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const layout = source("app/portal/layout.tsx");
const context = source("lib/auth/customer-portal.ts");
const selectionPage = source("app/portal/select-account/page.tsx");
const actions = source("lib/data/customer-portal-actions.ts");

test("missing or stale multi-account selection reaches a stable selection render", () => {
  assert.match(context, /activeLinks\.find\(\(link\) => link\.id === selected\)/);
  assert.match(context, /activeLinks\.length === 1 \? activeLinks\[0\] : null/);
  assert.match(context, /reason: "ACCOUNT_SELECTION_REQUIRED"/);
  const selectionBranch =
    layout.match(
      /if \(context\.reason === "ACCOUNT_SELECTION_REQUIRED"\)([^;]+;)/,
    )?.[1] ?? "";
  assert.match(selectionBranch, /return/);
  assert.match(selectionBranch, /<PortalHeader context=\{null\}/);
  assert.match(selectionBranch, /\{children\}/);
  assert.doesNotMatch(selectionBranch, /redirect\(/);
  assert.match(selectionPage, /<h1>Select an account<\/h1>/);
  assert.match(selectionPage, /context\.links\.map\(\(link\) =>/);
});

test("unresolved selection uses neutral branding without choosing an arbitrary tenant", () => {
  assert.match(layout, /context\?\.organization \? <OrganizationAvatar/);
  assert.match(layout, /<PortalHeader context=\{null\} hasMultipleAccounts=\{false\} enabled=\{false\}/);
  assert.match(layout, /<strong>DM3Oi™<\/strong><small>Customer Portal<\/small>/);
  assert.doesNotMatch(selectionPage, /links\[0\].*(?:organization|customer)/);
});

test("valid selected access retains the existing organization-branded portal shell", () => {
  assert.match(layout, /context\?\.organization\?\.avatar_path/);
  assert.match(layout, /createSignedUrl\(context\.organization\.avatar_path, 3600\)/);
  assert.match(layout, /className="portal-org-name">\{context\.organization\.name\}/);
  assert.match(
    layout,
    /<PortalHeader context=\{context\} hasMultipleAccounts=\{context\.links\.length > 1\}/,
  );
});

test("normal portal pages still enforce a selected relationship server-side", () => {
  for (const page of [
    "app/portal/page.tsx",
    "app/portal/service-requests/page.tsx",
    "app/portal/service-requests/new/page.tsx",
    "app/portal/service-requests/[serviceRequestId]/page.tsx",
  ]) {
    assert.match(source(page), /requireCustomerPortalContext\(\)/, page);
  }
  assert.match(
    context,
    /redirect\(context\?\.reason === "ACCOUNT_SELECTION_REQUIRED" \? "\/portal\/select-account" : "\/account\/unprovisioned"\)/,
  );
});

test("manual account selection validates access, writes the canonical cookie, and exits to portal", () => {
  assert.match(actions, /ACTIVE_PORTAL_ACCESS_COOKIE/);
  assert.match(actions, /\.eq\("id", id\)/);
  assert.match(actions, /\.eq\("user_id", user\.id\)/);
  assert.match(actions, /\.eq\("is_active", true\)/);
  assert.match(actions, /cookies\(\)\)\.set\(ACTIVE_PORTAL_ACCESS_COOKIE, id/);
  assert.match(actions, /redirect\("\/portal"\)/);
  assert.doesNotMatch(layout + selectionPage, /router\.(?:refresh|replace)|useEffect|setInterval/);
});
