import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mobileSecondaryNavigation } from "../lib/application-navigation.ts";

const source = (path: string) => readFileSync(path, "utf8");
const shell = source("components/layout/app-shell.tsx");
const navigation = source("components/layout/mobile-bottom-navigation.tsx");
const layout = source("app/layout.tsx");
const communications = source("app/communications/page.tsx");
const account = source("app/account/profile/page.tsx");
const applicationNavigation = source("lib/application-navigation.ts");
const css = source("app/globals.css");

test("phone shell exposes semantic primary navigation with the established destinations", () => {
  assert.match(applicationNavigation, /mobilePrimaryDestinations = new Set\(\["\/", "\/cases", "\/communications"\]\)/);
  assert.match(shell, /href: "\/account", label: "More"/);
  assert.match(shell, /<MobileBottomNavigation items=\{mobileNavigation\}/);
  assert.match(navigation, /aria-label="Primary mobile navigation"/);
  assert.match(navigation, /href === "\/" \? pathname === href : pathname\.startsWith\(href\)/);
  assert.match(navigation, /aria-current=\{active \? "page" : undefined\}/);
});

test("mobile destinations derive from the existing effective-permission navigation", () => {
  assert.match(shell, /authorizedOrganizationNavigation\(access\)/);
  assert.match(shell, /\.\.\.nav\s*\.filter\(\(item\) => mobilePrimaryDestinations\.has\(item\.href\)\)/);
  assert.match(shell, /if \(isPublic\(pathname\)\)\s*return <main className="public-main">/);
  assert.match(applicationNavigation, /organizationNavigation\.filter\(\(item\) => hasPermission\(context, item\.permission\)\)/);
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

test("phone header removes the drawer control and preserves the 56px account identity", () => {
  assert.match(css, /@media\(max-width:600px\)\{\.topbar\{min-height:68px;padding:6px 12px;gap:6px/);
  assert.match(shell, /const phoneLayout = usePhoneLayout\(closeDrawer\)/);
  assert.match(shell, /\{!phoneLayout \? <button[\s\S]*?className="menu-button"/);
  assert.match(shell, /\{!phoneLayout \? <aside/);
  assert.match(shell, /\{!phoneLayout && open && \(/);
  assert.match(css, /\.sidebar,\.scrim,\.menu-button\{display:none!important\}/);
  assert.match(css, /\.topbar \.account-menu>summary,\.topbar \.account-menu \.user-avatar\{width:56px;height:56px\}/);
  assert.match(css, /\.topbar \.product-tagline\{flex:1 1 0;min-width:0/);
  assert.match(shell, /className="organization-context-prefix">for<\/span><b className="organization-context-name">\{org\?\.name/);
  assert.match(css, /\.topbar \.organization-context\{display:grid;grid-template-columns:auto minmax\(0,1fr\)/);
  assert.match(css, /\.topbar \.organization-context-name\{[^}]*color:var\(--dm3oi-cyan\)[^}]*font-size:clamp\(16px,5vw,20px\)[^}]*font-weight:750/);
});

test("dynamic phone organization names wrap safely without tenant-specific sizing logic", () => {
  for (const name of [
    "Acme",
    "Mimms' Tax Service",
    "Commonwealth Professional Business Services",
    "Commonwealth Professional Business Services of Northern Virginia",
    "CommonwealthProfessionalBusinessServicesInternational",
  ]) assert.doesNotMatch(shell, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(shell, /\{org\?\.name \?\? "No active organization"\}/);
  assert.doesNotMatch(shell, /organizationName\.length|org\?\.name\.length|window\.innerWidth/);
  assert.match(css, /\.topbar \.organization-context\{[^}]*max-width:100%[^}]*white-space:normal/);
  assert.match(css, /\.topbar \.organization-context-name\{[^}]*min-width:0[^}]*max-width:100%[^}]*overflow:hidden/);
  assert.match(css, /\.topbar \.organization-context-name\{[^}]*overflow-wrap:anywhere[^}]*white-space:normal[^}]*-webkit-box-orient:vertical;-webkit-line-clamp:2/);
  assert.match(css, /\.topbar \.organization-context-prefix\{color:#c5d4e2/);
  assert.match(shell, /People\.<\/span> Work\. Progress\. Intelligence\./);
});

test("mobile More exposes only permission-filtered secondary destinations", () => {
  const more = source("app/account/page.tsx");
  assert.match(more, /mobileSecondaryNavigation\(access, platformContext\)/);
  assert.match(more, /mobile-account-navigation/);
  assert.match(more, /secondaryNavigation\.map\(\(item\) =>/);
  assert.match(more, /mobile-account-actions/);
  assert.match(more, /signOutAction/);
  assert.match(applicationNavigation, /mobileSecondaryNavigation\(context: PermissionContext, platformContext: boolean\)/);
  assert.match(applicationNavigation, /authorizedOrganizationAdministrationNavigation\(context\)/);
  assert.match(applicationNavigation, /!mobilePrimaryDestinations\.has\(item\.href\)/);
  assert.match(css, /\.mobile-account-navigation,\.mobile-account-actions\{display:none\}/);
  assert.match(css, /@media\(max-width:600px\)[\s\S]*\.mobile-account-navigation,\.mobile-account-actions\{display:block\}/);
});

test("mobile Account omits secondary destinations absent from effective permissions", () => {
  const navigation = mobileSecondaryNavigation({
    isSuperAdmin: false,
    internalAccess: true,
    activeOrganization: { role: "STAFF_USER" },
    effectivePermissions: new Set<"VIEW_SERVICE_DESK" | "VIEW_TASKS">(["VIEW_SERVICE_DESK", "VIEW_TASKS"]),
  }, false);
  assert.deepEqual(navigation.map((item) => item.href), ["/service-desk", "/tasks", "/account/profile"]);
  assert.ok(!navigation.some((item) => ["/customers", "/questions", "/reports", "/users", "/settings"].includes(item.href)));
  const platformNavigation = mobileSecondaryNavigation({
    isSuperAdmin: true,
    internalAccess: true,
    activeOrganization: null,
  }, true);
  assert.deepEqual(platformNavigation.map((item) => item.href), ["/admin/organizations", "/admin/users", "/account/profile"]);
});

test("Customer Portal bypasses every internal mobile navigation surface", () => {
  assert.match(shell, /path === "\/portal" \|\| path\.startsWith\("\/portal\/"\)/);
  assert.match(shell, /if \(isPublic\(pathname\)\)\s*return <main className="public-main">/);
  assert.match(account, /requireAuthenticatedInternalUser\(\)/);
  assert.doesNotMatch(source("app/portal/layout.tsx") + source("components/portal-nav.tsx"), /MobileBottomNavigation|mobile-account-navigation|mobileSecondaryNavigation/);
});

test("tablet and desktop retain the existing sidebar drawer architecture", () => {
  assert.match(shell, /<aside className=\{`sidebar \$\{open \? "open" : ""\}`\}>/);
  assert.match(shell, /className="close-menu"/);
  assert.match(css, /@media\(max-width:850px\)[^\n]*\.menu-button\{display:block\}/);
  assert.doesNotMatch(css, /@media\(min-width:601px\)[^\n]*\.sidebar[^}]*display:none/);
});

test("Communications controls are compact and duplicate source/category metadata is suppressed on mobile", () => {
  const inbox = source("components/communications-inbox.tsx");
  assert.match(communications, /action=\{<div className="communications-header-actions">/);
  assert.match(communications, /communications-mark-label-compact/);
  assert.match(inbox, /item\.category === item\.source_domain/);
  assert.match(inbox, /if \(!item\.category \|\| item\.category === item\.source_domain\) return null/);
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
