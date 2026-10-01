import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { authorizedOrganizationSettingsNavigation } from "../lib/application-navigation.ts";

const source = (path: string) => readFileSync(path, "utf8");
const shell = source("components/layout/app-shell.tsx");
const mobileNavigation = source("components/layout/mobile-bottom-navigation.tsx");
const applicationNavigation = source("lib/application-navigation.ts");
const css = source("app/globals.css");
const childPages = [
  "app/settings/case-configuration/page.tsx",
  "app/settings/case-lifecycle/page.tsx",
  "app/settings/customer-portal/page.tsx",
  "app/settings/user-access/page.tsx",
];

test("Settings child pages contain no page-level Settings navigation", () => {
  assert.equal(existsSync("components/settings-mobile-subnavigation.tsx"), false);

  for (const path of childPages) {
    const page = source(path);
    assert.match(page, /<PageHeader/);
    assert.doesNotMatch(page, /SettingsMobileSubnavigation/);
    assert.doesNotMatch(page, /authorizedOrganizationSettingsNavigation/);
  }

  const caseConfiguration = source(childPages[0]);
  assert.match(
    caseConfiguration,
    /<PageHeader[\s\S]*?description="Manage Case Types and Task Purposes used by your organization\."[\s\S]*?\/>\s*\{query\.error[\s\S]*?<CaseConfigurationEditor/,
  );
});

test("phone More opens shell-level secondary navigation instead of navigating to Account", () => {
  assert.match(shell, /label: "More",[\s\S]*opensPanel: true/);
  assert.match(
    shell,
    /<MobileBottomNavigation[\s\S]*moreItems=\{secondaryNavigation\}[\s\S]*settingsItems=\{platformContext \? \[\] : settingsNavigation\}/,
  );
  assert.match(mobileNavigation, /aria-label="More navigation"/);
  assert.match(mobileNavigation, /aria-label="Secondary mobile navigation"/);
  assert.match(mobileNavigation, /aria-expanded=\{moreOpen\}/);
  assert.match(mobileNavigation, /aria-controls=\{panelId\}/);
  assert.match(mobileNavigation, /className="mobile-navigation-scrim"/);
});

test("phone navigation renders the shared permission-filtered Settings hierarchy", () => {
  assert.match(shell, /authorizedOrganizationSettingsNavigation\(access\)/);
  assert.match(mobileNavigation, /item\.href === "\/settings\/case-configuration"/);
  assert.match(mobileNavigation, /className="mobile-settings-nav-group"/);
  assert.match(mobileNavigation, /className="mobile-settings-subnav"/);
  assert.match(mobileNavigation, /settingsItems\.map\(\(settingsItem\) =>/);
  assert.match(
    mobileNavigation,
    /pathname === settingsItem\.href \|\|\s*pathname\.startsWith\(`\$\{settingsItem\.href\}\/`\)/,
  );
  assert.match(
    mobileNavigation,
    /aria-current=\{childActive \? "page" : undefined\}/,
  );

  const all = authorizedOrganizationSettingsNavigation({
    isSuperAdmin: false,
    internalAccess: true,
    activeOrganization: { role: "BUSINESS_OWNER" },
    effectivePermissions: new Set([
      "VIEW_ADMINISTRATION",
      "MANAGE_ROLE_PERMISSIONS",
    ]),
  });
  assert.deepEqual(
    all.map(({ href, label }) => ({ href, label })),
    [
      { href: "/settings/case-configuration", label: "Case Configuration" },
      { href: "/settings/customer-portal", label: "Customer Portal" },
      { href: "/settings/user-access", label: "User Access" },
    ],
  );

  const superAdmin = authorizedOrganizationSettingsNavigation({
    isSuperAdmin: true,
    internalAccess: true,
    activeOrganization: { role: "BUSINESS_OWNER" },
    effectivePermissions: new Set([
      "VIEW_ADMINISTRATION",
      "MANAGE_ROLE_PERMISSIONS",
    ]),
  });

  assert.deepEqual(
    superAdmin.map(({ href, label }) => ({ href, label })),
    [
      { href: "/settings/case-configuration", label: "Case Configuration" },
      { href: "/settings/case-lifecycle", label: "Case Lifecycle" },
      { href: "/settings/customer-portal", label: "Customer Portal" },
      { href: "/settings/user-access", label: "User Access" },
    ],
  );
});

test("Settings parent targets Case Configuration and remains active throughout Settings", () => {
  assert.match(
    applicationNavigation,
    /\.filter\(\(item\) => item\.href === "\/settings"\)[\s\S]*href: "\/settings\/case-configuration"/,
  );
  assert.match(
    mobileNavigation,
    /settingsParent\s*\? pathname\.startsWith\("\/settings"\)/,
  );
  assert.match(
    mobileNavigation,
    /href=\{item\.href\}[\s\S]*className=\{`mobile-settings-nav-parent\$\{active \? " active" : ""\}`\}/,
  );
});

test("Settings child permissions continue to hide unauthorized destinations", () => {
  const limited = authorizedOrganizationSettingsNavigation({
    isSuperAdmin: false,
    internalAccess: true,
    activeOrganization: { role: "STAFF_USER" },
    effectivePermissions: new Set(["MANAGE_ROLE_PERMISSIONS"]),
  });
  assert.deepEqual(limited.map((item) => item.href), ["/settings/user-access"]);
  assert.match(
    applicationNavigation,
    /item\.href !== "\/settings\/case-lifecycle" \|\| context\.isSuperAdmin/,
  );
});

test("mobile Settings hierarchy uses shell navigation styling and cyan active states", () => {
  assert.match(css, /\.mobile-more-panel\{[^}]*position:fixed[^}]*z-index:22/);
  assert.match(
    css,
    /\.mobile-settings-subnav\{[^}]*border-left:1px solid #cfd8e3/,
  );
  assert.match(
    css,
    /\.mobile-settings-nav-parent\.active\{[^}]*box-shadow:inset 3px 0 var\(--dm3oi-cyan\)/,
  );
  assert.match(
    css,
    /\.mobile-settings-subnav>a\.active\{[^}]*background:#e7f8fb[^}]*box-shadow:inset 3px 0 var\(--dm3oi-cyan\)[^}]*color:#087d88/,
  );
  assert.doesNotMatch(css, /settings-mobile-subnavigation/);
});

test("desktop Settings hierarchy remains unchanged", () => {
  assert.match(shell, /className="settings-nav-group"/);
  assert.match(shell, /className="settings-nav-parent-link"/);
  assert.match(shell, /className="settings-subnav"/);
  assert.match(shell, /setSettingsOpen\(true\)/);
  assert.match(
    css,
    /\.sidebar \.settings-subnav\{display:grid;gap:2px;margin:2px 0 5px 18px;padding-left:12px;border-left:1px solid #ffffff17\}/,
  );
});

test("mobile shell preserves primary destinations, Profile, and Sign Out", () => {
  assert.match(
    applicationNavigation,
    /mobilePrimaryDestinations = new Set\(\["\/", "\/cases", "\/communications"\]\)/,
  );
  assert.match(
    applicationNavigation,
    /href: "\/account\/profile",\s*label: "Profile"/,
  );
  assert.match(mobileNavigation, /action=\{signOutAction\}/);
  assert.match(mobileNavigation, /Sign Out/);
  assert.match(mobileNavigation, /aria-label="Primary mobile navigation"/);
});
