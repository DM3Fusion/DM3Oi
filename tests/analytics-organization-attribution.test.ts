import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("analytics routes use the DM3Oi organization status model", () => {
  for (const path of [
    "app/api/analytics/page-view/route.ts",
    "app/api/analytics/presence/route.ts",
  ]) {
    const route = source(path);

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
  }
});

test("analytics routes retain SUPER_ADMIN exclusion", () => {
  for (const path of [
    "app/api/analytics/page-view/route.ts",
    "app/api/analytics/presence/route.ts",
  ]) {
    const route = source(path);

    assert.match(route, /rpc\("is_super_admin"\)/);
    assert.match(route, /isSuperAdmin === true/);
    assert.match(route, /ignored: true/);
  }
});

test("analytics membership lookup failures are observable", () => {
  const pageView = source(
    "app/api/analytics/page-view/route.ts",
  );
  const presence = source(
    "app/api/analytics/presence/route.ts",
  );

  assert.match(pageView, /membershipError/);
  assert.match(
    pageView,
    /Analytics organization membership lookup failed/,
  );

  assert.match(presence, /membershipError/);
  assert.match(
    presence,
    /Analytics presence organization membership lookup failed/,
  );
});
