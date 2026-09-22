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
  assert.match(resolver, /supabase\.auth\.getUser\(\)/);
  assert.match(resolver, /\.from\("profiles"\)/);
  assert.match(resolver, /\.from\("platform_user_roles"\)/);
  assert.match(resolver, /\.from\("organization_members"\)/);
  assert.match(resolver, /\.from\("customer_portal_users"\)/);
  assert.match(resolver, /\(await cookies\(\)\)\.get\(ACTIVE_ORGANIZATION_COOKIE\)/);
  assert.match(resolver, /\.from\("organization_role_permissions"\)/);
  assert.match(resolver, /\.from\("organization_licenses"\)/);
});

test("active organization permissions licensing and private avatar signing remain in one resolution", () => {
  assert.match(context, /organizations\.find\(\(org\) => org\.id === selected\)/);
  assert.match(context, /getEffectiveOrganizationPermissions/);
  assert.match(context, /effectiveLicense/);
  assert.match(context, /ORGANIZATION_AVATAR_BUCKET[\s\S]*createSignedUrl\(org\.avatar_path, 3600\)/);
  assert.match(context, /\.from\("user-avatars"\)[\s\S]*createSignedUrl\(profile\.data\.avatar_path, 3600\)/);
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
