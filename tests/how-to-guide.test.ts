import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  defaultHowToGuideContent,
  parseHowToGuideContent,
} from "../lib/how-to-guide-content.ts";

const source = (path: string) => readFileSync(path, "utf8");

const guidePath = "app/how-to-guide/page.tsx";
const guide = source(guidePath);
const renderer = source("components/how-to-guides/guide-renderer.tsx");
const figures = source("components/how-to-guides/guide-figures.tsx");
const navigation = source("lib/application-navigation.ts");
const styles = source("app/globals.css");
const layout = source("app/layout.tsx");
const proxy = source("proxy.ts");

const ownerContent = defaultHowToGuideContent.OWNER_ADMIN;

const sections = [
  ["getting-started", "Getting Started"],
  ["dashboard", "Dashboard / Operational Overview"],
  ["customers", "Customers"],
  ["cases", "Cases"],
  ["tasks", "Tasks"],
  ["service-desk", "Service Desk"],
  ["customer-portal", "Customer Portal"],
  ["communications", "Communications"],
  ["reports", "Reports & Business Reach"],
  ["users-access", "Users & Access"],
  ["settings", "Organization Settings"],
  ["common-workflows", "Common Workflows"],
  ["troubleshooting", "Tips & Troubleshooting"],
] as const;

test("organization How to Guide route uses the locked shared renderer", () => {
  assert.equal(existsSync(guidePath), true);

  assert.match(
    guide,
    /canAccessOrganizationGuide\(access, "\/how-to-guide"\)/,
  );
  assert.match(
    guide,
    /getPublishedHowToGuideForServer\("OWNER_ADMIN"\)/,
  );
  assert.match(
    guide,
    /<HowToGuideRenderer[\s\S]*content=\{content\}/,
  );

  const accessIndex = guide.indexOf("getAccessContext()");
  const guardIndex = guide.indexOf(
    'canAccessOrganizationGuide(access, "/how-to-guide")',
  );
  const loadIndex = guide.indexOf(
    'getPublishedHowToGuideForServer("OWNER_ADMIN")',
  );

  assert.ok(accessIndex >= 0);
  assert.ok(guardIndex > accessIndex);
  assert.ok(loadIndex > guardIndex);

  assert.doesNotMatch(
    guide,
    /createClient\(|getLiveOrganizationData|getOperationalIntelligence|getUnreadNotificationCount/,
  );
});

test("Owner Admin default guide preserves all intended semantic sections", () => {
  assert.equal(
    parseHowToGuideContent("OWNER_ADMIN", ownerContent),
    ownerContent,
  );
  assert.equal(ownerContent.title, "DM3Oi How to Guide");
  assert.equal(ownerContent.sections.length, sections.length);

  assert.deepEqual(
    ownerContent.sections.map((section) => [section.key, section.title]),
    sections,
  );
});

test("shared renderer provides guide header navigation sections and back-to-top behavior", () => {
  assert.match(renderer, /<PageHeader\s+eyebrow="Help"/);
  assert.match(renderer, /id="guide-top"/);
  assert.match(renderer, /className="panel guide-toc"/);
  assert.match(renderer, /sections\.map/);
  assert.match(renderer, /href=\{`#\$\{section\.key\}`\}/);
  assert.match(renderer, /className="panel guide-section"/);
  assert.match(renderer, /href="#guide-top"/);
});

test("guide routes remain independent of organization operational-data loading", () => {
  assert.match(
    layout,
    /requestPathname==="\/how-to-guide"\|\|requestPathname==="\/staff-how-to-guide"/,
  );
  assert.match(
    layout,
    /!staticGuideRequest && access\?\.internalAccess && access\.activeOrganization/,
  );
  assert.match(
    proxy,
    /forwardedHeaders\.set\("x-dm3oi-route-pathname",pathname\)/,
  );
});

test("Owner Admin guide content excludes platform-only contexts and production-looking PII", () => {
  const serialized = JSON.stringify(ownerContent);

  for (const forbidden of [
    "SUPER_ADMIN",
    "Super Admin",
    "Platform Console",
    "Platform Administration",
    "Supabase",
    "Vercel",
    "migration",
    "service role",
    "database administration",
    "global user",
    "tenant administration",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"), forbidden);
  }

  assert.doesNotMatch(
    serialized,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  );
  assert.doesNotMatch(serialized, /\b\d{3}-\d{2}-\d{4}\b/);
  assert.doesNotMatch(serialized, /\bCASE[- ]?\d{4,}\b/i);
});

test("organization How to Guide navigation remains adjacent to Settings while platform gets separate template management", () => {
  const organizationGroup = navigation.slice(
    navigation.indexOf("export const organizationAdministrationNavigation"),
    navigation.indexOf("export const organizationSettingsNavigation"),
  );
  const platformGroup = navigation.slice(
    navigation.indexOf("export const platformNavigation"),
    navigation.indexOf("export const mobilePrimaryDestinations"),
  );

  assert.match(
    organizationGroup,
    /href: "\/how-to-guide", label: "How to Guide", icon: "questions"/,
  );
  assert.ok(
    organizationGroup.indexOf('href: "/how-to-guide"') <
      organizationGroup.indexOf('href: "/settings"'),
  );

  assert.match(
    platformGroup,
    /href: "\/admin\/how-to-guides", label: "How-to Guides", icon: "questions"/,
  );

  assert.match(
    navigation,
    /const guide = administration\.filter\(\(item\) => item\.label === "How to Guide"\)/,
  );
});

test("Owner Admin guide documents current-state reporting and safe task and customer boundaries", () => {
  const customer = ownerContent.sections.find(
    (section) => section.key === "customers",
  );
  const tasks = ownerContent.sections.find(
    (section) => section.key === "tasks",
  );
  const reports = ownerContent.sections.find(
    (section) => section.key === "reports",
  );

  assert.ok(customer);
  assert.ok(tasks);
  assert.ok(reports);

  assert.doesNotMatch(JSON.stringify(customer), /\bexport\b/i);

  assert.match(
    JSON.stringify(tasks),
    /Workflow-required Tasks cannot be deleted or manually reordered/,
  );

  assert.match(
    JSON.stringify(reports),
    /Business Reach reflects the current customer footprint and is independent of the reporting-period filter below it/,
  );
});

test("Owner Admin figures remain code-controlled compact and accessible", () => {
  for (const key of [
    "customer-workspace",
    "guided-intake-owner",
    "task-register-owner",
    "service-request-flow-owner",
    "portal-access",
    "business-reach-owner",
    "invitation-flow",
    "settings-cards",
  ]) {
    assert.match(figures, new RegExp(`"${key}"`));
  }

  assert.match(figures, /<figure className="guide-figure">/);
  assert.match(figures, /role="img" aria-label=\{title\}/);
  assert.match(styles, /\.guide-figure\{/);
  assert.match(
    styles,
    /@media\(max-width:600px\)[\s\S]*\.guide-with-figure/,
  );

  assert.doesNotMatch(
    styles.match(/\.guide-figure\{[^}]*\}/)?.[0] ?? "",
    /border-radius:(?:99|999)px/,
  );
});
