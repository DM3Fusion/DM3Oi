import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("root supports a public landing page while preserving authenticated root experiences", () => {
  const root = source("app/page.tsx");
  const proxy = source("proxy.ts");
  const shell = source("components/layout/app-shell.tsx");

  assert.match(proxy, /publicRoutes=\["\/","\/login"/);
  assert.match(root, /if\(!access\)return <PublicLandingPage\/>/);
  assert.match(root, /experience==="PLATFORM"/);
  assert.match(root, /getLiveOrganizationData\(\)/);
  assert.match(shell, /path === "\/" && !access/);
});

test("landing sign in works while Request Trial remains non-functional", () => {
  const landing = source("components/public-landing-page.tsx");

  assert.match(landing, /href="\/login"/);
  assert.match(landing, /Request Trial/);
  assert.match(landing, /Coming Soon/);
  assert.doesNotMatch(landing, /href="\/request-trial"/);
});

test("public header stays compact without a horizontal product navigation", () => {
  const landing = source("components/public-landing-page.tsx");

  assert.match(landing, /className="public-home-header"/);
  assert.match(landing, /className="public-home-brand"/);
  assert.doesNotMatch(landing, /className="public-home-nav"/);
});

test("landing product presentation highlights Service Desk and mobile Inbox", () => {
  const landing = source("components/public-landing-page.tsx");

  assert.match(landing, /Service Desk/);
  assert.match(landing, /Recent Service Requests/);
  assert.match(landing, /className="public-home-phone"/);
  assert.match(landing, /<h3>Inbox<\/h3>/);
  assert.match(landing, /Home/);
  assert.match(landing, /Cases/);
  assert.match(landing, /More/);
});

test("sign out returns to the public root", () => {
  const actions = source("lib/auth/actions.ts");
  const route = source("app/auth/sign-out/route.ts");

  assert.match(actions, /signOutAction[\s\S]*redirect\("\/"\)/);
  assert.match(route, /new URL\("\/",request\.url\)/);
});

test("public search metadata exposes only the landing page in the sitemap", () => {
  const robots = source("app/robots.ts");
  const sitemap = source("app/sitemap.ts");
  const login = source("app/login/page.tsx");

  assert.match(robots, /allow: "\/"/);
  assert.match(robots, /"\/login"/);
  assert.match(robots, /"\/admin\/"/);
  assert.match(robots, /"\/portal\/"/);
  assert.match(sitemap, /NEXT_PUBLIC_SITE_URL/);
  assert.match(login, /robots: \{ index: false, follow: false \}/);
});
