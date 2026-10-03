export type InvitationEligibilityFacts = {
  organizationId?: string;
  membershipStatus?: string | null;
  targetHasActiveSuperAdminRole: boolean;
  authEmail?: string | null;
  authEmailConfirmedAt?: string | null;
  authLastSignInAt?: string | null;
  actorIsSuperAdmin: boolean;
  actorCanManageOrganization: boolean;
};

export function evaluateInvitationEligibility(
  facts: InvitationEligibilityFacts,
) {
  const authorized =
    facts.actorIsSuperAdmin ||
    (Boolean(facts.organizationId) && facts.actorCanManageOrganization);

  if (!authorized || !facts.authEmail) return false;

  if (facts.organizationId) {
    return (
      facts.membershipStatus === "INVITED" &&
      (facts.actorIsSuperAdmin || !facts.targetHasActiveSuperAdminRole)
    );
  }

  return (
    facts.actorIsSuperAdmin &&
    !facts.authEmailConfirmedAt &&
    !facts.authLastSignInAt
  );
}
