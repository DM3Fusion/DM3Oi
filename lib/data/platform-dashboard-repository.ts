import { requireSuperAdmin } from "@/lib/auth/context";
import {
  buildPlatformDashboardData,
  indexNewestLicensesByOrganization,
  type PlatformDashboardCase,
  type PlatformDashboardCustomer,
  type PlatformDashboardMembership,
  type PlatformDashboardOrganization,
  type PlatformDashboardPortalUser,
  type PlatformDashboardProfile,
  type PlatformDashboardRole,
  type PlatformDashboardSettings,
} from "@/lib/data/platform-dashboard-model";
import { fetchAllSupabaseRows } from "@/lib/data/supabase-pagination";
import {
  ORGANIZATION_AVATAR_BUCKET,
  resolveOwnedOrganizationAvatarUrl,
} from "@/lib/profile/avatar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { User } from "@supabase/supabase-js";

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];

type OrganizationQueryRow = Tables["organizations"]["Row"] & {
  organization_customers: { count: number }[];
};

type MembershipQueryRow = PlatformDashboardMembership & { id: string };
type RoleQueryRow = PlatformDashboardRole & { id: string };
type PortalUserQueryRow = PlatformDashboardPortalUser & { id: string };
type CaseQueryRow = PlatformDashboardCase & {
  id: Views["organization_cases"]["Row"]["id"];
};
type LicenseQueryRow = Tables["organization_licenses"]["Row"];

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

async function listAllDashboardAuthUsers(
  admin: ReturnType<typeof createAdminClient>,
) {
  const users: User[] = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage });

    if (result.error) {
      console.error("Platform dashboard Auth user enumeration failed", {
        code: result.error.code,
        message: result.error.message,
        page,
      });
      throw new Error(
        "Platform dashboard authentication data is temporarily unavailable.",
      );
    }

    users.push(...result.data.users);
    if (result.data.users.length < perPage) break;
  }

  return users;
}

export async function getPlatformDashboard() {
  await requireSuperAdmin();

  const supabase = await createClient();
  const admin = createAdminClient();
  const sandboxRpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
  ) => Promise<SandboxRpcResult>;

  const [
    organizationRows,
    memberships,
    profiles,
    platformRoles,
    portalUsers,
    cases,
    customers,
    organizationSettings,
    licenses,
    sandboxStateResult,
    authUsers,
  ] = await Promise.all([
    fetchAllSupabaseRows<OrganizationQueryRow>(
      () =>
        supabase
          .from("organizations")
          .select(
            "id,name,slug,status,created_at,updated_at,avatar_path,avatar_updated_at,business_postal_code,organization_customers(count)",
          ),
      {
        collection: "organizations",
        orderBy: [
          { column: "name", ascending: true },
          { column: "id", ascending: true },
        ],
      },
    ),
    fetchAllSupabaseRows<MembershipQueryRow>(
      () =>
        supabase
          .from("organization_members")
          .select("id,user_id,organization_id,role,status,is_active"),
      {
        collection: "organization memberships",
        orderBy: [{ column: "id", ascending: true }],
      },
    ),
    fetchAllSupabaseRows<PlatformDashboardProfile>(
      () => supabase.from("profiles").select("id,email,is_active"),
      {
        collection: "profiles",
        orderBy: [{ column: "id", ascending: true }],
      },
    ),
    fetchAllSupabaseRows<RoleQueryRow>(
      () =>
        supabase
          .from("platform_user_roles")
          .select("id,user_id,role,is_active"),
      {
        collection: "platform roles",
        orderBy: [{ column: "id", ascending: true }],
      },
    ),
    fetchAllSupabaseRows<PortalUserQueryRow>(
      () =>
        supabase
          .from("customer_portal_users")
          .select("id,user_id,organization_id,customer_id,is_active"),
      {
        collection: "Customer Portal links",
        orderBy: [{ column: "id", ascending: true }],
      },
    ),
    fetchAllSupabaseRows<CaseQueryRow>(
      () =>
        supabase
          .from("organization_cases")
          .select("id,organization_id,status,created_at,updated_at"),
      {
        collection: "organization Cases",
        orderBy: [{ column: "id", ascending: true }],
      },
    ),
    fetchAllSupabaseRows<PlatformDashboardCustomer>(
      () =>
        supabase
          .from("organization_customers")
          .select("id,organization_id,email,status,created_at,updated_at"),
      {
        collection: "organization Customers",
        orderBy: [{ column: "id", ascending: true }],
      },
    ),
    fetchAllSupabaseRows<PlatformDashboardSettings>(
      () =>
        supabase
          .from("organization_settings")
          .select("organization_id,portal_enabled"),
      {
        collection: "organization settings",
        orderBy: [{ column: "organization_id", ascending: true }],
      },
    ),
    fetchAllSupabaseRows<LicenseQueryRow>(
      () =>
        supabase
          .from("organization_licenses")
          .select(
            "id,organization_id,commercial_state,created_at,created_by,expires_at,grace_ends_at,is_current,license_status,notes,notice_days,notification_thresholds,plan_code,starts_at,updated_at,updated_by",
          )
          .eq("is_current", true),
      {
        collection: "organization licenses",
        orderBy: [
          { column: "created_at", ascending: false },
          { column: "id", ascending: true },
        ],
      },
    ),
    sandboxRpc("get_platform_organization_sandbox_states"),
    listAllDashboardAuthUsers(admin),
  ]);

  if (sandboxStateResult.error) {
    console.error("Platform dashboard Sandbox state query failed", {
      code: sandboxStateResult.error.code,
      message: sandboxStateResult.error.message,
    });
    throw new Error("Organization Sandbox state is temporarily unavailable.");
  }

  const sandboxStates = Array.isArray(sandboxStateResult.data)
    ? (sandboxStateResult.data as SandboxStateRow[])
    : [];
  const sandboxStateByOrganization = new Map(
    sandboxStates.map((state) => [state.organization_id, state]),
  );
  const licenseByOrganization =
    indexNewestLicensesByOrganization(licenses);

  const organizations: PlatformDashboardOrganization[] = await Promise.all(
    organizationRows.map(
      async ({ organization_customers: customerCounts, ...organization }) => {
        const sandboxState = sandboxStateByOrganization.get(organization.id);
        const avatarUrl = await resolveOwnedOrganizationAvatarUrl(
          organization.avatar_path,
          organization.id,
          async (ownedPath) => {
            const signed = await supabase.storage
              .from(ORGANIZATION_AVATAR_BUCKET)
              .createSignedUrl(ownedPath, 3600);
            return signed.data?.signedUrl ?? null;
          },
        );

        return {
          ...organization,
          avatarUrl,
          customerCount: customerCounts[0]?.count ?? 0,
          displayName: sandboxState?.display_name?.trim() || organization.name,
          isSandbox: sandboxState?.is_sandbox === true,
          sandboxDesignationSuppressed:
            sandboxState?.sandbox_designation_suppressed === true,
          legalState: sandboxState?.legal_state ?? "NOT_CONFIGURED",
          license: licenseByOrganization.get(organization.id) ?? null,
        };
      },
    ),
  );

  return buildPlatformDashboardData({
    organizations,
    memberships,
    profiles,
    platformRoles,
    portalUsers,
    cases,
    customers,
    organizationSettings,
    authUsers: authUsers.map((user) => ({ id: user.id, email: user.email })),
  });
}
