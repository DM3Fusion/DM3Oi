import { notFound } from "next/navigation";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { classifyAccess } from "@/lib/data/user-provisioning";
import { attachAvatarUrls, type ProfileWithAvatar } from "@/lib/data/avatar-urls";
import { ORGANIZATION_AVATAR_BUCKET } from "@/lib/profile/avatar";
import type { Database } from "@/types/database.generated";
type Tables = Database["public"]["Tables"];
export type OrganizationRow = Tables["organizations"]["Row"];
export type MembershipRow = Tables["organization_members"]["Row"];
export type ProfileRow = Tables["profiles"]["Row"];
export type AvatarProfileRow = ProfileWithAvatar<ProfileRow>;
export interface OrganizationAdminRow extends OrganizationRow {
  avatarUrl: string | null;
  license: any | null;
  activeUsers: number;
  businessOwners: number;
  businessAdmins: number;
  openCases: number;
  customers: number;
  lastActivity: string | null;
}
export interface MemberAdminRow extends MembershipRow {
  profile: AvatarProfileRow;
}
export interface PlatformUserRow extends AvatarProfileRow {
  platformAdmin: boolean;
  memberships: {
    id: string;
    organizationId: string;
    organizationName: string;
    role: string;
    active: boolean;
    joinedAt: string;
  }[];
  portalAccess: number;
  accessState:
    | "Platform Admin"
    | "Organization User"
    | "Customer Portal User"
    | "Pending Access";
}
export interface PlatformSummary {
  organizations: number;
  activeOrganizations: number;
  inactiveOrganizations: number;
  platformAdministrators: number;
  organizationUsers: number;
  pendingProvisioning: number;
}
async function loadPlatformData() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const [
    organizations,
    memberships,
    profiles,
    platformRoles,
    portalUsers,
    cases,
    customers,
  ] = await Promise.all([
    supabase.from("organizations").select("*").order("name"),
    supabase.from("organization_members").select("*"),
    supabase.from("profiles").select("*").order("display_name"),
    supabase.from("platform_user_roles").select("*"),
    supabase.from("customer_portal_users").select("*"),
    supabase.from("organization_cases").select("*"),
    supabase.from("organization_customers").select("*"),
  ]);
  const licenseQuery = await (supabase as any).from("organization_licenses").select("*").eq("is_current", true).order("created_at", { ascending: false });
  if (licenseQuery.error) {
    console.error("License administration query failed", { code: licenseQuery.error.code, message: licenseQuery.error.message });
    throw new Error("License administration data is temporarily unavailable.");
  }
  const licenses = licenseQuery.data;
  const error =
    organizations.error ??
    memberships.error ??
    profiles.error ??
    platformRoles.error ??
    portalUsers.error ??
    cases.error ??
    customers.error;
  if (error) {
    console.error("Platform administration query failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Platform administration data is temporarily unavailable.");
  }
  const hydratedProfiles = await attachAvatarUrls(supabase, profiles.data ?? []);
  const organizationsWithAvatars = await Promise.all((organizations.data ?? []).map(async (org) => {
    if (!org.avatar_path) return { ...org, avatarUrl: null };
    const signed = await supabase.storage.from(ORGANIZATION_AVATAR_BUCKET).createSignedUrl(org.avatar_path, 3600);
    return { ...org, avatarUrl: signed.data?.signedUrl ?? null };
  }));
  return {
    organizations: organizationsWithAvatars.map((org) => ({ ...org, license: (licenses ?? []).find((l: any) => l.organization_id === org.id) ?? null })),
    memberships: memberships.data ?? [],
    profiles: hydratedProfiles,
    platformRoles: platformRoles.data ?? [],
    portalUsers: portalUsers.data ?? [],
    cases: cases.data ?? [],
    customers: customers.data ?? [],
  };
}
export async function getPlatformAdministration() {
  const data = await loadPlatformData();
  const organizations: OrganizationAdminRow[] = data.organizations.map(
    (org) => {
      const members = data.memberships.filter(
        (m) => m.organization_id === org.id && m.is_active,
      );
      return {
        ...org,
        activeUsers: members.length,
        businessOwners: members.filter((m) => m.role === "BUSINESS_OWNER")
          .length,
        businessAdmins: members.filter((m) => m.role === "BUSINESS_ADMIN")
          .length,
        openCases: data.cases.filter(
          (c) =>
            c.organization_id === org.id &&
            !["COMPLETED", "CLOSED", "CANCELLED"].includes(c.status),
        ).length,
        customers: data.customers.filter((c) => c.organization_id === org.id)
          .length,
        lastActivity: [...data.cases.filter((c) => c.organization_id === org.id), ...data.customers.filter((c) => c.organization_id === org.id)]
          .map((item) => item.updated_at ?? item.created_at)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
      };
    },
  );
  const users: PlatformUserRow[] = data.profiles.map((profile) => {
    const memberships = data.memberships
      .filter((m) => m.user_id === profile.id)
      .map((m) => ({
        id: m.id,
        organizationId: m.organization_id,
        organizationName:
          data.organizations.find((o) => o.id === m.organization_id)?.name ??
          "Unknown organization",
        role: m.role,
        active: m.is_active,
        joinedAt: m.joined_at,
      }));
    const platformAdmin = data.platformRoles.some(
      (r) => r.user_id === profile.id && r.is_active,
    );
    const portalAccess = data.portalUsers.filter(
      (p) => p.user_id === profile.id && p.is_active,
    ).length;
    return {
      ...profile,
      platformAdmin,
      memberships,
      portalAccess,
      accessState: classifyAccess({
        platformAdmin,
        activeOrganizationMembership: memberships.some((m) => m.active),
        activePortalAccess: portalAccess > 0,
      }),
    };
  });
  return {
    organizations,
    users,
    summary: {
      organizations: organizations.length,
      activeOrganizations: organizations.filter((o) => o.status === "ACTIVE")
        .length,
      inactiveOrganizations: organizations.filter((o) => o.status !== "ACTIVE")
        .length,
      platformAdministrators: data.platformRoles.filter(
        (r) => r.role === "SUPER_ADMIN" && r.is_active,
      ).length,
      organizationUsers: new Set(
        data.memberships.filter((m) => m.is_active).map((m) => m.user_id),
      ).size,
      pendingProvisioning: users.filter(
        (u) => u.accessState === "Pending Access",
      ).length,
    } satisfies PlatformSummary,
  };
}
export async function getPlatformSummary() {
  return (await getPlatformAdministration()).summary;
}
export async function getOrganizationAdministration(id: string) {
  const data = await getPlatformAdministration();
  const organization = data.organizations.find((o) => o.id === id);
  if (!organization) notFound();
  const base = await loadPlatformData();
  const members: MemberAdminRow[] = base.memberships
    .filter((m) => m.organization_id === id)
    .flatMap((m) => {
      const profile = base.profiles.find((p) => p.id === m.user_id);
      return profile ? [{ ...m, profile }] : [];
    });
  return { organization, members, cases: base.cases.filter((c) => c.organization_id === id), customers: base.customers.filter((c) => c.organization_id === id) };
}
export async function getPlatformUser(id: string) {
  const data = await getPlatformAdministration();
  const user = data.users.find((item) => item.id === id);
  if (!user) notFound();
  return { user, organizations: data.organizations };
}
