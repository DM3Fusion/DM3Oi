import { cookies } from "next/headers";
import { cache } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";
import { hasTenantInternalAccess } from "./access-routing";
import {
  ORGANIZATION_AVATAR_BUCKET,
  resolveOwnedOrganizationAvatarUrl,
} from "@/lib/profile/avatar";
import { effectiveLicense, type LicenseSnapshot } from "@/lib/licensing";
import { measureServerPerformance } from "@/lib/server-performance";
import { getEffectiveOrganizationPermissions, hasPermission, permissions, type ConfigurableOrganizationRole, type Permission } from "@/lib/auth/permissions";
export const ACTIVE_ORGANIZATION_COOKIE = "dm3iqcm-active-organization";
export const PLATFORM_CONTEXT_COOKIE_VALUE = "platform";

const ACCESS_AVATAR_CACHE_TTL_MS = 50 * 60 * 1000;
const ACCESS_AVATAR_CACHE_MAX_ENTRIES = 256;

type AccessAvatarCacheEntry = {
  expiresAt: number;
  url: string;
};

const accessAvatarUrlCache = new Map<string, AccessAvatarCacheEntry>();

async function getCachedAccessAvatarUrl(
  bucket: string,
  path: string,
  sign: () => Promise<string | null>,
) {
  const key = `${bucket}:${path}`;
  const now = Date.now();
  const cached = accessAvatarUrlCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  if (cached) {
    accessAvatarUrlCache.delete(key);
  }

  let url: string | null;

  try {
    url = await sign();
  } catch {
    return null;
  }

  if (!url) return null;

  if (accessAvatarUrlCache.size >= ACCESS_AVATAR_CACHE_MAX_ENTRIES) {
    const oldestKey = accessAvatarUrlCache.keys().next().value;
    if (typeof oldestKey === "string") {
      accessAvatarUrlCache.delete(oldestKey);
    }
  }

  accessAvatarUrlCache.set(key, {
    expiresAt: now + ACCESS_AVATAR_CACHE_TTL_MS,
    url,
  });

  return url;
}
type Role = Database["public"]["Enums"]["application_role"];
export interface AuthorizedOrganization {
  id: string;
  name: string;
  slug: string;
  role: Role;
  avatarPath: string | null;
  avatarUrl: string | null;
}
export interface AccessIdentity {
  id: string;
  email?: string;
}

export interface AccessContext {
  user: AccessIdentity;
  displayName: string;
  profileEmail: string | null;
  title: string | null;
  avatarPath: string | null;
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
async function resolveAccessContext(): Promise<AccessContext | null> {
  return measureServerPerformance("shared", "resolveAccessContext.total", async () => {
    if (!isSupabaseConfigured()) return null;

    try {
      const supabase = await createClient();

      const {
        data: claimsData,
        error: claimsError,
      } = await measureServerPerformance(
        "shared",
        "resolveAccessContext.authClaims",
        () => supabase.auth.getClaims(),
      );

    if (claimsError) {
      throw claimsError;
    }

    const claims = claimsData?.claims;
    const userId =
      typeof claims?.sub === "string"
        ? claims.sub
        : null;
    const userEmail =
      typeof claims?.email === "string"
        ? claims.email
        : undefined;

    if (!userId) {
      return null;
    }

    const user: AccessIdentity = {
      id: userId,
      email: userEmail,
    };

    const selected =
      (await cookies()).get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;

    const requestedOrganizationId =
      selected && selected !== PLATFORM_CONTEXT_COOKIE_VALUE
        ? selected
        : null;


    // The fast access-context RPC is introduced by migration
    // 20261002012000. Cast locally until generated Supabase types
    // are refreshed as part of a deliberate schema-type update.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accessRpcClient = supabase as any;
      const { data: rawContext, error: accessError } =
        await measureServerPerformance(
          "shared",
          "resolveAccessContext.getMyAccessContextRpc",
          () =>
            accessRpcClient.rpc(
              "get_my_access_context",
              {
                target_organization_id: requestedOrganizationId,
              },
            ),
        );


    if (accessError) {
      throw accessError;
    }

    if (
      !rawContext ||
      typeof rawContext !== "object" ||
      Array.isArray(rawContext)
    ) {
      return null;
    }

    type RpcProfile = {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      title: string | null;
      avatar_path: string | null;
      avatar_updated_at: string | null;
      is_active: boolean;
    };

    type RpcOrganization = {
      id: string;
      name: string;
      slug: string;
      avatar_path: string | null;
      avatar_updated_at: string | null;
      role: Role;
    };

    type RpcPermissionOverride = {
      role: ConfigurableOrganizationRole;
      permission: string;
      is_allowed: boolean;
    };

    type RpcLicense = {
      license_status: Database["public"]["Enums"]["license_status"];
      commercial_state: Database["public"]["Enums"]["commercial_state"];
      starts_at: string | null;
      expires_at: string | null;
      grace_ends_at: string | null;
      notice_days: number;
      notification_thresholds: number[] | null;
    };

    type RpcAccessContext = {
      profile?: RpcProfile | null;
      is_super_admin?: boolean;
      organizations?: RpcOrganization[];
      active_organization_id?: string | null;
      active_role?: Role | null;
      permission_overrides?: RpcPermissionOverride[];
      license?: RpcLicense | null;
      customer_portal_ids?: string[];
    };

    const rpcContext = rawContext as RpcAccessContext;
    const profile = rpcContext.profile ?? null;

    if (!profile || profile.is_active !== true) {
      return null;
    }

    const isSuperAdmin = Boolean(rpcContext.is_super_admin);

    let organizations: AuthorizedOrganization[] = (
      rpcContext.organizations ?? []
    ).map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: organization.role,
      avatarPath: organization.avatar_path,
      avatarUrl: null,
    }));

    let activeOrganization =
      rpcContext.active_organization_id
        ? organizations.find(
            (organization) =>
              organization.id === rpcContext.active_organization_id,
          ) ?? null
        : null;

    const effectivePermissions = activeOrganization
      ? new Set(
          getEffectiveOrganizationPermissions(
            isSuperAdmin
              ? "SUPER_ADMIN"
              : activeOrganization.role,
            (rpcContext.permission_overrides ?? [])
              .filter((override) =>
                permissions.some(
                  (permission) =>
                    permission === override.permission,
                ),
              )
              .map((override) => ({
                role: override.role,
                permission: override.permission as Permission,
                isAllowed: override.is_allowed,
              })),
          ),
        )
      : new Set<Permission>();

    let license:
      | (LicenseSnapshot & ReturnType<typeof effectiveLicense>)
      | null = null;

    if (rpcContext.license) {
      const licenseSnapshot: LicenseSnapshot = {
        status: rpcContext.license.license_status,
        commercialState: rpcContext.license.commercial_state,
        startsAt: rpcContext.license.starts_at,
        expiresAt: rpcContext.license.expires_at,
        graceEndsAt: rpcContext.license.grace_ends_at,
        noticeDays: rpcContext.license.notice_days,
      };

      license = {
        ...licenseSnapshot,
        ...effectiveLicense(licenseSnapshot),
        notificationThresholds:
          rpcContext.license.notification_thresholds ?? [],
      };
    }


    const [avatarUrl, activeOrganizationAvatarUrl] =
      await measureServerPerformance(
        "shared",
        "resolveAccessContext.avatarResolution",
        () => Promise.all([
        profile.avatar_path
          ? getCachedAccessAvatarUrl(
              "user-avatars",
              profile.avatar_path,
              () =>
                supabase.storage
                  .from("user-avatars")
                  .createSignedUrl(profile.avatar_path!, 3600)
                  .then(
                    (result) =>
                      result.data?.signedUrl ?? null,
                  ),
            )
          : Promise.resolve<string | null>(null),
        activeOrganization
          ? resolveOwnedOrganizationAvatarUrl(
              activeOrganization.avatarPath,
              activeOrganization.id,
              (ownedPath) =>
                getCachedAccessAvatarUrl(
                  ORGANIZATION_AVATAR_BUCKET,
                  ownedPath,
                  () =>
                    supabase.storage
                      .from(ORGANIZATION_AVATAR_BUCKET)
                      .createSignedUrl(ownedPath, 3600)
                      .then(
                        (result) =>
                          result.data?.signedUrl ?? null,
                      ),
                ),
            )
          : Promise.resolve<string | null>(null),
        ]),
      );


    if (activeOrganization) {
      const resolvedActiveOrganization: AuthorizedOrganization = {
        ...activeOrganization,
        avatarUrl: activeOrganizationAvatarUrl,
      };

      activeOrganization = resolvedActiveOrganization;

      organizations = organizations.map((organization) =>
        organization.id === resolvedActiveOrganization.id
          ? resolvedActiveOrganization
          : organization,
      );
    }

    const customerPortalIds =
      rpcContext.customer_portal_ids ?? [];

    const displayName =
      profile.display_name ||
      user.email ||
      "User";


    return {
      user,
      displayName,
      profileEmail: profile.email,
      title: profile.title,
      avatarPath: profile.avatar_path,
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
      internalAccess:
        isSuperAdmin || organizations.length > 0,
      license,
      effectivePermissions,
    };
    } catch (error) {
      console.error(
        "Unable to resolve authenticated access context",
        error,
      );
      return null;
    }
  });
}
// React clears cache() between Server Component requests. This shares one
// authoritative resolution within a render without persisting access state.
export const getAccessContext = cache(resolveAccessContext);
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
