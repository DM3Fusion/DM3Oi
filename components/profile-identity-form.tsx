"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOwnProfileAction } from "@/lib/data/profile-actions";

export const isProfileIdentityDirty = (value: string, persisted: string) =>
  value !== persisted;

export function ProfileIdentityForm({
  displayName,
  email,
  accessSummary,
}: {
  displayName: string;
  email: string;
  accessSummary: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(displayName);
  const [saved, setSaved] = useState(displayName);
  const [pending, setPending] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = isProfileIdentityDirty(value, saved);

  return (
    <form
      className="entity-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!dirty || pending) return;

        setPending(true);
        setError(null);
        setUpdated(false);

        try {
          const result = await updateOwnProfileAction(
            new FormData(event.currentTarget),
          );
          if (!result.ok) {
            setValue(result.values.displayName);
            setError(result.error);
            return;
          }

          setValue(result.values.displayName);
          setSaved(result.values.displayName);
          setUpdated(true);
          router.refresh();
        } catch {
          setError("Your profile could not be updated.");
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="form-grid">
        <label>
          <span>Display name</span>
          <input
            name="displayName"
            value={value}
            required
            maxLength={160}
            disabled={pending}
            onChange={(event) => {
              setValue(event.target.value);
              setUpdated(false);
              setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "profile-display-name-error" : undefined}
          />
          {error ? (
            <small
              id="profile-display-name-error"
              className="field-error"
              role="alert"
            >
              {error}
            </small>
          ) : null}
        </label>
        <label>
          <span>Email</span>
          <input value={email} readOnly />
        </label>
        <label className="full">
          <span>Access summary</span>
          <textarea value={accessSummary} readOnly rows={3} />
        </label>
      </div>
      <div className="form-actions">
        <button
          type="submit"
          className={
            dirty
              ? "license-save-button"
              : updated
                ? "profile-save-success"
                : "primary-button"
          }
          disabled={!dirty || pending}
          aria-busy={pending}
        >
          {pending
            ? "Saving…"
            : updated
              ? "Profile updated"
              : dirty
                ? "Save changes"
                : "Save profile"}
        </button>
      </div>
    </form>
  );
}
