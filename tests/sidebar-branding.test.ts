import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const shell = source("components/layout/app-shell.tsx");
const css = source("app/globals.css");

test("desktop and tablet sidebar retain the complete DM3Oi product identity", () => {
  assert.match(shell, /className="dm3oi-wordmark"/);
  assert.match(shell, /className="brand-dm3">DM3<\/span>/);
  assert.match(shell, /className="brand-oi">Oi<\/span>/);
  assert.match(shell, /className="dm3oi-wordmark-tm">™<\/span>/);
  assert.match(shell, /className="brand-descriptor">OPERATIONAL<br\/>INTELLIGENCE<\/span>/);
  assert.match(css, /\/\* Desktop and tablet product identity; the phone header remains independent\. \*\//);
  assert.match(css, /@media\(min-width:601px\)\{\.brand-row/);
  assert.match(css, /font-family:"Avenir Next",Avenir,"Century Gothic","Trebuchet MS",Arial,sans-serif/);
  assert.match(css, /\.brand strong \.brand-dm3\{color:#fff\}/);
  assert.match(css, /\.brand strong \.brand-oi\{color:var\(--dm3oi-cyan\)\}/);
  assert.match(css, /\.brand \.dm3oi-wordmark-tm\{top:-\.02em;right:0;font-size:\.25em/);
  assert.match(css, /\.brand \.brand-descriptor\{margin-top:12px[^}]*letter-spacing:2\.15px/);
});

test("tablet keeps the existing drawer architecture with refined branding", () => {
  assert.match(shell, /\{!phoneLayout \? <aside className=\{`sidebar \$\{open \? "open" : ""\}`\}>/);
  assert.match(shell, /className="close-menu"/);
  assert.match(css, /@media\(min-width:601px\) and \(max-width:850px\)\{\.brand \.dm3oi-wordmark\{font-size:37px\}/);
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
