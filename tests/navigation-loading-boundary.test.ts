import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("ordinary internal navigation uses a route skeleton without replacing the application shell", () => {
  assert.equal(existsSync("app/loading.tsx"), true);
  assert.match(source("app/loading.tsx"), /RootRouteSkeleton/);
  assert.doesNotMatch(source("app/globals.css"), /loading-spinner|Loading organization workspace/);
});

test("authenticated shell navigation fully prefetches through normal Next Links", () => {
  const shell = source("components/layout/app-shell.tsx");
  const mobileNavigation = source("components/layout/mobile-bottom-navigation.tsx");
  const navigation = `${shell}\n${mobileNavigation}`;

  assert.match(shell, /<Link[\s\S]*?href=\{href\}/);
  assert.match(shell, /<main>\{children\}<\/main>/);
  assert.match(mobileNavigation, /<Link[\s\S]*?href=\{href\}/);
  assert.equal(
    navigation.match(/<Link\b/g)?.length,
    navigation.match(/prefetch=\{true\}/g)?.length,
  );
  assert.doesNotMatch(navigation, /prefetch=\{false\}/);
  assert.doesNotMatch(
    navigation,
    /useRouter|router\.(?:refresh|push|replace|prefetch)|window\.location|document\.location/,
  );
});

test("full navigation prefetch preserves UI close handlers and authorization", () => {
  const layout = source("app/layout.tsx");
  const shell = source("components/layout/app-shell.tsx");
  const mobileNavigation = source("components/layout/mobile-bottom-navigation.tsx");

  assert.match(shell, /onClick=\{\(\) => setOpen\(false\)\}/);
  assert.match(mobileNavigation, /onClick=\{\(\) => setMoreOpen\(false\)\}/);
  assert.match(shell, /authorizedOrganizationNavigation\(access\)/);
  assert.match(shell, /authorizedOrganizationAdministrationNavigation\(access\)/);
  assert.match(shell, /authorizedOrganizationSettingsNavigation\(access\)/);
  assert.match(shell, /<form action=\{signOutAction\}/);
  assert.doesNotMatch(shell, /<Link[^>]+signOutAction/);
  assert.match(layout, /export const dynamic="force-dynamic"/);
  assert.match(layout, /Promise\.all\(\[getAccessContext\(\), headers\(\)\]\)/);
});
