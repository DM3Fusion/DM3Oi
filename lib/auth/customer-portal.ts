import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const ACTIVE_PORTAL_ACCESS_COOKIE = "dm3iqcm-active-portal-access";
// Portal rows are extended by the deployed Supabase schema; keep this guard isolated from generated types.
export type PortalContextReason =
  | "VALID"
  | "NO_ACTIVE_PORTAL_ACCESS"
  | "ACCOUNT_SELECTION_REQUIRED"
  | "INVALID_SELECTED_ACCESS"
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_INACTIVE"
  | "CUSTOMER_NOT_FOUND"
  | "CUSTOMER_INACTIVE"
  | "PORTAL_DISABLED"
  | "SETTINGS_LOOKUP_FAILED";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CustomerPortalContext = { user: { id: string; email?: string }; access: any; organization: any; customer: any; links: any[]; settings: any; reason: PortalContextReason };

export async function getCustomerPortalContext(): Promise<CustomerPortalContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: links, error } = await supabase
    .from("customer_portal_users")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true);
  const activeLinks = links ?? [];
  if (error || !activeLinks.length) {
    return { user, access: null, organization: null, customer: null, links: [], settings: null, reason: "NO_ACTIVE_PORTAL_ACCESS" };
  }

  const selected = (await cookies()).get(ACTIVE_PORTAL_ACCESS_COOKIE)?.value;
  const access = activeLinks.find((link) => link.id === selected) ?? (activeLinks.length === 1 ? activeLinks[0] : null);
  if (!access) {
    return { user, access: null, organization: null, customer: null, links: activeLinks, settings: null, reason: "ACCOUNT_SELECTION_REQUIRED" };
  }

  const admin = createAdminClient();
  const [
    { data: organization, error: organizationError },
    { data: customer, error: customerError },
    { data: settings, error: settingsError },
  ] = await Promise.all([
    admin.from("organizations").select("*").eq("id", access.organization_id).eq("status", "ACTIVE").maybeSingle(),
    admin.from("customers").select("*").eq("id", access.customer_id).eq("organization_id", access.organization_id).eq("status", "ACTIVE").maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("organization_settings").select("portal_enabled,portal_submission_enabled,portal_show_priority,timezone").eq("organization_id", access.organization_id).maybeSingle(),
  ]);

  if (organizationError || !organization) {
    return { user, access: null, organization: null, customer: null, links: activeLinks, settings: null, reason: "ORGANIZATION_NOT_FOUND" };
  }
  if (organization.status !== "ACTIVE") {
    return { user, access: null, organization, customer: null, links: activeLinks, settings: null, reason: "ORGANIZATION_INACTIVE" };
  }
  if (customerError || !customer) {
    return { user, access: null, organization, customer: null, links: activeLinks, settings: null, reason: "CUSTOMER_NOT_FOUND" };
  }
  if (customer.status !== "ACTIVE") {
    return { user, access: null, organization, customer, links: activeLinks, settings: null, reason: "CUSTOMER_INACTIVE" };
  }
  if (settingsError) {
    return { user, access: null, organization, customer, links: activeLinks, settings: null, reason: "SETTINGS_LOOKUP_FAILED" };
  }

  const effectiveSettings = settings ?? { portal_enabled: true, portal_submission_enabled: true, portal_show_priority: true, timezone: "UTC" };
  if (effectiveSettings.portal_enabled === false) {
    return { user, access: null, organization, customer, links: activeLinks, settings: effectiveSettings, reason: "PORTAL_DISABLED" };
  }
  return { user, access, organization, customer, links: activeLinks, settings: effectiveSettings, reason: "VALID" };
}

export async function requireCustomerPortalContext(): Promise<CustomerPortalContext> {
  const context = await getCustomerPortalContext();
  if (!context?.access) {
    redirect(context?.reason === "ACCOUNT_SELECTION_REQUIRED" ? "/portal/select-account" : "/account/unprovisioned");
  }
  return context;
}
