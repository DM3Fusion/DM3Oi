import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const shell = source("components/layout/app-shell.tsx");
const navigation = source("components/layout/mobile-bottom-navigation.tsx");
const layout = source("app/layout.tsx");
const communications = source("app/communications/page.tsx");
const css = source("app/globals.css");

test("phone shell exposes semantic primary navigation with the established destinations", () => {
  assert.match(shell, /mobilePrimaryDestinations = new Set\(\["\/", "\/cases", "\/communications"\]\)/);
  assert.match(shell, /href: "\/account\/profile", label: "Account"/);
  assert.match(shell, /<MobileBottomNavigation items=\{mobileNavigation\}/);
  assert.match(navigation, /aria-label="Primary mobile navigation"/);
  assert.match(navigation, /href === "\/" \? pathname === href : pathname\.startsWith\(href\)/);
  assert.match(navigation, /aria-current=\{active \? "page" : undefined\}/);
});

test("mobile destinations derive from the existing effective-permission navigation", () => {
  assert.match(shell, /organizationNav\.filter\(\(item\) => hasPermission\(access,item\.permission\)\)/);
  assert.match(shell, /\.\.\.nav\s*\.filter\(\(item\) => mobilePrimaryDestinations\.has\(item\.href\)\)/);
  assert.match(shell, /if \(isPublic\(pathname\)\)\s*return <main className="public-main">/);
  assert.match(shell, /mobile-primary-nav-item/);
  assert.match(css, /@media\(max-width:600px\)[\s\S]*\.sidebar nav a\.mobile-primary-nav-item\{display:none\}/);
});

test("mobile Communications badge reuses the root unread count and disappears at zero", () => {
  assert.match(layout, /getUnreadNotificationCount\(\{organizationId:access\.activeOrganization\.id,userId:access\.user\.id\}\)/);
  assert.match(shell, /unreadCount: item\.href === "\/communications" \? unreadNotificationCount : undefined/);
  assert.match(navigation, /unreadCount > 0 \? <span className="mobile-navigation-badge"/);
  assert.match(navigation, /unreadCount > 99 \? "99\+" : unreadCount/);
  assert.doesNotMatch(navigation, /getUnreadNotificationCount|notifications/);
});

test("phone-only fixed navigation has equal controls safe-area clearance and no tablet impact", () => {
  assert.match(css, /\.mobile-bottom-navigation[^}]*display:none/);
  assert.match(css, /@media\(max-width:600px\)[\s\S]*\.mobile-bottom-navigation\{position:fixed/);
  assert.match(css, /grid-auto-flow:column;grid-auto-columns:1fr/);
  assert.match(css, /padding:5px 6px max\(5px,env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.main-column>main\{padding:14px 12px calc\(86px \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(css, /\.mobile-bottom-navigation>a\{[^}]*min-width:0;min-height:58px/);
  assert.match(css, /\.mobile-bottom-navigation>a\.active/);
});

test("phone header preserves the 56px controls while using compact DM3Oi identity styling", () => {
  assert.match(css, /@media\(max-width:600px\)\{\.topbar\{min-height:68px;padding:6px 12px;gap:6px/);
  assert.match(css, /\.topbar \.menu-button\{[^}]*flex:0 0 56px;width:56px;height:56px/);
  assert.match(css, /\.topbar \.menu-button svg\{width:30px;height:30px\}/);
  assert.match(css, /\.topbar \.account-menu>summary,\.topbar \.account-menu \.user-avatar\{width:56px;height:56px\}/);
  assert.match(css, /\.topbar \.product-tagline\{flex:1;min-width:0/);
  assert.match(css, /\.topbar \.product-tagline small b\{color:var\(--dm3oi-cyan\)\}/);
});

test("Communications controls are compact and duplicate source/category metadata is suppressed on mobile", () => {
  assert.match(communications, /action=\{<div className="communications-header-actions">/);
  assert.match(communications, /communications-mark-label-compact/);
  assert.match(communications, /item\.source_domain === item\.category \? " duplicate"/);
  assert.match(communications, /notification-category-label">Category:/);
  assert.match(css, /\.communications-view-mobile \.notification-category\.duplicate\{display:none\}/);
  assert.match(css, /\.communications-header-actions \.communications-view-toggle\{display:flex;margin:0\}/);
  assert.match(css, /\.communications-workspace>\.page-header p\{[^}]*-webkit-line-clamp:2/);
});

test("desktop and explicit full-site Communications behavior remain available", () => {
  assert.match(css, /\.mobile-bottom-navigation[^}]*display:none/);
  assert.match(css, /\.communications-view-label-compact[^}]*display:none/);
  assert.match(source("components/communications-view-toggle.tsx"), /View Full Site/);
  assert.match(source("components/communications-view-toggle.tsx"), /Return to Mobile View/);
  assert.match(source("components/communications-view-toggle.tsx"), /dm3oi_communications_view|communicationsViewCookie/);
});
