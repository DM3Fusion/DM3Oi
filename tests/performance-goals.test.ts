import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  filterGoals,
  formatGoalValue,
  goalHistoryChangeDetails,
  goalElapsedPercentage,
  goalPerformance,
  goalProgressPercentage,
  goalTargetSatisfied,
  isGoalCount,
  organizationDateKey,
  type GoalHistoryEntry,
  type GoalRecord,
} from "../lib/goals.ts";

const source = (path: string) => readFileSync(path, "utf8");
const migrationPath = "supabase/migrations/20261004130000_dm3oi_performance_goals.sql";
const migration = source(migrationPath);

function sqlFunction(name: string) {
  const body = migration.match(
    new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`),
  )?.[0];
  assert.ok(body, `Expected SQL function ${name}`);
  return body;
}

const goal = (value: Partial<GoalRecord> = {}): GoalRecord => ({
  id: "goal-1",
  organization_id: "org-1",
  goal_number: "GOAL-000001",
  title: "Complete filing work",
  description: "Complete the planned Case volume.",
  metric_label: "Cases completed",
  ownership_scope: "ORGANIZATION",
  owner_user_id: null,
  owner_display_name: null,
  measurement_direction: "AT_LEAST",
  unit: "COUNT",
  currency_code: null,
  target_value: "100.0000",
  baseline_value: "0.0000",
  period_kind: "CUSTOM",
  period_start: "2026-10-01",
  period_end: "2026-10-31",
  lifecycle_status: "ACTIVE",
  revision: 1,
  created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-01T12:00:00Z",
  completed_at: null,
  cancelled_at: null,
  current_actual: "50.0000",
  current_as_of_date: "2026-10-15",
  current_progress_entry_id: "progress-1",
  ...value,
});

test("Goals migration creates the manual-only tenant schema without delete or system RPCs", () => {
  for (const table of ["organization_goal_number_counters", "goals", "goal_progress_entries", "goal_history"])
    assert.match(migration, new RegExp(`create table public\\.${table}`));
  assert.match(migration, /progress_source text not null default 'MANUAL' check\(progress_source='MANUAL'\)/);
  assert.doesNotMatch(migration, /get_system_goal_actual|SYSTEM_DERIVED|system metric/i);
  assert.doesNotMatch(source("lib/data/goal-actions.ts"), /deleteGoal|\.delete\(/);
});

test("Goal lifecycle transitions are exact, terminal, revision locked, and never automatic", () => {
  assert.match(migration, /action_name='ACTIVATE' and item\.lifecycle_status<>'DRAFT'/);
  assert.match(migration, /action_name='COMPLETE' and item\.lifecycle_status<>'ACTIVE'/);
  assert.match(migration, /action_name='CANCEL' and item\.lifecycle_status not in \('DRAFT','ACTIVE'\)/);
  assert.match(migration, /for update;[\s\S]*expected_revision[\s\S]*item\.revision<>expected_revision/);
  assert.match(migration, /revision=revision\+1/);
  assert.doesNotMatch(migration, /pg_cron|cron\.|schedule\(|realtime|setInterval|setTimeout/);
});

test("measurement directions compare exact scaled decimal values", () => {
  assert.equal(goalTargetSatisfied("AT_LEAST", "10.0000", "10"), true);
  assert.equal(goalTargetSatisfied("AT_LEAST", "9.9999", "10"), false);
  assert.equal(goalTargetSatisfied("AT_MOST", "4.25", "5"), true);
  assert.equal(goalTargetSatisfied("AT_MOST", "5.0001", "5"), false);
  assert.equal(goalTargetSatisfied("EXACT", "1.2300", "1.23"), true);
});

test("baseline progress is clamped and unavailable for meaningless paths", () => {
  assert.equal(goalProgressPercentage(goal({ current_actual: "50" })), 50);
  assert.equal(goalProgressPercentage(goal({ current_actual: "150" })), 100);
  assert.equal(goalProgressPercentage(goal({ current_actual: "-10" })), 0);
  assert.equal(goalProgressPercentage(goal({ baseline_value: null })), null);
  assert.equal(goalProgressPercentage(goal({ baseline_value: "100", target_value: "50" })), null);
  assert.equal(goalProgressPercentage(goal({ measurement_direction: "AT_MOST", baseline_value: "20", target_value: "10", current_actual: "15" })), 50);
  assert.equal(goalProgressPercentage(goal({ measurement_direction: "EXACT", baseline_value: "0", target_value: "10", current_actual: "5" })), 50);
});

test("performance stays separate from lifecycle and follows period semantics", () => {
  const during = new Date("2026-10-15T16:00:00Z");
  assert.equal(goalPerformance(goal({ lifecycle_status: "CANCELLED" }), "UTC", during), null);
  assert.equal(goalPerformance(goal({ lifecycle_status: "DRAFT" }), "UTC", during), "NOT_STARTED");
  assert.equal(goalPerformance(goal(), "UTC", new Date("2026-09-30T16:00:00Z")), "NOT_STARTED");
  assert.equal(goalPerformance(goal({ current_actual: null }), "UTC", during), "NOT_STARTED");
  assert.equal(goalPerformance(goal({ current_actual: "100" }), "UTC", during), "ON_TRACK");
  assert.equal(goalPerformance(goal({ current_actual: "5" }), "UTC", during), "AT_RISK");
  assert.equal(goalPerformance(goal({ current_actual: "100" }), "UTC", new Date("2026-10-31T12:00:00Z")), "ON_TRACK");
  assert.equal(goalPerformance(goal({ current_actual: "100" }), "UTC", new Date("2026-11-01T12:00:00Z")), "ACHIEVED");
  assert.equal(goalPerformance(goal({ current_actual: "99" }), "UTC", new Date("2026-11-01T12:00:00Z")), "MISSED");
  assert.equal(goalPerformance(goal({ current_actual: "100" }), "UTC", new Date("2026-11-01T12:00:00Z")), "ACHIEVED");
  assert.equal(goalPerformance(goal({ current_actual: null }), "UTC", new Date("2026-11-01T12:00:00Z")), "MISSED");
  assert.equal(goalPerformance(goal({ lifecycle_status: "COMPLETED", current_actual: "90" }), "UTC", during), "MISSED");
});

test("elapsed pace and today use organization-local inclusive dates", () => {
  assert.equal(organizationDateKey(new Date("2026-10-02T02:00:00Z"), "America/New_York"), "2026-10-01");
  assert.equal(organizationDateKey(new Date("2026-10-02T02:00:00Z"), "UTC"), "2026-10-02");
  assert.equal(goalElapsedPercentage(goal(), "2026-10-01"), 100 / 31);
  assert.equal(goalElapsedPercentage(goal(), "2026-10-31"), 100);
});

test("permission defaults and configurable non-escalation include all three Goal capabilities", () => {
  const permissions = source("lib/auth/permissions.ts");
  const accessPage = source("app/settings/user-access/page.tsx");
  const actions = source("lib/data/organization-permission-actions.ts");
  for (const capability of ["VIEW_GOALS", "MANAGE_GOALS", "UPDATE_GOAL_PROGRESS"]) {
    assert.match(permissions, new RegExp(`"${capability}"`));
    assert.match(migration, new RegExp(`'${capability}'`));
  }
  assert.match(permissions, /staffRead:[\s\S]*/i);
  assert.match(permissions, /const manager:[\s\S]*"UPDATE_GOAL_PROGRESS"/);
  assert.match(permissions, /const organizationAdmin:[\s\S]*"MANAGE_GOALS"/);
  assert.match(accessPage, /Goals[\s\S]*VIEW_GOALS/);
  assert.match(accessPage, /Goal management[\s\S]*MANAGE_GOALS/);
  assert.match(actions, /if\(allowed&&!hasPermission\(access,permission\)\)/);
});

test("individual Goal privacy and progress scope are enforced in SECURITY DEFINER RPCs", () => {
  assert.match(migration, /target_goal\.ownership_scope='ORGANIZATION'[\s\S]*target_goal\.owner_user_id=target_actor[\s\S]*'MANAGE_GOALS'/);
  assert.match(migration, /'UPDATE_GOAL_PROGRESS'[\s\S]*item\.ownership_scope='ORGANIZATION' or item\.owner_user_id=actor/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /auth\.uid\(\)/);
});

test("SUPER_ADMIN reads require a bounded active organization argument", () => {
  assert.match(migration, /create or replace function public\.get_goals\([\s\S]*target_organization_id uuid/);
  assert.match(migration, /organization\.id=target_organization_id[\s\S]*organization\.status='ACTIVE'/);
  assert.doesNotMatch(migration, /grant select on table public\.goals to authenticated/);
  assert.match(source("lib/data/goals-repository.ts"), /target_organization_id: organizationId/);
});

test("progress is immutable, corrected by supersession, and selected deterministically", () => {
  const recordProgressFunction =
    migration.match(
      /create or replace function public\.record_goal_progress\([\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
  assert.match(migration, /create unique index goal_progress_one_correction_idx/);
  assert.match(migration, /supersedes_entry_id/);
  assert.match(migration, /order by progress\.as_of_date desc,progress\.created_at desc,progress\.id desc/);
  assert.match(recordProgressFunction, /insert into public\.goal_progress_entries/);
  assert.doesNotMatch(
    recordProgressFunction,
    /update public\.goal_progress_entries|delete from public\.goal_progress_entries/,
  );
  assert.match(migration, /revoke all privileges on table public\.goal_progress_entries from public,anon,authenticated,service_role/);
});

test("progress correction chains retain A and B as superseded while C is the effective leaf", () => {
  const progress = sqlFunction("record_goal_progress");
  const reads = sqlFunction("get_goals");
  assert.match(migration, /check\(id is distinct from supersedes_entry_id\)/);
  assert.match(migration, /create unique index goal_progress_one_correction_idx[\s\S]*on public\.goal_progress_entries\(supersedes_entry_id\)/);
  assert.match(progress, /previous\.id=target_supersedes_entry_id[\s\S]*previous\.organization_id=item\.organization_id[\s\S]*previous\.goal_id=item\.id/);
  assert.match(progress, /not exists\([\s\S]*correction\.supersedes_entry_id=previous\.id/);
  assert.match(reads, /not exists\([\s\S]*correction\.supersedes_entry_id=progress\.id[\s\S]*order by progress\.as_of_date desc,progress\.created_at desc,progress\.id desc/);
});

test("RLS, narrow grants, and platform actor masking are explicit", () => {
  for (const table of ["goals", "goal_progress_entries", "goal_history"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.doesNotMatch(migration, /grant execute[^;]+to anon/);
  assert.match(migration, /when public\.is_super_admin\(target_actor\) then 'DM3Oi Sys Support'/);
  assert.match(migration, /case when history\.actor_kind='PLATFORM_SUPPORT' then null else history\.actor_user_id end/);
});

test("service_role is revoked from every Goal table before its one narrow dependency grant", () => {
  const tables = ["organization_goal_number_counters", "goals", "goal_progress_entries", "goal_history"];
  for (const table of tables) {
    assert.match(
      migration,
      new RegExp(`revoke all privileges on table public\\.${table} from public,anon,authenticated,service_role;`),
    );
  }
  const serviceRoleGrants = migration.match(/grant[^;]+to service_role;/g) ?? [];
  assert.deepEqual(serviceRoleGrants, [
    "grant select(id,organization_id,owner_user_id) on table public.goals to service_role;",
  ]);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete)[^;]+service_role/i);
});

test("reset and permanent deletion remove Goal dependencies in explicit order", () => {
  for (const prefix of ["reset_organization", "permanently_delete_organization"]) assert.match(migration, new RegExp(prefix));
  const progressIndex = migration.indexOf("delete from public.goal_progress_entries");
  const historyIndex = migration.indexOf("delete from public.goal_history", progressIndex);
  const goalIndex = migration.indexOf("delete from public.goals", historyIndex);
  const counterIndex = migration.indexOf("delete from public.organization_goal_number_counters", goalIndex);
  assert.ok(progressIndex >= 0 && progressIndex < historyIndex && historyIndex < goalIndex && goalIndex < counterIndex);
  assert.match(migration, /platform_organization_reset_audit[\s\S]*deleted_counts=deleted_counts\|\|goal_counts/);
  assert.match(migration, /platform_organization_deletion_audit[\s\S]*deleted_counts=deleted_counts\|\|goal_counts/);
});

test("reset and permanent deletion lock the target organization before Goal cleanup", () => {
  for (const name of [
    "reset_organization_company_and_users_without_email_deliveries",
    "permanently_delete_organization_without_email_deliveries",
  ]) {
    const body = sqlFunction(name);
    const previewIndex = body.indexOf("perform public.preview_");
    const lockIndex = body.indexOf("from public.organizations organization");
    const forUpdateIndex = body.indexOf("for update", lockIndex);
    const cleanupIndex = body.indexOf("delete from public.goal_progress_entries");
    assert.ok(previewIndex >= 0 && previewIndex < lockIndex);
    assert.ok(lockIndex < forUpdateIndex && forUpdateIndex < cleanupIndex);
  }
});

test("Goal wrappers preserve the latest analytics-aware reset and delete implementations", () => {
  assert.match(
    source("supabase/migrations/20261003101000_dm3oi_reset_preserves_platform_analytics.sql"),
    /create or replace function public\.reset_organization_company_and_users_without_email_deliveries[\s\S]*platform_organization_reset_audit/,
  );
  assert.match(
    source("supabase/migrations/20261003102000_dm3oi_permanent_delete_preserves_platform_analytics.sql"),
    /create or replace function public\.permanently_delete_organization_without_email_deliveries[\s\S]*platform_organization_deletion_audit/,
  );
  assert.match(migration, /alter function public\.reset_organization_company_and_users_without_email_deliveries[\s\S]*rename to reset_org_company_users_without_email_deliveries_and_goals/);
  assert.match(migration, /result:=public\.reset_org_company_users_without_email_deliveries_and_goals\(/);
  assert.match(migration, /alter function public\.permanently_delete_organization_without_email_deliveries[\s\S]*rename to permanent_delete_org_without_email_deliveries_and_goals/);
  assert.match(migration, /result:=public\.permanent_delete_org_without_email_deliveries_and_goals\(/);
});

test("CURRENCY rejects null and malformed codes at the database boundary", () => {
  const save = sqlFunction("save_goal");
  assert.match(migration, /unit='CURRENCY' and currency_code is not null and currency_code ~ '\^\[A-Z\]\{3\}\$'/);
  assert.match(save, /normalized_unit='CURRENCY' and \([\s\S]*normalized_currency is null or normalized_currency !~ '\^\[A-Z\]\{3\}\$'/);
});

test("all measurement semantics are immutable after any progress exists", () => {
  const save = sqlFunction("save_goal");
  const immutableChecks = [
    "item.metric_label is distinct from btrim(target_metric_label)",
    "item.measurement_direction is distinct from normalized_direction",
    "item.unit is distinct from normalized_unit",
    "item.currency_code is distinct from normalized_currency",
    "item.baseline_value is distinct from target_baseline_value",
    "item.target_value is distinct from target_target_value",
    "item.period_kind is distinct from normalized_period",
    "item.period_start is distinct from target_period_start",
    "item.period_end is distinct from target_period_end",
  ];
  assert.match(save, /if exists\([\s\S]*from public\.goal_progress_entries entry where entry\.goal_id=item\.id/);
  for (const check of immutableChecks) assert.ok(save.includes(check), `Missing immutable check: ${check}`);
  assert.doesNotMatch(save, /item\.title is distinct from btrim\(target_title\)[\s\S]*goal measurement cannot change/);
  assert.doesNotMatch(save, /item\.owner_user_id is distinct from target_owner_user_id[\s\S]*goal measurement cannot change/);
});

test("record_goal_progress hides existence and authorizes before Goal state disclosure", () => {
  const progress = sqlFunction("record_goal_progress");
  const missingIndex = progress.indexOf("if not found then raise exception 'not authorized'");
  const authorizationIndex = progress.indexOf("if not (", missingIndex);
  const revisionIndex = progress.indexOf("if expected_revision is null", authorizationIndex);
  const lifecycleIndex = progress.indexOf("if item.lifecycle_status<>'ACTIVE'", revisionIndex);
  assert.ok(missingIndex >= 0 && missingIndex < authorizationIndex);
  assert.ok(authorizationIndex < revisionIndex && authorizationIndex < lifecycleIndex);
  assert.doesNotMatch(progress, /raise exception 'goal not found'/);
});

test("all mutation RPCs lock, revision-check, and increment atomically", () => {
  for (const name of ["save_goal", "record_goal_progress", "transition_goal"]) {
    const body = sqlFunction(name);
    const lockIndex = body.indexOf("for update;");
    const revisionCheckIndex = body.indexOf("expected_revision is null", lockIndex);
    const incrementIndex = body.indexOf("revision=revision+1", revisionCheckIndex);
    assert.ok(lockIndex >= 0 && lockIndex < revisionCheckIndex, `${name} must lock before checking revision`);
    assert.ok(revisionCheckIndex < incrementIndex, `${name} must increment after checking revision`);
  }
});

test("COUNT values are integral at schema, save, progress, and application boundaries", () => {
  const save = sqlFunction("save_goal");
  const progress = sqlFunction("record_goal_progress");
  assert.match(migration, /unit<>'COUNT'[\s\S]*target_value=trunc\(target_value\)[\s\S]*baseline_value=trunc\(baseline_value\)/);
  assert.match(save, /normalized_unit='COUNT'[\s\S]*target_target_value<>trunc\(target_target_value\)[\s\S]*target_baseline_value<>trunc\(target_baseline_value\)/);
  assert.match(progress, /item\.unit='COUNT' and target_actual_value<>trunc\(target_actual_value\)/);
  assert.equal(isGoalCount("9007199254740991.0000"), true);
  assert.equal(isGoalCount("12.0001"), false);
  assert.equal(formatGoalValue("9999999999999999.0000", "COUNT", null), "9,999,999,999,999,999");
  assert.throws(() => formatGoalValue("1.5000", "COUNT", null), /whole numbers/);
});

test("Goal value formatting preserves numeric(20,4) precision without JavaScript Number", () => {
  assert.equal(formatGoalValue("9999999999999999.9999", "NUMBER", null), "9,999,999,999,999,999.9999");
  assert.equal(formatGoalValue("1234567890123456.1250", "CURRENCY", "USD"), "$1,234,567,890,123,456.13");
  assert.equal(formatGoalValue("12.3400", "PERCENT", null), "12.34%");
  assert.doesNotMatch(source("lib/goals.ts"), /const numeric = Number\(value\)/);
  assert.doesNotMatch(source("lib/data/goal-actions.ts"), /Number\(target(?:Target|Baseline)?Value\)/);
});

test("hidden individual Goals stay owner-or-manager scoped throughout the register", () => {
  const canView = sqlFunction("can_view_goal");
  const reads = sqlFunction("get_goals");
  const register = source("app/goals/page.tsx");
  assert.match(canView, /target_goal\.ownership_scope='ORGANIZATION'[\s\S]*target_goal\.owner_user_id=target_actor[\s\S]*'MANAGE_GOALS'/);
  assert.match(reads, /public\.can_view_goal\(goal,actor\)/);
  assert.match(register, /filterGoals\(data\.goals/);
  assert.match(register, /data\.goals\.flatMap/);
  assert.match(register, /<b>\{goals\.length\}<\/b> Goals/);
  assert.doesNotMatch(register, /organization_members|profiles/);
});

test("Goal register polish filters inactive owners and distinguishes empty states", () => {
  const repository = source("lib/data/goals-repository.ts");
  const register = source("app/goals/page.tsx");
  assert.match(repository, /\.from\("profiles"\)[\s\S]*\.eq\("is_active", true\)/);
  assert.match(register, /data\.goals\.length \? "No Goals match the current filters\." : "No Goals have been created\."/);
});

test("Goal history presents bounded changed values for definition target and period events", () => {
  const entry: GoalHistoryEntry = {
    id: "history-1",
    event_type: "TARGET_CHANGED",
    before_data: { targetValue: "10.0000", baselineValue: "0.0000" },
    after_data: { targetValue: "20.0000", baselineValue: "5.0000" },
    prior_owner_display_name: null,
    new_owner_display_name: null,
    note: null,
    actor_user_id: "user-1",
    actor_display_name: "Avery Owner",
    actor_kind: "ORGANIZATION_MEMBER",
    created_at: "2026-10-04T12:00:00Z",
  };
  assert.deepEqual(goalHistoryChangeDetails(entry), [
    "Target: 10.0000 → 20.0000",
    "Baseline: 0.0000 → 5.0000",
  ]);
  assert.match(source("app/goals/[goalId]/page.tsx"), /goalHistoryChangeDetails\(entry\)/);
});

test("Goals block permanent identity deletion but never membership revocation", () => {
  assert.match(source("lib/data/platform-user-deletion.ts"), /Individual Goal responsibility exists\.[\s\S]*\.from\("goals"\)[\s\S]*owner_user_id/);
  assert.match(source("lib/data/platform-user-global-deletion.ts"), /Individual Goal responsibility exists\.[\s\S]*\.from\("goals"\)[\s\S]*owner_user_id/);
  assert.doesNotMatch(migration, /ACTIVE_OPERATIONAL_RESPONSIBILITY[\s\S]*goals|goals[\s\S]*ACTIVE_OPERATIONAL_RESPONSIBILITY/);
  assert.doesNotMatch(source("lib/data/organization-user-actions.ts"), /GOALS/);
});

test("register filtering searches bounded visible Goal content", () => {
  const rows = [
    goal(),
    goal({ id: "goal-2", goal_number: "GOAL-000002", title: "Retention", description: "Keep customers", ownership_scope: "INDIVIDUAL", owner_user_id: "user-2", owner_display_name: "Avery Owner" }),
  ];
  assert.equal(filterGoals(rows, { q: "goal-000002", lifecycle: "", performance: "", scope: "", owner: "", period: "" }, "UTC").length, 1);
  assert.equal(filterGoals(rows, { q: "avery", lifecycle: "", performance: "", scope: "", owner: "", period: "" }, "UTC").length, 1);
  assert.equal(filterGoals(rows, { q: "", lifecycle: "", performance: "", scope: "INDIVIDUAL", owner: "user-2", period: "CUSTOM" }, "UTC").length, 1);
});

test("Goals navigation, mobile visibility, responsive UI, and zero-background-network policy are preserved", () => {
  const navigation = source("lib/application-navigation.ts");
  const shell = source("components/layout/app-shell.tsx");
  const css = source("app/globals.css");
  assert.ok(navigation.indexOf('href: "/tasks"') < navigation.indexOf('href: "/goals"'));
  assert.ok(navigation.indexOf('href: "/goals"') < navigation.indexOf('href: "/reports"'));
  assert.match(navigation, /"\/goals"/);
  assert.match(shell, /authorizedOrganizationNavigation/);
  assert.match(css, /@media\(max-width:700px\)[^{]*\{[^}]*goal-detail-facts/);
  for (const file of ["lib/data/goals-repository.ts", "app/goals/page.tsx", "app/goals/[goalId]/page.tsx"]) {
    assert.doesNotMatch(source(file), /setInterval|setTimeout|realtime|channel\(|subscribe\(/i);
  }
});
