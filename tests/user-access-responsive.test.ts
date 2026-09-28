import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const css = source("app/globals.css");
const component = source("components/user-access-matrix.tsx");
const page = source("app/settings/user-access/page.tsx");
const mobileStart = css.indexOf(
  "@media(max-width:600px){.user-access-section",
);
const mobileUserAccess = css.slice(
  mobileStart,
  css.indexOf("\n", mobileStart),
);

test("phone User Access cards contain a touch-scrollable readable table", () => {
  assert.ok(mobileStart >= 0, "phone User Access styles are missing");
  assert.match(
    mobileUserAccess,
    /\.user-access-section\{[^}]*width:100%[^}]*max-width:100%[^}]*min-width:0[^}]*overflow:hidden/,
  );
  assert.match(
    mobileUserAccess,
    /\.user-access-scroll\{[^}]*width:100%[^}]*min-width:0[^}]*overflow-x:auto[^}]*-webkit-overflow-scrolling:touch/,
  );
  assert.match(css, /\.user-access-table\{min-width:760px\}/);
  assert.match(
    mobileUserAccess,
    /\.user-access-table\{min-width:680px\}/,
  );
});

test("phone User Access keeps an opaque wrapping row label column sticky", () => {
  assert.match(
    mobileUserAccess,
    /\.user-access-table th:first-child\{[^}]*position:sticky[^}]*left:0[^}]*z-index:2[^}]*background:#fafbfc[^}]*white-space:normal[^}]*overflow-wrap:anywhere/,
  );
  assert.match(
    mobileUserAccess,
    /\.user-access-table thead th:first-child\{z-index:3\}/,
  );
  assert.match(page, /Case customer reassignment/);
  assert.match(css, /\.user-access-focused\{background:#ecfeff\}/);
});

test("phone actions stack while permission controls retain their semantics", () => {
  assert.match(
    mobileUserAccess,
    /\.user-access-actions\{[^}]*width:100%[^}]*flex-direction:column/,
  );
  assert.match(
    mobileUserAccess,
    /\.user-access-actions button\{[^}]*width:100%[^}]*justify-content:center/,
  );
  assert.match(component, /<table className="user-access-table">/);
  assert.match(component, /<th scope="row">\{row\.label\}<\/th>/);
  assert.match(component, /type="checkbox"/);
  assert.match(component, /aria-label=\{`Allow \$\{roleLabel\(role\)\} to \$\{row\.label\}`\}/);
  assert.match(component, /focusedRole === role \? "user-access-focused"/);
});
