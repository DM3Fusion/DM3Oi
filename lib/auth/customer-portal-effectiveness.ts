import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

type Tables = Database["public"]["Tables"];
export type CustomerPortalLink = Tables["customer_portal_users"]["Row"];
export type CustomerPortalOrganization = Tables["organizations"]["Row"];
export type CustomerPortalCustomer = Tables["customers"]["Row"];
export type CustomerPortalSettings = Tables["organization_settings"]["Row"];

export type CustomerPortalAccessReason =
  | "VALID"
  | "NO_ACTIVE_PORTAL_ACCESS"
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_INACTIVE"
  | "CUSTOMER_NOT_FOUND"
  | "CUSTOMER_INACTIVE"
  | "PORTAL_DISABLED"
  | "SETTINGS_LOOKUP_FAILED";

export interface CustomerPortalEffectivenessInput {
  authAccountExists: boolean;
  profileActive: boolean;
  linkActive: boolean;
  organizationStatus: string | null;
  customerStatus: string | null;
  portalEnabled: boolean | null | undefined;
  organizationFound?: boolean;
  customerFound?: boolean;
  settingsLookupFailed?: boolean;
}

export function getCustomerPortalAccessReason({
  authAccountExists,
  profileActive,
  linkActive,
  organizationStatus,
  customerStatus,
  portalEnabled,
  organizationFound = organizationStatus !== null,
  customerFound = customerStatus !== null,
  settingsLookupFailed = false,
}: CustomerPortalEffectivenessInput): CustomerPortalAccessReason {
  if (!authAccountExists || !profileActive || !linkActive)
    return "NO_ACTIVE_PORTAL_ACCESS";
  if (!organizationFound) return "ORGANIZATION_NOT_FOUND";
  if (organizationStatus !== "ACTIVE") return "ORGANIZATION_INACTIVE";
  if (!customerFound) return "CUSTOMER_NOT_FOUND";
  if (customerStatus !== "ACTIVE") return "CUSTOMER_INACTIVE";
  if (settingsLookupFailed) return "SETTINGS_LOOKUP_FAILED";
  if (portalEnabled === false) return "PORTAL_DISABLED";
  return "VALID";
}

export function isEffectiveCustomerPortalAccess(
  input: CustomerPortalEffectivenessInput,
): boolean {
  return getCustomerPortalAccessReason(input) === "VALID";
}

export interface ResolvedCustomerPortalAccess {
  link: CustomerPortalLink;
  organization: CustomerPortalOrganization | null;
  customer: CustomerPortalCustomer | null;
  settings: CustomerPortalSettings | null;
  reason: CustomerPortalAccessReason;
  effective: boolean;
}

export async function resolveCustomerPortalAccesses(
  admin: SupabaseClient<Database>,
  links: readonly CustomerPortalLink[],
  options: { authAccountExists: boolean; profileActive: boolean },
): Promise<ResolvedCustomerPortalAccess[]> {
  if (!links.length) return [];

  const organizationIds = [...new Set(links.map((link) => link.organization_id))];
  const customerIds = [...new Set(links.map((link) => link.customer_id))];
  const [organizations, customers, settings] = await Promise.all([
    admin.from("organizations").select("*").in("id", organizationIds),
    admin.from("customers").select("*").in("id", customerIds),
    admin
      .from("organization_settings")
      .select("*")
      .in("organization_id", organizationIds),
  ]);

  return links.map((link) => {
    const organization = organizations.error
      ? null
      : (organizations.data ?? []).find(
          (item) => item.id === link.organization_id,
        ) ?? null;
    const customer = customers.error
      ? null
      : (customers.data ?? []).find(
          (item) =>
            item.id === link.customer_id &&
            item.organization_id === link.organization_id,
        ) ?? null;
    const organizationSettings = settings.error
      ? null
      : (settings.data ?? []).find(
          (item) => item.organization_id === link.organization_id,
        ) ?? null;
    const reason = getCustomerPortalAccessReason({
      ...options,
      linkActive: link.is_active,
      organizationFound: !organizations.error && Boolean(organization),
      organizationStatus: organization?.status ?? null,
      customerFound: !customers.error && Boolean(customer),
      customerStatus: customer?.status ?? null,
      settingsLookupFailed: Boolean(settings.error),
      portalEnabled: organizationSettings?.portal_enabled,
    });

    return {
      link,
      organization,
      customer,
      settings: organizationSettings,
      reason,
      effective: reason === "VALID",
    };
  });
}
