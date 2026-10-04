import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const guidePath = "app/how-to-guide/page.tsx";
const guide = source(guidePath);
const navigation = source("lib/application-navigation.ts");
const styles = source("app/globals.css");

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

test("organization How to Guide route and semantic sections exist", () => {
  assert.equal(existsSync(guidePath), true);
  assert.match(guide, /title="DM3Oi How to Guide"/);
  assert.match(guide, /eyebrow="Help"/);
  assert.match(guide, /id="guide-top"/);
  assert.match(guide, /requirePermission\("VIEW_SETTINGS"\)/);

  for (const [id, title] of sections) {
    assert.match(guide, new RegExp(`id="${id}"`));
    assert.match(guide, new RegExp(`title="${title.replace(/[&/]/g, "\\$&")}"`));
  }

  assert.match(guide, /guideSections\.map\(\(\[id, label\], index\) =>/);
  assert.match(guide, /<a href=\{`#\$\{id\}`\}>/);
  assert.match(guide, /href="#guide-top"/);
});

test("guide content excludes restricted operational contexts and production-looking PII", () => {
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
    assert.doesNotMatch(guide, new RegExp(forbidden, "i"), forbidden);
  }

  assert.doesNotMatch(guide, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(guide, /\b\d{3}-\d{2}-\d{4}\b/);
  assert.doesNotMatch(guide, /\bCASE[- ]?\d{4,}\b/i);
});

test("How to Guide navigation is organization-facing and adjacent to Settings", () => {
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
    /href: "\/how-to-guide", label: "How to Guide", icon: "questions", permission: "VIEW_SETTINGS"/,
  );
  assert.ok(
    organizationGroup.indexOf('href: "/how-to-guide"') <
      organizationGroup.indexOf('href: "/settings"'),
  );
  assert.doesNotMatch(platformGroup, /how-to-guide|How to Guide/);
  assert.match(navigation, /const guide = administration\.filter\(\(item\) => item\.href === "\/how-to-guide"\)/);
});

test("guide documents current-state reporting and safe task and customer boundaries", () => {
  const customerSection = guide.slice(
    guide.indexOf('id="customers"'),
    guide.indexOf('id="cases"'),
  );
  const taskSection = guide.slice(
    guide.indexOf('id="tasks"'),
    guide.indexOf('id="service-desk"'),
  );

  assert.match(
    guide,
    /Business Reach reflects the current customer footprint and is[\s\S]*independent of the reporting-period filter below it/,
  );
  assert.doesNotMatch(customerSection, /export/i);
  assert.match(taskSection, /Workflow-required Tasks cannot be deleted or manually reordered/);
  assert.doesNotMatch(taskSection, /remove workflow|required Tasks can be (?:removed|deleted)/i);
});

test("guide figures are compact accessible and use generic instructional content", () => {
  for (const title of [
    "Customer workspace example",
    "Guided Case Intake steps",
    "Task register example",
    "Service Request conversation flow",
    "Portal Access controls",
    "Business Reach map key",
    "Organization invitation flow",
    "Organization settings cards",
  ]) {
    assert.match(guide, new RegExp(`title="${title}"`));
  }

  assert.match(guide, /<figure className="guide-figure">/);
  assert.match(guide, /role="img" aria-label=\{title\}/);
  assert.match(guide, /<figcaption>[\s\S]*<strong>\{title\}<\/strong>[\s\S]*\{caption\}/);
  assert.match(styles, /\.guide-figure\{/);
  assert.match(styles, /@media\(max-width:600px\)[\s\S]*\.guide-with-figure/);
  assert.doesNotMatch(styles.match(/\.guide-figure\{[^}]*\}/)?.[0] ?? "", /border-radius:(?:99|999)px/);
});
