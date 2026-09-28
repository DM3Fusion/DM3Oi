import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authorizedOrganizationSettingsNavigation } from "../lib/application-navigation.ts";

const source = (path: string) => readFileSync(path, "utf8");
const component = source("components/settings-mobile-subnavigation.tsx");
const shell = source("components/layout/app-shell.tsx");
const css = source("app/globals.css");
const childCssStart = css.indexOf(
  "/* Settings child-page phone subnavigation. */",
);
const childCssEnd = css.indexOf(
  "/* DM3Oi product shell",
  childCssStart,
);
const childCss = css.slice(childCssStart, childCssEnd);
const childPages = [
  "app/settings/case-configuration/page.tsx",
  "app/settings/case-lifecycle/page.tsx",
  "app/settings/customer-portal/page.tsx",
  "app/settings/user-access/page.tsx",
];

test("shared Settings children preserve permission-filtered destinations", () => {
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
      {
        href: "/settings/case-configuration",
        label: "Case Configuration",
      },
      { href: "/settings/case-lifecycle", label: "Case Lifecycle" },
      { href: "/settings/customer-portal", label: "Customer Portal" },
      { href: "/settings/user-access", label: "User Access" },
    ],
  );

  const limited = authorizedOrganizationSettingsNavigation({
    isSuperAdmin: false,
    internalAccess: true,
    activeOrganization: { role: "STAFF_USER" },
    effectivePermissions: new Set(["MANAGE_ROLE_PERMISSIONS"]),
  });
  assert.deepEqual(limited.map((item) => item.href), [
    "/settings/user-access",
  ]);
});

test("every Settings child renders the mobile subnavigation after its PageHeader", () => {
  for (const path of childPages) {
    const page = source(path);
    const header = page.indexOf("<PageHeader");
    const subnavigation = page.indexOf("<SettingsMobileSubnavigation");

    assert.ok(header >= 0, `${path} must retain its PageHeader`);
    assert.ok(
      subnavigation > header,
      `${path} must place mobile Settings navigation after its PageHeader`,
    );
    assert.match(page, /authorizedOrganizationSettingsNavigation\(/);
  }
});

test("mobile Settings child links expose active and accessible state", () => {
  assert.match(component, /usePathname\(\)/);
  assert.match(
    component,
    /pathname === item\.href \|\| pathname\.startsWith\(`\$\{item\.href\}\/`\)/,
  );
  assert.match(component, /aria-label="Settings sections"/);
  assert.match(
    component,
    /href="\/settings\/case-configuration"[\s\S]*className="settings-mobile-subnavigation-parent active"/,
  );
  assert.match(component, /className="settings-mobile-subnav"/);
  assert.doesNotMatch(component, /className="panel settings-mobile-subnavigation"/);
  assert.match(component, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(component, /active \? " active" : ""/);
  assert.match(component, /<Link[\s\S]*href=\{item\.href\}/);
});

test("mobile Settings child CSS is phone-only contained and touch-friendly", () => {
  assert.match(
    childCss,
    /\.settings-mobile-subnavigation\{display:none\}/,
  );
  assert.match(
    childCss,
    /@media\(max-width:600px\)\{\.settings-mobile-subnavigation\{[^}]*display:grid[^}]*width:100%[^}]*max-width:100%[^}]*min-width:0[^}]*overflow:hidden/,
  );
  assert.match(
    childCss,
    /\.settings-mobile-subnav\{[^}]*display:grid[^}]*min-width:0[^}]*margin:2px 0 0 18px[^}]*padding-left:12px[^}]*border-left:1px solid #cfd8e3/,
  );
  assert.match(
    childCss,
    /\.settings-mobile-subnavigation-link\{[^}]*grid-template-columns:18px minmax\(0,1fr\) 15px[^}]*min-width:0[^}]*min-height:44px/,
  );
  assert.match(
    childCss,
    /\.settings-mobile-subnavigation-link:focus-visible\{[^}]*outline:/,
  );
  assert.match(
    childCss,
    /\.settings-mobile-subnavigation-link\.active\{[^}]*background:#e7f8fb[^}]*box-shadow:inset 3px 0 var\(--dm3oi-cyan\)[^}]*color:#087d88/,
  );
  assert.doesNotMatch(childCss, /overflow-x:auto|white-space:nowrap/);
  assert.doesNotMatch(childCss, /\.settings-mobile-subnavigation\{[^}]*border-radius|\.settings-mobile-subnavigation\{[^}]*background:#fff/);
});

test("desktop Settings hierarchy and landing cards remain independent", () => {
  const landing = source("app/settings/page.tsx");
  const navigation = source("lib/application-navigation.ts");

  assert.match(
    navigation,
    /organizationAdministrationNavigation = \[[\s\S]*href: "\/settings", label: "Settings"/,
  );
  assert.match(shell, /href="\/settings\/case-configuration"/);
  assert.match(
    source("app/globals.css"),
    /\.sidebar \.settings-subnav\{display:grid;gap:2px;margin:2px 0 5px 18px;padding-left:12px;border-left:1px solid #ffffff17\}/,
  );
  assert.match(shell, /authorizedOrganizationSettingsNavigation\(access\)/);
  assert.match(
    landing,
    /className="admin-card-grid settings-desktop-card-grid"/,
  );
  assert.match(landing, /className="panel admin-config-card"/);
});
