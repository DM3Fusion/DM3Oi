"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  permanentlyDeleteOrganizationAction,
  previewPermanentOrganizationDeletionAction,
  type PermanentOrganizationDeletionPreviewState,
} from "@/lib/data/platform-actions";

const initialPreviewState: PermanentOrganizationDeletionPreviewState = {
  ok: false,
  error: null,
  preview: null,
};

const previewRows = [
  ["Organization users", "organizationUsers"],
  ["Identities evaluated for permanent cleanup", "identityCleanupCandidates"],
  ["Customer Portal users", "customerPortalUsers"],
  ["Customers", "customers"],
  ["Cases", "cases"],
  ["Case tasks", "caseTasks"],
  ["Case activity", "caseActivity"],
  ["Case assignments", "caseAssignments"],
  ["Case questions", "caseQuestions"],
  ["Case question responses", "caseQuestionResponses"],
  ["Service requests", "serviceRequests"],
  ["Service request messages", "serviceRequestMessages"],
  ["Service request activity", "serviceRequestActivity"],
  ["Service request communications", "serviceRequestCommunications"],
  ["Notifications", "notifications"],
  ["Membership events", "membershipEvents"],
  ["Question definitions", "questionDefinitions"],
  ["Question options", "questionOptions"],
  ["Rule definitions", "ruleDefinitions"],
  ["Rule actions", "ruleActions"],
  ["Case types", "caseTypes"],
  ["Lifecycle statuses", "lifecycleStatuses"],
  ["Role permissions", "rolePermissions"],
  ["Organization settings", "organizationSettings"],
  ["Licenses", "licenses"],
  ["License events", "licenseEvents"],
  ["Case number counters", "caseNumberCounters"],
  ["Customer annual counters", "customerAnnualNumberCounters"],
  ["Customer number counters", "customerNumberCounters"],
  ["Service request annual counters", "serviceRequestAnnualNumberCounters"],
  ["Analytics live sessions", "analyticsLiveSessions"],
  ["Analytics page views", "analyticsPageViews"],
  ["Historical reset audits retained", "resetAuditRows"],
  ["Trial Request conversion links retained", "trialRequestLinks"],
] as const;

function PreviewButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="secondary-button" disabled={pending}>
      {pending ? "Preparing Preview…" : "Preview Permanent Deletion"}
    </button>
  );
}

function DeleteButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="secondary-button danger-button"
      disabled={!enabled || pending}
    >
      {pending ? "Deleting Organization…" : "Delete Organization Permanently"}
    </button>
  );
}

export function SuperAdminOrganizationDelete({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [previewed, setPreviewed] = useState(false);
  const [previewState, previewAction] = useActionState(
    previewPermanentOrganizationDeletionAction,
    initialPreviewState,
  );

  const expected = `DELETE ${organizationName}`;
  const previewIsCurrent =
    previewed &&
    previewState.ok &&
    previewState.preview !== null &&
    previewState.preview.organizationId === organizationId &&
    previewState.preview.organizationName === organizationName;

  const enabled = previewIsCurrent && confirmation === expected;

  return (
    <details className="admin-organization-delete">
      <summary>Delete Organization Permanently</summary>

      <div className="admin-organization-delete-body">
        <strong>Permanent and non-reversible deletion</strong>

        <p>
          This permanently removes the organization and all organization-owned
          operational data, configuration, licensing, Questions & Rules,
          Customer Portal access, memberships, counters, analytics, and
          organization Storage assets.
        </p>

        <p>
          Historical Trial Request conversion records and platform reset/deletion
          audit history are retained without keeping the organization itself.
          Shared identities are preserved. Identities used exclusively by this
          organization are evaluated for permanent removal from DM3Oi and
          Supabase Auth.
        </p>

        <div className="form-alert">
          There is no restore, archive, undo, or recovery operation for this
          action. Preview and verify the exact impact before continuing.
        </div>

        <form
          action={previewAction}
          onSubmit={() => {
            setPreviewed(true);
            setConfirmation("");
          }}
        >
          <input type="hidden" name="organizationId" value={organizationId} />
          <div className="form-actions">
            <PreviewButton />
          </div>
        </form>

        {previewState.error ? (
          <div className="form-alert">{previewState.error}</div>
        ) : null}

        {previewIsCurrent && previewState.preview ? (
          <div className="admin-organization-delete-preview">
            <strong>Permanent Deletion Preview</strong>
            <p>
              Review every count below. The organization itself will also be
              deleted.
            </p>

            <dl>
              {previewRows.map(([label, key]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{previewState.preview?.[key] ?? 0}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <form action={permanentlyDeleteOrganizationAction}>
          <input type="hidden" name="organizationId" value={organizationId} />

          <label>
            <span>Type {expected} to confirm</span>
            <input
              name="confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              disabled={!previewIsCurrent}
              required
            />
          </label>

          <div className="form-actions">
            <DeleteButton enabled={enabled} />
          </div>
        </form>
      </div>
    </details>
  );
}
