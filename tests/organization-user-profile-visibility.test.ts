import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20260927005000_dm3oi_inactive_member_profile_visibility.sql",
);
const usersPage = source("app/users/page.tsx");
const detailPage = source("app/users/[membershipId]/page.tsx");

test("organization profile visibility includes inactive membership lifecycle rows", () => {
  assert.match(migration, /drop policy if exists profiles_select/);
  assert.match(migration, /create policy profiles_select/);
  assert.match(migration, /me\.user_id = auth\.uid\(\)/);
  assert.match(migration, /me\.is_active/);
  assert.match(migration, /them\.user_id = profiles\.id/);

  const relationship = migration.slice(
    migration.indexOf("create policy profiles_select"),
    migration.indexOf("comment on policy profiles_select"),
  );

  assert.doesNotMatch(relationship, /them\.is_active/);
});

test("self and SUPER_ADMIN profile visibility remain intact", () => {
  assert.match(migration, /id = auth\.uid\(\)/);
  assert.match(migration, /public\.is_super_admin\(\)/);
});

test("organization Users surfaces intentionally include non-active membership rows", () => {
  assert.match(usersPage, /from\("organization_members"\)/);
  assert.match(
    usersPage,
    /profiles\(id,email,first_name,last_name,display_name,title,avatar_path,avatar_updated_at\)/,
  );
  assert.match(usersPage, /m\.status/);
  assert.doesNotMatch(
    usersPage.slice(
      usersPage.indexOf('.from("organization_members")'),
      usersPage.indexOf("const query = await searchParams"),
    ),
    /\.eq\("is_active", true\)/,
  );

  assert.match(detailPage, /from\("organization_members"\)/);
  assert.match(
    detailPage,
    /profiles\(id,email,first_name,last_name,display_name,title,avatar_path,avatar_updated_at\)/,
  );
});

test("profile visibility does not alter membership activation", () => {
  assert.doesNotMatch(
    migration,
    /update public\.organization_members|insert into public\.organization_members/,
  );
});
