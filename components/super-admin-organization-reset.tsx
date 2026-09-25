"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  previewOrganizationResetAction,
  resetOrganizationCompanyAndUsersAction,
  retryOrganizationResetIdentityCleanupAction,
  type OrganizationResetPreviewState,
} from "@/lib/data/platform-actions";

type Owner = {
  userId: string;
  displayName: string;
  email: string;
};

const initialPreviewState: OrganizationResetPreviewState = {
  ok: false,
  error: null as never,
  preview: null,
};

const previewRows = [
  ["Test identities evaluated for permanent cleanup", "identityCleanupCandidates"],
  ["Organization users removed", "organizationUsersRemoved"],
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
  ["Case number counters", "caseNumberCounters"],
  ["Customer annual counters", "customerAnnualNumberCounters"],
  ["Customer number counters", "customerNumberCounters"],
  ["Service request annual counters", "serviceRequestAnnualNumberCounters"],
  ["Analytics live sessions", "analyticsLiveSessions"],
  ["Analytics page views", "analyticsPageViews"],
] as const;

function PreviewButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="secondary-button" disabled={pending}>
      {pending ? "Preparing Preview…" : "Preview Reset"}
    </button>
  );
}

function ResetButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="secondary-button danger-button"
      disabled={!enabled || pending}
    >
      {pending ? "Resetting…" : "Reset Company & Users"}
    </button>
  );
}

export function SuperAdminOrganizationReset({
  organizationId,
  organizationName,
  owners,
  retryResetAuditId,
}: {
  organizationId: string;
  organizationName: string;
  owners: Owner[];
  retryResetAuditId?: string;
}) {
  const defaultOwnerId = owners.length === 1 ? owners[0].userId : "";
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [previewOwnerId, setPreviewOwnerId] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const [previewState, previewAction] = useActionState(
    previewOrganizationResetAction,
    initialPreviewState,
  );

  const expected = `RESET ${organizationName}`;

  const previewIsCurrent =
    previewState.ok &&
    previewState.preview !== null &&
    previewOwnerId === ownerId &&
    previewState.preview.preservedOwnerUserId === ownerId &&
    previewState.preview.organizationId === organizationId;

  const enabled =
    Boolean(ownerId) &&
    previewIsCurrent &&
    confirmation === expected;

  function ownerChanged(nextOwnerId: string) {
    setOwnerId(nextOwnerId);
    setPreviewOwnerId("");
    setConfirmation("");
  }

  return (
    <details className="admin-organization-reset">
      <summary>Reset Company & Users</summary>

      <div className="admin-organization-reset-body">
        <strong>Reset organization test data</strong>

        {retryResetAuditId ? (
          <div className="form-alert">
            <p>
              The company reset completed, but identity cleanup still requires
              reconciliation. Retry only the identity cleanup; the company
              reset itself will not run again.
            </p>
            <form action={retryOrganizationResetIdentityCleanupAction}>
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="resetAuditId" value={retryResetAuditId} />
              <div className="form-actions">
                <button type="submit" className="secondary-button danger-button">
                  Retry Identity Cleanup
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <p>
          This permanently removes organization users other than the selected
          Business Owner, Customer Portal access, customers, cases, service
          requests, communications, notifications, analytics, membership
          history, and transactional counters for this organization.
        </p>

        <p>
          The organization, selected Business Owner identity and membership,
          organization settings, case types, lifecycle configuration, role
          permissions, licensing, Questions & Rules configuration, and platform
          landing-page configuration are preserved.
        </p>

        <p>
          Test identities used only by this organization are also evaluated for
          permanent removal from DM3Oi and Supabase Auth. An identity is
          preserved if it still has access, configuration history, or other
          retained dependencies elsewhere in the platform.
        </p>

        {owners.length ? (
          <>
            <label>
              <span>Business Owner to preserve</span>
              <select
                value={ownerId}
                onChange={(event) => ownerChanged(event.target.value)}
                required
              >
                {owners.length > 1 ? (
                  <option value="">Select Business Owner</option>
                ) : null}

                {owners.map((owner) => (
                  <option key={owner.userId} value={owner.userId}>
                    {owner.displayName || owner.email}
                    {owner.displayName && owner.email
                      ? ` — ${owner.email}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            <form
              action={previewAction}
              onSubmit={() => setPreviewOwnerId(ownerId)}
            >
              <input
                type="hidden"
                name="organizationId"
                value={organizationId}
              />
              <input
                type="hidden"
                name="preservedOwnerUserId"
                value={ownerId}
              />

              <div className="form-actions">
                <PreviewButton />
              </div>
            </form>

            {previewState.error ? (
              <div className="form-alert">{previewState.error}</div>
            ) : null}

            {previewIsCurrent && previewState.preview ? (
              <div className="admin-organization-reset-preview">
                <strong>Reset Preview</strong>
                <p>
                  These records will be removed from {organizationName}. Test
                  identities shown below will also be evaluated for permanent
                  cleanup. Review the counts before enabling the permanent
                  reset.
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

            <form action={resetOrganizationCompanyAndUsersAction}>
              <input
                type="hidden"
                name="organizationId"
                value={organizationId}
              />
              <input
                type="hidden"
                name="preservedOwnerUserId"
                value={ownerId}
              />

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
                <ResetButton enabled={enabled} />
              </div>
            </form>
          </>
        ) : (
          <div className="form-alert">
            Reset unavailable. This organization does not have an active
            Business Owner that can be preserved.
          </div>
        )}
      </div>
    </details>
  );
}
