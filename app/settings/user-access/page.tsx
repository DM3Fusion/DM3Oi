import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { UserAccessMatrix } from "@/components/user-access-matrix";
import { getAccessContext } from "@/lib/auth/context";
import { canConfigureOrganizationRole } from "@/lib/auth/organization-permissions";
import {
  configurableOrganizationRoles,
  getEffectiveOrganizationPermissions,
  hasPermission,
  permissions,
  type ConfigurableOrganizationRole,
  type OrganizationPermissionOverride,
  type Permission,
} from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
const navigationRows = [
  { label: "Dashboard", permission: "VIEW_DASHBOARD" },
  { label: "Cases", permission: "VIEW_CASES" },
  { label: "Service Desk", permission: "VIEW_SERVICE_DESK" },
  { label: "Communications", permission: "VIEW_COMMUNICATIONS" },
  { label: "Customers", permission: "VIEW_CUSTOMERS" },
  { label: "Tasks", permission: "VIEW_TASKS" },
  { label: "Questions & Rules", permission: "VIEW_QUESTIONS" },
  { label: "Rules", permission: "VIEW_RULES" },
  { label: "Reports", permission: "VIEW_REPORTS" },
  { label: "Users", permission: "VIEW_USERS" },
  { label: "Settings", permission: "VIEW_SETTINGS" },
] as const;
const managementRows = [
  { label: "Case creation", permission: "CREATE_CASE" },
  { label: "Case work", permission: "WORK_CASES" },
  { label: "Case assignment", permission: "ASSIGN_CASES" },
  { label: "Case customer reassignment", permission: "REASSIGN_CASE_CUSTOMER" },
  { label: "Task work / completion", permission: "WORK_TASKS" },
  { label: "Task management", permission: "MANAGE_TASKS" },
  { label: "Task assignment", permission: "ASSIGN_TASKS" },
  { label: "Service Desk creation", permission: "CREATE_SERVICE_REQUEST" },
  { label: "Service Desk work", permission: "WORK_SERVICE_REQUEST" },
  { label: "Service Desk management", permission: "MANAGE_SERVICE_REQUEST" },
  { label: "Service Desk response", permission: "RESPOND_SERVICE_REQUEST" },
  { label: "Service Desk assignment", permission: "ASSIGN_SERVICE_REQUEST" },
  { label: "Customer creation", permission: "CREATE_CUSTOMER" },
  { label: "Customer management", permission: "EDIT_CUSTOMER" },
  { label: "Question management", permission: "MANAGE_QUESTIONS" },
  { label: "Rule management", permission: "MANAGE_RULES" },
  { label: "User management", permission: "MANAGE_USERS" },
  {
    label: "Organization configuration",
    permission: "MANAGE_ORGANIZATION_SETTINGS",
  },
  { label: "User Access configuration", permission: "MANAGE_ROLE_PERMISSIONS" },
] as const;
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const [access, query] = await Promise.all([getAccessContext(), searchParams]);
  if (
    !access?.activeOrganization ||
    !hasPermission(access, "VIEW_SETTINGS") ||
    !hasPermission(access, "MANAGE_ROLE_PERMISSIONS")
  )
    notFound();
  const supabase = await createClient();
  const overrideResult = await supabase
    .from("organization_role_permissions")
    .select("role,permission,is_allowed")
    .eq("organization_id", access.activeOrganization.id);
  if (overrideResult.error) throw overrideResult.error;
  const data=overrideResult.data;
  const overrides = (
    (data ?? []) as Array<{
      role: string;
      permission: string;
      is_allowed: boolean;
    }>
  )
    .filter(
      (row) =>
        configurableOrganizationRoles.some((role) => role === row.role) &&
        permissions.some((permission) => permission === row.permission),
    )
    .map((row) => ({
      role: row.role,
      permission: row.permission,
      isAllowed: row.is_allowed,
    })) as OrganizationPermissionOverride[];
  const shownPermissions = [...navigationRows, ...managementRows].map(
    (row) => row.permission,
  ) as Permission[];
  const initial = Object.fromEntries(
    configurableOrganizationRoles.map((role) => {
      const effective = getEffectiveOrganizationPermissions(role, overrides);
      return [
        role,
        Object.fromEntries(
          shownPermissions.map((permission) => [
            permission,
            effective.has(permission),
          ]),
        ),
      ];
    }),
  ) as Record<ConfigurableOrganizationRole, Record<string, boolean>>;
  const editableRoles = configurableOrganizationRoles.filter((role) =>
    canConfigureOrganizationRole(
      access.activeOrganization!.role,
      role,
      access.isSuperAdmin,
    ),
  );
  const focusedRole = configurableOrganizationRoles.find(
    (role) => role === query.role,
  );
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="User Access"
        description="Control what organization roles can access and manage."
      />
      <UserAccessMatrix
        navigationRows={[...navigationRows]}
        managementRows={[...managementRows]}
        initial={initial}
        editableRoles={editableRoles}
        focusedRole={focusedRole}
      />
    </>
  );
}
