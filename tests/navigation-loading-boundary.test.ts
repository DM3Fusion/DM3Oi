import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("ordinary internal navigation uses a route skeleton without replacing the application shell", () => {
  assert.equal(existsSync("app/loading.tsx"), true);
  assert.match(source("app/loading.tsx"), /RootRouteSkeleton/);
  assert.doesNotMatch(source("app/globals.css"), /loading-spinner|Loading organization workspace/);
});

test("application shell navigation remains client-side and preserves the mounted shell", () => {
  const shell = source("components/layout/app-shell.tsx");
  const mobileNavigation = source("components/layout/mobile-bottom-navigation.tsx");

  assert.match(shell, /<Link[\s\S]*?href=\{href\}/);
  assert.match(shell, /<main>\{children\}<\/main>/);
  assert.match(mobileNavigation, /<Link[\s\S]*?href=\{href\}/);
  assert.doesNotMatch(shell + mobileNavigation, /window\.location/);
  assert.doesNotMatch(shell + mobileNavigation, /prefetch=\{false\}/);
});
