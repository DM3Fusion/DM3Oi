import type { Database } from "@/types/database.generated";

export type ApplicationRole = Database["public"]["Enums"]["application_role"];
export const permissions = [
  "MANAGE_PLATFORM",
  "VIEW_DASHBOARD","VIEW_CASES","CREATE_CASE","WORK_CASES","ASSIGN_CASES",
  "VIEW_SERVICE_DESK","CREATE_SERVICE_REQUEST","MANAGE_SERVICE_REQUEST","ASSIGN_SERVICE_REQUEST",
  "VIEW_COMMUNICATIONS","RESPOND_COMMUNICATIONS",
  "VIEW_CUSTOMERS","CREATE_CUSTOMER","EDIT_CUSTOMER",
  "VIEW_TASKS","WORK_TASKS","ASSIGN_TASKS",
  "VIEW_QUESTIONS","MANAGE_QUESTIONS","VIEW_REPORTS",
  "VIEW_USERS","MANAGE_USERS",
  "VIEW_ADMINISTRATION","MANAGE_ORGANIZATION_SETTINGS","VIEW_SETTINGS",
  "ACCESS_CUSTOMER_PORTAL",
] as const;
export type Permission = typeof permissions[number];

const staffRead: Permission[] = ["VIEW_DASHBOARD","VIEW_CASES","WORK_CASES","VIEW_SERVICE_DESK","CREATE_SERVICE_REQUEST","VIEW_COMMUNICATIONS","VIEW_CUSTOMERS","CREATE_CUSTOMER","EDIT_CUSTOMER","VIEW_TASKS","WORK_TASKS","VIEW_QUESTIONS","VIEW_REPORTS","VIEW_USERS","VIEW_SETTINGS"];
const manager: Permission[] = [...staffRead,"CREATE_CASE","ASSIGN_CASES","MANAGE_SERVICE_REQUEST","ASSIGN_SERVICE_REQUEST","RESPOND_COMMUNICATIONS","ASSIGN_TASKS","MANAGE_QUESTIONS"];
const organizationAdmin: Permission[] = [...manager,"MANAGE_USERS","VIEW_ADMINISTRATION","MANAGE_ORGANIZATION_SETTINGS"];

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
};

export function hasPermission(context: PermissionContext | null, permission: Permission): boolean {
  if (!context) return false;
  if (permission === "ACCESS_CUSTOMER_PORTAL") return (context.customerPortalCount ?? 0) > 0;
  if (!context.internalAccess || !context.activeOrganization) return false;
  const role = context.isSuperAdmin ? "SUPER_ADMIN" : context.activeOrganization.role;
  return rolePermissionMatrix[role].has(permission);
}
export const roleHasPermission=(role:ApplicationRole,permission:Permission)=>rolePermissionMatrix[role].has(permission);
export const hasAnyPermission=(context:PermissionContext|null,required:readonly Permission[])=>required.some(permission=>hasPermission(context,permission));
export const hasAllPermissions=(context:PermissionContext|null,required:readonly Permission[])=>required.every(permission=>hasPermission(context,permission));
export const canAccessOrganizationAdministration=(context:PermissionContext|null)=>hasPermission(context,"VIEW_ADMINISTRATION");
