import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasTenantInternalAccess, resolveRootExperience } from "../lib/auth/access-routing.ts";
test("SUPER_ADMIN with no organizations receives the platform Back Office",()=>{const access={isSuperAdmin:true,internalAccess:true,provisioned:true,hasActiveOrganization:false};assert.equal(access.provisioned,true);assert.equal(access.internalAccess,true);assert.equal(resolveRootExperience(access),"PLATFORM");assert.equal(hasTenantInternalAccess({...access,activeOrganization:null}),false)});
test("SUPER_ADMIN with an active organization receives its workspace",()=>{const access={isSuperAdmin:true,internalAccess:true,provisioned:true,hasActiveOrganization:true};assert.equal(resolveRootExperience(access),"ORGANIZATION");assert.equal(hasTenantInternalAccess({...access,activeOrganization:{id:"organization-id"}}),true)});
test("a normal organization member retains the operational dashboard",()=>{const access={isSuperAdmin:false,internalAccess:true,provisioned:true,hasActiveOrganization:true};assert.equal(resolveRootExperience(access),"ORGANIZATION")});
test("an authenticated user without provisioning remains Access pending",()=>{const access={isSuperAdmin:false,internalAccess:false,provisioned:false,hasActiveOrganization:false};assert.equal(resolveRootExperience(access),"UNPROVISIONED")});
test("tenant data access always requires an active organization",()=>{assert.equal(hasTenantInternalAccess({internalAccess:true,activeOrganization:null}),false);assert.equal(hasTenantInternalAccess(null),false)});
test("explicit Back Office context remains distinct after organizations exist",()=>{const access={isSuperAdmin:true,internalAccess:true,provisioned:true,hasActiveOrganization:false};assert.equal(resolveRootExperience(access),"PLATFORM")});
test("unprovisioned users retain the shell without tenant or platform navigation",()=>{
  const shell = readFileSync("components/layout/app-shell.tsx", "utf8");
  assert.doesNotMatch(shell, /account\/unprovisioned/);
  assert.match(shell, /access\?\.internalAccess/);
  assert.match(shell, /: \[\]/);
});
test("organization sidebar shows canonical profile display name with safe fallback",()=>{
  const shell = readFileSync("components/layout/app-shell.tsx", "utf8");
  const context = readFileSync("lib/auth/context.ts", "utf8");
  assert.match(shell, /className="sidebar-user-name">\{access\.displayName\}/);
  assert.match(context, /profile\.data\?\.display_name/);
  assert.match(context, /user\.email \|\|\n      "User"/);
  assert.match(shell, /SUPER ADMIN/);
});
test("organization administration exposes live activity drilldowns",()=>{
  const page = readFileSync("app/admin/organizations/[organizationId]/page.tsx", "utf8");
  const row = readFileSync("components/organization-summary-row.tsx", "utf8");
  const repository = readFileSync("lib/data/platform-repository.ts", "utf8");
  assert.match(page, /Last activity/);
  assert.match(row, /target: "cases" \| "customers"/);
  assert.match(row, /params\.set\("drilldown", target\)/);
  assert.match(page, /COMPLETED.*CLOSED.*CANCELLED/);
  assert.match(page, /This calendar year/);
  assert.match(repository, /lastActivity/);
  assert.match(repository, /openCases: data\.cases\.filter/);
});
test("summary drilldown rows preserve full-width button layout",()=>{
  const css = readFileSync("app/globals.css", "utf8");
  const row = readFileSync("components/organization-summary-row.tsx", "utf8");
  assert.match(row, /<button type="button"/);
  assert.match(row, /aria-expanded/);
  assert.match(row, /aria-controls/);
  assert.match(css, /summary-drilldown-row\{[^}]*display:flex/);
  assert.match(css, /summary-drilldown-row\{[^}]*width:100%/);
  assert.match(css, /summary-drilldown-row\{[^}]*justify-content:space-between/);
  assert.match(css, /summary-drilldown-row:hover/);
});
test("portal-only sessions pass middleware access gating",()=>{const source=readFileSync("proxy.ts","utf8");assert.match(source,/from\("customer_portal_users"\)/);assert.match(source,/!portal\.data\?\.length/);});

test("SUPER_ADMIN organization context requires an explicit valid organization selection", () => {
  const context = readFileSync("lib/auth/context.ts", "utf8");

  assert.match(
    context,
    /const selectedOrganization =[\s\S]*?organizations\.find\(\(org\) => org\.id === selected\) \?\? null;/,
  );
  assert.match(
    context,
    /const activeOrganization = isSuperAdmin[\s\S]*?\? selected && selected !== PLATFORM_CONTEXT_COOKIE_VALUE[\s\S]*?\? selectedOrganization[\s\S]*?: null/,
  );
  assert.match(
    context,
    /: selectedOrganization \?\? organizations\[0\] \?\? null;/,
  );
});
