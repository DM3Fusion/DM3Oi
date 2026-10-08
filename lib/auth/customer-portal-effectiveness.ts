import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
export type CustomerPortalLink = Tables["customer_portal_users"]["Row"];
export type CustomerPortalOrganization = Tables["organizations"]["Row"];
export type CustomerPortalCustomer = Tables["customers"]["Row"];
export type CustomerPortalSettings = Tables["organization_settings"]["Row"];

export type CustomerPortalAccessReason =
  | "VALID"
  | "NO_ACTIVE_PORTAL_ACCESS"
  | "PORTAL_IDENTITY_MISMATCH"
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
  identityConsistent: boolean;
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
  identityConsistent,
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
  if (!identityConsistent) return "PORTAL_IDENTITY_MISMATCH";
  if (settingsLookupFailed) return "SETTINGS_LOOKUP_FAILED";
  if (portalEnabled === false) return "PORTAL_DISABLED";
  return "VALID";
}

const normalizedIdentityEmail = (email: string | null | undefined) =>
  email?.trim().toLowerCase() || null;

export function isCustomerPortalIdentityConsistent(input: {
  customerEmail: string | null | undefined;
  profileEmail: string | null | undefined;
  authEmail: string | null | undefined;
}) {
  const customerEmail = normalizedIdentityEmail(input.customerEmail);
  const profileEmail = normalizedIdentityEmail(input.profileEmail);
  const authEmail = normalizedIdentityEmail(input.authEmail);
  return Boolean(
    customerEmail &&
      profileEmail &&
      authEmail &&
      customerEmail === profileEmail &&
      customerEmail === authEmail,
  );
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
  const userIds = [...new Set(links.map((link) => link.user_id))];
  const [organizations, customers, settings, profiles, authIdentities] =
    await Promise.all([
      admin.from("organizations").select("*").in("id", organizationIds),
      admin.from("customers").select("*").in("id", customerIds),
      admin
        .from("organization_settings")
        .select("*")
        .in("organization_id", organizationIds),
      admin.from("profiles").select("id,email,is_active").in("id", userIds),
      Promise.all(
        userIds.map(async (userId) => {
          try {
            const result = await admin.auth.admin.getUserById(userId);
            return {
              userId,
              user: result.error ? null : result.data.user,
            };
          } catch {
            return { userId, user: null };
          }
        }),
      ),
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
    const profile = profiles.error
      ? null
      : (profiles.data ?? []).find((item) => item.id === link.user_id) ?? null;
    const authUser =
      authIdentities.find((item) => item.userId === link.user_id)?.user ?? null;
    const reason = getCustomerPortalAccessReason({
      authAccountExists: options.authAccountExists && Boolean(authUser),
      profileActive: options.profileActive && profile?.is_active === true,
      linkActive: link.is_active,
      identityConsistent: isCustomerPortalIdentityConsistent({
        customerEmail: customer?.email,
        profileEmail: profile?.email,
        authEmail: authUser?.email,
      }),
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
