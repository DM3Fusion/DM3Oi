"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteGuidedIntakeDraftAction } from "@/lib/data/guided-case-intake-actions";

type Props = {
  draftId: string;
  customerName: string;
  caseTitle: string;
  completedSteps: number;
  totalSteps: number;
  canResume: boolean;
  canDelete: boolean;
  updatedAt: string;
};

export function DraftIntakeRow({
  draftId,
  customerName,
  caseTitle,
  completedSteps,
  totalSteps,
  canResume,
  canDelete,
  updatedAt,
}: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const href = `/cases/new?draft=${draftId}`;
  const completionPercent =
    totalSteps > 0
      ? Math.round((completedSteps / totalSteps) * 100)
      : 0;

  const resume = () => {
    if (canResume) router.push(href);
  };

  const deleteDraft = async () => {
    if (deleting || !canDelete) return;

    if (
      !window.confirm(
        `Permanently delete the draft intake for "${customerName}"? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    const result = await deleteGuidedIntakeDraftAction(draftId);

    if (!result.ok) {
      setDeleteError(result.error);
      setDeleting(false);
      return;
    }

    router.refresh();
  };

  return (
    <tr
      className={`draft-intake-row${canResume ? "" : " draft-intake-row-static"}`}
      role={canResume ? "link" : undefined}
      tabIndex={canResume ? 0 : undefined}
      onClick={canResume ? resume : undefined}
      onKeyDown={
        canResume
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                resume();
              }
            }
          : undefined
      }
      aria-label={
        canResume ? `Resume draft intake for ${customerName}` : undefined
      }
    >
      <td>
        <div className="draft-intake-actions">
          {canResume ? (
            <Link
              className="draft-intake-resume-button"
              href={href}
              onClick={(event) => event.stopPropagation()}
            >
              Resume
            </Link>
          ) : null}

          {canDelete ? (
            <button
              className="draft-intake-delete-button"
              type="button"
              disabled={deleting}
              onClick={(event) => {
                event.stopPropagation();
                void deleteDraft();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          ) : null}
        </div>

        {deleteError ? (
          <span className="draft-intake-delete-error" role="alert">
            {deleteError}
          </span>
        ) : null}
      </td>
      <td className="draft-intake-status">
        <strong>
          {completedSteps} of {totalSteps} ({completionPercent}%)
        </strong>
        <span>complete</span>
      </td>
      <td>{customerName}</td>
      <td>{caseTitle}</td>
      <td>{updatedAt}</td>
    </tr>
  );
}
