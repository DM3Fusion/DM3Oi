import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const page = source("app/settings/page.tsx");
const css = source("app/globals.css");
const cssStart = css.indexOf(
  "/* Settings landing-page phone navigation. */",
);
const cssEnd = css.indexOf(
  "/* DM3Oi product shell",
  cssStart,
);
const settingsCss = css.slice(cssStart, cssEnd);
const mobileMarkup = page.slice(
  page.indexOf('<nav\n              className="panel settings-mobile-navigation"'),
  page.indexOf("</nav>"),
);

test("desktop Settings cards remain the non-phone presentation", () => {
  assert.match(
    page,
    /className="admin-card-grid settings-desktop-card-grid"/,
  );
  assert.match(page, /className="panel admin-config-card"/);
  assert.match(page, /<p>\{description\}<\/p>/);
  assert.match(page, /className="admin-card-action">Manage/);
});

test("phone Settings navigation is semantic compact and accessible", () => {
  assert.match(page, /<nav[\s\S]*aria-label="Settings navigation"/);
  assert.match(page, /className="settings-mobile-navigation-list"/);
  assert.match(page, /className="settings-mobile-navigation-link"/);
  assert.match(mobileMarkup, /<span>\{title\}<\/span>/);
  assert.match(mobileMarkup, /<ApplicationIcon name="forward" \/>/);
  assert.doesNotMatch(mobileMarkup, /description|Manage/);
});

test("phone navigation keeps organization Settings destinations while Case Lifecycle remains SUPER_ADMIN-only", () => {
  for (const [label, href] of [
    ["Customer Portal", "/settings/customer-portal"],
    ["Case Configuration", "/settings/case-configuration"],
    ["Questions & Rules", "/questions"],
    ["User Access", "/settings/user-access"],
    ["Case Lifecycle", "/settings/case-lifecycle"],
  ]) {
    assert.match(page, new RegExp(`title: "${label}"`));
    assert.match(page, new RegExp(`href: "${href}"`));
  }

  assert.match(
    page,
    /card\.href !== "\/settings\/case-lifecycle" \|\| access\?\.isSuperAdmin/,
  );
  assert.match(
    page,
    /const mobileCards = cards\.filter\([\s\S]*card\.href !== "\/settings\/general"/,
  );
  assert.match(page, /mobileCards\.map\(\(\{ title, href \}\) =>/);
  const orderedLabels = ["Customer Portal", "Case Configuration", "Questions & Rules", "User Access"];
  for (let index = 1; index < orderedLabels.length; index += 1) {
    assert.ok(
      page.indexOf(`title: "${orderedLabels[index - 1]}"`) <
        page.indexOf(`title: "${orderedLabels[index]}"`),
    );
  }
});

test("phone CSS swaps cards for a contained touch-friendly navigation", () => {
  assert.match(settingsCss, /\.settings-mobile-navigation\{display:none\}/);
  assert.match(
    settingsCss,
    /@media\(max-width:600px\)\{\.settings-desktop-card-grid\{display:none\}/,
  );
  assert.match(
    settingsCss,
    /\.settings-mobile-navigation\{[^}]*display:block[^}]*width:100%[^}]*max-width:100%[^}]*min-width:0[^}]*overflow:hidden/,
  );
  assert.match(
    settingsCss,
    /\.settings-mobile-navigation-link\{[^}]*display:flex[^}]*width:100%[^}]*min-width:0[^}]*min-height:56px/,
  );
  assert.match(
    settingsCss,
    /\.settings-mobile-navigation-link:focus-visible\{[^}]*outline:/,
  );
});

test("Settings phone CSS does not target shared shell or global surfaces", () => {
  assert.doesNotMatch(
    settingsCss,
    /(?:^|})\s*(?:main|\.main-column|\.sidebar|\.mobile-bottom-navigation|\.panel|\.detail-section|table)(?:[,{])/,
  );
});
