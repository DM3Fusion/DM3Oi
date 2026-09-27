export type PendingInviteProfile = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  title: string | null;
};

const metadataText = (
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) => {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
};

export function resolvePendingInviteIdentityRepair(input: {
  profile: PendingInviteProfile | null;
  authEmail: string;
  userMetadata: Record<string, unknown> | null | undefined;
}) {
  const email = input.authEmail.trim().toLowerCase();
  const currentDisplayName = input.profile?.display_name?.trim() ?? "";
  if (currentDisplayName && currentDisplayName.toLowerCase() !== email)
    return null;

  const firstName =
    input.profile?.first_name?.trim() ||
    metadataText(input.userMetadata, "first_name");
  const lastName =
    input.profile?.last_name?.trim() ||
    metadataText(input.userMetadata, "last_name");
  const metadataDisplayName = metadataText(input.userMetadata, "display_name");
  const profileDerivedName = [
    input.profile?.first_name?.trim(),
    input.profile?.last_name?.trim(),
  ].filter(Boolean).join(" ");
  const metadataDerivedName = [
    metadataText(input.userMetadata, "first_name"),
    metadataText(input.userMetadata, "last_name"),
  ].filter(Boolean).join(" ");
  const displayName =
    profileDerivedName ||
    (metadataDisplayName && metadataDisplayName.toLowerCase() !== email
      ? metadataDisplayName
      : metadataDerivedName);
  if (!displayName || displayName.toLowerCase() === email) return null;

  return {
    email: input.profile?.email?.trim().toLowerCase() || email,
    first_name: firstName || null,
    last_name: lastName || null,
    display_name: displayName,
    title:
      input.profile?.title?.trim() ||
      metadataText(input.userMetadata, "title") ||
      null,
  };
}

export function organizationUserDisplayName(profile: {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}) {
  const email = profile.email?.trim() ?? "";
  const displayName = profile.display_name?.trim() ?? "";
  if (displayName && displayName.toLowerCase() !== email.toLowerCase())
    return displayName;
  const fullName = [profile.first_name, profile.last_name]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return fullName || email || "Unnamed user";
}
