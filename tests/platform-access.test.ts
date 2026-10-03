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
  assert.match(context, /profile\.display_name/);
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
  assert.match(page, /isIncompleteCompatibilityCaseStatus/);
  assert.match(page, /This calendar year/);
  assert.match(repository, /lastActivity/);
  assert.match(repository, /openCases: data\.cases\.filter/);
  assert.match(repository, /isIncompleteCompatibilityCaseStatus/);
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
test("portal-only sessions pass middleware access gating",()=>{const source=readFileSync("proxy.ts","utf8");assert.match(source,/rpc\("get_my_route_access_state"\)/);assert.match(source,/hasActiveAccess=Boolean\(routeState\?\.has_active_super_admin_access\|\|routeState\?\.has_active_organization_access\|\|routeState\?\.has_active_customer_portal_access\)/);});

test("SUPER_ADMIN organization context requires an explicit valid organization selection", () => {
  const context = readFileSync("lib/auth/context.ts", "utf8");
  const migration = readFileSync(
    "supabase/migrations/20261002012000_dm3oi_fast_access_context.sql",
    "utf8",
  );

  assert.match(
    context,
    /const requestedOrganizationId =[\s\S]*selected && selected !== PLATFORM_CONTEXT_COOKIE_VALUE[\s\S]*\? selected[\s\S]*: null;/,
  );
  assert.match(
    context,
    /get_my_access_context[\s\S]*target_organization_id: requestedOrganizationId/,
  );
  assert.match(
    context,
    /rpcContext\.active_organization_id[\s\S]*organizations\.find/,
  );

  assert.match(
    migration,
    /if super_admin then[\s\S]*if target_organization_id is not null[\s\S]*where o\.id = target_organization_id[\s\S]*and o\.status = 'ACTIVE'[\s\S]*active_organization_id := target_organization_id/,
  );

  assert.match(
    migration,
    /else[\s\S]*from public\.organization_members m[\s\S]*m\.user_id = actor_id[\s\S]*m\.is_active[\s\S]*o\.status = 'ACTIVE'/,
  );

  assert.match(
    migration,
    /if active_organization_id is null then[\s\S]*order by o\.name[\s\S]*limit 1;/,
  );
});
