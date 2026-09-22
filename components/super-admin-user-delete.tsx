"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteRevokedPlatformUserAction } from "@/lib/data/platform-actions";

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="secondary-button"
      disabled={pending}
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
}: {
  userId: string;
  membershipId: string;
  organizationId: string;
  displayName: string;
  email: string;
  blockers: string[];
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
          Organization access must already be revoked and all retained
          dependencies must remain clear.
        </p>
        <form action={deleteRevokedPlatformUserAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="membershipId" value={membershipId} />
          <input type="hidden" name="organizationId" value={organizationId} />
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
            <DeleteButton />
          </div>
        </form>
      </div>
    </details>
  );
}
