import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { avatarInitials } from "../lib/profile/avatar.ts";

const source = (path: string) => readFileSync(path, "utf8");
const register = source("app/users/page.tsx");
const detail = source("app/users/[membershipId]/page.tsx");
const avatarResolver = source("lib/data/avatar-urls.ts");
const avatar = source("components/user-avatar.tsx");
const shellContext = source("lib/auth/context.ts");
const historicalStorage = source(
  "supabase/migrations/20260904010000_dm3iqcm_user_avatar_profile_identity.sql",
);
const hardeningMigration = source(
  "supabase/migrations/20260907100000_dm3oi_private_avatar_access_hardening.sql",
);

test("private avatar reads are owner-only after the forward hardening migration", () => {
  assert.match(
    historicalStorage,
    /create policy user_avatars_authenticated_read[\s\S]*using \(bucket_id = 'user-avatars'\)/,
  );
  assert.match(
    hardeningMigration,
    /drop policy if exists user_avatars_authenticated_read on storage\.objects/,
  );
  assert.match(
    hardeningMigration,
    /create policy user_avatars_owner_select[\s\S]*for select to authenticated[\s\S]*bucket_id = 'user-avatars'[\s\S]*storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/,
  );
  assert.doesNotMatch(hardeningMigration, /to (?:anon|public)\b/i);
  assert.doesNotMatch(hardeningMigration, /grant\s|alter table[\s\S]*disable row level security/i);
  assert.doesNotMatch(
    hardeningMigration,
    /user_avatars_owner_(?:insert|update|delete)/,
  );
});

test("established avatar paths are profile-owned UUID WebP objects", () => {
  const profileAvatar = source("lib/profile/avatar.ts");
  assert.match(
    profileAvatar,
    /\^\$\{userId\}\/avatar-\[0-9a-f\][\s\S]*\\\.webp\$/,
  );
  assert.match(
    historicalStorage,
    /first folder segment is the profile user ID/,
  );
});

test("organization Users resolves canonical profile avatars after tenant and platform filtering", () => {
  assert.match(register, /requirePermission\("VIEW_USERS"\)/);
  assert.match(register, /\.eq\("organization_id", org\.id\)/);
  assert.match(register, /!platformAdminIds\.has\(member\.user_id\)/);
  assert.ok(
    register.indexOf("!platformAdminIds.has(member.user_id)") <
      register.indexOf("attachAuthorizedAvatarUrls("),
  );
  assert.match(register, /profiles\(id,email,display_name,avatar_path,avatar_updated_at\)/);
  assert.match(register, /attachAuthorizedAvatarUrls\(\s*rows\.flatMap/);
  assert.doesNotMatch(register, /createAdminClient/);
  assert.match(register, /src=\{profile\?\.avatarUrl\}/);
  assert.match(register, /size="sm"/);
});

test("organization user detail signs only the membership-scoped profile avatar", () => {
  assert.match(detail, /hasPermission\(access, "VIEW_USERS"\)/);
  assert.match(detail, /\.eq\("id", membershipId\)/);
  assert.match(detail, /\.eq\("organization_id", access\.activeOrganization\.id\)/);
  assert.match(detail, /getPlatformAdminUserIds\(\)[\s\S]*has\(membership\.user_id\)\)notFound\(\)/);
  assert.ok(
    detail.indexOf("getPlatformAdminUserIds()") <
      detail.indexOf("attachAuthorizedAvatarUrls("),
  );
  assert.match(detail, /attachAuthorizedAvatarUrls\(\[membershipProfile\]\)/);
  assert.doesNotMatch(detail, /createAdminClient/);
  assert.match(detail, /src=\{profile\?\.avatarUrl\}/);
  assert.match(detail, /size="lg"/);
});

test("trusted signing validates authorized profile paths and remains server-only", () => {
  assert.match(avatarResolver, /^import "server-only";/);
  assert.match(avatarResolver, /attachAuthorizedAvatarUrls/);
  assert.match(
    avatarResolver,
    /isOwnedAvatarPath\(profile\.avatar_path, profile\.id\)/,
  );
  assert.match(
    avatarResolver,
    /attachAvatarUrls\(createAdminClient\(\), signableProfiles\)/,
  );
  assert.doesNotMatch(avatarResolver, /\.list\(/);
  assert.doesNotMatch(register + detail, /DM3IQCM_SUPABASE_SERVICE_ROLE_KEY/);
});

test("avatar signing failures fall back without making the page unavailable", () => {
  assert.match(avatarResolver, /if \(!paths\.length\) return withoutUrls\(\)/);
  assert.match(avatarResolver, /try \{[\s\S]*createSignedUrls\(paths, 3600\)[\s\S]*\} catch \{[\s\S]*return withoutUrls\(\)/);
  assert.match(avatarResolver, /if \(error \|\| !data\) return withoutUrls\(\)/);
  assert.match(avatarResolver, /avatarUrl: null/);
  assert.match(avatar, /const showImage = Boolean\(src && src !== failedSrc\)/);
  assert.match(avatar, /onError=\{\(\) => setFailedSrc\(src \?\? null\)\}/);
  assert.match(avatar, /showImage \? \([\s\S]*<img[\s\S]*\) : \([\s\S]*avatarInitials/);
  assert.equal(avatarInitials("George Mimms", null), "GM");
  assert.equal(avatarInitials(null, "user@example.com"), "U");
});

test("register navigation and invitation controls remain unchanged", () => {
  assert.match(register, /<NavigableRow/);
  assert.match(register, /href=\{`\/users\/\$\{m\.id\}`\}/);
  assert.match(register, /<ResendInviteButton/);
  assert.match(register, /organizationId=\{org\.id\}/);
  assert.doesNotMatch(register, /<Link[^>]+avatar/i);
});

test("the shared shell continues to render its canonical avatar URL", () => {
  const shell = source("components/layout/app-shell.tsx");
  const accountMenu = source("components/account-menu.tsx");
  assert.match(shell, /<AccountMenu displayName=\{access\.displayName\} email=\{access\.user\.email\} avatarUrl=\{access\.avatarUrl\}/);
  assert.match(accountMenu, /<UserAvatar displayName=\{displayName\} email=\{email\} src=\{avatarUrl\}/);
  assert.match(
    shellContext,
    /supabase\.storage[\s\S]*\.from\("user-avatars"\)[\s\S]*\.createSignedUrl\(profile\.data\.avatar_path, 3600\)/,
  );
});
