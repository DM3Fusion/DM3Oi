import test from "node:test";
import assert from "node:assert/strict";
import {
  APPLICATION_VERSION,
  getApplicationVersionLabel,
} from "../lib/app-version.ts";
import { readFileSync } from "node:fs";

test("canonical application release is 1.1", () => {
  assert.equal(APPLICATION_VERSION, "1.1");
});

test("application version label uses the first seven deployment SHA characters", () => {
  const previous = process.env.VERCEL_GIT_COMMIT_SHA;
  process.env.VERCEL_GIT_COMMIT_SHA = "3693189abcdef";
  assert.equal(getApplicationVersionLabel(), "Version 1.1 · 3693189");
  if (previous === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA; else process.env.VERCEL_GIT_COMMIT_SHA = previous;
});
test("application version label omits the separator when deployment SHA is unavailable", () => {
  const previous = process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  assert.equal(getApplicationVersionLabel(), "Version 1.1");
  process.env.VERCEL_GIT_COMMIT_SHA = "   ";
  assert.equal(getApplicationVersionLabel(), "Version 1.1");
  if (previous !== undefined) process.env.VERCEL_GIT_COMMIT_SHA = previous;
  else delete process.env.VERCEL_GIT_COMMIT_SHA;
});

test("authenticated desktop tablet and phone Account surfaces reuse the version label", () => {
  const shell = readFileSync("components/layout/app-shell.tsx", "utf8");
  const layout = readFileSync("app/layout.tsx", "utf8");
  const account = readFileSync("app/account/profile/page.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(layout, /applicationVersionLabel=\{getApplicationVersionLabel\(\)\}/);
  assert.match(shell, /brand-descriptor">OPERATIONAL<br\/>INTELLIGENCE<\/span>\s*<span className="brand-version">\{applicationVersionLabel\}<\/span>/);
  assert.match(account, /className="mobile-account-version">\{getApplicationVersionLabel\(\)\}<\/small>/);
  assert.match(css, /\.brand \.brand-version\{display:block;[^}]*font-size:7px[^}]*white-space:nowrap\}/);
  assert.match(css, /@media\(max-width:600px\)\{\.mobile-account-version\{display:block;[^}]*font-size:11px[^}]*white-space:nowrap\}\}/);
  assert.doesNotMatch(shell, /NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA|3693189/);
});

test("phone header and Customer Portal remain outside version presentation", () => {
  const shell = readFileSync("components/layout/app-shell.tsx", "utf8");
  const portal = readFileSync("app/portal/layout.tsx", "utf8");
  const topbar = shell.slice(shell.indexOf('<header className="topbar">'), shell.indexOf("</header>"));
  assert.doesNotMatch(topbar, /applicationVersionLabel|brand-version|mobile-account-version/);
  assert.doesNotMatch(portal, /app-version|ApplicationVersion|applicationVersion|brand-version|mobile-account-version/);
  assert.match(shell, /if \(isPublic\(pathname\)\)\s*return <main className="public-main">\{children\}<\/main>/);
});
