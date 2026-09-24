import Link from "next/link";
import { ApplicationIcon } from "@/components/application-icon";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireAuthenticatedInternalUser } from "@/lib/auth/context";
import { signOutAction } from "@/lib/auth/actions";
import { getApplicationVersionLabel } from "@/lib/app-version";
import { mobileSecondaryNavigation } from "@/lib/application-navigation";
import { getNewTrialRequestCount } from "@/lib/data/trial-request-repository";

export default async function Page() {
  const access = await requireAuthenticatedInternalUser();
  const platformContext = access.isSuperAdmin && !access.activeOrganization;
  const secondaryNavigation = mobileSecondaryNavigation(access, platformContext);
  const newTrialRequestCount = platformContext
    ? await getNewTrialRequestCount()
    : 0;

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
