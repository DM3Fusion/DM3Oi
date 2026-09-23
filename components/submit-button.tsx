"use client";

import { PendingSubmitButton } from "@/components/pending-submit-button";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  return (
    <PendingSubmitButton
      className={className}
      pendingLabel={pendingText}
    >
      {children}
    </PendingSubmitButton>
  );
}
