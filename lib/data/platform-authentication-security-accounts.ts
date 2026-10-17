import "server-only";

import { requireSuperAdmin } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SECURITY_EVENTS_PAGE_SIZE,
  type AuthenticationSecurityEvent,
} from "@/lib/data/platform-authentication-security-repository";

export type AuthenticationSecurityAccount = {
  userId: string;
  name: string | null;
  email: string | null;
  organizationId: string | null;
  organizationName: string | null;
  currentMembershipRole: string | null;
  currentMembershipStatus: string | null;
};

export type AuthenticationSecurityAccountMap =
  Record<string, AuthenticationSecurityAccount>;

export async function getAuthenticationSecurityAccounts(
  events: AuthenticationSecurityEvent[],
): Promise<AuthenticationSecurityAccountMap> {
  await requireSuperAdmin();

  const userIds = [...new Set(events.map((event) => event.user_id))]
    .filter(Boolean)
    .slice(0, SECURITY_EVENTS_PAGE_SIZE);

  if (!userIds.length) return {};

  const organizationIds = [
    ...new Set(
      events
        .map((event) => event.organization_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const admin = createAdminClient();

  const [profilesResult, membershipsResult, organizationsResult] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id,first_name,last_name,display_name,email")
        .in("id", userIds),
      organizationIds.length
        ? admin
            .from("organization_members")
            .select("user_id,organization_id,role,status")
            .in("user_id", userIds)
            .in("organization_id", organizationIds)
        : Promise.resolve({ data: [], error: null }),
      organizationIds.length
        ? admin
            .from("organizations")
            .select("id,name")
            .in("id", organizationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (
    profilesResult.error ||
    membershipsResult.error ||
    organizationsResult.error
  ) {
    console.error("Authentication security account lookup failed");
    throw new Error(
      "Authentication security account information is temporarily unavailable.",
    );
  }

  const profiles = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.id,
      profile,
    ]),
  );

  const organizations = new Map(
    (organizationsResult.data ?? []).map((organization) => [
      organization.id,
      organization.name,
    ]),
  );

  const memberships = new Map(
    (membershipsResult.data ?? []).map((membership) => [
      `${membership.user_id}:${membership.organization_id}`,
      membership,
    ]),
  );

  const authEmails = new Map<string, string | null>();

  // Limit concurrent Admin Auth requests to avoid a 50-request burst.
  for (let offset = 0; offset < userIds.length; offset += 5) {
    const batch = userIds.slice(offset, offset + 5);

    const resolved = await Promise.all(
      batch.map(async (userId) => {
        try {
          const result = await admin.auth.admin.getUserById(userId);

          return [
            userId,
            result.error ? null : result.data.user?.email ?? null,
          ] as const;
        } catch {
          return [userId, null] as const;
        }
      }),
    );

    for (const [userId, email] of resolved) {
      authEmails.set(userId, email);
    }
  }

  const accounts: AuthenticationSecurityAccountMap = {};

  for (const event of events) {
    const profile = profiles.get(event.user_id);
    const membership = event.organization_id
      ? memberships.get(`${event.user_id}:${event.organization_id}`)
      : null;

    const firstName = profile?.first_name?.trim() ?? "";
    const lastName = profile?.last_name?.trim() ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    const name =
      fullName ||
      profile?.display_name?.trim() ||
      null;

    accounts[event.event_id] = {
      userId: event.user_id,
      name,
      email: authEmails.get(event.user_id) ?? null,
      organizationId: event.organization_id,
      organizationName: event.organization_id
        ? organizations.get(event.organization_id) ?? null
        : null,
      currentMembershipRole: membership?.role ?? null,
      currentMembershipStatus: membership?.status ?? null,
    };
  }

  return accounts;
}
