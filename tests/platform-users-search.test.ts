import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizePlatformUserQuery,
  platformUserMatchesSearch,
} from "../lib/platform-user-filters.ts";
import {
  maskPlatformProfile,
  ORGANIZATION_SUPPORT_IDENTITY,
} from "../lib/auth/platform-privacy.ts";

const source = (path: string) => readFileSync(path, "utf8");
const user = {
  display_name: "George Mimms",
  first_name: "George",
  last_name: "Mimms",
  email: "george@pobox.com",
  accessState: "Organization User",
  is_active: true,
  memberships: [
    {
      organizationName: "Mimms Tax Service",
      role: "BUSINESS_OWNER",
      active: true,
    },
    {
      organizationName: "Example Services",
      role: "STAFF_MANAGER",
      active: false,
    },
  ],
};

test("platform user matching is trimmed, partial, and case-insensitive", () => {
  for (const query of [" george ", "MIMMS", "pObOx", "tax serv", "owner", "staff manager", "organization user", "active"]) {
    assert.equal(platformUserMatchesSearch(user, query), true, query);
  }
  assert.equal(platformUserMatchesSearch(user, "customer portal"), false);
  assert.equal(platformUserMatchesSearch(user, "pending access"), false);
  assert.equal(platformUserMatchesSearch(user, "unknown value"), false);
  assert.equal(platformUserMatchesSearch(user, " "), true);
  assert.equal(normalizePlatformUserQuery(`  ${"x".repeat(220)}  `).length, 200);
});

test("access state and profile status are independently searchable", () => {
  const portalUser = {
    ...user,
    accessState: "Customer Portal User",
    is_active: false,
    memberships: [],
  };
  const pendingUser = { ...portalUser, accessState: "Pending Access" };
  assert.equal(platformUserMatchesSearch(portalUser, "portal"), true);
  assert.equal(platformUserMatchesSearch(portalUser, "inactive"), true);
  assert.equal(platformUserMatchesSearch(pendingUser, "pending"), true);
});

test("platform users page filters only its authorized repository result", () => {
  const page = source("app/admin/users/page.tsx");
  const repository = source("lib/data/platform-repository.ts");
  assert.match(repository, /async function loadPlatformData\(\)[\s\S]*await requireSuperAdmin\(\)/);
  assert.match(page, /getPlatformAdministration\(\)/);
  assert.match(page, /searchParams: Promise<\{ q\?: string \}>/);
  assert.match(page, /normalizePlatformUserQuery\(query\.q\)/);
  assert.match(page, /users\.filter\(\(user\) =>[\s\S]*platformUserMatchesSearch\(user, q\)/);
  assert.doesNotMatch(page, /createClient|createAdminClient|\.from\(/);
});

test("platform users page reuses the debounced clearable URL search", () => {
  const page = source("app/admin/users/page.tsx");
  const search = source("components/question-search.tsx");
  assert.match(page, /placeholder="Search users\.\.\."/);
  assert.match(page, /clearLabel="Clear platform user search"/);
  assert.match(search, /setTimeout\(\(\)=>updateUrl\(value\),300\)/);
  assert.match(search, /router\.replace\(destination\)/);
  assert.match(search, /params\.set\("q",normalized\)/);
  assert.match(search, /params\.delete\("q"\)/);
});

test("filtered and genuine empty states remain distinct with creation available", () => {
  const page = source("app/admin/users/page.tsx");
  assert.match(page, /users\.length/);
  assert.match(page, /visibleUsers\.length/);
  assert.match(page, /No users match this search\./);
  assert.match(page, /No user profiles yet/);
  assert.match(page, /href="\/admin\/users\/new"/);
  assert.match(page, /＋ Create User/);
});

test("row detail behavior and organization-facing platform privacy are unchanged", () => {
  const page = source("app/admin/users/page.tsx");
  assert.match(page, /<NavigableRow/);
  assert.match(page, /href=\{`\/admin\/users\/\$\{user\.id\}`\}/);
  const profile = {
    id: "platform-id",
    display_name: "Private Admin",
    email: "private@example.com",
  };
  const masked = maskPlatformProfile(profile, new Set([profile.id]));
  assert.equal(masked.display_name, ORGANIZATION_SUPPORT_IDENTITY);
  assert.equal(masked.email, null);
  assert.equal(ORGANIZATION_SUPPORT_IDENTITY, "DM3Oi Sys Support");
});
