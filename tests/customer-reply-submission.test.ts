import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("customer reply acknowledges the first tap and blocks duplicate submissions", () => {
  const form = source("components/customer-reply-form.tsx");
  assert.match(form, /event\.preventDefault\(\)/);
  assert.match(form, /if \(submittingRef\.current\) return/);
  assert.match(form, /submittingRef\.current = true;\s*setPending\(true\)/);
  assert.match(form, /disabled=\{pending\}/);
  assert.match(form, /aria-busy=\{pending\}/);
  assert.match(form, /pending \? "Sending…" : "Send Reply"/);
});

test("customer reply clears only after confirmed persistence and refreshes in place", () => {
  const form = source("components/customer-reply-form.tsx");
  const action = source("lib/data/customer-portal-actions.ts");
  assert.match(form, /if \(!result\.ok\) \{\s*setError\(result\.error\);\s*return;/);
  assert.match(form, /setBody\(""\);\s*router\.refresh\(\)/);
  assert.match(form, /value=\{body\}/);
  assert.match(form, /finally \{\s*submittingRef\.current = false;\s*setPending\(false\)/);
  assert.doesNotMatch(action, /redirect\(`\/portal\/service-requests\/\$\{serviceRequestId\}`\)/);
});

test("customer reply returns after the secure insert and isolates delivery follow-up", () => {
  const action = source("lib/data/customer-portal-actions.ts");
  assert.equal(action.match(/\.rpc\("create_customer_service_request_message"/g)?.length, 1);
  assert.match(action, /revalidatePath\(`\/portal\/service-requests\/\$\{serviceRequestId\}`\)/);
  assert.match(action, /after\(async \(\) => \{/);
  assert.match(action, /recordPortalCommunication/);
  assert.match(action, /notifyStaffOfCustomerReply/);
  assert.match(action, /return \{ ok: true \}/);
});

test("customer reply composer remains reachable and touch-sized on mobile", () => {
  const css = source("app/globals.css");
  assert.match(css, /\.customer-reply-form\{width:100%;min-width:0\}/);
  assert.match(css, /\.customer-reply-form textarea\{width:100%;max-width:100%\}/);
  assert.match(css, /\.customer-reply-form \.primary-button\{[^}]*min-height:44px[^}]*touch-action:manipulation/);
  assert.match(css, /margin-bottom:max\(12px,env\(safe-area-inset-bottom\)\)/);
});
