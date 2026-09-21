import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { communicationsDestination, communicationsViewCookie, normalizeCommunicationsView } from "../lib/communications-view.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("Communications view preference is explicit persistent and scoped to Communications presentation", () => {
  const toggle = source("components/communications-view-toggle.tsx");
  const inbox = source("app/communications/page.tsx");
  const detail = source("app/service-desk/[serviceRequestId]/page.tsx");
  assert.equal(communicationsViewCookie, "dm3oi_communications_view");
  assert.equal(normalizeCommunicationsView(undefined), "mobile");
  assert.equal(normalizeCommunicationsView("full"), "full");
  assert.equal(normalizeCommunicationsView("unexpected"), "mobile");
  assert.match(toggle, /View Full Site/);
  assert.match(toggle, /Return to Mobile View/);
  assert.match(toggle, /Max-Age=31536000/);
  assert.match(toggle, /SameSite=Lax/);
  assert.match(toggle, /router\.refresh\(\)/);
  assert.match(inbox, /cookies\(\)/);
  assert.match(detail, /query\.from === "communications"/);
  assert.doesNotMatch(source("components/layout/app-shell.tsx"), /communicationsViewCookie|dm3oi_communications_view/);
});

test("notification destinations retain Communications context without accepting external paths", () => {
  assert.equal(communicationsDestination("/service-desk/request-1"), "/service-desk/request-1?from=communications");
  assert.equal(communicationsDestination("/cases/case-1?view=work#tasks"), "/cases/case-1?view=work&from=communications#tasks");
  assert.equal(communicationsDestination("https://example.com/bad"), "/communications");
  assert.equal(communicationsDestination("//example.com/bad"), "/communications");
  const actions = source("lib/data/communications-actions.ts");
  assert.match(actions, /setReadState[\s\S]*communicationsDestination\(safeDestination/);
  assert.match(actions, /requirePermission\("VIEW_COMMUNICATIONS"\)/);
});

test("mobile inbox remains one authorized dataset with touch cards and non-color unread text", () => {
  const page = source("app/communications/page.tsx");
  const css = source("app/globals.css");
  assert.equal((page.match(/getNotifications\(/g) ?? []).length, 1);
  assert.match(page, /communications-view-\$\{communicationsView\}/);
  assert.match(page, /notification-read-label/);
  assert.match(page, /item\.read_at \? "Read" : "Unread"/);
  assert.match(page, /item\.source_domain\.replaceAll/);
  assert.match(css, /\.communications-view-mobile \.notification-item\{[^}]*border-radius:10px/);
  assert.match(css, /\.communications-view-mobile \.notification-open\{[^}]*min-height:112px/);
  assert.match(css, /-webkit-line-clamp:2/);
  assert.match(css, /@media\(max-width:430px\)/);
});

test("mobile search stays live while structured filters collapse with count and clear controls", () => {
  const filters = source("components/communications-filters.tsx");
  assert.match(filters, /setTimeout\(\(\) => update\("q", value\), 300\)/);
  assert.match(filters, /aria-label="Clear communications search"/);
  assert.match(filters, /aria-expanded=\{filtersOpen\}/);
  assert.match(filters, /Filters\{activeFilterCount \? ` \(\$\{activeFilterCount\}\)` : ""\}/);
  assert.match(filters, />Clear Filters</);
  assert.match(filters, /for \(const name of \["status", "source", "range"\]\) params\.delete\(name\)/);
  assert.match(source("app/globals.css"), /\.communications-view-mobile \.communications-filter-fields\{display:none/);
});

test("Communications-origin detail prioritizes conversation and preserves authorized reply behavior", () => {
  const detail = source("app/service-desk/[serviceRequestId]/page.tsx");
  const actions = source("lib/data/service-request-actions.ts");
  const css = source("app/globals.css");
  assert.match(detail, /communication-origin communications-view-\$\{communicationsView\}/);
  assert.match(detail, /fromCommunications \? <input type="hidden" name="fromCommunications"/);
  assert.match(detail, /PendingSubmitButton className="primary-button" pendingLabel="Sending…"/);
  assert.match(detail, /canReply &&/);
  assert.match(actions, /requirePermission\("RESPOND_SERVICE_REQUEST"\)/);
  assert.match(actions, /fromCommunications[\s\S]*query\.set\("from", "communications"\)/);
  assert.match(css, /communication-origin\.communications-view-mobile \.service-request-reply textarea\{[^}]*min-height:170px/);
  assert.match(css, /communication-origin\.communications-view-mobile \.service-request-reply \.primary-button\{[^}]*min-height:52px/);
});

test("full-site selectors preserve the established desktop presentation", () => {
  const css = source("app/globals.css");
  assert.match(css, /\.communications-view-full \.communications-filter-fields\{display:grid/);
  assert.match(css, /\.communications-view-toggle\{display:none\}/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.communications-view-toggle\{display:flex/);
  assert.doesNotMatch(source("lib/data/communications-repository.ts"), /dm3oi_communications_view|communications-view/);
});
