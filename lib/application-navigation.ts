import {
  hasPermission,
  type Permission,
  type PermissionContext,
} from "./auth/permissions.ts";
import type { ApplicationIconName } from "./application-icons.ts";

export type ApplicationNavigationItem = {
  href: string;
  label: string;
  icon: ApplicationIconName;
  permission?: Permission;
};

export const organizationNavigation = [
  { href: "/", label: "Dashboard", icon: "dashboard", permission: "VIEW_DASHBOARD" },
  { href: "/cases", label: "Cases", icon: "cases", permission: "VIEW_CASES" },
  { href: "/communications", label: "Inbox", icon: "communications", permission: "VIEW_COMMUNICATIONS" },
  { href: "/service-desk", label: "Service Desk", icon: "service-desk", permission: "VIEW_SERVICE_DESK" },
  { href: "/customers", label: "Customers", icon: "customers", permission: "VIEW_CUSTOMERS" },
  { href: "/tasks", label: "Tasks", icon: "tasks", permission: "VIEW_TASKS" },
  { href: "/questions", label: "Questions & Rules", icon: "questions", permission: "VIEW_QUESTIONS" },
  { href: "/reports", label: "Reports", icon: "reports", permission: "VIEW_REPORTS" },
] as const satisfies readonly ApplicationNavigationItem[];

export const organizationAdministrationNavigation = [
  { href: "/users", label: "Users", icon: "users", permission: "VIEW_USERS" },
  { href: "/settings", label: "Settings", icon: "settings", permission: "VIEW_SETTINGS" },
] as const satisfies readonly ApplicationNavigationItem[];

export const platformNavigation = [
  { href: "/", label: "Back Office", icon: "platform" },
  { href: "/admin/organizations", label: "Organizations", icon: "organization" },
  { href: "/admin/users", label: "Users / Access", icon: "users" },
] as const satisfies readonly ApplicationNavigationItem[];

export const mobilePrimaryDestinations = new Set(["/", "/cases", "/communications"]);

export const authorizedOrganizationNavigation = (context: PermissionContext) =>
  organizationNavigation.filter((item) => hasPermission(context, item.permission));

export const authorizedOrganizationAdministrationNavigation = (context: PermissionContext) =>
  organizationAdministrationNavigation.filter((item) => hasPermission(context, item.permission));

export function mobileSecondaryNavigation(context: PermissionContext, platformContext: boolean) {
  const navigation = platformContext
    ? platformNavigation
    : [
        ...authorizedOrganizationNavigation(context),
        ...authorizedOrganizationAdministrationNavigation(context),
      ];
  return navigation.filter((item) => !mobilePrimaryDestinations.has(item.href));
}
