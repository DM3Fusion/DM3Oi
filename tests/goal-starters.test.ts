import assert from "node:assert/strict";
import test from "node:test";

import {
  goalAnnualPeriod,
  goalMonthlyPeriod,
  goalStarterPreset,
  goalStarterPresets,
  goalTaxSeasonPeriod,
  organizationGoalStarterKeys,
} from "../lib/goals.ts";

test("four organization starter keys are stable", () => {
  assert.deepEqual(
    organizationGoalStarterKeys,
    [
      "TAX_SEASON_RETURNS",
      "OVERDUE_TASKS",
      "SERVICE_REQUEST_RESOLUTION",
      "ACTIVE_CUSTOMER_GROWTH",
    ],
  );
});

test("starter definitions retain approved measurement semantics", () => {
  const now =
    new Date("2026-03-15T12:00:00Z");

  const tax = goalStarterPreset(
    "TAX_SEASON_RETURNS",
    "UTC",
    now,
  );
  assert.equal(
    tax.title,
    "Complete 150 returns by April 10",
  );
  assert.equal(
    tax.measurementDirection,
    "AT_LEAST",
  );
  assert.equal(tax.unit, "COUNT");
  assert.equal(tax.targetValue, "150");
  assert.equal(tax.baselineValue, "0");

  const overdue = goalStarterPreset(
    "OVERDUE_TASKS",
    "UTC",
    now,
  );
  assert.equal(
    overdue.title,
    "Keep overdue Tasks below 10",
  );
  assert.equal(
    overdue.measurementDirection,
    "AT_MOST",
  );
  assert.equal(overdue.targetValue, "9");
  assert.equal(overdue.baselineValue, null);

  const service = goalStarterPreset(
    "SERVICE_REQUEST_RESOLUTION",
    "UTC",
    now,
  );
  assert.equal(service.unit, "PERCENT");
  assert.equal(service.targetValue, "95");

  const growth = goalStarterPreset(
    "ACTIVE_CUSTOMER_GROWTH",
    "UTC",
    now,
  );
  assert.equal(growth.baselineValue, "400");
  assert.equal(growth.targetValue, "450");
});

test("tax season uses current year through April 10 inclusive", () => {
  assert.deepEqual(
    goalTaxSeasonPeriod(
      "UTC",
      new Date("2026-04-09T12:00:00Z"),
    ),
    {
      periodStart: "2026-01-01",
      periodEnd: "2026-04-10",
    },
  );

  assert.deepEqual(
    goalTaxSeasonPeriod(
      "UTC",
      new Date("2026-04-10T23:59:00Z"),
    ),
    {
      periodStart: "2026-01-01",
      periodEnd: "2026-04-10",
    },
  );
});

test("tax season rolls to next year after April 10", () => {
  assert.deepEqual(
    goalTaxSeasonPeriod(
      "UTC",
      new Date("2026-04-11T00:01:00Z"),
    ),
    {
      periodStart: "2027-01-01",
      periodEnd: "2027-04-10",
    },
  );
});

test("starter periods honor organization-local calendar date", () => {
  const instant =
    new Date("2026-04-11T02:00:00Z");

  assert.deepEqual(
    goalTaxSeasonPeriod(
      "America/New_York",
      instant,
    ),
    {
      periodStart: "2026-01-01",
      periodEnd: "2026-04-10",
    },
  );

  assert.deepEqual(
    goalTaxSeasonPeriod(
      "UTC",
      instant,
    ),
    {
      periodStart: "2027-01-01",
      periodEnd: "2027-04-10",
    },
  );
});

test("annual starter uses organization-local calendar year", () => {
  assert.deepEqual(
    goalAnnualPeriod(
      "America/New_York",
      new Date("2026-12-31T20:00:00Z"),
    ),
    {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    },
  );
});

test("monthly individual starter uses full organization-local month", () => {
  assert.deepEqual(
    goalMonthlyPeriod(
      "UTC",
      new Date("2028-02-15T12:00:00Z"),
    ),
    {
      periodStart: "2028-02-01",
      periodEnd: "2028-02-29",
    },
  );

  const preset = goalStarterPreset(
    "MONTHLY_ASSIGNED_CASES",
    "UTC",
    new Date("2026-10-04T12:00:00Z"),
  );

  assert.equal(
    preset.ownershipScope,
    "INDIVIDUAL",
  );
  assert.equal(preset.targetValue, "40");
  assert.equal(preset.baselineValue, "0");
  assert.equal(
    preset.periodStart,
    "2026-10-01",
  );
  assert.equal(
    preset.periodEnd,
    "2026-10-31",
  );
});

test("starter list contains four organization examples plus one individual template", () => {
  const presets = goalStarterPresets(
    "UTC",
    new Date("2026-03-15T12:00:00Z"),
  );

  assert.equal(presets.length, 5);
  assert.equal(
    presets.filter(
      (item) =>
        item.ownershipScope ===
        "ORGANIZATION",
    ).length,
    4,
  );
  assert.equal(
    presets.filter(
      (item) =>
        item.ownershipScope ===
        "INDIVIDUAL",
    ).length,
    1,
  );
});

import { readFileSync } from "node:fs";

const starterSource = (path: string) =>
  readFileSync(path, "utf8");

const starterMigration = starterSource(
  "supabase/migrations/20261004140000_dm3oi_goal_starters.sql",
);

test("starter migration uses durable organization-scoped starter identity", () => {
  assert.match(
    starterMigration,
    /add column starter_key text/,
  );

  assert.match(
    starterMigration,
    /create unique index goals_organization_starter_key_uidx[\s\S]*organization_id,starter_key[\s\S]*where starter_key is not null/,
  );

  assert.doesNotMatch(
    starterMigration,
    /where existing\.title\s*=/,
  );
});

test("starter migration seeds exactly four organization definitions and never the individual starter", () => {
  for (const key of [
    "TAX_SEASON_RETURNS",
    "OVERDUE_TASKS",
    "SERVICE_REQUEST_RESOLUTION",
    "ACTIVE_CUSTOMER_GROWTH",
  ]) {
    assert.match(
      starterMigration,
      new RegExp(`'${key}'`),
    );
  }

  assert.doesNotMatch(
    starterMigration,
    /MONTHLY_ASSIGNED_CASES/,
  );

  assert.match(
    starterMigration,
    /'ORGANIZATION'/,
  );

  assert.match(
    starterMigration,
    /'DRAFT'/,
  );
});

test("starter seeding is idempotent serialized and keeps atomic Goal numbering", () => {
  assert.match(
    starterMigration,
    /from public\.organizations organization[\s\S]*for update/,
  );

  assert.match(
    starterMigration,
    /if not exists \([\s\S]*existing\.starter_key=[\s\S]*starter\.starter_key/,
  );

  assert.match(
    starterMigration,
    /public\.next_goal_number\([\s\S]*target_organization_id/,
  );

  assert.match(
    starterMigration,
    /create unique index goals_organization_starter_key_uidx/,
  );
});

test("existing and future active organizations receive starter Goals centrally", () => {
  assert.match(
    starterMigration,
    /create trigger organizations_seed_goal_starters[\s\S]*after insert or update of status[\s\S]*on public\.organizations/,
  );

  assert.match(
    starterMigration,
    /new\.status='ACTIVE'/,
  );

  assert.match(
    starterMigration,
    /where organization\.status='ACTIVE'[\s\S]*perform public\.seed_organization_goal_starters/,
  );
});

test("automatically seeded Goal history uses truthful platform-safe attribution", () => {
  assert.match(
    starterMigration,
    /actor_user_id,[\s\S]*actor_display_name,[\s\S]*actor_kind/,
  );

  assert.match(
    starterMigration,
    /null,[\s\S]*'DM3Oi Sys Support',[\s\S]*'PLATFORM_SUPPORT'/,
  );

  assert.doesNotMatch(
    starterMigration,
    /'ORGANIZATION_MEMBER'[\s\S]{0,200}Starter Goal created/,
  );
});

test("starter seeder is not directly executable by application roles", () => {
  assert.match(
    starterMigration,
    /revoke all[\s\S]*seed_organization_goal_starters\(uuid\)[\s\S]*from public,anon,authenticated,service_role/,
  );

  assert.doesNotMatch(
    starterMigration,
    /grant execute[\s\S]*seed_organization_goal_starters/,
  );
});

test("New Goal starter selection continues through the existing save action", () => {
  const page = starterSource(
    "app/goals/new/page.tsx",
  );
  const form = starterSource(
    "components/goals/goal-form.tsx",
  );

  assert.match(page, /goalStarterPresets/);
  assert.match(
    form,
    /Start with a template/,
  );
  assert.match(form, /Blank Goal/);
  assert.match(
    form,
    /action=\{saveGoalAction\}/,
  );
  assert.doesNotMatch(
    form,
    /saveStarterGoal|createStarterGoal/,
  );

  assert.match(
    form,
    /Select owner/,
  );
});

test("Dashboard Goal summary uses authorized get_goals data and existing performance semantics", () => {
  const repository = starterSource(
    "lib/data/goals-repository.ts",
  );

  assert.match(
    repository,
    /export async function getGoalDashboardSummary/,
  );

  assert.match(
    repository,
    /hasPermission\(access, "VIEW_GOALS"\)/,
  );

  assert.match(
    repository,
    /rpc\.rpc\("get_goals"/,
  );

  assert.match(
    repository,
    /goalPerformance\(goal, timezone\)/,
  );

  assert.doesNotMatch(
    repository,
    /\.from\("goals"\)[\s\S]{0,500}getGoalDashboardSummary/,
  );
});

test("Dashboard renders four centered Goal KPI cards before Rule Activity", () => {
  const component = starterSource(
    "components/dashboard/operational-intelligence.tsx",
  );
  const css = starterSource(
    "app/globals.css",
  );

  for (const label of [
    "Active Goals",
    "Achieved",
    "At Risk",
    "Missed",
  ]) {
    assert.match(
      component,
      new RegExp(`label="${label}"`),
    );
  }

  const goalHeading =
    component.indexOf("Performance Goals");
  const ruleActivity =
    component.indexOf("Rule Activity");

  assert.ok(
    goalHeading >= 0 &&
      goalHeading < ruleActivity,
  );

  assert.match(
    component,
    /className="intelligence-kpis goal-performance-kpis"/,
  );

  assert.match(
    css,
    /\.intelligence-kpi\{align-items:center;text-align:center\}/,
  );

  assert.match(
    css,
    /@media\(max-width:760px\)\{\.intelligence-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
  );
});

test("Goal KPI section is permission-aware and has no background refresh behavior", () => {
  const page = starterSource("app/page.tsx");
  const repository = starterSource(
    "lib/data/goals-repository.ts",
  );
  const dashboard = starterSource(
    "components/dashboard/dashboard.tsx",
  );
  const component = starterSource(
    "components/dashboard/operational-intelligence.tsx",
  );

  assert.match(
    page,
    /getGoalDashboardSummary\(\)/,
  );

  assert.match(
    repository,
    /return null/,
  );

  assert.match(
    component,
    /\{goalSummary \? \(/,
  );

  assert.match(
    dashboard,
    /goalSummary=\{goalSummary\}/,
  );

  for (const text of [
    page,
    repository,
    dashboard,
    component,
  ]) {
    assert.doesNotMatch(
      text,
      /setInterval|setTimeout|realtime|channel\(|subscribe\(/i,
    );
  }
});

test("Owner/Admin How-to Guide explains starter Goal behavior without changing Staff content", () => {
  const guide = starterSource(
    "lib/how-to-guide-content.ts",
  );

  const ownerStart =
    guide.indexOf(
      'const ownerAdminContent',
    );
  const staffStart =
    guide.indexOf('const staffContent');

  const ownerGuide = guide.slice(
    ownerStart,
    staffStart,
  );
  const staffGuide =
    guide.slice(staffStart);

  assert.match(
    ownerGuide,
    /key: "goals", title: "Goals"/,
  );

  assert.match(
    ownerGuide,
    /Starter Goals are editable examples and begin as Draft/,
  );

  assert.match(
    ownerGuide,
    /Goal progress is entered manually in this release/,
  );

  assert.match(
    ownerGuide,
    /require an explicit active organization user/,
  );

  assert.doesNotMatch(
    staffGuide,
    /Starter Goals are editable examples/,
  );
});
