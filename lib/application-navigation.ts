import {
  hasPermission,
  organizationGuideHref,
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
  { href: "/how-to-guide", label: "How to Guide", icon: "questions" },
  { href: "/settings", label: "Settings", icon: "settings", permission: "VIEW_SETTINGS" },
] as const satisfies readonly ApplicationNavigationItem[];

export const organizationSettingsNavigation = [
  { href: "/settings/case-configuration", label: "Case Configuration", icon: "cases", permission: "VIEW_ADMINISTRATION" },
  { href: "/settings/case-lifecycle", label: "Case Lifecycle", icon: "status", permission: "VIEW_ADMINISTRATION" },
  { href: "/settings/customer-portal", label: "Customer Portal", icon: "customers", permission: "VIEW_ADMINISTRATION" },
  { href: "/settings/user-access", label: "User Access", icon: "users", permission: "MANAGE_ROLE_PERMISSIONS" },
] as const satisfies readonly ApplicationNavigationItem[];

export const platformTemplatesNavigation = [
  { href: "/admin/email-templates", label: "Email Templates", icon: "communications" },
  { href: "/admin/configuration-templates", label: "New Orgn Templates", icon: "organization" },
  { href: "/admin/how-to-guides", label: "How-to-Guides Templates", icon: "questions" },
  { href: "/admin/landing-page", label: "Landing Page Template", icon: "platform" },
] as const satisfies readonly ApplicationNavigationItem[];

export const platformNavigation = [
  { href: "/", label: "Platform Console", icon: "platform" },
  { href: "/admin/organizations", label: "Organizations", icon: "organization" },
  { href: "/admin/organizations/new", label: "New Organizations", icon: "add" },
  { href: "/admin/case-cleanup", label: "Case Cleanup", icon: "cases" },
  { href: "/admin/customer-import", label: "Customer Import", icon: "customers" },
  { href: "/admin/customer-duplicates", label: "Duplicate Customers", icon: "customers" },
  { href: "/admin/trial-requests", label: "Trial Requests", icon: "reports" },
  { href: "/admin/email-templates", label: "Templates", icon: "questions" },
  { href: "/admin/users", label: "Users / Access", icon: "users" },
] as const satisfies readonly ApplicationNavigationItem[];

export const mobilePrimaryDestinations = new Set(["/", "/cases", "/communications"]);

export const authorizedOrganizationNavigation = (context: PermissionContext) =>
  organizationNavigation.filter((item) => hasPermission(context, item.permission));

export const authorizedOrganizationAdministrationNavigation = (context: PermissionContext) => {
  const guideHref = organizationGuideHref(context);
  return organizationAdministrationNavigation
    .filter((item) =>
      item.label === "How to Guide"
        ? Boolean(guideHref)
        : "permission" in item && hasPermission(context, item.permission),
    )
    .map((item) =>
      item.label === "How to Guide" && guideHref
        ? { ...item, href: guideHref }
        : item,
    );
};

export const authorizedOrganizationSettingsNavigation = (context: PermissionContext) =>
  organizationSettingsNavigation.filter(
    (item) =>
      hasPermission(context, item.permission) &&
      (item.href !== "/settings/case-lifecycle" || context.isSuperAdmin),
  );

export function mobileSecondaryNavigation(context: PermissionContext, platformContext: boolean) {
  const profileNavigation = {
    href: "/account/profile",
    label: "Profile",
    icon: "account" as const,
  };

  if (platformContext) {
    return [
      ...platformNavigation.filter((item) => !mobilePrimaryDestinations.has(item.href)),
      profileNavigation,
    ];
  }

  const organizationSecondary = authorizedOrganizationNavigation(context).filter(
    (item) => !mobilePrimaryDestinations.has(item.href),
  );
  const administration = authorizedOrganizationAdministrationNavigation(context);
  const orderedHrefs = [
    "/service-desk",
    "/customers",
    "/tasks",
    "/reports",
    "/questions",
  ];

  const orderedSecondary = orderedHrefs.flatMap((href) =>
    organizationSecondary.filter((item) => item.href === href),
  );
  const users = administration.filter((item) => item.href === "/users");
  const guide = administration.filter((item) => item.label === "How to Guide");
  const settings = administration
    .filter((item) => item.href === "/settings")
    .map((item) => ({
      ...item,
      href: "/settings/case-configuration",
    }));

  return [
    ...orderedSecondary,
    ...users,
    profileNavigation,
    ...guide,
    ...settings,
  ];
}
