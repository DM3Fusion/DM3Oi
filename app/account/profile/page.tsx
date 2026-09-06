import { PageHeader } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { AvatarUploadForm } from "@/components/avatar-upload-form";
import { requireAuthenticatedInternalUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { attachAvatarUrls } from "@/lib/data/avatar-urls";
import {
  removeOwnAvatarAction,
  updateOwnProfileAction,
} from "@/lib/data/profile-actions";

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
          <form action={updateOwnProfileAction} className="entity-form">
            <div className="form-grid">
              <label>
                <span>Display name</span>
                <input
                  name="displayName"
                  defaultValue={identity.display_name ?? ""}
                  required
                  maxLength={160}
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  value={identity.email ?? access.user.email ?? ""}
                  readOnly
                />
              </label>
              <label className="full">
                <span>Access summary</span>
                <textarea
                  value={roleSummary || "Pending Access"}
                  readOnly
                  rows={3}
                />
              </label>
            </div>
            <div className="form-actions">
              <button className="primary-button">Save profile</button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
