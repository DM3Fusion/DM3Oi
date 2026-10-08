import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("page-view attribution uses the self-only analytics identity resolver", () => {
  const route = source(
    "app/api/analytics/page-view/route.ts",
  );

  assert.match(
    route,
    /rpc\(\s*"get_my_analytics_identity_context"/,
  );
  assert.match(
    route,
    /target_organization_id:\s*selectedOrganizationId/,
  );
  assert.match(
    route,
    /target_portal_access_id:\s*selectedPortalAccessId/,
  );
  assert.doesNotMatch(
    route,
    /\.from\("organization_members"\)/,
  );
  assert.doesNotMatch(
    route,
    /\.from\("customer_portal_users"\)/,
  );
});

test("page-view attribution retains SUPER_ADMIN exclusion", () => {
  const route = source(
    "app/api/analytics/page-view/route.ts",
  );

  assert.match(route, /rpc\("is_super_admin"\)/);
  assert.match(route, /isSuperAdmin === true/);
  assert.match(route, /ignored: true/);
});

test("page-view identity lookup failures remain observable", () => {
  const route = source(
    "app/api/analytics/page-view/route.ts",
  );

  assert.match(route, /identityError/);
  assert.match(
    route,
    /Analytics identity context lookup failed/,
  );
});

test("retired analytics presence ingestion surface stays removed", () => {
  const proxy = source("proxy.ts");

  assert.doesNotMatch(
    proxy,
    /\/api\/analytics\/presence/,
  );

  assert.throws(
    () => source("app/api/analytics/presence/route.ts"),
  );
});
