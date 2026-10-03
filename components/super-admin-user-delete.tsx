"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteOrphanedPlatformUserAction,
  deleteRevokedPlatformUserAction,
} from "@/lib/data/platform-actions";

function DeleteButton({ confirmed }: { confirmed: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={`secondary-button permanent-delete-button ${confirmed ? "confirmed" : ""}`.trim()}
      disabled={pending || !confirmed}
    >
      {pending ? "Deleting…" : "Delete permanently"}
    </button>
  );
}

export function SuperAdminUserDelete({
  userId,
  membershipId,
  organizationId,
  displayName,
  email,
  blockers,
  returnTo,
  orphaned = false,
}: {
  userId: string;
  membershipId?: string;
  organizationId?: string;
  displayName: string;
  email: string;
  blockers: string[];
  returnTo?: "/users";
  orphaned?: boolean;
}) {
  const [confirmation, setConfirmation] = useState("");

  if (blockers.length) {
    return (
      <div className="admin-permanent-delete">
        <strong>Permanent deletion unavailable</strong>
        <p>
          This identity must remain in DM3Oi because it is still referenced by
          access or retained business history.
        </p>
        <ul>
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <details className="admin-permanent-delete">
      <summary>Permanent deletion</summary>
      <div>
        <p>
          Permanently delete <strong>{displayName}</strong>
          {email ? <> ({email})</> : null} from DM3Oi.
        </p>
        <p>
          This removes the Auth identity and profile and cannot be undone.
          {orphaned
            ? " The identity must have no remaining organization, platform, portal, or retained business dependencies."
            : " Organization access must already be revoked and all retained dependencies must remain clear."}
        </p>
        <form
          action={
            orphaned
              ? deleteOrphanedPlatformUserAction
              : deleteRevokedPlatformUserAction
          }
        >
          <input type="hidden" name="userId" value={userId} />
          {!orphaned && membershipId ? (
            <input type="hidden" name="membershipId" value={membershipId} />
          ) : null}
          {!orphaned && organizationId ? (
            <input type="hidden" name="organizationId" value={organizationId} />
          ) : null}
          {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
          <label>
            <span>Type DELETE to confirm</span>
            <input
              name="confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              pattern="DELETE"
              autoComplete="off"
              required
            />
          </label>
          <div className="form-actions">
            <DeleteButton confirmed={confirmation === "DELETE"} />
          </div>
        </form>
      </div>
    </details>
  );
}
