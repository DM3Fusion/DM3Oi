export const AVATAR_BUCKET = "user-avatars";
export const AVATAR_SOURCE_BUCKET = "user-avatar-sources";
export const ORGANIZATION_AVATAR_BUCKET = "organization-avatars";
export const ORGANIZATION_AVATAR_SOURCE_BUCKET = "organization-avatar-sources";

export const AVATAR_OUTPUT_SIZE = 512;
export const AVATAR_WEBP_QUALITY = 0.82;

export const MAX_AVATAR_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 1 * 1024 * 1024;

export const AVATAR_SOURCE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function avatarSourceExtension(contentType: string) {
  return contentType === "image/jpeg"
    ? "jpg"
    : contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : null;
}

export function createAvatarPath(userId: string) {
  return `${userId}/avatar-${crypto.randomUUID()}.webp`;
}

export function createAvatarSourcePath(userId: string, contentType: string) {
  const extension = avatarSourceExtension(contentType);
  return extension
    ? `${userId}/source-${crypto.randomUUID()}.${extension}`
    : null;
}

export function avatarInitials(
  displayName?: string | null,
  email?: string | null,
) {
  const name = displayName?.trim();

  if (name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return email?.trim().charAt(0).toUpperCase() || "U";
}

export function isOwnedAvatarPath(path: string, userId: string) {
  return new RegExp(
    `^${userId}/avatar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.webp$`,
  ).test(path);
}

export function isOwnedAvatarSourcePath(path: string, userId: string) {
  return new RegExp(
    `^${userId}/source-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$`,
  ).test(path);
}

export function organizationInitials(name?: string | null) {
  const words = (name ?? "").trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!words.length) return "O";
  if (words.length >= 3) return words.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
  if (words.length === 2) return words.map((word) => word[0]).join("").toUpperCase();
  return words[0].slice(0, 3).toUpperCase();
}

export function isOwnedOrganizationAvatarPath(path: string, organizationId: string) {
  return new RegExp(`^${organizationId}/avatar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.webp$`).test(path);
}

export function isOwnedOrganizationAvatarSourcePath(path: string, organizationId: string) {
  return new RegExp(`^${organizationId}/source-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$`).test(path);
}
