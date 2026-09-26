import test from "node:test";import assert from "node:assert/strict";import{existsSync,readFileSync}from"node:fs";
test("settings is the capability-filtered organization configuration hub",()=>{const settings=readFileSync("app/settings/page.tsx","utf8");const routes=["/settings/general","/settings/case-configuration","/settings/case-lifecycle","/settings/customer-portal","/settings/user-access"];let previous=-1;for(const route of routes){const index=settings.indexOf(`href: "${route}"`);assert.ok(index>previous,`${route} must retain its card order`);previous=index;assert.ok(existsSync(`app${route}/page.tsx`),`${route} must exist`);}assert.match(settings,/hasPermission\(access, "VIEW_SETTINGS"\)/);assert.match(settings,/hasPermission\(access,\s*card\.permission\)/);assert.doesNotMatch(settings,/href: "\/(users|questions)"/);});
test("administration index redirects while its namespace remains protected",()=>{const page=readFileSync("app/administration/page.tsx","utf8");const layout=readFileSync("app/administration/layout.tsx","utf8");assert.match(page,/redirect\("\/settings"\)/);assert.match(layout,/canAccessOrganizationAdministration\(access\)/);assert.match(layout,/notFound\(\)/);});
test("administration sidebar group retains users and settings only",()=>{const navigation=readFileSync("lib/application-navigation.ts","utf8");const shell=readFileSync("components/layout/app-shell.tsx","utf8");const group=navigation.slice(navigation.indexOf("export const organizationAdministrationNavigation"),navigation.indexOf("export const platformNavigation"));assert.match(group,/href: "\/users"/);assert.match(group,/href: "\/settings"/);assert.doesNotMatch(group,/href: "\/administration"/);assert.match(shell,/authorizedOrganizationAdministrationNavigation\(access\)/);assert.match(shell,/pathname\.startsWith\(href\)/);});
test("global and case-specific not-found states remain correctly scoped",()=>{const globalNotFound=readFileSync("app/not-found.tsx","utf8");const caseNotFound=readFileSync("app/cases/[caseId]/not-found.tsx","utf8");const casePage=readFileSync("app/cases/[caseId]/page.tsx","utf8");assert.match(globalNotFound,/Page not found/);assert.match(globalNotFound,/Return to dashboard/);assert.doesNotMatch(globalNotFound,/Case not found|Return to cases/);assert.match(caseNotFound,/Case not found/);assert.match(caseNotFound,/Return to cases/);assert.match(casePage,/if \(!item\) notFound\(\)/);});


test("Organization Defaults is exposed only to SUPER_ADMIN in an active organization context",()=>{
  const settings=readFileSync("app/settings/page.tsx","utf8");
  const defaults=readFileSync("app/settings/general/page.tsx","utf8");
  const actions=readFileSync("lib/data/organization-administration-actions.ts","utf8");

  assert.match(settings,/card\.href !== "\/settings\/general" \|\| access\?\.isSuperAdmin/);
  assert.match(defaults,/!access\?\.isSuperAdmin\s*\|\|\s*!access\.activeOrganization/);
  assert.match(actions,/export async function saveOrganizationDefaults/);
  assert.match(actions,/export async function saveCustomerPortalSettings/);
  assert.equal((actions.match(/!access\?\.isSuperAdmin/g) ?? []).length,2);
});
