import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const navigation = source("lib/application-navigation.ts");
const shell = source("components/layout/app-shell.tsx");
const organizationPage = source(
  "app/admin/organizations/[organizationId]/page.tsx",
);
const css = source("app/globals.css");

test("Account is exposed only to BUSINESS_OWNER organization administration", () => {
  assert.match(
    navigation,
    /href: "\/account", label: "Account", icon: "account", ownerOnly: true/,
  );

  assert.match(
    navigation,
    /"ownerOnly" in item && item\.ownerOnly[\s\S]*context\.activeOrganization\?\.role === "BUSINESS_OWNER"/,
  );

  assert.doesNotMatch(
    shell,
    /org\?\.role === "BUSINESS_OWNER"[\s\S]*href: "\/account"/,
  );
});

test("phone More remains the Account surface", () => {
  assert.match(
    shell,
    /href: "\/account",[\s\S]*label: "More"[\s\S]*opensPanel: true/,
  );
});

test("Legal Sandbox setting uses isolated responsive styling", () => {
  assert.match(
    organizationPage,
    /className="entity-form sandbox-setting-form"/,
  );
  assert.match(css, /\.sandbox-setting-form\{/);
  assert.match(css, /\.sandbox-setting-form>label\{/);
  assert.match(css, /\.sandbox-setting-form select\{/);
  assert.match(css, /\.sandbox-setting-form select:focus-visible\{/);
});
