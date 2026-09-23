import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { ApplicationIcon } from "@/components/application-icon";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireAuthenticatedInternalUser } from "@/lib/auth/context";
import { signOutAction } from "@/lib/auth/actions";
import { getApplicationVersionLabel } from "@/lib/app-version";
import { mobileSecondaryNavigation } from "@/lib/application-navigation";

export default async function Page() {
  const access = await requireAuthenticatedInternalUser();
  const platformContext = access.isSuperAdmin && !access.activeOrganization;
  const secondaryNavigation = mobileSecondaryNavigation(access, platformContext);

  return (
    <>
      <PageHeader eyebrow="Account" title="More" />

      <section
        className="panel detail-section mobile-account-navigation mobile-more-navigation"
        aria-labelledby="mobile-more-navigation-heading"
      >
        <div className="section-head">
          <h2 id="mobile-more-navigation-heading">
            {platformContext ? "Platform" : "Organization"}
          </h2>
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
