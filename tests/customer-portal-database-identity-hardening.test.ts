import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20261003200000_dm3oi_customer_portal_identity_database_hardening.sql";
const migration = readFileSync(migrationPath, "utf8");
const regression = readFileSync(
  "supabase/tests/customer_portal_identity_hardening.sql",
  "utf8",
);

function getFunctionDefinition(name: string) {
  return (
    migration.match(
      new RegExp(
        `create or replace function public\\.${name}\\b[\\s\\S]*?\\nalter function public\\.${name}\\b`,
      ),
    )?.[0] ?? ""
  );
}

function getTriggerDefinition(name: string) {
  return (
    migration.match(
      new RegExp(
        `create trigger ${name}[\\s\\S]*?execute function public\\.retire_inconsistent_customer_portal_identities\\(\\);`,
      ),
    )?.[0] ?? ""
  );
}

test("legacy cleanup preserves only one identity proven against current Customer, Profile, and Auth email", () => {
  assert.match(
    migration,
    /partition by access\.organization_id,access\.customer_id/,
  );
  assert.match(migration, /where access\.is_active/);
  assert.match(migration, /profile\.is_active/);
  assert.match(
    migration,
    /lower\(btrim\(profile\.email\)\)=lower\(btrim\(customer\.email\)\)/,
  );
  assert.match(
    migration,
    /lower\(btrim\(auth_user\.email\)\)=lower\(btrim\(customer\.email\)\)/,
  );
  assert.match(migration, /where identity_rank=1/);
  assert.match(
    migration,
    /not exists \([\s\S]*dm3oi_portal_identity_survivors survivor[\s\S]*survivor\.id=access\.id/,
  );
});

test("cleanup deactivates every non-survivor and cancels only its scoped live invitations", () => {
  assert.match(
    migration,
    /update public\.customer_portal_users access[\s\S]*set is_active=false[\s\S]*access\.organization_id=superseded\.organization_id[\s\S]*access\.customer_id=superseded\.customer_id[\s\S]*access\.user_id=superseded\.user_id/,
  );
  assert.match(
    migration,
    /update public\.customer_portal_invitations invitation[\s\S]*set status='CANCELLED'[\s\S]*invitation\.organization_id=superseded\.organization_id[\s\S]*invitation\.customer_id=superseded\.customer_id[\s\S]*invitation\.user_id=superseded\.user_id[\s\S]*invitation\.status in \('PENDING','SENT'\)/,
  );
});

test("partial uniqueness is per organization/customer and preserves inactive history", () => {
  assert.match(
    migration,
    /create unique index customer_portal_users_one_active_identity_uidx[\s\S]*on public\.customer_portal_users\(organization_id,customer_id\)[\s\S]*where is_active=true/,
  );
  assert.doesNotMatch(
    migration,
    /create unique index customer_portal_users_one_active_identity_uidx[\s\S]*\(user_id\)/,
  );
});

test("central database authorization is self-only and enforces every effective identity dependency", () => {
  const predicate =
    migration.match(
      /create or replace function public\.is_customer_portal_user[\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
  assert.match(predicate, /security definer/);
  assert.match(predicate, /set search_path=''/);
  assert.match(predicate, /check_user_id=auth\.uid\(\)/);
  assert.match(predicate, /access\.user_id=check_user_id/);
  assert.match(predicate, /access\.is_active/);
  assert.match(predicate, /customer\.status='ACTIVE'/);
  assert.match(predicate, /profile\.is_active/);
  assert.match(predicate, /organization\.status='ACTIVE'/);
  assert.match(predicate, /coalesce\(settings\.portal_enabled,true\)/);
  assert.match(predicate, /join auth\.users auth_user/);
  assert.doesNotMatch(predicate, /returns table|auth_user\.email as/);
});

test("all five portal-facing SECURITY DEFINER RPCs call the central effective-identity predicate", () => {
  for (const name of [
    "create_customer_service_request",
    "get_customer_portal_cases",
    "get_customer_portal_case_requirements",
    "report_customer_case_documents_sent",
    "get_my_access_context",
  ]) {
    const definition = getFunctionDefinition(name);
    assert.notEqual(definition, "", `${name} is redefined by the migration`);
    assert.match(definition, /security definer/);
    assert.match(definition, /set search_path=''/);
    assert.match(definition, /public\.is_customer_portal_user\(/);
    assert.match(definition, /auth\.uid\(\)/);
  }
});

test("strengthened RPCs preserve selector, actor, tenant, result-shape, and authenticated-only compatibility", () => {
  const createRequest = getFunctionDefinition("create_customer_service_request");
  assert.match(createRequest, /access\.id=target_portal_access_id/);
  assert.match(createRequest, /access\.user_id=actor/);
  assert.match(createRequest, /link\.organization_id/);
  assert.match(createRequest, /link\.customer_id/);
  assert.match(createRequest, /returns public\.service_requests/);

  const cases = getFunctionDefinition("get_customer_portal_cases");
  assert.match(cases, /access\.id=target_portal_access_id/);
  assert.match(cases, /access\.user_id=auth\.uid\(\)/);
  assert.match(cases, /intake_finalized boolean/);
  assert.match(cases, /tax_outcome text/);

  const requirements = getFunctionDefinition(
    "get_customer_portal_case_requirements",
  );
  assert.match(requirements, /access\.id=target_portal_access_id/);
  assert.match(requirements, /access\.user_id=auth\.uid\(\)/);
  assert.match(requirements, /task\.organization_id=item\.organization_id/);
  assert.match(requirements, /item\.customer_id=access\.customer_id/);

  const report = getFunctionDefinition("report_customer_case_documents_sent");
  assert.match(report, /access\.id=target_portal_access_id/);
  assert.match(report, /access\.user_id=actor/);
  assert.match(report, /item\.organization_id=access_row\.organization_id/);
  assert.match(report, /item\.customer_id=access_row\.customer_id/);

  const accessContext = getFunctionDefinition("get_my_access_context");
  assert.match(accessContext, /actor_id uuid:=auth\.uid\(\)/);
  assert.match(accessContext, /access\.user_id=actor_id/);
  assert.match(
    accessContext,
    /public\.is_customer_portal_user\([\s\S]*access\.organization_id,[\s\S]*access\.customer_id,[\s\S]*actor_id/,
  );

  for (const signature of [
    "create_customer_service_request\\(uuid,text,text\\)",
    "get_customer_portal_cases\\(uuid\\)",
    "get_customer_portal_case_requirements\\(uuid\\)",
    "report_customer_case_documents_sent\\(uuid,uuid\\)",
    "get_my_access_context\\(uuid\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.${signature}[\\s\\S]*?from public,anon,authenticated;[\\s\\S]*?grant execute on function public\\.${signature}[\\s\\S]*?to authenticated;`,
      ),
    );
  }
});

test("migration bounds lock acquisition and total statement time inside its transaction", () => {
  assert.match(
    migration,
    /^begin;\s+set local lock_timeout='5s';\s+set local statement_timeout='60s';/,
  );
});

test("committed active links cannot drift when Customer, Profile, or Auth identity changes", () => {
  assert.match(
    migration,
    /create constraint trigger customer_portal_identity_consistency_guard\s+after insert or update of id,organization_id,customer_id,user_id,is_active[\s\S]*deferrable initially deferred/,
  );
  assert.match(
    migration,
    /active Customer Portal identity does not match current Customer email/,
  );
  assert.match(
    migration,
    /after update of email on public\.customers[\s\S]*retire_inconsistent_customer_portal_identities/,
  );
  assert.match(
    migration,
    /after update of email,is_active on public\.profiles[\s\S]*retire_inconsistent_customer_portal_identities/,
  );
  assert.match(
    migration,
    /after update of email on auth\.users[\s\S]*retire_inconsistent_customer_portal_identities/,
  );
});

test("retirement triggers skip no-op identity updates without broadening watched columns", () => {
  const customerTrigger = getTriggerDefinition(
    "customer_portal_customer_identity_retirement",
  );
  assert.match(customerTrigger, /after update of email on public\.customers/);
  assert.match(
    customerTrigger,
    /when \(old\.email is distinct from new\.email\)/,
  );

  const profileTrigger = getTriggerDefinition(
    "customer_portal_profile_identity_retirement",
  );
  assert.match(
    profileTrigger,
    /after update of email,is_active on public\.profiles/,
  );
  assert.match(
    profileTrigger,
    /when \(\s*old\.email is distinct from new\.email\s*or old\.is_active is distinct from new\.is_active\s*\)/,
  );

  const authTrigger = getTriggerDefinition(
    "customer_portal_auth_identity_retirement",
  );
  assert.match(authTrigger, /after update of email on auth\.users/);
  assert.match(
    authTrigger,
    /when \(old\.email is distinct from new\.email\)/,
  );
});

test("direct link RLS excludes stale self-access without weakening administrator visibility", () => {
  const policy =
    migration.match(
      /create policy portal_links_self_select[\s\S]*?\n\);/,
    )?.[0] ?? "";
  assert.match(policy, /user_id=auth\.uid\(\)/);
  assert.match(policy, /public\.is_customer_portal_user/);
  assert.match(policy, /public\.is_super_admin\(\)/);
  assert.match(policy, /public\.has_organization_role/);
});

test("proxy routing derives portal access from the same central predicate", () => {
  const routeState =
    migration.match(
      /create or replace function public\.get_my_route_access_state\(\)[\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
  assert.match(routeState, /actor_id uuid:=auth\.uid\(\)/);
  assert.match(routeState, /public\.is_customer_portal_user\(/);
  assert.doesNotMatch(
    routeState,
    /portal_user\.is_active=true/,
  );
  assert.match(
    migration,
    /revoke all on function public\.get_my_route_access_state\(\)[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_my_route_access_state\(\)[\s\S]*to authenticated/,
  );
});

test("SQL regression covers replacement, fail-closed cleanup, tenant isolation, account selection, uniqueness, and stale RLS", () => {
  for (const evidence of [
    "one valid current identity remains effective",
    "same user retains a second distinct valid Customer link",
    "no matching identity deactivates every active link for the Customer",
    "cross-tenant link and invitation remain untouched",
    "stale identity cannot satisfy effective portal access",
    "stale identity cannot enumerate its old portal link through RLS",
    "replacement identity becomes the sole effective identity",
    "second active Customer Portal identity was accepted",
    "at most one active identity exists per organization/customer",
    "no-op identity updates preserve valid portal access and invitation state",
  ])
    assert.match(regression, new RegExp(evidence));
});

test("database regression is wired but this source-only suite never invokes Docker or Supabase", () => {
  const runner = readFileSync("scripts/test-database.sh", "utf8");
  assert.match(runner, /customer_portal_identity_hardening\.sql/);
  assert.doesNotMatch(import.meta.url, /docker|supabase db/);
});
