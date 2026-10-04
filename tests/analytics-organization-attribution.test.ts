import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("page-view attribution uses the DM3Oi organization status model", () => {
  const route = source(
    "app/api/analytics/page-view/route.ts",
  );

  assert.match(
    route,
    /organization:organizations\(id,status\)/,
  );
  assert.match(
    route,
    /organization\?\.status === "ACTIVE"/,
  );
  assert.doesNotMatch(
    route,
    /organization:organizations\(id,is_active\)/,
  );
  assert.doesNotMatch(
    route,
    /organization\?\.is_active/,
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

test("page-view membership lookup failures remain observable", () => {
  const route = source(
    "app/api/analytics/page-view/route.ts",
  );

  assert.match(route, /membershipError/);
  assert.match(
    route,
    /Analytics organization membership lookup failed/,
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
