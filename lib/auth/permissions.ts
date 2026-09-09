import type { Database } from "@/types/database.generated";

export type ApplicationRole = Database["public"]["Enums"]["application_role"];
export const permissions = [
  "MANAGE_PLATFORM",
  "VIEW_DASHBOARD","VIEW_CASES","CREATE_CASE","WORK_CASES","ASSIGN_CASES","REASSIGN_CASE_CUSTOMER",
  "VIEW_SERVICE_DESK","CREATE_SERVICE_REQUEST","WORK_SERVICE_REQUEST","MANAGE_SERVICE_REQUEST","ASSIGN_SERVICE_REQUEST","RESPOND_SERVICE_REQUEST",
  "VIEW_COMMUNICATIONS","RESPOND_COMMUNICATIONS",
  "VIEW_CUSTOMERS","CREATE_CUSTOMER","EDIT_CUSTOMER",
  "VIEW_TASKS","WORK_TASKS","MANAGE_TASKS","ASSIGN_TASKS",
  "VIEW_QUESTIONS","MANAGE_QUESTIONS","VIEW_RULES","MANAGE_RULES","VIEW_REPORTS",
  "VIEW_USERS","MANAGE_USERS",
  "VIEW_ADMINISTRATION","MANAGE_ORGANIZATION_SETTINGS","MANAGE_ROLE_PERMISSIONS","VIEW_SETTINGS",
  "ACCESS_CUSTOMER_PORTAL",
] as const;
export type Permission = typeof permissions[number];
export const configurableOrganizationRoles = ["BUSINESS_OWNER","BUSINESS_ADMIN","STAFF_MANAGER","STAFF_USER"] as const;
export type ConfigurableOrganizationRole = typeof configurableOrganizationRoles[number];
export const configurableOrganizationPermissions = permissions.filter(
  (permission) =>
    permission !== "MANAGE_PLATFORM" && permission !== "ACCESS_CUSTOMER_PORTAL",
);
export const protectedOwnerPermissions: readonly Permission[] = ["VIEW_SETTINGS","VIEW_USERS","MANAGE_USERS","VIEW_ADMINISTRATION","MANAGE_ORGANIZATION_SETTINGS","MANAGE_ROLE_PERMISSIONS"];

const staffRead: Permission[] = ["VIEW_DASHBOARD","VIEW_CASES","WORK_CASES","VIEW_SERVICE_DESK","CREATE_SERVICE_REQUEST","WORK_SERVICE_REQUEST","RESPOND_SERVICE_REQUEST","VIEW_COMMUNICATIONS","VIEW_CUSTOMERS","CREATE_CUSTOMER","EDIT_CUSTOMER","VIEW_TASKS","WORK_TASKS","VIEW_QUESTIONS","VIEW_REPORTS","VIEW_USERS","VIEW_SETTINGS"];
const manager: Permission[] = [...staffRead,"CREATE_CASE","ASSIGN_CASES","REASSIGN_CASE_CUSTOMER","MANAGE_TASKS","ASSIGN_TASKS","MANAGE_SERVICE_REQUEST","ASSIGN_SERVICE_REQUEST","RESPOND_COMMUNICATIONS","MANAGE_QUESTIONS","VIEW_RULES"];
const organizationAdmin: Permission[] = [...manager,"MANAGE_RULES","MANAGE_USERS","VIEW_ADMINISTRATION","MANAGE_ORGANIZATION_SETTINGS","MANAGE_ROLE_PERMISSIONS"];

export const rolePermissionMatrix: Readonly<Record<ApplicationRole, ReadonlySet<Permission>>> = {
  SUPER_ADMIN: new Set([...permissions.filter(permission=>permission!=="ACCESS_CUSTOMER_PORTAL")]),
  BUSINESS_OWNER: new Set(organizationAdmin),
  BUSINESS_ADMIN: new Set(organizationAdmin),
  STAFF_MANAGER: new Set(manager),
  STAFF_USER: new Set(staffRead),
  PUBLIC_USER: new Set(["ACCESS_CUSTOMER_PORTAL"]),
};

export type PermissionContext = {
  isSuperAdmin: boolean;
  internalAccess: boolean;
  activeOrganization?: { role: ApplicationRole } | null;
  customerPortalCount?: number;
  effectivePermissions?: ReadonlySet<Permission>;
};

export type OrganizationPermissionOverride={role:ConfigurableOrganizationRole;permission:Permission;isAllowed:boolean};
export const roleHasDefaultPermission=(role:ApplicationRole,permission:Permission)=>rolePermissionMatrix[role]?.has(permission)??false;
export function getEffectiveOrganizationPermissions(role:ApplicationRole,overrides:readonly OrganizationPermissionOverride[]=[]):ReadonlySet<Permission>{
  const effective=new Set(rolePermissionMatrix[role]??[]);
  if(!configurableOrganizationRoles.some(item=>item===role))return effective;
  for(const override of overrides)if(override.role===role&&permissions.some(permission=>permission===override.permission)){if(override.isAllowed)effective.add(override.permission);else effective.delete(override.permission);}
  if(role==="BUSINESS_OWNER")for(const permission of protectedOwnerPermissions)effective.add(permission);
  if(role==="STAFF_MANAGER"||role==="STAFF_USER")effective.delete("MANAGE_ROLE_PERMISSIONS");
  return effective;
}

export function hasPermission(context: PermissionContext | null, permission: Permission): boolean {
  if (!context) return false;
  if (permission === "ACCESS_CUSTOMER_PORTAL") return (context.customerPortalCount ?? 0) > 0;
  if (!context.internalAccess || !context.activeOrganization) return false;
  const role = context.isSuperAdmin ? "SUPER_ADMIN" : context.activeOrganization.role;
  return (context.effectivePermissions??rolePermissionMatrix[role]).has(permission);
}
export const roleHasPermission=roleHasDefaultPermission;
export const hasAnyPermission=(context:PermissionContext|null,required:readonly Permission[])=>required.some(permission=>hasPermission(context,permission));
export const hasAllPermissions=(context:PermissionContext|null,required:readonly Permission[])=>required.every(permission=>hasPermission(context,permission));
export const canAccessOrganizationAdministration=(context:PermissionContext|null)=>hasPermission(context,"VIEW_ADMINISTRATION");
export const canInviteOrganizationUsers=(context:PermissionContext|null)=>
  Boolean(
    context &&
    !context.isSuperAdmin &&
    hasPermission(context,"MANAGE_USERS") &&
    (context.activeOrganization?.role==="BUSINESS_OWNER" || context.activeOrganization?.role==="BUSINESS_ADMIN"),
  );
