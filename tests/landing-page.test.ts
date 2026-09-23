import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("root supports managed public landing content while preserving authenticated root experiences", () => {
  const root = source("app/page.tsx");
  const proxy = source("proxy.ts");
  const shell = source("components/layout/app-shell.tsx");

  assert.match(proxy, /publicRoutes=\["\/","\/login"/);
  assert.match(root, /getPublishedLandingPageContent/);
  assert.match(root, /PublicLandingPage/);
  assert.match(root, /experience==="PLATFORM"/);
  assert.match(root, /getLiveOrganizationData\(\)/);
  assert.match(shell, /path === "\/" && !access/);
});

test("landing sign in works while Request Trial remains disabled", () => {
  const landing = source("components/public-landing-page.tsx");
  const content = source("lib/public-landing-page.ts");

  assert.match(landing, /href="\/login"/);
  assert.match(landing, /content\.hero\.trialLabel/);
  assert.match(landing, /aria-disabled="true"/);
  assert.doesNotMatch(landing, /href="\/request-trial"/);

  assert.match(content, /trialLabel:\s*"Request Trial"/);
});

test("managed defaults preserve the DM3Oi product identity", () => {
  const content = source("lib/public-landing-page.ts");

  assert.match(content, /Business Operations Intelligence/);
  assert.match(content, /headlinePrimary:\s*"People\. Work\."/);
  assert.match(content, /headlineSecondary:\s*"Progress\. Intelligence\."/);
  assert.match(content, /title:\s*"Inbox"/);
  assert.match(content, /title:\s*"Service Desk"/);
  assert.match(content, /title:\s*"Cases"/);
  assert.match(content, /title:\s*"Tasks"/);
  assert.match(content, /title:\s*"Questions & Rules"/);
  assert.match(content, /title:\s*"Secure Access"/);
});

test("public landing stays compact without horizontal product navigation", () => {
  const landing = source("components/public-landing-page.tsx");

  assert.match(landing, /public-home-hero-showcase/);
  assert.doesNotMatch(landing, /className="public-home-nav"/);
});

test("landing renders managed showcase content and workflow artwork", () => {
  const landing = source("components/public-landing-page.tsx");

  assert.match(landing, /PublicWorkflowImage/);
  assert.match(landing, /content\.features\.workflowImageUrl/);
  assert.match(landing, /content\.hero\.headlinePrimary/);
  assert.match(landing, /content\.hero\.headlineSecondary/);
  assert.match(landing, /content\.features\.items\.map/);
});

test("SUPER_ADMIN landing-page management is available in platform navigation", () => {
  const navigation = source("lib/application-navigation.ts");
  const page = source("app/admin/landing-page/page.tsx");
  const actions = source("app/admin/landing-page/actions.ts");

  assert.match(
    navigation,
    /href: "\/admin\/landing-page", label: "Landing Page"/,
  );
  assert.match(page, /requireSuperAdmin\(\)/);
  assert.match(actions, /requireSuperAdmin\(\)/);
  assert.match(actions, /publish_public_landing_page/);
  assert.match(actions, /revert_public_landing_page/);
});

test("landing management keeps Request Trial content staged without enabling the route", () => {
  const landing = source("components/public-landing-page.tsx");
  const content = source("lib/public-landing-page.ts");

  assert.match(content, /trialRequest/);
  assert.doesNotMatch(landing, /href="\/request-trial"/);
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
