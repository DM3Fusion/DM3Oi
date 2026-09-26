import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getEffectiveOrganizationPermissions,
  hasPermission,
  roleHasDefaultPermission,
  type ApplicationRole,
  type OrganizationPermissionOverride,
} from "../lib/auth/permissions.ts";

const migration = readFileSync(
  "supabase/migrations/20260907143000_dm3oi_rules_data_foundation.sql",
  "utf8",
);

test("Rules permissions use the centralized configurable permission model", () => {
  for (const role of ["BUSINESS_OWNER", "BUSINESS_ADMIN"] as const) {
    assert.equal(roleHasDefaultPermission(role, "VIEW_RULES"), true);
    assert.equal(roleHasDefaultPermission(role, "MANAGE_RULES"), true);
  }
  assert.equal(roleHasDefaultPermission("STAFF_MANAGER", "VIEW_RULES"), true);
  assert.equal(roleHasDefaultPermission("STAFF_MANAGER", "MANAGE_RULES"), false);
  assert.equal(roleHasDefaultPermission("STAFF_USER", "VIEW_RULES"), false);
  assert.equal(roleHasDefaultPermission("STAFF_USER", "MANAGE_RULES"), false);

  const managerGrant: OrganizationPermissionOverride[] = [
    { role: "STAFF_MANAGER", permission: "MANAGE_RULES", isAllowed: true },
  ];
  assert.equal(
    getEffectiveOrganizationPermissions("STAFF_MANAGER", managerGrant).has(
      "MANAGE_RULES",
    ),
    true,
  );
  const staffGrant: OrganizationPermissionOverride[] = [
    { role: "STAFF_USER", permission: "VIEW_RULES", isAllowed: true },
    { role: "STAFF_USER", permission: "MANAGE_RULES", isAllowed: true },
  ];
  assert.equal(
    getEffectiveOrganizationPermissions("STAFF_USER", staffGrant).has(
      "VIEW_RULES",
    ),
    true,
  );
  assert.equal(
    getEffectiveOrganizationPermissions("STAFF_USER", staffGrant).has(
      "MANAGE_RULES",
    ),
    true,
  );
  const adminDeny: OrganizationPermissionOverride[] = [
    { role: "BUSINESS_ADMIN", permission: "MANAGE_RULES", isAllowed: false },
  ];
  assert.equal(
    getEffectiveOrganizationPermissions("BUSINESS_ADMIN", adminDeny).has(
      "MANAGE_RULES",
    ),
    false,
  );
  const accessPage = readFileSync("app/settings/user-access/page.tsx", "utf8");
  assert.match(accessPage, /label: "Rules", permission: "VIEW_RULES"/);
  assert.match(
    accessPage,
    /label: "Rule management", permission: "MANAGE_RULES"/,
  );
});

test("Rules access still requires internal active-organization context", () => {
  const context = (role: ApplicationRole) => ({
    isSuperAdmin: role === "SUPER_ADMIN",
    internalAccess: true,
    activeOrganization: { role },
  });
  const portalContext = {
    isSuperAdmin: false,
    internalAccess: false,
    activeOrganization: null,
    customerPortalCount: 1,
  };
  assert.equal(hasPermission(context("SUPER_ADMIN"), "VIEW_RULES"), true);
  assert.equal(
    hasPermission(
      { isSuperAdmin: true, internalAccess: true, activeOrganization: null },
      "VIEW_RULES",
    ),
    false,
  );
  assert.equal(hasPermission(portalContext, "VIEW_RULES"), false);
});

test("Rule condition grammar is closed and response-type compatible", () => {
  assert.match(
    migration,
    /create type public\.rule_condition_operator as enum \(\s*'IS_YES','IS_NO','EQUALS','NOT_EQUALS','CONTAINS','NOT_CONTAINS','IS_ANSWERED','IS_NOT_ANSWERED'\s*\)/,
  );
  assert.match(migration, /source_type<>'YES_NO'/);
  assert.match(migration, /source_type<>'SINGLE_SELECT'/);
  assert.match(migration, /source_type<>'MULTI_SELECT'/);
  assert.match(
    migration,
    /condition_operator in \('IS_ANSWERED','IS_NOT_ANSWERED'\)[\s\S]*condition_option_id is not null/,
  );
  assert.doesNotMatch(
    migration,
    /GREATER_THAN|LESS_THAN|REGEX|TEXT_CONTAINS|AND_GROUP|OR_GROUP/,
  );
});

test("Rule definitions and actions enforce composite tenant references", () => {
  assert.match(
    migration,
    /foreign key \(organization_id,source_question_id\)[\s\S]*question_definitions\(organization_id,id\) on delete restrict/,
  );
  assert.match(
    migration,
    /foreign key \(organization_id,source_question_id,condition_option_id\)[\s\S]*question_options\(organization_id,question_id,id\) on delete restrict/,
  );
  assert.match(
    migration,
    /foreign key \(organization_id,rule_definition_id\)[\s\S]*rule_definitions\(organization_id,id\) on delete restrict/,
  );
  assert.match(
    migration,
    /foreign key \(organization_id,target_question_id\)[\s\S]*question_definitions\(organization_id,id\) on delete restrict/,
  );
  assert.doesNotMatch(migration, /on delete cascade/);
});

test("Option UUIDs survive edits and hidden options remain durable", () => {
  assert.match(
    migration,
    /unique \(organization_id,question_id,id\)/,
  );

  const activationMigration = readFileSync(
    "supabase/migrations/20260926194500_dm3oi_question_option_activation.sql",
    "utf8",
  );
  const page = readFileSync("app/questions/page.tsx", "utf8");
  const editor = readFileSync(
    "components/question-options-editor.tsx",
    "utf8",
  );
  const action = readFileSync("lib/data/question-actions.ts", "utf8");

  assert.match(
    activationMigration,
    /add column if not exists is_active boolean not null default true/,
  );

  assert.match(
    activationMigration,
    /update public\.question_options[\s\S]*option_label=trim\(opt->>'label'\)[\s\S]*is_active=coalesce\(\(opt->>'is_active'\)::boolean,true\)[\s\S]*where id=option_id[\s\S]*question_id=item\.id/,
  );

  assert.match(
    activationMigration,
    /update public\.question_options[\s\S]*set is_active=false[\s\S]*not \(id=any\(seen_option_ids\)\)/,
  );

  assert.doesNotMatch(
    activationMigration,
    /delete from public\.question_options/,
  );

  assert.match(page, /QuestionOptionsEditor/);
  assert.match(editor, /name="optionsJson"/);
  assert.match(editor, /id: option\.id \|\| undefined/);
  assert.match(editor, /is_active: option\.isActive/);

  assert.match(action, /id: option\.id/);
  assert.match(action, /value: option\.value \?\? optionValue\(option\.label\)/);
  assert.match(action, /is_active: option\.is_active/);
});

test("Actions accept only valid question targets or complete task templates", () => {
  assert.match(
    migration,
    /create type public\.rule_action_type as enum \('SHOW_QUESTION','REQUIRE_QUESTION','CREATE_TASK'\)/,
  );
  assert.match(
    migration,
    /action_type in \('SHOW_QUESTION','REQUIRE_QUESTION'\)[\s\S]*target_question_id is not null[\s\S]*task_title is null/,
  );
  assert.match(
    migration,
    /action_type='CREATE_TASK'[\s\S]*target_question_id is null[\s\S]*task_title is not null[\s\S]*task_priority is not null[\s\S]*task_required is not null/,
  );
  assert.match(
    migration,
    /source_question=new\.target_question_id[\s\S]*rule cannot directly target its source question/,
  );
  assert.match(
    migration,
    /a\.target_question_id=new\.source_question_id[\s\S]*rule cannot directly target its source question/,
  );
});

test("Rules RLS uses effective permissions and exposes only safe projections", () => {
  for (const table of ["rule_definitions", "rule_actions"]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
  }
  assert.match(
    migration,
    /rule_definitions_effective_read[\s\S]*has_effective_organization_permission\(organization_id,'VIEW_RULES'\)/,
  );
  assert.match(
    migration,
    /rule_actions_effective_read[\s\S]*has_effective_organization_permission\(organization_id,'VIEW_RULES'\)/,
  );
  assert.match(
    migration,
    /rule_definitions_effective_(?:insert|update|delete)[\s\S]*has_effective_organization_permission\(organization_id,'MANAGE_RULES'\)/,
  );
  assert.match(
    migration,
    /rule_actions_effective_(?:insert|update|delete)[\s\S]*has_effective_organization_permission\(organization_id,'MANAGE_RULES'\)/,
  );
  assert.match(migration, /organization_actor_id\(r\.created_by_user_id\)/);
  assert.match(migration, /organization_actor_label\(r\.created_by_user_id\)/);
  assert.match(
    migration,
    /revoke all on public\.rule_definitions,public\.rule_actions,[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /grant select on public\.organization_rule_definitions,public\.organization_rule_actions to authenticated/,
  );
});
