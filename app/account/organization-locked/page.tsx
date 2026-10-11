import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth-card";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { signOutAction } from "@/lib/auth/actions";
import { requireAuthenticatedInternalUser } from "@/lib/auth/context";
import { getMyOrganizationLegalState } from "@/lib/data/organization-legal-repository";

export const metadata = {
  title: "Organization access unavailable",
  robots: { index: false, follow: false },
};

export default async function OrganizationLockedPage() {
  const access = await requireAuthenticatedInternalUser();
  const organization = access.activeOrganization;

  if (!organization) redirect("/");

  const legalState = await getMyOrganizationLegalState(
    organization.id,
  );

  if (!legalState || legalState.state === "ACTIVE") {
    redirect("/");
  }

  const isBusinessOwner =
    organization.role === "BUSINESS_OWNER";

  return (
    <AuthCard
      title="System Denied"
      description={`${legalState.display_name} is not currently authorized for DM3Oi organization access.`}
    >
      <div className="auth-message">
        {isBusinessOwner ? (
          <>
            Organization authorization must be completed before
            anyone assigned to this organization can use DM3Oi.
            Return to Account to accept the current Terms of
            Service and acknowledge the current Privacy Policy.
          </>
        ) : (
          <>
            Organization access is currently locked because the
            required organization legal authorization is not
            active. See your Organization Admin for instructions.
          </>
        )}
      </div>

      <div className="form-actions">
        {isBusinessOwner ? (
          <Link className="primary-button" href="/account">
            Return to Accept
          </Link>
        ) : null}

        <form action={signOutAction}>
          <PendingSubmitButton
            className={isBusinessOwner ? "secondary-button" : "primary-button"}
            pendingLabel="Exiting…"
          >
            Exit System
          </PendingSubmitButton>
        </form>
      </div>
    </AuthCard>
  );
}
