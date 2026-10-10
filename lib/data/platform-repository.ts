import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { classifyAccess } from "@/lib/data/user-provisioning";
import {
  attachAuthorizedAvatarUrls,
  attachAvatarUrls,
  type ProfileWithAvatar,
} from "@/lib/data/avatar-urls";
import {
  ORGANIZATION_AVATAR_BUCKET,
  resolveOwnedOrganizationAvatarUrl,
} from "@/lib/profile/avatar";
import { createAdminClient } from "@/lib/supabase/admin";
import { derivePlatformUserStatus, type PlatformUserStatus } from "@/lib/platform-user-filters";
import {
  isCustomerPortalIdentityConsistent,
  isEffectiveCustomerPortalAccess,
} from "@/lib/auth/customer-portal-effectiveness";
import { isIncompleteCompatibilityCaseStatus } from "@/lib/case-lifecycle";
import type { Database } from "@/types/database";
import type { User } from "@supabase/supabase-js";
import { requireOrganizationCustomers } from "@/lib/data/organization-customers";
type Tables = Database["public"]["Tables"];
export type OrganizationRow = Tables["organizations"]["Row"];
export type MembershipRow = Tables["organization_members"]["Row"];
export type ProfileRow = Tables["profiles"]["Row"];
export type LicenseRow = Tables["organization_licenses"]["Row"];
export type AvatarProfileRow = ProfileWithAvatar<ProfileRow>;
export interface OrganizationAdminRow extends OrganizationRow {
  avatarUrl: string | null;
  displayName: string;
  isSandbox: boolean;
  sandboxDesignationSuppressed: boolean;
  legalState: string;
  license: LicenseRow | null;
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
export interface PlatformUserRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  phone: string | null;
  title: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  avatar_path: string | null;
  avatar_updated_at: string | null;
  avatarUrl: string | null;
  profileExists: boolean;
  authAccountExists: boolean;
  authEmail: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  userSinceAt: string | null;
  status: PlatformUserStatus;
  platformAdmin: boolean;
  platformRoleAssigned: boolean;
  memberships: {
    id: string;
    organizationId: string;
    organizationName: string;
    role: string;
    status: Database["public"]["Enums"]["organization_membership_status"];
    active: boolean;
    organizationActive: boolean;
    joinedAt: string;
  }[];
  portalAccess: number;
  portalAccesses: {
    id: string;
    organizationName: string;
    customerName: string;
    effective: boolean;
  }[];
  accessState:
    | "Platform Operations"
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
export interface PlatformCustomerCount {
  organizationId: string;
  organizationName: string;
  customerCount: number;
}
export interface PlatformCustomerSummary {
  totalCustomers: number;
  byOrganization: PlatformCustomerCount[];
}
async function listAllAuthUsers(admin: ReturnType<typeof createAdminClient>) {
  const users: User[] = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage });
    if (result.error) {
      console.error("Platform Auth user enumeration failed", {
        code: result.error.code,
        message: result.error.message,
        page,
      });
      throw new Error("Platform authentication data is temporarily unavailable.");
    }
    users.push(...result.data.users);
    if (result.data.users.length < perPage) break;
  }
  return users;
}

async function loadPlatformData() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();
  const [
    organizations,
    memberships,
    profiles,
    platformRoles,
    portalUsers,
    cases,
    customers,
    organizationSettings,
    authUsers,
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("*,organization_customers(count)")
      .order("name"),
    supabase.from("organization_members").select("*"),
    supabase.from("profiles").select("*").order("display_name"),
    supabase.from("platform_user_roles").select("*"),
    supabase.from("customer_portal_users").select("*"),
    supabase.from("organization_cases").select("*"),
    supabase.from("organization_customers").select("*"),
    supabase.from("organization_settings").select("organization_id,portal_enabled"),
    listAllAuthUsers(admin),
  ]);
  const licenseQuery = await supabase.from("organization_licenses").select("*").eq("is_current", true).order("created_at", { ascending: false });
  if (licenseQuery.error) {
    console.error("License administration query failed", { code: licenseQuery.error.code, message: licenseQuery.error.message });
    throw new Error("License administration data is temporarily unavailable.");
  }
  const licenses = licenseQuery.data;

  type SandboxStateRow = {
    organization_id: string;
    canonical_name: string;
    display_name: string;
    is_sandbox: boolean;
    sandbox_designation_suppressed: boolean;
    legal_state: string;
  };

  type SandboxRpcResult = {
    data: unknown;
    error: { code?: string; message: string } | null;
  };

  const sandboxRpc = supabase.rpc as unknown as (
    fn: string,
  ) => Promise<SandboxRpcResult>;

  const sandboxStateResult =
    await sandboxRpc("get_platform_organization_sandbox_states");

  if (sandboxStateResult.error) {
    console.error("Platform Sandbox state query failed", {
      code: sandboxStateResult.error.code,
      message: sandboxStateResult.error.message,
    });
    throw new Error(
      "Organization Sandbox state is temporarily unavailable.",
    );
  }

  const sandboxStates = Array.isArray(sandboxStateResult.data)
    ? (sandboxStateResult.data as SandboxStateRow[])
    : [];

  const sandboxStateByOrganization = new Map(
    sandboxStates.map((state) => [
      state.organization_id,
      state,
    ]),
  );

  const error =
    organizations.error ??
    memberships.error ??
    profiles.error ??
    platformRoles.error ??
    portalUsers.error ??
    cases.error ??
    customers.error ??
    organizationSettings.error;
  if (error) {
    console.error("Platform administration query failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Platform administration data is temporarily unavailable.");
  }
  const hydratedProfiles = await attachAuthorizedAvatarUrls(
    profiles.data ?? [],
  );
  const organizationsWithAvatars = await Promise.all((organizations.data ?? []).map(async ({ organization_customers: customerCounts, ...org }) => {
    const avatarUrl = await resolveOwnedOrganizationAvatarUrl(
      org.avatar_path,
      org.id,
      async (ownedPath) => {
        const signed = await supabase.storage.from(ORGANIZATION_AVATAR_BUCKET).createSignedUrl(ownedPath, 3600);
        return signed.data?.signedUrl ?? null;
      },
    );
    return {
      ...org,
      avatarUrl,
      customerCount: customerCounts[0]?.count ?? 0,
    };
  }));
  return {
    organizations: organizationsWithAvatars.map((org) => {
      const sandboxState =
        sandboxStateByOrganization.get(org.id);

      return {
        ...org,
        displayName:
          sandboxState?.display_name?.trim() || org.name,
        isSandbox: sandboxState?.is_sandbox === true,
        sandboxDesignationSuppressed:
          sandboxState?.sandbox_designation_suppressed === true,
        legalState:
          sandboxState?.legal_state ?? "NOT_CONFIGURED",
        license:
          (licenses ?? []).find(
            (license) => license.organization_id === org.id,
          ) ?? null,
      };
    }),
    memberships: memberships.data ?? [],
    profiles: hydratedProfiles,
    platformRoles: platformRoles.data ?? [],
    portalUsers: portalUsers.data ?? [],
    cases: cases.data ?? [],
    customers: requireOrganizationCustomers(customers.data ?? []),
    organizationSettings: organizationSettings.data ?? [],
    authUsers,
  };
}
export async function getPlatformAdministration() {
  const data = await loadPlatformData();
  const organizations: OrganizationAdminRow[] = data.organizations.map(
    (org) => {
      const { customerCount, ...organization } = org;
      const members = data.memberships.filter(
        (m) => m.organization_id === org.id && m.is_active,
      );
      return {
        ...organization,
        activeUsers: members.length,
        businessOwners: members.filter((m) => m.role === "BUSINESS_OWNER")
          .length,
        businessAdmins: members.filter((m) => m.role === "BUSINESS_ADMIN")
          .length,
        openCases: data.cases.filter(
          (c) =>
            c.organization_id === org.id &&
            isIncompleteCompatibilityCaseStatus(c.status),
        ).length,
        customers: customerCount,
        lastActivity: [...data.cases.filter((c) => c.organization_id === org.id), ...data.customers.filter((c) => c.organization_id === org.id)]
          .map((item) => item.updated_at ?? item.created_at)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
      };
    },
  );
  const profileById = new Map(data.profiles.map((profile) => [profile.id, profile]));
  const authById = new Map(data.authUsers.map((user) => [user.id, user]));
  const userIds = new Set<string>([
    ...data.authUsers.map((user) => user.id),
    ...data.profiles.map((profile) => profile.id),
    ...data.platformRoles.map((role) => role.user_id),
    ...data.memberships.map((membership) => membership.user_id),
    ...data.portalUsers.map((portal) => portal.user_id),
  ]);
  const users: PlatformUserRow[] = Array.from(userIds).map((userId) => {
    const profile = profileById.get(userId);
    const authUser = authById.get(userId);
    const memberships = data.memberships
      .filter((m) => m.user_id === userId)
      .map((m) => ({
        id: m.id,
        organizationId: m.organization_id,
        organizationName:
          data.organizations.find((o) => o.id === m.organization_id)?.name ??
          "Unknown organization",
        role: m.role,
        status: m.status,
        active: m.is_active,
        organizationActive:
          data.organizations.find((o) => o.id === m.organization_id)?.status === "ACTIVE",
        joinedAt: m.joined_at,
      }));
    const assignedPlatformRoles = data.platformRoles.filter((r) => r.user_id === userId);
    const platformAdmin = assignedPlatformRoles.some(
      (r) => r.role === "SUPER_ADMIN" && r.is_active,
    );
    const portalAccesses = data.portalUsers
      .filter((p) => p.user_id === userId)
      .map((portal) => {
        const organization = data.organizations.find((item) => item.id === portal.organization_id);
        const customer = data.customers.find((item) => item.id === portal.customer_id && item.organization_id === portal.organization_id);
        const settings = data.organizationSettings.find((item) => item.organization_id === portal.organization_id);
        return {
          id: portal.id,
          organizationName: organization?.name ?? "Unknown organization",
          customerName: customer?.name ?? "Unknown customer",
          effective: isEffectiveCustomerPortalAccess({
            authAccountExists: Boolean(authUser),
            profileActive: profile?.is_active === true,
            linkActive: portal.is_active,
            identityConsistent: isCustomerPortalIdentityConsistent({
              customerEmail: customer?.email,
              profileEmail: profile?.email,
              authEmail: authUser?.email,
            }),
            organizationFound: Boolean(organization),
            organizationStatus: organization?.status ?? null,
            customerFound: Boolean(customer),
            customerStatus: customer?.status ?? null,
            portalEnabled: settings?.portal_enabled,
          }),
        };
      });
    const portalAccess = portalAccesses.filter((portal) => portal.effective).length;
    const effectivePlatformAccess = Boolean(
      authUser && profile?.is_active === true && platformAdmin,
    );
    const effectiveOrganizationAccess = Boolean(
      authUser &&
      profile?.is_active === true &&
      memberships.some((membership) =>
        membership.status === "ACTIVE" && membership.active && membership.organizationActive,
      ),
    );
    const status = derivePlatformUserStatus({
      authAccountExists: Boolean(authUser),
      profileExists: Boolean(profile),
      profileActive: profile?.is_active ?? null,
      hasApplicationAssignment: Boolean(
        profile || assignedPlatformRoles.length || memberships.length || portalAccesses.length,
      ),
      effectivePlatformAccess,
      effectiveOrganizationAccess,
      effectivePortalAccess: portalAccess > 0,
      membershipStatuses: memberships.map((membership) => membership.status),
    });
    const metadataName =
      typeof authUser?.user_metadata?.display_name === "string"
        ? authUser.user_metadata.display_name
        : typeof authUser?.user_metadata?.full_name === "string"
          ? authUser.user_metadata.full_name
          : null;
    const createdAt = profile?.created_at ?? authUser?.created_at ?? new Date(0).toISOString();
    return {
      id: userId,
      email: authUser?.email ?? profile?.email ?? null,
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      display_name:
        profile?.display_name ??
        metadataName ??
        authUser?.email ??
        profile?.email ??
        "Unnamed user",
      phone: profile?.phone ?? null,
      title: profile?.title ?? null,
      is_active: profile?.is_active ?? true,
      created_at: createdAt,
      updated_at: profile?.updated_at ?? createdAt,
      avatar_path: profile?.avatar_path ?? null,
      avatar_updated_at: profile?.avatar_updated_at ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      profileExists: Boolean(profile),
      authAccountExists: Boolean(authUser),
      authEmail: authUser?.email ?? null,
      emailConfirmedAt: authUser?.email_confirmed_at ?? null,
      lastSignInAt: authUser?.last_sign_in_at ?? null,
      userSinceAt: authUser?.created_at ?? profile?.created_at ?? null,
      status,
      platformAdmin,
      platformRoleAssigned: assignedPlatformRoles.some((role) => role.role === "SUPER_ADMIN"),
      memberships,
      portalAccess,
      portalAccesses,
      accessState: classifyAccess({
        platformAdmin: effectivePlatformAccess,
        activeOrganizationMembership: effectiveOrganizationAccess,
        activePortalAccess: portalAccess > 0,
      }),
    };
  }).sort((a, b) =>
    (a.display_name ?? a.email ?? "").localeCompare(b.display_name ?? b.email ?? ""),
  );
  const byOrganization = organizations
    .filter((organization) => organization.customers > 0)
    .map((organization) => ({
      organizationId: organization.id,
      organizationName: organization.name,
      customerCount: organization.customers,
    }));
  return {
    organizations,
    users,
    customerSummary: {
      totalCustomers: byOrganization.reduce(
        (total, organization) => total + organization.customerCount,
        0,
      ),
      byOrganization,
    } satisfies PlatformCustomerSummary,
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
  await requireSuperAdmin();

  const supabase = await createClient();

  const [
    organizationResult,
    membershipsResult,
    casesResult,
    customersResult,
    settingsResult,
    licenseResult,
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", id),
    supabase
      .from("organization_cases")
      .select("*")
      .eq("organization_id", id),
    supabase
      .from("organization_customers")
      .select("*")
      .eq("organization_id", id),
    supabase
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", id)
      .maybeSingle(),
    supabase
      .from("organization_licenses")
      .select("*")
      .eq("organization_id", id)
      .eq("is_current", true)
      .maybeSingle(),
  ]);

  const error =
    organizationResult.error ??
    membershipsResult.error ??
    casesResult.error ??
    customersResult.error ??
    settingsResult.error ??
    licenseResult.error;

  if (error) {
    console.error("Organization administration query failed", {
      organizationId: id,
      code: error.code,
      message: error.message,
    });
    throw new Error(
      "Organization administration data is temporarily unavailable.",
    );
  }

  if (!organizationResult.data) notFound();

  const membershipRows = membershipsResult.data ?? [];
  const organizationCases = casesResult.data ?? [];
  const organizationCustomers = requireOrganizationCustomers(
    customersResult.data ?? [],
  );

  const memberUserIds = [
    ...new Set(membershipRows.map((membership) => membership.user_id)),
  ];

  let profiles: AvatarProfileRow[] = [];

  if (memberUserIds.length) {
    const profileResult = await supabase
      .from("profiles")
      .select("*")
      .in("id", memberUserIds);

    if (profileResult.error) {
      console.error("Organization member profile query failed", {
        organizationId: id,
        code: profileResult.error.code,
        message: profileResult.error.message,
      });
      throw new Error(
        "Organization administration data is temporarily unavailable.",
      );
    }

    profiles = await attachAvatarUrls(
      supabase,
      profileResult.data ?? [],
    );
  }

  const baseOrganization = organizationResult.data;

  type OrganizationSandboxAuditProjection = {
    display_name?: string;
    is_sandbox?: boolean;
    sandbox_designation_suppressed?: boolean;
    legal_state?: string;
  };

  type OrganizationSandboxAuditRpcResult = {
    data: unknown;
    error: { code?: string; message: string } | null;
  };

  const organizationSandboxAuditRpc =
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<OrganizationSandboxAuditRpcResult>;

  const organizationSandboxAuditResult =
    await organizationSandboxAuditRpc(
      "get_organization_legal_audit_admin",
      {
        target_organization_id: id,
      },
    );

  if (organizationSandboxAuditResult.error) {
    console.error("Organization Sandbox state query failed", {
      organizationId: id,
      code: organizationSandboxAuditResult.error.code,
      message: organizationSandboxAuditResult.error.message,
    });
    throw new Error(
      "Organization Sandbox state is temporarily unavailable.",
    );
  }

  const organizationSandboxAudit =
    (organizationSandboxAuditResult.data ??
      null) as OrganizationSandboxAuditProjection | null;

  const organizationAvatarUrl = await resolveOwnedOrganizationAvatarUrl(
    baseOrganization.avatar_path,
    baseOrganization.id,
    async (ownedPath) =>
      (
        await supabase.storage
          .from(ORGANIZATION_AVATAR_BUCKET)
          .createSignedUrl(ownedPath, 3600)
      ).data?.signedUrl ?? null,
  );

  const activeMemberships = membershipRows.filter(
    (membership) => membership.is_active,
  );

  const organization: OrganizationAdminRow = {
    ...baseOrganization,
    avatarUrl: organizationAvatarUrl,
    displayName:
      organizationSandboxAudit?.display_name?.trim() ||
      baseOrganization.name,
    isSandbox:
      organizationSandboxAudit?.is_sandbox === true,
    sandboxDesignationSuppressed:
      organizationSandboxAudit
        ?.sandbox_designation_suppressed === true,
    legalState:
      organizationSandboxAudit?.legal_state ??
      "NOT_CONFIGURED",
    license: licenseResult.data ?? null,
    activeUsers: activeMemberships.length,
    businessOwners: activeMemberships.filter(
      (membership) => membership.role === "BUSINESS_OWNER",
    ).length,
    businessAdmins: activeMemberships.filter(
      (membership) => membership.role === "BUSINESS_ADMIN",
    ).length,
    openCases: organizationCases.filter(
      (item) => isIncompleteCompatibilityCaseStatus(item.status),
    ).length,
    customers: organizationCustomers.length,
    lastActivity:
      [...organizationCases, ...organizationCustomers]
        .map((item) => item.updated_at ?? item.created_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
  };

  const profileById = new Map(
    profiles.map((profile) => [profile.id, profile]),
  );

  const members: MemberAdminRow[] = membershipRows.flatMap(
    (membership) => {
      const profile = profileById.get(membership.user_id);
      return profile ? [{ ...membership, profile }] : [];
    },
  );

  return {
    organization,
    members,
    cases: organizationCases,
    customers: organizationCustomers,
    timezone: settingsResult.data?.timezone ?? "UTC",
  };
}
export async function getPlatformUser(id: string) {
  const data = await getPlatformAdministration();
  const user = data.users.find((item) => item.id === id);
  if (!user) notFound();
  return { user, organizations: data.organizations };
}
