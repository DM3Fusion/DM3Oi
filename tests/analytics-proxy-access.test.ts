import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proxy = readFileSync("proxy.ts", "utf8");

function declaration(name: string) {
  const match = proxy.match(
    new RegExp(`const ${name}=new Set\\(\\[([^\\]]*)\\]\\)`),
  );

  assert.ok(match, `${name} declaration is missing`);
  return match[1];
}

test("the three analytics ingestion endpoints bypass proxy protection exactly", () => {
  const publicAnalyticsRoutes = declaration(
    "publicAnalyticsRoutes",
  );

  for (const route of [
    "/api/analytics/page-view",
    "/api/analytics/interaction",
    "/api/analytics/presence",
  ]) {
    assert.match(publicAnalyticsRoutes, new RegExp(`"${route}"`));
  }

  assert.match(
    proxy,
    /function isProtected\(pathname:string\)\{return !publicAnalyticsRoutes\.has\(pathname\)&&!publicRoutes\.some/,
  );
});

test("the analytics exemption does not make unrelated or nested API routes public", () => {
  const publicAnalyticsRoutes = declaration(
    "publicAnalyticsRoutes",
  );
  const publicRoutes = proxy.match(
    /const publicRoutes=\[([^\]]*)\]/,
  );

  assert.ok(publicRoutes, "publicRoutes declaration is missing");

  assert.doesNotMatch(publicAnalyticsRoutes, /"\/api"/);
  assert.doesNotMatch(
    publicAnalyticsRoutes,
    /"\/api\/customers"/,
  );
  assert.doesNotMatch(publicRoutes[1], /"\/api\/customers"/);
  assert.doesNotMatch(publicRoutes[1], /"\/settings"/);
  assert.doesNotMatch(proxy, /pathname\.startsWith\(`\/api\/analytics/);
  assert.match(
    proxy,
    /if\(!user&&protectedRoute\)\{const target=new URL\("\/login"/,
  );
});

test("existing public routes and authenticated proxy behavior remain unchanged", () => {
  assert.match(
    proxy,
    /publicRoutes=\["\/","\/login","\/terms","\/privacy","\/request-trial","\/robots\.txt","\/sitemap\.xml","\/auth\/callback","\/auth\/invite","\/auth\/sign-out"\]/,
  );
  assert.match(proxy, /supabase\.auth\.getUser\(\)/);
  assert.match(proxy, /if\(user&&pathname==="\/login"\)/);
  assert.match(proxy, /if\(user&&protectedRoute\)/);
});

test("public analytics routes return before Supabase Auth verification", () => {
  assert.ok(
    proxy.indexOf("if(publicAnalyticsRoutes.has(pathname)) return response") <
      proxy.indexOf("supabase.auth.getUser()"),
  );
});
