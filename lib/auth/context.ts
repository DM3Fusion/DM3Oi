import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";
import { hasTenantInternalAccess } from "./access-routing";
import { ORGANIZATION_AVATAR_BUCKET } from "@/lib/profile/avatar";
import { effectiveLicense, type LicenseSnapshot } from "@/lib/licensing";
import { getEffectiveOrganizationPermissions, hasPermission, permissions, type OrganizationPermissionOverride, type Permission } from "@/lib/auth/permissions";
export const ACTIVE_ORGANIZATION_COOKIE = "dm3iqcm-active-organization";
export const PLATFORM_CONTEXT_COOKIE_VALUE = "platform";
type Role = Database["public"]["Enums"]["application_role"];
export interface AuthorizedOrganization {
  id: string;
  name: string;
  slug: string;
  role: Role;
  avatarPath: string | null;
  avatarUrl: string | null;
}
export interface AccessContext {
  user: User;
  displayName: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  organizations: AuthorizedOrganization[];
  activeOrganization: AuthorizedOrganization | null;
  customerPortalIds: string[];
  customerPortalCount: number;
  provisioned: boolean;
  internalAccess: boolean;
  license: (LicenseSnapshot & ReturnType<typeof effectiveLicense>) | null;
  effectivePermissions: ReadonlySet<Permission>;
}
export type InternalAccessContext = AccessContext & {
  activeOrganization: AuthorizedOrganization;
  internalAccess: true;
};
export type AuthenticatedInternalContext = AccessContext & {
  internalAccess: true;
};
export type SuperAdminContext = AccessContext & {
  isSuperAdmin: true;
  internalAccess: true;
};
export async function getAccessContext(): Promise<AccessContext | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const [profile, platform, memberships, portal] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name,first_name,last_name,avatar_path,avatar_updated_at")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("platform_user_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("role", "SUPER_ADMIN")
        .eq("is_active", true)
        .limit(1),
      supabase
        .from("organization_members")
        .select("organization_id,role")
        .eq("user_id", user.id)
        .eq("is_active", true),
      supabase
        .from("customer_portal_users")
        .select("customer_id")
        .eq("user_id", user.id)
        .eq("is_active", true),
    ]);
    const isSuperAdmin = Boolean(platform.data?.length);
    const membershipRows = memberships.data ?? [];
    const allowedIds = membershipRows.map((row) => row.organization_id);
    let organizationQuery = supabase
      .from("organizations")
      .select("id,name,slug,avatar_path,avatar_updated_at")
      .eq("status", "ACTIVE")
      .order("name");
    if (!isSuperAdmin)
      organizationQuery = organizationQuery.in(
        "id",
        allowedIds.length
          ? allowedIds
          : ["00000000-0000-0000-0000-000000000000"],
      );
    const { data: organizationRows } = await organizationQuery;
    const organizationAvatarUrls = await Promise.all((organizationRows ?? []).map(async (org) => ({
      id: org.id,
      url: org.avatar_path
        ? (await supabase.storage.from(ORGANIZATION_AVATAR_BUCKET).createSignedUrl(org.avatar_path, 3600)).data?.signedUrl ?? null
        : null,
    })));
    const organizations: AuthorizedOrganization[] = (
      organizationRows ?? []
    ).map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      avatarPath: org.avatar_path,
      avatarUrl: organizationAvatarUrls.find((item) => item.id === org.id)?.url ?? null,
      role: isSuperAdmin
        ? "SUPER_ADMIN"
        : (membershipRows.find((row) => row.organization_id === org.id)?.role ??
          "STAFF_USER"),
    }));
    const selected = (await cookies()).get(ACTIVE_ORGANIZATION_COOKIE)?.value;
    const activeOrganization =
      isSuperAdmin && selected === PLATFORM_CONTEXT_COOKIE_VALUE
        ? null
        : (organizations.find((org) => org.id === selected) ??
          organizations[0] ??
          null);
    let license: (LicenseSnapshot & ReturnType<typeof effectiveLicense>) | null = null;
    let effectivePermissions = new Set<Permission>();
    if (activeOrganization) {
      const overrideResult=await supabase.from("organization_role_permissions").select("role,permission,is_allowed").eq("organization_id",activeOrganization.id).eq("role",activeOrganization.role);
      if (overrideResult.error) throw overrideResult.error;
      const overrideRows=overrideResult.data??[];
      const overrides=overrideRows.filter(row=>permissions.some(permission=>permission===row.permission)).map(row=>({role:row.role,permission:row.permission,isAllowed:row.is_allowed})) as OrganizationPermissionOverride[];
      effectivePermissions=new Set(getEffectiveOrganizationPermissions(isSuperAdmin?"SUPER_ADMIN":activeOrganization.role,overrides));
      // The licensing migration extends the generated schema at deployment time.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: currentLicense } = await (supabase as any).from("organization_licenses").select("license_status,commercial_state,starts_at,expires_at,grace_ends_at,notice_days,notification_thresholds").eq("organization_id", activeOrganization.id).eq("is_current", true).maybeSingle();
      if (currentLicense) license = { ...effectiveLicense({ status: currentLicense.license_status, commercialState: currentLicense.commercial_state, startsAt: currentLicense.starts_at, expiresAt: currentLicense.expires_at, graceEndsAt: currentLicense.grace_ends_at, noticeDays: currentLicense.notice_days }), ...currentLicense, status: currentLicense.license_status, commercialState: currentLicense.commercial_state };
    }
    const customerPortalIds = (portal.data ?? []).map((row) => row.customer_id);
    const displayName =
      profile.data?.display_name ||
      user.email ||
      "User";
    const avatarUrl = profile.data?.avatar_path
      ? (
          await supabase.storage
            .from("user-avatars")
            .createSignedUrl(profile.data.avatar_path, 3600)
        ).data?.signedUrl ?? null
      : null;
    return {
      user,
      displayName,
      avatarUrl,
      isSuperAdmin,
      organizations,
      activeOrganization,
      customerPortalIds,
      customerPortalCount: customerPortalIds.length,
      provisioned:
        isSuperAdmin ||
        organizations.length > 0 ||
        customerPortalIds.length > 0,
      internalAccess: isSuperAdmin || organizations.length > 0,
      license,
      effectivePermissions,
    };
  } catch (error) {
    console.error("Unable to resolve authenticated access context", error);
    return null;
  }
}
export async function requireInternalContext(): Promise<InternalAccessContext> {
  const context = await getAccessContext();
  if (!context?.user || !hasTenantInternalAccess(context))
    throw new Error("UNAUTHORIZED");
  return context as InternalAccessContext;
}
export async function requirePermission(permission: Permission): Promise<InternalAccessContext> {
  const context = await getAccessContext();
  if (!context?.activeOrganization || !hasPermission(context, permission))
    throw new Error("UNAUTHORIZED");
  return context as InternalAccessContext;
}
export async function requireAuthenticatedInternalUser(): Promise<AuthenticatedInternalContext> {
  const context = await getAccessContext();
  if (!context?.user || !context.internalAccess) throw new Error("UNAUTHORIZED");
  return context as AuthenticatedInternalContext;
}
export async function requireSuperAdmin(): Promise<SuperAdminContext> {
  const context = await getAccessContext();
  if (!context?.user || !context.isSuperAdmin) throw new Error("UNAUTHORIZED");
  return context as SuperAdminContext;
}
