import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const context = source("lib/auth/context.ts");

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
  const resolver = context.slice(
    context.indexOf("async function resolveAccessContext"),
    context.indexOf("export const getAccessContext"),
  );

  assert.match(resolver, /await createClient\(\)/);
  assert.match(resolver, /supabase\.auth\.getClaims\(\)/);
  assert.match(resolver, /typeof claims\?\.sub === "string"/);
  assert.match(resolver, /typeof claims\?\.email === "string"/);
  assert.doesNotMatch(resolver, /supabase\.auth\.getUser\(\)/);
  assert.match(resolver, /\(await cookies\(\)\)\.get\(ACTIVE_ORGANIZATION_COOKIE\)/);
  assert.match(resolver, /get_my_access_context/);
  assert.match(resolver, /target_organization_id: requestedOrganizationId/);

  assert.doesNotMatch(resolver, /\.from\("profiles"\)/);
  assert.doesNotMatch(resolver, /\.from\("platform_user_roles"\)/);
  assert.doesNotMatch(resolver, /\.from\("organization_members"\)/);
  assert.doesNotMatch(resolver, /\.from\("customer_portal_users"\)/);
  assert.doesNotMatch(resolver, /\.from\("organization_role_permissions"\)/);
  assert.doesNotMatch(resolver, /\.from\("organization_licenses"\)/);
});

test("active organization permissions licensing and private avatar signing remain in one resolution", () => {
  assert.match(
    context,
    /rpcContext\.active_organization_id[\s\S]*organizations\.find/,
  );
  assert.match(context, /getEffectiveOrganizationPermissions/);
  assert.match(context, /effectiveLicense/);
  assert.match(
    context,
    /ORGANIZATION_AVATAR_BUCKET[\s\S]*createSignedUrl/,
  );
  assert.match(
    context,
    /\.from\("user-avatars"\)[\s\S]*createSignedUrl/,
  );
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
    /getCachedAccessAvatarUrl\(\s*"user-avatars",\s*profile\.avatar_path/,
  );
  assert.match(
    context,
    /getCachedAccessAvatarUrl\(\s*ORGANIZATION_AVATAR_BUCKET,\s*activeOrganization\.avatarPath/,
  );
  assert.match(
    context,
    /createSignedUrl\(profile\.avatar_path!, 3600\)/,
  );
  assert.match(
    context,
    /createSignedUrl\(\s*activeOrganization!\.avatarPath!,\s*3600,?\s*\)/,
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

test("proxy and Customer Portal retain separate fresh authorization stages", () => {
  const proxy = source("proxy.ts");
  const portal = source("lib/auth/customer-portal.ts");

  assert.match(proxy, /supabase\.auth\.getUser\(\)/);
  assert.doesNotMatch(proxy, /getAccessContext|cache\(/);
  assert.match(portal, /export async function getCustomerPortalContext/);
  assert.match(portal, /supabase\.auth\.getUser\(\)/);
  assert.match(portal, /ACTIVE_PORTAL_ACCESS_COOKIE/);
  assert.doesNotMatch(portal, /getAccessContext|cache\(/);
});
