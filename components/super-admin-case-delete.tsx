"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  permanentlyDeleteOrganizationCasesAction,
  previewOrganizationCaseDeletionAction,
  type OrganizationCaseDeletionPreviewState,
} from "@/lib/data/platform-actions";

type CaseOption = {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
  customerName: string;
};

const initialState: OrganizationCaseDeletionPreviewState = {
  ok: false,
  error: null as never,
  preview: null,
};

const previewRows = [
  ["Cases", "caseCount"],
  ["Tasks", "caseTasks"],
  ["Activity records", "caseActivity"],
  ["Assignments", "caseAssignments"],
  ["Case questions", "caseQuestions"],
  ["Question responses", "caseQuestionResponses"],
  ["Document confirmations", "caseDocumentConfirmations"],
  ["Guided Intake drafts", "guidedIntakeDrafts"],
  ["Email records detached", "emailDeliveriesDetached"],
  ["Service Requests detached", "serviceRequestsDetached"],
] as const;

function PreviewButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="secondary-button"
      disabled={!enabled || pending}
    >
      {pending ? "Preparing Preview…" : "Preview Case Deletion"}
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
      {pending ? "Deleting…" : "Delete Selected Cases"}
    </button>
  );
}

export function SuperAdminCaseDelete({
  organizationId,
  organizationName,
  cases,
}: {
  organizationId: string;
  organizationName: string;
  cases: CaseOption[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [previewSelection, setPreviewSelection] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");

  const [previewState, previewAction] = useActionState(
    previewOrganizationCaseDeletionAction,
    initialState,
  );

  const selectedKey = useMemo(
    () => [...selected].sort().join("|"),
    [selected],
  );

  const previewKey = useMemo(
    () => [...previewSelection].sort().join("|"),
    [previewSelection],
  );

  const expected = `DELETE ${organizationName} CASES`;

  const previewIsCurrent =
    previewState.ok &&
    previewState.preview !== null &&
    selected.length > 0 &&
    selectedKey === previewKey &&
    [...previewState.preview.selectedCaseIds].sort().join("|") === selectedKey;

  const deleteEnabled =
    previewIsCurrent &&
    confirmation === expected;

  function toggle(caseId: string, checked: boolean) {
    setSelected((current) => {
      const next = checked
        ? [...new Set([...current, caseId])]
        : current.filter((id) => id !== caseId);

      return next;
    });

    setPreviewSelection([]);
    setConfirmation("");
  }

  if (!cases.length) {
    return (
      <details className="admin-organization-reset">
        <summary>Delete Test Cases</summary>
        <div className="admin-organization-reset-body">
          <strong>Permanent Case cleanup</strong>
          <p>No Cases currently exist for this organization.</p>
        </div>
      </details>
    );
  }

  return (
    <details className="admin-organization-reset">
      <summary>Delete Test Cases</summary>

      <div className="admin-organization-reset-body">
        <strong>Permanently delete selected Cases</strong>

        <p>
          This SUPER_ADMIN-only tool removes selected test Cases and their
          Case-owned workflow data. Customers, users, organization setup,
          licensing, Questions &amp; Rules, and Case-number counters are
          preserved.
        </p>

        <p>
          Linked Service Requests and email-delivery records are preserved and
          detached from the deleted Case. Deleted Case numbers are never reused.
        </p>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th aria-label="Select" />
                <th>Case</th>
                <th>Customer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={(event) =>
                        toggle(item.id, event.target.checked)
                      }
                      aria-label={`Select ${item.caseNumber}`}
                    />
                  </td>
                  <td>
                    <strong>{item.caseNumber}</strong>
                    <small className="table-secondary">{item.title}</small>
                  </td>
                  <td>{item.customerName}</td>
                  <td>{item.status.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form
          action={previewAction}
          onSubmit={() => setPreviewSelection([...selected])}
        >
          <input
            type="hidden"
            name="organizationId"
            value={organizationId}
          />

          {selected.map((caseId) => (
            <input
              key={caseId}
              type="hidden"
              name="caseId"
              value={caseId}
            />
          ))}

          <div className="form-actions">
            <PreviewButton enabled={selected.length > 0} />
          </div>
        </form>

        {previewState.error ? (
          <div className="form-alert">{previewState.error}</div>
        ) : null}

        {previewIsCurrent && previewState.preview ? (
          <div className="admin-organization-reset-preview">
            <strong>Case Deletion Preview</strong>

            <p>
              Review everything affected by this deletion before continuing.
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

        <form action={permanentlyDeleteOrganizationCasesAction}>
          <input
            type="hidden"
            name="organizationId"
            value={organizationId}
          />

          {selected.map((caseId) => (
            <input
              key={caseId}
              type="hidden"
              name="caseId"
              value={caseId}
            />
          ))}

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
            <DeleteButton enabled={deleteEnabled} />
          </div>
        </form>
      </div>
    </details>
  );
}
