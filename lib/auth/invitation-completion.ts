import type { IdentityCategory } from "@/lib/auth/identity-category";

export type InvitationCompletionDestination =
  | "/"
  | "/account/pending-activation"
  | "/portal"
  | "/portal/select-account";

export function resolveInvitationCompletionDestination(input: {
  hasVerifiedMembershipInvitation: boolean;
  identityCategory: IdentityCategory;
  effectivePortalAccessIds: string[];
}): {
  destination: InvitationCompletionDestination;
  portalAccessId: string | null;
} {
  if (input.hasVerifiedMembershipInvitation)
    return {
      destination: "/account/pending-activation",
      portalAccessId: null,
    };
  if (input.identityCategory === "INTERNAL")
    return { destination: "/", portalAccessId: null };
  if (
    input.identityCategory === "CUSTOMER_PORTAL" &&
    input.effectivePortalAccessIds.length === 1
  )
    return {
      destination: "/portal",
      portalAccessId: input.effectivePortalAccessIds[0],
    };
  if (
    input.identityCategory === "CUSTOMER_PORTAL" &&
    input.effectivePortalAccessIds.length > 1
  )
    return { destination: "/portal/select-account", portalAccessId: null };
  return { destination: "/", portalAccessId: null };
}
