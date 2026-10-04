import type { ReactNode } from "react";

import type {
  HowToGuideRichTextRun,
  HowToGuideText,
} from "@/lib/how-to-guide-content";

function renderRun(
  run: HowToGuideRichTextRun,
  key: number,
): ReactNode {
  let content: ReactNode = run.text;

  if (run.bold) {
    content = <strong>{content}</strong>;
  }

  if (run.italic) {
    content = <em>{content}</em>;
  }

  if (run.underline) {
    content = <u>{content}</u>;
  }

  return <span key={key}>{content}</span>;
}

export function HowToGuideTextRenderer({
  value,
}: {
  value: HowToGuideText;
}) {
  if (typeof value === "string") {
    return <>{value}</>;
  }

  return (
    <span
      className={`guide-rich-text guide-rich-text-${value.align}`}
    >
      {value.runs.map(renderRun)}
    </span>
  );
}
