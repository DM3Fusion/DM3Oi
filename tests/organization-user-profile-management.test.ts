import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createAvatarPath,
  createAvatarSourcePath,
  isOwnedAvatarPath,
} from "../lib/profile/avatar.ts";
import { validateDisplayName } from "../lib/profile/identity.ts";

const source = (path: string) => readFileSync(path, "utf8");
const action = source("lib/data/organization-profile-actions.ts");
const detail = source("app/users/[membershipId]/page.tsx");
const editor = source("components/organization-user-profile-editor.tsx");
const selfAction = source("lib/data/profile-actions.ts");
const selfForm = source("components/profile-identity-form.tsx");
const selfAvatar = source("components/avatar-upload-form.tsx");
const membershipAction = source("lib/data/organization-user-actions.ts");
const hardening = source(
  "supabase/migrations/20260907100000_dm3oi_private_avatar_access_hardening.sql",
);

test("self profile identity stays owner-scoped and email remains read-only", () => {
  assert.match(selfAction, /requireAuthenticatedInternalUser\(\)/);
  assert.match(selfAction, /validateDisplayName\(submittedDisplayName\)/);
  assert.match(selfAction, /\.eq\("id", access\.user\.id\)/);
  assert.match(selfAction, /set_own_avatar_path/);
  assert.match(selfAction, /isOwnedAvatarSourcePath\(sourcePath, access\.user\.id\)/);
  assert.match(selfAvatar, /createAvatarSourcePath\(user\.id, source\.type\)/);
  assert.doesNotMatch(selfAction + selfAvatar, /form\.get\("userId"\)/);
  assert.match(selfForm, /<input value=\{email\} readOnly/);
});

test("shared profile validation and avatar paths retain canonical behavior", () => {
  assert.deepEqual(validateDisplayName("  Employee Name  "), {
    ok: true,
    displayName: "Employee Name",
  });
  assert.equal(validateDisplayName(" ").ok, false);
  assert.equal(validateDisplayName("x".repeat(161)).ok, false);
  const userId = "11111111-1111-4111-8111-111111111111";
  const avatarPath = createAvatarPath(userId);
  assert.equal(isOwnedAvatarPath(avatarPath, userId), true);
  assert.equal(
    isOwnedAvatarPath(
      avatarPath,
      "22222222-2222-4222-8222-222222222222",
    ),
    false,
  );
  assert.match(createAvatarSourcePath(userId, "image/png") ?? "", /^11111111-1111-4111-8111-111111111111\/source-[0-9a-f-]+\.png$/);
  assert.equal(createAvatarSourcePath(userId, "text/plain"), null);
});

test("delegated profile authorization derives its target from a tenant membership", () => {
  assert.match(action, /^"use server";/);
  assert.match(action, /hasPermission\(access, "MANAGE_USERS"\)/);
  assert.match(action, /\.eq\("id", membershipId\)[\s\S]*\.eq\("organization_id", organizationId\)/);
  assert.match(action, /getPlatformAdminUserIds\(\)[\s\S]*\.has\(membership\.user_id\)/);
  assert.match(action, /profile\.id !== membership\.user_id/);
  assert.ok(action.indexOf("authorizeTarget(membershipId)") < action.indexOf("createAdminClient()"));
  assert.doesNotMatch(action, /form\.get\("(?:userId|profileId|avatarPath|sourcePath)"\)/);
  assert.match(action, /createAvatarPath\(target\.profile\.id\)/);
  assert.match(action, /\.eq\("id", target\.profile\.id\)/);
});

test("delegated avatar upload is exact-path signed, normalized, and safely replaced", () => {
  assert.match(action, /createAvatarSourcePath\(target\.profile\.id, contentType\)/);
  assert.match(action, /createSignedUploadUrl\(sourcePath\)/);
  assert.match(editor, /uploadToSignedUrl\(prepared\.sourcePath, prepared\.token, source/);
  assert.match(action, /sourcePath = `\$\{target\.profile\.id\}\/\$\{sourceReference\}`/);
  assert.match(action, /isOwnedAvatarSourcePath\(sourcePath, target\.profile\.id\)/);
  assert.match(editor, /form\.set\("sourceReference", prepared\.sourceReference\)/);
  assert.match(action, /normalizeAvatarSource/);
  assert.match(action, /contentType: "image\/webp"/);
  assert.match(action, /avatar_updated_at: new Date\(\)\.toISOString\(\)/);
  assert.match(action, /if \(update\.error \|\| !update\.data\)[\s\S]*remove\(\[uploadedPath\]\)/);
  assert.match(action, /isOwnedAvatarPath\(target\.profile\.avatar_path, target\.profile\.id\)/);
  assert.doesNotMatch(action, /\.list\(/);
});

test("delegated removal clears the reference before owner-validated cleanup", () => {
  const removal = action.slice(action.indexOf("removeOrganizationUserAvatarAction"));
  assert.match(removal, /authorizeTarget\(membershipId\)/);
  assert.match(removal, /avatar_path: null, avatar_updated_at: null/);
  assert.ok(removal.indexOf(".update({ avatar_path: null") < removal.indexOf(".remove([target.profile.avatar_path])"));
  assert.match(removal, /isOwnedAvatarPath\(target\.profile\.avatar_path, target\.profile\.id\)/);
});

test("employee profile editing is capability-gated and email is immutable", () => {
  assert.match(detail, /const canManage = hasPermission\(access, "MANAGE_USERS"\)/);
  assert.match(detail, /\{canManage \? \([\s\S]*<OrganizationUserProfileEditor/);
  assert.match(editor, />\s*Edit Profile\s*</);
  assert.match(editor, /name="displayName"/);
  assert.match(editor, /<input value=\{email\} readOnly/);
  assert.doesNotMatch(editor + action, /name="email"|form\.get\("email"\)/);
  assert.match(editor, />\s*Change Photo\s*</);
  assert.match(editor, />\s*Cancel\s*</);
  assert.match(editor, /Save Profile/);
  assert.match(editor, /Remove Photo/);
  assert.match(membershipAction, /updateOrganizationMembershipAction/);
  assert.match(detail, /Manage organization access/);
});

test("tenant and platform boundaries precede every trusted profile mutation", () => {
  for (const exportName of [
    "prepareOrganizationUserAvatarUploadAction",
    "updateOrganizationUserProfileAction",
    "removeOrganizationUserAvatarAction",
  ]) {
    const section = action.slice(action.indexOf(`export async function ${exportName}`));
    assert.match(section, /authorizeTarget\(membershipId\)/);
  }
  assert.match(detail, /hasPermission\(access, "VIEW_USERS"\)/);
  assert.match(detail, /\.eq\("organization_id", access\.activeOrganization\.id\)/);
  assert.match(detail, /getPlatformAdminUserIds/);
  assert.doesNotMatch(action + editor, /DM3IQCM_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source("lib/data/platform-privacy.ts"), /^import "server-only";/);
  assert.match(
    source("supabase/migrations/20260906120000_dm3oi_organization_role_permissions.sql"),
    /DM3Oi Sys Support/,
  );
});

test("03A.5 direct Storage privacy remains unchanged", () => {
  assert.match(hardening, /drop policy if exists user_avatars_authenticated_read/);
  assert.match(hardening, /create policy user_avatars_owner_select/);
  assert.match(hardening, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.doesNotMatch(hardening, /to (?:anon|public)\b/i);
  assert.doesNotMatch(action, /create policy|grant\s/i);
});

test("delegated changes emit bounded server-side trace events", () => {
  assert.match(action, /console\.info\("DM3Oi delegated profile change"/);
  assert.match(action, /actorUserId: target\.actorUserId/);
  assert.match(action, /organizationId: target\.organizationId/);
  assert.match(action, /membershipId: target\.membershipId/);
  assert.match(action, /targetProfileId: target\.profile\.id/);
  assert.match(action, /occurredAt: new Date\(\)\.toISOString\(\)/);
  assert.match(action, /DISPLAY_NAME_CHANGED/);
  assert.match(action, /AVATAR_CHANGED/);
  assert.match(action, /AVATAR_AND_DISPLAY_NAME_CHANGED/);
  assert.match(action, /AVATAR_REMOVED/);
});
