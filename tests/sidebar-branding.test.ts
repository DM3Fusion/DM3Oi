import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const shell = source("components/layout/app-shell.tsx");
const css = source("app/globals.css");

test("desktop and tablet sidebar retain the approved DM3Oi photographic product identity", () => {
  assert.match(shell, /className="brand brand-hero"/);
  assert.match(shell, /aria-label="DM3Oi Operational Intelligence home"/);
  assert.match(shell, /src="\/images\/dm3oi-operations-hero\.jpg"/);
  assert.match(shell, /width=\{600\}/);
  assert.match(shell, /height=\{349\}/);
  assert.match(shell, /sizes="240px"/);
  assert.match(shell, /className="brand-hero-image"/);
  assert.match(shell, /className="sidebar-brand-version">\{applicationVersionLabel\}<\/div>/);
  assert.match(css, /\.brand-hero-image\{[^}]*display:block[^}]*width:100%[^}]*height:auto/);
  assert.match(css, /\.sidebar-brand-version\{[^}]*font-size:7px[^}]*white-space:nowrap/);
});

test("tablet keeps the existing drawer architecture with photographic branding", () => {
  assert.match(shell, /\{!phoneLayout \? <aside className=\{`sidebar \$\{open \? "open" : ""\}`\}>/);
  assert.match(shell, /className="close-menu"/);
  assert.match(shell, /className="brand brand-hero"/);
  assert.match(css, /@media\(max-width:850px\)[^\n]*\.sidebar\.open\{transform:translateX\(0\)\}/);
});

test("phone header and Customer Portal remain outside sidebar branding", () => {
  assert.match(shell, /if \(isPublic\(pathname\)\)\s*return <main className="public-main">/);
  assert.match(shell, /\{!phoneLayout \? <aside/);
  assert.match(css, /@media\(max-width:600px\)\{\.sidebar,\.scrim,\.menu-button\{display:none!important\}/);
  assert.match(css, /\.topbar \.product-tagline strong\{color:#fff\}/);
  assert.match(css, /\.topbar \.account-menu>summary,\.topbar \.account-menu \.user-avatar\{width:56px;height:56px\}/);
  assert.match(css, /\.mobile-bottom-navigation>a\{[^}]*min-height:58px/);
});
