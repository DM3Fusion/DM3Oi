"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  draftId: string;
  customerName: string;
  caseTitle: string;
  caseType: string;
  savedStep: string;
  updatedAt: string;
};

export function DraftIntakeRow({
  draftId,
  customerName,
  caseTitle,
  caseType,
  savedStep,
  updatedAt,
}: Props) {
  const router = useRouter();
  const href = `/cases/new?draft=${draftId}`;

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
      <td>{customerName}</td>
      <td>{caseTitle}</td>
      <td>{caseType}</td>
      <td>{savedStep}</td>
      <td>{updatedAt}</td>
    </tr>
  );
}
