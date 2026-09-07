"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateOrganizationAction } from "@/lib/data/platform-actions";
import {
  isOrganizationDetailsDirty,
  type OrganizationDetailsValues,
} from "@/lib/platform-organization-details";

export function PlatformOrganizationDetailsForm({
  organizationId,
  initial,
  createdAt,
  avatarAction,
}: {
  organizationId: string;
  initial: OrganizationDetailsValues;
  createdAt: string;
  avatarAction: ReactNode;
}) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = isOrganizationDetailsDirty(values, saved);
  const update = (key: keyof OrganizationDetailsValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setJustSaved(false);
    setError(null);
  };

  return (
    <>
      <form
        id="platform-organization-details-form"
        className="entity-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (submittingRef.current) return;
          submittingRef.current = true;
          setPending(true);
          setError(null);
          try {
            const result = await updateOrganizationAction(
              new FormData(event.currentTarget),
            );
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setValues(result.values);
            setSaved(result.values);
            setJustSaved(true);
            router.refresh();
          } catch {
            setError("The platform change could not be completed.");
          } finally {
            submittingRef.current = false;
            setPending(false);
          }
        }}
      >
        <input type="hidden" name="organizationId" value={organizationId} />
        <div className="form-grid">
          <label>
            <span>Name</span>
            <input
              name="name"
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              required
            />
          </label>
          <label>
            <span>Slug</span>
            <input
              name="slug"
              value={values.slug}
              onChange={(event) => update("slug", event.target.value)}
              required
            />
          </label>
          <label>
            <span>Status</span>
            <select
              name="status"
              value={values.status}
              onChange={(event) => update("status", event.target.value)}
            >
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <label>
            <span>Created</span>
            <input value={createdAt} disabled />
          </label>
        </div>
        {error ? (
          <div className="form-alert" role="alert">
            {error}
          </div>
        ) : null}
      </form>
      <div className="form-actions">
        <span className="organization-form-actions">
          {avatarAction}
          <button
            form="platform-organization-details-form"
            type="submit"
            className={dirty ? "license-save-button" : "primary-button"}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? "Saving…" : justSaved ? "Changes Saved" : "Save changes"}
          </button>
        </span>
      </div>
    </>
  );
}
