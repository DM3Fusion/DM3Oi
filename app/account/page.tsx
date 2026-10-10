import Link from "next/link";
import { ApplicationIcon } from "@/components/application-icon";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireAuthenticatedInternalUser } from "@/lib/auth/context";
import { signOutAction } from "@/lib/auth/actions";
import { getApplicationVersionLabel } from "@/lib/app-version";
import { mobileSecondaryNavigation } from "@/lib/application-navigation";
import { getNewTrialRequestCount } from "@/lib/data/trial-request-repository";
import { getMyOrganizationLegalState } from "@/lib/data/organization-legal-repository";
import {
  acceptOrganizationLegalDocumentsAction,
  withdrawOrganizationLegalAcceptanceAction,
} from "@/lib/data/organization-legal-actions";

export default async function Page() {
  const access = await requireAuthenticatedInternalUser();
  const platformContext = access.isSuperAdmin && !access.activeOrganization;
  const secondaryNavigation = mobileSecondaryNavigation(access, platformContext);
  const newTrialRequestCount = platformContext
    ? await getNewTrialRequestCount()
    : 0;

  const legalState = access.activeOrganization
    ? await getMyOrganizationLegalState(
        access.activeOrganization.id,
      )
    : null;

  const isBusinessOwner =
    access.activeOrganization?.role === "BUSINESS_OWNER";

  return (
    <>
      <section
        className="panel detail-section mobile-account-navigation mobile-more-navigation"
        aria-labelledby="mobile-more-navigation-heading"
      >
        <div className="section-head">
          <h2 id="mobile-more-navigation-heading">More Options</h2>
        </div>
        <nav
          aria-label={
            platformContext ? "Platform destinations" : "Organization destinations"
          }
        >
          {secondaryNavigation.map((item) => (
            <Link href={item.href} key={item.href}>
              <ApplicationIcon name={item.icon} />
              <span>{item.label}</span>
              {item.href === "/admin/trial-requests" && newTrialRequestCount > 0 ? (
                <span
                  className="nav-unread-count"
                  aria-label={`${newTrialRequestCount} new Trial Requests`}
                >
                  {newTrialRequestCount > 99 ? "99+" : newTrialRequestCount}
                </span>
              ) : null}
              <ApplicationIcon name="forward" />
            </Link>
          ))}
        </nav>
      </section>

      {access.activeOrganization && legalState ? (
        <section
          className="panel detail-section"
          aria-labelledby="organization-legal-heading"
        >
          <div className="section-head">
            <div>
              <h2 id="organization-legal-heading">
                Organization Legal Authorization
              </h2>
              <p>
                {legalState.display_name}
              </p>
            </div>
            <strong>
              {legalState.state.replaceAll("_", " ")}
            </strong>
          </div>

          {legalState.current_documents ? (
            <div className="detail-list">
              <div>
                <span>Terms of Service</span>
                <strong>
                  Version {legalState.current_documents.terms_version}
                  {" · "}
                  {legalState.current_documents.terms_effective_date}
                </strong>
              </div>
              <div>
                <span>Privacy Policy</span>
                <strong>
                  Version {legalState.current_documents.privacy_version}
                  {" · "}
                  {legalState.current_documents.privacy_effective_date}
                </strong>
              </div>
            </div>
          ) : (
            <p>
              Current legal documents are not available for
              organization authorization.
            </p>
          )}

          {legalState.is_sandbox ? (
            <p>
              This organization is currently designated as Sandbox.
            </p>
          ) : null}

          {isBusinessOwner &&
          legalState.current_documents &&
          legalState.state !== "ACTIVE" ? (
            <form
              action={acceptOrganizationLegalDocumentsAction}
              className="entity-form"
            >
              <input
                type="hidden"
                name="organizationId"
                value={access.activeOrganization.id}
              />
              <label>
                <span>Business Owner authorization</span>
                <span>
                  <input
                    type="checkbox"
                    name="legalConsent"
                    value="accepted"
                    required
                  />{" "}
                  I have authority to bind this organization. I
                  accept the current{" "}
                  <Link href="/terms">Terms of Service</Link> and
                  acknowledge the current{" "}
                  <Link href="/privacy">Privacy Policy</Link>.
                </span>
              </label>
              <div className="form-actions">
                <PendingSubmitButton
                  className="primary-button"
                  pendingLabel="Accepting…"
                >
                  Accept for Organization
                </PendingSubmitButton>
              </div>
            </form>
          ) : null}

          {isBusinessOwner &&
          legalState.state === "ACTIVE" ? (
            <form
              action={withdrawOrganizationLegalAcceptanceAction}
              className="form-actions"
            >
              <input
                type="hidden"
                name="organizationId"
                value={access.activeOrganization.id}
              />
              <PendingSubmitButton
                className="secondary-button"
                pendingLabel="Withdrawing…"
              >
                Withdraw Organization Acceptance
              </PendingSubmitButton>
            </form>
          ) : null}

          {!isBusinessOwner &&
          legalState.state !== "ACTIVE" ? (
            <p>
              A Business Owner must complete organization legal
              authorization.
            </p>
          ) : null}
        </section>
      ) : null}

      <section
        className="panel detail-section mobile-account-actions mobile-more-actions"
        aria-labelledby="mobile-more-actions-heading"
      >
        <div className="section-head">
          <h2 id="mobile-more-actions-heading">Account actions</h2>
        </div>
        <form action={signOutAction}>
          <PendingSubmitButton pendingLabel="Signing out…">
            <ApplicationIcon name="sign-out" />
            Sign Out
          </PendingSubmitButton>
        </form>
      </section>

      <small className="mobile-account-version">
        {getApplicationVersionLabel()}
      </small>
    </>
  );
}
