import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  organizationInitials,
  isOwnedOrganizationAvatarPath,
  isOwnedOrganizationAvatarSourcePath,
  resolveOwnedOrganizationAvatarUrl,
} from "../lib/profile/avatar.ts";

const org = "11111111-1111-4111-8111-111111111111";
const otherOrg = "33333333-3333-4333-8333-333333333333";
const ownedPath = `${org}/avatar-22222222-2222-4222-8222-222222222222.webp`;
test("organization initials are deterministic", () => {
  assert.equal(organizationInitials("Mimms' Tax Service"), "MTS");
  assert.equal(organizationInitials("DM3 Fusion"), "DF");
  assert.equal(organizationInitials(""), "O");
});
test("organization avatar paths are organization scoped and WebP-only", () => {
  assert.equal(isOwnedOrganizationAvatarPath(ownedPath, org), true);
  assert.equal(isOwnedOrganizationAvatarPath(`${org}/avatar-22222222-2222-4222-8222-222222222222.png`, org), false);
  assert.equal(isOwnedOrganizationAvatarSourcePath(`${org}/source-22222222-2222-4222-8222-222222222222.png`, org), true);
  assert.equal(isOwnedOrganizationAvatarSourcePath(`${otherOrg}/source-22222222-2222-4222-8222-222222222222.png`, org), false);
});
test("owned organization avatar paths are signed and preserve valid behavior", async () => {
  const signedPaths: string[] = [];
  const result = await resolveOwnedOrganizationAvatarUrl(
    ownedPath,
    org,
    async (path) => {
      signedPaths.push(path);
      return "https://signed.example/organization-avatar";
    },
  );

  assert.equal(result, "https://signed.example/organization-avatar");
  assert.deepEqual(signedPaths, [ownedPath]);
});
test("cross-tenant malformed and null organization avatar paths fail closed before signing", async () => {
  let signCalls = 0;
  const sign = async () => {
    signCalls += 1;
    return "https://signed.example/unexpected";
  };

  assert.equal(
    await resolveOwnedOrganizationAvatarUrl(
      `${otherOrg}/avatar-22222222-2222-4222-8222-222222222222.webp`,
      org,
      sign,
    ),
    null,
  );
  assert.equal(
    await resolveOwnedOrganizationAvatarUrl(`${org}/not-an-avatar.webp`, org, sign),
    null,
  );
  assert.equal(await resolveOwnedOrganizationAvatarUrl(null, org, sign), null);
  assert.equal(signCalls, 0);
});
test("organization avatar flow uses private buckets and role-gated server actions", () => {
  const migration = readFileSync("supabase/migrations/20260904060000_dm3iqcm_organization_avatar_storage.sql", "utf8");
  const action = readFileSync("lib/data/organization-avatar-actions.ts", "utf8");
  assert.match(migration, /organization-avatar-sources/);
  assert.match(migration, /organization-avatars/);
  assert.match(migration, /public\.has_organization_role/);
  assert.match(action, /BUSINESS_OWNER.*BUSINESS_ADMIN/);
  assert.match(action, /image\/webp/);
  assert.doesNotMatch(action, /SERVICE_ROLE_KEY/);
});
test("every database-derived organization avatar signing path validates ownership", () => {
  const layout = readFileSync("app/portal/layout.tsx", "utf8");
  const context = readFileSync("lib/auth/context.ts", "utf8");
  const platformRepository = readFileSync("lib/data/platform-repository.ts", "utf8");

  assert.match(
    layout,
    /resolveOwnedOrganizationAvatarUrl\([\s\S]*context\.organization\.avatar_path,[\s\S]*context\.organization\.id,[\s\S]*createAdminClient\(\)\.storage[\s\S]*createSignedUrl\(ownedPath, 3600\)/,
  );
  for (const signingSource of [context, platformRepository]) {
    assert.match(signingSource, /resolveOwnedOrganizationAvatarUrl/);
    assert.doesNotMatch(
      signingSource,
      /createSignedUrl\((?:org\.avatar_path|baseOrganization\.avatar_path|activeOrganization!?\.avatarPath)/,
    );
  }
});
test("organization avatar writes and deletes remain organization-owned", () => {
  const migration = readFileSync("supabase/migrations/20260904060000_dm3iqcm_organization_avatar_storage.sql", "utf8");
  const action = readFileSync("lib/data/organization-avatar-actions.ts", "utf8");
  const uploadForm = readFileSync("components/organization-avatar-upload-form.tsx", "utf8");
  const finalPathCheck = action.indexOf(
    "isOwnedOrganizationAvatarPath(finalPath, organizationId)",
  );
  const finalPathPersist = action.indexOf("avatar_path: finalPath");

  assert.match(action, /const finalPath = `\$\{organizationId\}\/avatar-\$\{randomUUID\(\)\}\.webp`/);
  assert.ok(finalPathCheck >= 0 && finalPathCheck < finalPathPersist);
  assert.doesNotMatch(uploadForm, /avatar_path|finalPath/);
  assert.match(
    migration,
    /organizations_avatar_path_owned_check[\s\S]*avatar_path is null or avatar_path ~ \('\^' \|\| id::text \|\| '\/avatar-/,
  );
  assert.match(
    action,
    /current\.data\.avatar_path && isOwnedOrganizationAvatarPath\(current\.data\.avatar_path, organizationId\)[\s\S]*\.remove\(\[current\.data\.avatar_path\]\)/,
  );
});
