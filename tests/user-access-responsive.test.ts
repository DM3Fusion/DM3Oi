import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const css = source("app/globals.css");
const component = source("components/user-access-matrix.tsx");
const mobileStart = css.indexOf(
  "@media(max-width:600px){.user-access-desktop-section",
);
const mobileCss = css.slice(
  mobileStart,
  css.indexOf("\n", mobileStart),
);

test("desktop retains the established permission matrices above phone width", () => {
  assert.match(
    component,
    /user-access-section user-access-desktop-section/,
  );
  assert.match(component, /<table className="user-access-table">/);
  assert.match(component, /<th scope="row">\{row\.label\}<\/th>/);
  assert.match(css, /\.user-access-table\{min-width:760px\}/);
  assert.match(css, /\.user-access-mobile\{display:none\}/);
});

test("phone hides the wide matrices and presents one role-first card per role", () => {
  assert.ok(mobileStart >= 0, "phone User Access styles are missing");
  assert.match(mobileCss, /\.user-access-desktop-section\{display:none\}/);
  assert.match(
    mobileCss,
    /\.user-access-mobile\{[^}]*display:grid[^}]*width:100%[^}]*max-width:100%[^}]*min-width:0[^}]*overflow:hidden/,
  );
  assert.match(
    mobileCss,
    /\.user-access-mobile-role\{[^}]*width:100%[^}]*max-width:100%[^}]*min-width:0[^}]*overflow:hidden/,
  );
  assert.match(component, /aria-label="User Access by role"/);
  assert.match(component, /roles\.map\(\(role\) =>/);
  assert.match(component, /Navigation Access/);
  assert.match(component, /Management Access/);
});

test("phone role cards have no wide-table or sticky-column requirement", () => {
  assert.doesNotMatch(mobileCss, /min-width:(?:680|760)px/);
  assert.doesNotMatch(mobileCss, /position:sticky/);
  assert.doesNotMatch(mobileCss, /overflow-x:auto/);
  assert.match(
    mobileCss,
    /grid-template-columns:minmax\(0,1fr\) auto/,
  );
  assert.match(
    mobileCss,
    /\.user-access-mobile-permission label\{[^}]*min-width:0[^}]*white-space:normal[^}]*overflow-wrap:anywhere/,
  );
});

test("desktop and mobile controls share state update locking and accessibility", () => {
  assert.equal(component.match(/useState\(initial\)/g)?.length, 2);
  assert.equal(component.match(/permissionControl\(/g)?.length, 2);
  assert.match(component, /checked=\{Boolean\(values\[role\]\[row\.permission\]\)\}/);
  assert.match(component, /update\(role, row\.permission, event\.target\.checked\)/);
  assert.match(component, /editableRoles\.includes\(role\)/);
  assert.match(component, /row\.permission === "MANAGE_ROLE_PERMISSIONS"/);
  assert.match(component, /role === "STAFF_MANAGER" \|\| role === "STAFF_USER"/);
  assert.match(component, /role === "BUSINESS_OWNER"/);
  assert.match(component, /type="checkbox"/);
  assert.match(component, /aria-label=\{`Allow \$\{roleLabel\(role\)\} to \$\{row\.label\}`\}/);
  assert.match(component, /aria-describedby=\{!editable \? `\$\{id\}-reason` : undefined\}/);
  assert.match(component, /<label htmlFor=\{id\}>\{row\.label\}<\/label>/);
  assert.match(component, /focusedRole === role \? " user-access-focused"/);
});

test("phone actions stack without changing unrelated global layout selectors", () => {
  assert.match(
    mobileCss,
    /\.user-access-actions\{[^}]*width:100%[^}]*flex-direction:column/,
  );
  assert.match(
    mobileCss,
    /\.user-access-actions button\{[^}]*width:100%[^}]*justify-content:center/,
  );
  assert.doesNotMatch(
    mobileCss,
    /(?:^|})\s*(?:main|\.main-column|\.panel|\.detail-section|\.public-home-value-action)/,
  );
});
