import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveCustomerPortalAccesses,
  type CustomerPortalAccessReason,
} from "@/lib/auth/customer-portal-effectiveness";

export const ACTIVE_PORTAL_ACCESS_COOKIE = "dm3iqcm-active-portal-access";
// Portal rows are extended by the deployed Supabase schema; keep this guard isolated from generated types.
export type PortalContextReason =
  | CustomerPortalAccessReason
  | "ACCOUNT_SELECTION_REQUIRED"
  | "INVALID_SELECTED_ACCESS";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CustomerPortalContext = { user: { id: string; email?: string }; access: any; organization: any; customer: any; links: any[]; settings: any; reason: PortalContextReason };

export async function getCustomerPortalContext(): Promise<CustomerPortalContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: links, error }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("customer_portal_users")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true),
  ]);
  const activeLinks = links ?? [];
  if (profile?.is_active !== true || error || !activeLinks.length) {
    return { user, access: null, organization: null, customer: null, links: [], settings: null, reason: "NO_ACTIVE_PORTAL_ACCESS" };
  }

  const resolvedAccesses = await resolveCustomerPortalAccesses(
    createAdminClient(),
    activeLinks,
    { authAccountExists: true, profileActive: true },
  );
  const effectiveAccesses = resolvedAccesses.filter((item) => item.effective);
  const selected = (await cookies()).get(ACTIVE_PORTAL_ACCESS_COOKIE)?.value;
  const resolved = effectiveAccesses.find((item) => item.link.id === selected) ??
    (effectiveAccesses.length === 1 ? effectiveAccesses[0] : null);
  if (!resolved) {
    const ineffectiveSelection = resolvedAccesses.find((item) => item.link.id === selected);
    const reason = effectiveAccesses.length
      ? "ACCOUNT_SELECTION_REQUIRED"
      : ineffectiveSelection?.reason ?? resolvedAccesses[0]?.reason ?? "NO_ACTIVE_PORTAL_ACCESS";
    return { user, access: null, organization: null, customer: null, links: effectiveAccesses.map((item) => item.link), settings: null, reason };
  }

  const effectiveSettings = resolved.settings ?? { portal_enabled: true, portal_submission_enabled: true, portal_show_priority: true, timezone: "UTC" };
  return { user, access: resolved.link, organization: resolved.organization, customer: resolved.customer, links: effectiveAccesses.map((item) => item.link), settings: effectiveSettings, reason: "VALID" };
}

export async function requireCustomerPortalContext(): Promise<CustomerPortalContext> {
  const context = await getCustomerPortalContext();
  if (!context?.access) {
    redirect(context?.reason === "ACCOUNT_SELECTION_REQUIRED" ? "/portal/select-account" : "/account/unprovisioned");
  }
  return context;
}
