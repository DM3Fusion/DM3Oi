import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { customerPortalWelcomeCopy } from "../lib/customer-portal-welcome.ts";

const source = (path: string) => readFileSync(path, "utf8");
const portal = source("app/portal/page.tsx");
const repository = source("lib/data/case-repository.ts");
const resolver = source("lib/data/avatar-urls.ts");
const caseDetail = source("app/cases/[caseId]/page.tsx");
const avatar = source("components/user-avatar.tsx");
const users = source("app/users/page.tsx");

test("portal welcome copy follows the authoritative active Case count", () => {
  assert.equal(
    customerPortalWelcomeCopy(0),
    "Here's a summary of your service requests.",
  );
  assert.equal(
    customerPortalWelcomeCopy(1),
    "Here's the status of your case and service requests.",
  );
  assert.equal(
    customerPortalWelcomeCopy(2),
    "Here's the status of your cases and service requests.",
  );
  assert.equal(
    customerPortalWelcomeCopy(12),
    "Here's the status of your cases and service requests.",
  );
  assert.match(portal, /customerPortalWelcomeCopy\(cases\.length\)/);
  assert.equal((portal.match(/getCustomerPortalCases\(/g) ?? []).length, 1);
});

test("Case assignments use canonical profile avatars through one trusted batch", () => {
  assert.match(repository, /\.eq\("organization_id", organizationId\)/);
  assert.match(repository, /memberships = .*\.filter\(member=>!platformAdminIds\.has\(member\.user_id\)\)/);
  assert.match(repository, /profileIds = \[[\s\S]*memberships\.map\(\(row\) => row\.user_id\)/);
  assert.match(
    repository,
    /const profiles = await attachAuthorizedAvatarUrls\(\(profileResult\.data \?\? \[\]\)\.map\(profile=>maskPlatformProfile\(profile,platformAdminIds\)\)\)/,
  );
  assert.equal(
    (repository.match(/attachAuthorizedAvatarUrls\(/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(repository, /attachAvatarUrls\(supabase/);
  assert.match(resolver, /createSignedUrls\(paths, 3600\)/);
  assert.match(resolver, /new Set\([\s\S]*profile\.avatar_path/);
});

test("canonical signing stays tenant-authorized, owner-path validated, and platform-safe", () => {
  assert.ok(
    repository.indexOf("!platformAdminIds.has(member.user_id)") <
      repository.indexOf("attachAuthorizedAvatarUrls("),
  );
  assert.match(resolver, /isOwnedAvatarPath\(profile\.avatar_path, profile\.id\)/);
  assert.match(resolver, /attachAvatarUrls\(createAdminClient\(\), signableProfiles\)/);
  assert.doesNotMatch(resolver, /\.list\(/);
  assert.match(repository, /maskPlatformProfile\(profile,platformAdminIds\)/);
  assert.match(repository, /ORGANIZATION_SUPPORT_IDENTITY/);
});

test("manager and staff assignment avatars receive signed URLs with resilient initials fallback", () => {
  assert.match(
    caseDetail,
    /<UserAvatar displayName=\{displayName\(item\.manager\)\} email=\{item\.manager\.email\} src=\{item\.manager\.avatarUrl\}/,
  );
  assert.match(
    caseDetail,
    /item\.assignedStaff\.map\(\(profile\) =>[\s\S]*src=\{profile\.avatarUrl\}/,
  );
  assert.match(resolver, /catch \{[\s\S]*return withoutUrls\(\)/);
  assert.match(resolver, /if \(error \|\| !data\) return withoutUrls\(\)/);
  assert.match(avatar, /onError=\{\(\) => setFailedSrc\(src \?\? null\)\}/);
  assert.match(avatar, /avatarInitials\(displayName, email\)/);
});

test("assignment controls and organization Users avatar behavior remain unchanged", () => {
  for (const label of ["Manager", "Staff", "Remove", "Change manager…", "Add staff…", "Assign"]) {
    assert.match(caseDetail, new RegExp(label.replace("…", "…")));
  }
  assert.match(caseDetail, /hasPermission\(access, "ASSIGN_CASES"\)/);
  assert.match(caseDetail, /setCaseAssignmentAction/);
  assert.match(users, /attachAuthorizedAvatarUrls/);
  assert.match(users, /src=\{profile\?\.avatarUrl\}/);
});
