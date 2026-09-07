export const ORGANIZATION_SUPPORT_IDENTITY = "DM3Oi Sys Support";

type OrganizationVisibleProfile = {
  id: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  avatar_path?: string | null;
  avatar_updated_at?: string | null;
};

/**
 * Retains the protected actor ID for platform audit correlation while removing
 * identity fields from the organization-facing presentation object.
 */
export function maskPlatformProfile<T extends OrganizationVisibleProfile>(
  profile: T,
  platformIds: ReadonlySet<string>,
): T {
  return platformIds.has(profile.id)
    ? {
        ...profile,
        display_name: ORGANIZATION_SUPPORT_IDENTITY,
        first_name: null,
        last_name: null,
        email: null,
        avatar_path: null,
        avatar_updated_at: null,
      }
    : profile;
}
