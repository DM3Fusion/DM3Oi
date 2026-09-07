type SearchablePlatformMembership = {
  organizationName: string;
  role: string;
  active: boolean;
};

type SearchablePlatformUser = {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  accessState: string;
  is_active: boolean;
  memberships: SearchablePlatformMembership[];
};

export const normalizePlatformUserQuery = (value?: string) =>
  (value ?? "").trim().slice(0, 200);

export function platformUserMatchesSearch(
  user: SearchablePlatformUser,
  query: string,
) {
  const term = normalizePlatformUserQuery(query).toLowerCase();
  if (!term) return true;

  const membershipFields = user.memberships.flatMap((membership) => [
    membership.organizationName,
    membership.role,
    membership.role.replaceAll("_", " "),
    membership.active ? "active" : "inactive",
  ]);
  const fields = [
    user.display_name,
    user.first_name,
    user.last_name,
    [user.first_name, user.last_name].filter(Boolean).join(" "),
    user.email,
    user.accessState,
    user.is_active ? "active" : "inactive",
    ...membershipFields,
  ];

  return fields.some((value) => value?.toLowerCase().includes(term));
}
