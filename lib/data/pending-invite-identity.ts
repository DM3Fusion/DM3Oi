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

  const firstName = metadataText(input.userMetadata, "first_name");
  const lastName = metadataText(input.userMetadata, "last_name");
  const metadataDisplayName = metadataText(input.userMetadata, "display_name");
  const derivedName = [firstName, lastName].filter(Boolean).join(" ");
  const displayName =
    metadataDisplayName && metadataDisplayName.toLowerCase() !== email
      ? metadataDisplayName
      : derivedName;
  if (!displayName || displayName.toLowerCase() === email) return null;

  return {
    email: input.profile?.email?.trim().toLowerCase() || email,
    first_name: input.profile?.first_name?.trim() || firstName || null,
    last_name: input.profile?.last_name?.trim() || lastName || null,
    display_name: displayName,
    title:
      input.profile?.title?.trim() ||
      metadataText(input.userMetadata, "title") ||
      null,
  };
}
