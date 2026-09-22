import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("ordinary internal navigation has no root workspace loading takeover", () => {
  assert.equal(existsSync("app/loading.tsx"), false);
  assert.doesNotMatch(source("app/globals.css"), /loading-state|loading-spinner|Loading organization workspace/);
});

test("application shell navigation remains client-side and preserves the mounted shell", () => {
  const shell = source("components/layout/app-shell.tsx");
  const mobileNavigation = source("components/layout/mobile-bottom-navigation.tsx");

  assert.match(shell, /<Link[\s\S]*?href=\{href\}/);
  assert.match(shell, /<main>\{children\}<\/main>/);
  assert.match(mobileNavigation, /<Link[\s\S]*?href=\{href\}/);
  assert.doesNotMatch(shell + mobileNavigation, /window\.location/);
});
