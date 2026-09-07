import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { avatarInitials } from "../lib/profile/avatar.ts";

const source = (path: string) => readFileSync(path, "utf8");
const register = source("app/users/page.tsx");
const detail = source("app/users/[membershipId]/page.tsx");
const avatarResolver = source("lib/data/avatar-urls.ts");
const avatar = source("components/user-avatar.tsx");

test("organization Users resolves canonical profile avatars after tenant and platform filtering", () => {
  assert.match(register, /requirePermission\("VIEW_USERS"\)/);
  assert.match(register, /\.eq\("organization_id", org\.id\)/);
  assert.match(register, /!platformAdminIds\.has\(member\.user_id\)/);
  assert.ok(
    register.indexOf("!platformAdminIds.has(member.user_id)") <
      register.indexOf("attachAvatarUrls("),
  );
  assert.match(register, /profiles\(id,email,display_name,avatar_path,avatar_updated_at\)/);
  assert.match(register, /attachAvatarUrls\(\s*supabase,/);
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
      detail.indexOf("attachAvatarUrls("),
  );
  assert.match(detail, /attachAvatarUrls\(supabase, \[membershipProfile\]\)/);
  assert.match(detail, /src=\{profile\?\.avatarUrl\}/);
  assert.match(detail, /size="lg"/);
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
});
