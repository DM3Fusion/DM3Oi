"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  draftId: string;
  customerName: string;
  caseTitle: string;
  completedSteps: number;
  totalSteps: number;
  updatedAt: string;
};

export function DraftIntakeRow({
  draftId,
  customerName,
  caseTitle,
  completedSteps,
  totalSteps,
  updatedAt,
}: Props) {
  const router = useRouter();
  const href = `/cases/new?draft=${draftId}`;
  const completionPercent =
    totalSteps > 0
      ? Math.round((completedSteps / totalSteps) * 100)
      : 0;

  const resume = () => {
    router.push(href);
  };

  return (
    <tr
      className="draft-intake-row"
      role="link"
      tabIndex={0}
      onClick={resume}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          resume();
        }
      }}
      aria-label={`Resume draft intake for ${customerName}`}
    >
      <td>
        <Link
          className="draft-intake-resume-button"
          href={href}
          onClick={(event) => event.stopPropagation()}
        >
          Resume
        </Link>
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
