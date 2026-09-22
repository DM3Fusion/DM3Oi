"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateUserProfileAction } from "@/lib/data/user-invitation-actions";
import { ResendInviteButton } from "@/components/resend-invite-button";

type Identity = { displayName: string; title: string; email: string; active: boolean };

export function PlatformIdentityForm({
  userId,
  identity,
  invitationEligible,
}: {
  userId: string;
  identity: Identity;
  invitationEligible: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Identity>(identity);
  const [saved, setSaved] = useState<Identity>(identity);
  const [pending, setPending] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const update = (key: keyof Identity, value: string | boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
    setJustSaved(false);
    setError(null);
  };
  return (
    <>
      <form
        id="platform-identity-form"
        className="entity-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          const result = await updateUserProfileAction(
            new FormData(event.currentTarget),
          );
          setPending(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSaved(values);
          setJustSaved(true);
          router.refresh();
        }}
      >
        <input type="hidden" name="userId" value={userId} />
        <div className="form-grid">
          <label><span>Display name</span><input name="displayName" value={values.displayName} onChange={(e) => update("displayName", e.target.value)} required /></label>
          <label><span>Title</span><input name="title" value={values.title} onChange={(e) => update("title", e.target.value)} maxLength={100} placeholder="e.g. President" /></label>
          <label><span>Email</span><input name="email" type="email" value={values.email} onChange={(e) => update("email", e.target.value)} required /></label>
          <label><span>Profile state</span><select name="active" value={String(values.active)} onChange={(e) => update("active", e.target.value === "true")}><option value="true">Active</option><option value="false">Inactive</option></select></label>
        </div>
        {error ? <p className="form-alert" role="alert">{error}</p> : null}
      </form>
      <div className="form-actions identity-actions">
        <button form="platform-identity-form" type="submit" className={dirty ? "license-save-button" : "primary-button"} disabled={pending}>
          {pending ? "Saving…" : justSaved ? "Changes Saved" : "Save identity"}
        </button>
        {invitationEligible ? <ResendInviteButton userId={userId} /> : null}
      </div>
    </>
  );
}
