import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const context = source("lib/auth/context.ts");
const coreResolver = context.slice(
  context.indexOf("async function resolveAccessContext"),
  context.indexOf("export const getAccessContext"),
);
const presentationResolver = context.slice(
  context.indexOf("async function resolvePresentationAccessContext"),
  context.indexOf("export const getPresentationAccessContext"),
);

test("React cache shares a resolution within one server render and refreshes the next render", () => {
  const script = `
    import React, { cache } from "react";
    import { renderToReadableStream } from "next/dist/compiled/react-server-dom-webpack/server.node.js";
    let resolutions = 0;
    const getContext = cache(async () => ++resolutions);
    async function Consumer() {
      return React.createElement("span", null, await getContext());
    }
    function Render() {
      return React.createElement("div", null, React.createElement(Consumer), React.createElement(Consumer));
    }
    const counts = [];
    for (let request = 0; request < 2; request += 1) {
      const stream = renderToReadableStream(React.createElement(Render), {});
      await new Response(stream).text();
      counts.push(resolutions);
    }
    process.stdout.write(JSON.stringify(counts));
  `;
  const output = execFileSync(
    process.execPath,
    ["--conditions", "react-server", "--input-type=module", "-e", script],
    { encoding: "utf8" },
  );

  assert.deepEqual(JSON.parse(output), [1, 2]);
});

test("access context uses React request memoization around one authoritative resolver", () => {
  assert.match(context, /import \{ cache \} from "react"/);
  assert.match(context, /async function resolveAccessContext\(\): Promise<AccessContext \| null>/);
  assert.match(context, /export const getAccessContext = cache\(resolveAccessContext\)/);
  assert.doesNotMatch(context, /unstable_cache|globalThis|new Map<.*AccessContext|localStorage|sessionStorage/);
});

test("each uncached resolution still reads authoritative request and authorization state", () => {
  assert.match(coreResolver, /await createClient\(\)/);
  assert.match(coreResolver, /supabase\.auth\.getClaims\(\)/);
  assert.match(coreResolver, /typeof claims\?\.sub === "string"/);
  assert.match(coreResolver, /typeof claims\?\.email === "string"/);
  assert.doesNotMatch(coreResolver, /supabase\.auth\.getUser\(\)/);
  assert.match(coreResolver, /\(await cookies\(\)\)\.get\(ACTIVE_ORGANIZATION_COOKIE\)/);
  assert.match(coreResolver, /get_my_access_context/);
  assert.match(coreResolver, /target_organization_id: requestedOrganizationId/);

  assert.doesNotMatch(coreResolver, /\.from\("profiles"\)/);
  assert.doesNotMatch(coreResolver, /\.from\("platform_user_roles"\)/);
  assert.doesNotMatch(coreResolver, /\.from\("organization_members"\)/);
  assert.doesNotMatch(coreResolver, /\.from\("customer_portal_users"\)/);
  assert.doesNotMatch(coreResolver, /\.from\("organization_role_permissions"\)/);
  assert.doesNotMatch(coreResolver, /\.from\("organization_licenses"\)/);
});

test("core access resolves authorization fields without presentation storage work", () => {
  assert.match(
    coreResolver,
    /rpcContext\.active_organization_id[\s\S]*organizations\.find/,
  );
  assert.match(coreResolver, /getEffectiveOrganizationPermissions/);
  assert.match(coreResolver, /effectiveLicense/);
  assert.match(coreResolver, /avatarPath: profile\.avatar_path/);
  assert.match(coreResolver, /avatarUrl: null/);
  assert.match(coreResolver, /organizations/);
  assert.match(coreResolver, /activeOrganization/);
  assert.match(coreResolver, /effectivePermissions/);
  assert.doesNotMatch(coreResolver, /createSignedUrl|getCachedAccessAvatarUrl|\.storage/);
  assert.equal(
    context.match(/\.rpc\(\s*"get_my_access_context"/g)?.length,
    1,
  );
});

test("presentation access is request-cached and reuses the core resolution", () => {
  assert.match(
    context,
    /export const getPresentationAccessContext = cache\(\s*resolvePresentationAccessContext,?\s*\)/,
  );
  assert.match(presentationResolver, /const access = await getAccessContext\(\)/);
  assert.doesNotMatch(presentationResolver, /get_my_access_context|getClaims\(\)/);
  assert.match(presentationResolver, /if \(!access\.avatarPath && !activeOrganization\?\.avatarPath\) return access/);
  assert.match(presentationResolver, /Promise\.all\(\[/);
  assert.match(presentationResolver, /getCachedAccessAvatarUrl/);
  assert.match(presentationResolver, /resolveOwnedOrganizationAvatarUrl/);
  assert.match(presentationResolver, /avatarUrl: activeOrganizationAvatarUrl/);
});

test("access avatar URLs reuse exact immutable object paths inside the signed URL lifetime", () => {
  assert.match(
    context,
    /ACCESS_AVATAR_CACHE_TTL_MS = 50 \* 60 \* 1000/,
  );
  assert.match(
    context,
    /ACCESS_AVATAR_CACHE_MAX_ENTRIES = 256/,
  );
  assert.match(
    context,
    /const accessAvatarUrlCache = new Map/,
  );
  assert.match(
    context,
    /const key = `\$\{bucket\}:\$\{path\}`/,
  );
  assert.match(
    context,
    /cached && cached\.expiresAt > now/,
  );
  assert.match(
    context,
    /getCachedAccessAvatarUrl\(\s*"user-avatars",\s*access\.avatarPath/,
  );
  assert.match(
    context,
    /resolveOwnedOrganizationAvatarUrl\(\s*activeOrganization\.avatarPath,\s*activeOrganization\.id/,
  );
  assert.match(
    context,
    /getCachedAccessAvatarUrl\(\s*ORGANIZATION_AVATAR_BUCKET,\s*ownedPath/,
  );
  assert.match(
    context,
    /createSignedUrl\(access\.avatarPath!, 3600\)/,
  );
  assert.match(
    context,
    /createSignedUrl\(ownedPath, 3600\)/,
  );
});

test("authorization helpers continue checking the shared authoritative context", () => {
  assert.match(context, /requireInternalContext[\s\S]*await getAccessContext\(\)[\s\S]*hasTenantInternalAccess/);
  assert.match(context, /requirePermission[\s\S]*await getAccessContext\(\)[\s\S]*hasPermission/);
  assert.match(context, /requireAuthenticatedInternalUser[\s\S]*await getAccessContext\(\)[\s\S]*internalAccess/);
  assert.match(context, /requireSuperAdmin[\s\S]*await getAccessContext\(\)[\s\S]*isSuperAdmin/);
});

test("Home and Communications consumers naturally converge on the shared accessor", () => {
  assert.match(source("app/page.tsx"), /getAccessContext\(\)/);
  assert.match(source("lib/data/case-repository.ts"), /getAccessContext\(\)/);
  assert.match(source("lib/data/operational-intelligence-repository.ts"), /getAccessContext\(\)/);
  assert.match(source("app/communications/page.tsx"), /requirePermission\("VIEW_COMMUNICATIONS"\)/);
  const communications = source("lib/data/communications-repository.ts");
  assert.match(communications, /getNotifications[\s\S]*await requireInternalContext\(\)/);
  assert.match(communications, /getUnreadNotificationCount[\s\S]*await requireInternalContext\(\)/);
});

test("only shell and profile presentation consumers request hydrated access", () => {
  const layout = source("app/layout.tsx");
  const profile = source("app/account/profile/page.tsx");
  assert.match(layout, /getPresentationAccessContext\(\)/);
  assert.match(profile, /getPresentationAccessContext\(\)/);
  assert.match(profile, /requireAuthenticatedInternalUser\(\)/);

  for (const path of [
    "app/page.tsx",
    "app/cases/page.tsx",
    "app/service-desk/page.tsx",
    "app/customers/page.tsx",
    "lib/data/case-repository.ts",
    "lib/data/reports-repository.ts",
    "lib/data/communications-repository.ts",
    "lib/data/goals-repository.ts",
    "lib/data/operational-intelligence-repository.ts",
  ]) {
    const consumer = source(path);
    assert.match(consumer, /getAccessContext\(\)|requireInternalContext\(\)/);
    assert.doesNotMatch(consumer, /getPresentationAccessContext/);
  }
});

test("proxy and Customer Portal retain separate fresh authorization stages", () => {
  const proxy = source("proxy.ts");
  const portal = source("lib/auth/customer-portal.ts");

  assert.match(proxy, /supabase\.auth\.getUser\(\)/);
  assert.doesNotMatch(proxy, /getAccessContext|cache\(/);
  assert.match(portal, /async function resolveCustomerPortalContext/);
  assert.match(portal, /getCustomerPortalContext = cache\(resolveCustomerPortalContext\)/);
  assert.match(portal, /supabase\.auth\.getUser\(\)/);
  assert.match(portal, /ACTIVE_PORTAL_ACCESS_COOKIE/);
  assert.doesNotMatch(portal, /getAccessContext|unstable_cache/);
});
