import { PageHeader } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { AvatarUploadForm } from "@/components/avatar-upload-form";
import { ProfileIdentityForm } from "@/components/profile-identity-form";
import { requireAuthenticatedInternalUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { attachAvatarUrls } from "@/lib/data/avatar-urls";
import {
  removeOwnAvatarAction,
} from "@/lib/data/profile-actions";
import Link from "next/link";
import { mobileSecondaryNavigation } from "@/lib/application-navigation";
import { signOutAction } from "@/lib/auth/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ApplicationIcon } from "@/components/application-icon";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const [access, query] = await Promise.all([
    requireAuthenticatedInternalUser(),
    searchParams,
  ]);
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", access.user.id)
    .single();
  if (error) throw new Error("Profile data is temporarily unavailable.");
  const [identity] = await attachAvatarUrls(supabase, [profile]);
  const roleSummary = access.isSuperAdmin
    ? "SUPER ADMIN · Platform-level access"
    : access.organizations
        .map(
          (organization) =>
            `${organization.name} · ${organization.role.replaceAll("_", " ")}`,
        )
        .join("; ");
  const platformContext = access.isSuperAdmin && !access.activeOrganization;
  const secondaryNavigation = mobileSecondaryNavigation(access, platformContext);
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="My Profile"
        description="Manage your user-level identity across every DM3Oi organization."
      />
      {query.error ? (
        <div className="form-alert page-notice">{query.error}</div>
      ) : null}
      {query.message ? (
        <div className="success-alert page-notice">{query.message}</div>
      ) : null}
      {secondaryNavigation.length ? <section className="panel detail-section mobile-account-navigation" aria-labelledby="mobile-account-navigation-heading">
        <div className="section-head">
          <div>
            <h2 id="mobile-account-navigation-heading">{platformContext ? "Platform" : "Organization"}</h2>
            <p>Open the tools available to your account.</p>
          </div>
        </div>
        <nav aria-label={platformContext ? "Platform destinations" : "Organization destinations"}>
          {secondaryNavigation.map((item) => <Link href={item.href} key={item.href}><ApplicationIcon name={item.icon} /><span>{item.label}</span><ApplicationIcon name="forward" /></Link>)}
        </nav>
      </section> : null}
      <div className="profile-layout">
        <section className="panel detail-section profile-avatar-panel">
          <UserAvatar
            displayName={identity.display_name}
            email={identity.email}
            src={identity.avatarUrl}
            size="lg"
          />
          <div>
            <h2>Profile avatar</h2>
            <p>
              JPEG, PNG, or WEBP · automatically center-cropped and optimized
              to 512 × 512 WEBP
            </p>
          </div>
          <AvatarUploadForm />
          {identity.avatar_path ? (
            <form action={removeOwnAvatarAction}>
              <button className="text-button">Remove avatar</button>
            </form>
          ) : null}
        </section>
        <section className="panel detail-section">
          <div className="section-head">
            <div>
              <h2>Identity</h2>
              <p>Email is managed by Supabase Auth and is read-only here.</p>
            </div>
          </div>
          <ProfileIdentityForm
            displayName={identity.display_name ?? ""}
            email={identity.email ?? access.user.email ?? ""}
            accessSummary={roleSummary || "Pending Access"}
          />
        </section>
      </div>
      <section className="panel detail-section mobile-account-actions" aria-labelledby="mobile-account-actions-heading">
        <div className="section-head">
          <div>
            <h2 id="mobile-account-actions-heading">Account actions</h2>
          </div>
        </div>
        <form action={signOutAction}><PendingSubmitButton pendingLabel="Signing out…"><ApplicationIcon name="sign-out" />Sign Out</PendingSubmitButton></form>
      </section>
    </>
  );
}
