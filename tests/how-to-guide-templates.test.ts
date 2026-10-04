import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  defaultHowToGuideContent,
  parseHowToGuideContent,
} from "../lib/how-to-guide-content.ts";

const source = (path: string) => readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20261004110000_dm3oi_how_to_guide_templates.sql",
);
const page = source("app/admin/how-to-guides/page.tsx");
const actions = source("app/admin/how-to-guides/actions.ts");
const repository = source("lib/data/how-to-guide-repository.ts");
const ownerRoute = source("app/how-to-guide/page.tsx");
const staffRoute = source("app/staff-how-to-guide/page.tsx");
const navigation = source("lib/application-navigation.ts");

const clone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

test("both default How-to Guides pass bounded application validation", () => {
  assert.equal(
    parseHowToGuideContent(
      "OWNER_ADMIN",
      defaultHowToGuideContent.OWNER_ADMIN,
    ),
    defaultHowToGuideContent.OWNER_ADMIN,
  );

  assert.equal(
    parseHowToGuideContent(
      "STAFF",
      defaultHowToGuideContent.STAFF,
    ),
    defaultHowToGuideContent.STAFF,
  );
});

test("guide validation rejects cross-audience callout types", () => {
  const owner = clone(defaultHowToGuideContent.OWNER_ADMIN);
  owner.sections[0]!.callout = {
    type: "STAFF_BOUNDARY",
    text: "Not allowed here.",
  };

  assert.equal(
    parseHowToGuideContent("OWNER_ADMIN", owner),
    null,
  );

  const staff = clone(defaultHowToGuideContent.STAFF);
  staff.sections[0]!.callout = {
    type: "OWNER_ADMIN",
    text: "Not allowed here.",
  };

  assert.equal(
    parseHowToGuideContent("STAFF", staff),
    null,
  );
});

test("guide validation rejects unknown section and figure keys", () => {
  const section = clone(defaultHowToGuideContent.OWNER_ADMIN);
  section.sections[0]!.key = "platform-operations";

  assert.equal(
    parseHowToGuideContent("OWNER_ADMIN", section),
    null,
  );

  const figure = clone(defaultHowToGuideContent.STAFF);
  figure.sections[2]!.figure_key =
    "business-reach-owner" as typeof figure.sections[2]["figure_key"];

  assert.equal(
    parseHowToGuideContent("STAFF", figure),
    null,
  );
});

test("guide validation rejects HTML-like and oversized text", () => {
  const html = clone(defaultHowToGuideContent.OWNER_ADMIN);
  html.title = "<script>alert(1)</script>";

  assert.equal(
    parseHowToGuideContent("OWNER_ADMIN", html),
    null,
  );

  const oversized = clone(defaultHowToGuideContent.STAFF);
  oversized.intro = "x".repeat(501);

  assert.equal(
    parseHowToGuideContent("STAFF", oversized),
    null,
  );
});

test("SUPER_ADMIN management page and actions independently require SUPER_ADMIN", () => {
  assert.match(page, /await requireSuperAdmin\(\)/);

  assert.ok(
    (actions.match(/await requireSuperAdmin\(\)/g) ?? []).length >= 2,
  );

  assert.match(
    navigation,
    /href: "\/admin\/how-to-guides", label: "How-to Guide Templates"/,
  );
});

test("organization routes authorize before requesting published content", () => {
  const ownerGuard = ownerRoute.indexOf(
    'canAccessOrganizationGuide(access, "/how-to-guide")',
  );
  const ownerLoad = ownerRoute.indexOf(
    'getPublishedHowToGuideForServer("OWNER_ADMIN")',
  );

  const staffGuard = staffRoute.indexOf(
    'canAccessOrganizationGuide(access, "/staff-how-to-guide")',
  );
  const staffLoad = staffRoute.indexOf(
    'getPublishedHowToGuideForServer("STAFF")',
  );

  assert.ok(ownerGuard >= 0 && ownerLoad > ownerGuard);
  assert.ok(staffGuard >= 0 && staffLoad > staffGuard);
});

test("published organization content uses only the service-role RPC and never drafts", () => {
  assert.match(
    repository,
    /createAdminClient\(\)[\s\S]*get_published_how_to_guide_server/,
  );

  const publishedLoader = repository.slice(
    repository.indexOf(
      "export async function getPublishedHowToGuideForServer",
    ),
  );

  assert.doesNotMatch(
    publishedLoader,
    /draft_content|get_how_to_guide_template_for_admin|save_how_to_guide_draft/,
  );

  assert.match(
    publishedLoader,
    /defaultHowToGuideContent\[guideKey\]/,
  );
});

test("migration denies direct table access and narrowly grants RPC execution", () => {
  assert.match(
    migration,
    /alter table public\.how_to_guide_templates enable row level security/,
  );
  assert.match(
    migration,
    /alter table public\.how_to_guide_templates force row level security/,
  );

  assert.match(
    migration,
    /revoke all[\s\S]*on table public\.how_to_guide_templates[\s\S]*from public, anon, authenticated, service_role/,
  );

  assert.match(
    migration,
    /grant execute[\s\S]*get_how_to_guide_template_for_admin\(text\)[\s\S]*to authenticated/,
  );
  assert.match(
    migration,
    /grant execute[\s\S]*save_how_to_guide_draft\(text, jsonb\)[\s\S]*to authenticated/,
  );
  assert.match(
    migration,
    /grant execute[\s\S]*publish_how_to_guide\(text\)[\s\S]*to authenticated/,
  );

  assert.match(
    migration,
    /grant execute[\s\S]*get_published_how_to_guide_server\(text\)[\s\S]*to service_role/,
  );

  assert.doesNotMatch(
    migration,
    /grant execute[\s\S]*get_published_how_to_guide_server\(text\)[\s\S]*to authenticated/,
  );
});

test("admin RPCs enforce SUPER_ADMIN and publishing is atomic", () => {
  for (const functionName of [
    "get_how_to_guide_template_for_admin",
    "save_how_to_guide_draft",
    "publish_how_to_guide",
  ]) {
    const start = migration.indexOf(
      `create or replace function public.${functionName}`,
    );
    assert.ok(start >= 0);

    const next = migration.indexOf(
      "create or replace function public.",
      start + 1,
    );
    const body =
      next === -1
        ? migration.slice(start)
        : migration.slice(start, next);

    assert.match(
      body,
      /actor uuid := auth\.uid\(\)/,
      functionName,
    );
    assert.match(
      body,
      /not public\.is_super_admin\(actor\)/,
      functionName,
    );
  }

  const publish = migration.slice(
    migration.indexOf(
      "create or replace function public.publish_how_to_guide",
    ),
    migration.indexOf(
      "create or replace function public.get_published_how_to_guide_server",
    ),
  );

  assert.match(publish, /for update/);
  assert.match(
    publish,
    /published_content = current_template\.draft_content/,
  );
  assert.match(
    publish,
    /published_revision = published_revision \+ 1/,
  );
});

test("database validator mirrors section figure and callout audience boundaries", () => {
  assert.match(
    migration,
    /target_guide_key = 'OWNER_ADMIN'[\s\S]*'OWNER_ADMIN'/,
  );
  assert.match(
    migration,
    /target_guide_key = 'STAFF'[\s\S]*'STAFF_BOUNDARY'/,
  );

  assert.match(
    migration,
    /allowed_sections := array\[/,
  );
  assert.match(
    migration,
    /allowed_figures := array\[/,
  );

  assert.match(
    migration,
    /position\('<' in target_value\) = 0/,
  );
  assert.match(
    migration,
    /position\('>' in target_value\) = 0/,
  );
});
