import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = (path: string) => fs.readFileSync(path, "utf8");

test("pending organization membership lookup is authenticated self-only and narrowly exposed", () => {
  const migration = source(
    "supabase/migrations/20260927143000_dm3oi_self_pending_organization_access.sql",
  );

  assert.match(
    migration,
    /create or replace function public\.get_my_pending_organization_membership\(\)/,
  );
  assert.match(migration, /actor uuid := auth\.uid\(\)/);
  assert.match(migration, /member\.user_id = actor/);
  assert.match(migration, /member\.status in \('INVITED', 'VERIFIED'\)/);
  assert.match(migration, /member\.is_active = false/);
  assert.match(migration, /organization\.status = 'ACTIVE'/);
  assert.match(migration, /security definer/);
  assert.match(
    migration,
    /revoke all[\s\S]*get_my_pending_organization_membership\(\)[\s\S]*from public, anon/,
  );
  assert.match(
    migration,
    /grant execute[\s\S]*get_my_pending_organization_membership\(\)[\s\S]*to authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /target_user_id|target_organization_id|target_membership_id/,
  );
});

test("proxy resolves pending organization access through the consolidated self-only state", () => {
  const proxy = source("proxy.ts");

  assert.match(proxy, /rpc\("get_my_route_access_state",\{/);
  assert.match(
    proxy,
    /hasPendingOrganizationAccess=routeState\?\.has_pending_organization_membership===true/,
  );
  assert.doesNotMatch(
    proxy,
    /getMyPendingOrganizationMembership|\.from\("organization_members"\)/,
  );
  assert.match(
    proxy,
    /!hasActiveAccess&&hasPendingOrganizationAccess[\s\S]*\/account\/pending-activation/,
  );
});

test("pending activation page uses the same self-only membership projection", () => {
  const page = source("app/account/pending-activation/page.tsx");

  assert.match(page, /getMyPendingOrganizationMembership\(supabase\)/);
  assert.match(page, /membership\.organization_name/);
  assert.match(page, /membership\.status === "VERIFIED"/);
  assert.match(page, /getAccessContext\(\)/);
  assert.doesNotMatch(page, /auth\.getUser\(\)/);
  assert.doesNotMatch(
    page,
    /\.from\("organization_members"\)[\s\S]{0,220}\.in\("status", \["INVITED", "VERIFIED"\]\)/,
  );
});


test("verified pending activation offers an explicit status check without polling", () => {
  const page = source("app/account/pending-activation/page.tsx");
  const reconciler = source("components/pending-activation-reconciler.tsx");

  assert.match(page, /verified \? <PendingActivationReconciler \/> : null/);
  assert.match(
    page,
    /After activation, check your status or refresh this page\./,
  );
  assert.doesNotMatch(page, /update automatically/);
  assert.doesNotMatch(page, /After activation, sign in again to continue\./);

  assert.match(reconciler, /Check activation/);
  assert.match(reconciler, /onClick=\{\(\) => startTransition\(\(\) => router\.refresh\(\)\)\}/);
  assert.match(reconciler, /router\.refresh\(\)/);
  assert.doesNotMatch(reconciler, /setInterval|setTimeout|useEffect|focus|visibilitychange/);

  assert.match(
    page,
    /if \(activeMembership\) redirect\("\/"\)/,
  );
});
