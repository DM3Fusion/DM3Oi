"use client";

import { PendingSubmitButton } from "@/components/pending-submit-button";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
  pendingText?: string;
}) {
  return (
    <PendingSubmitButton
      {...props}
      className={className}
      pendingLabel={pendingText}
    >
      {children}
    </PendingSubmitButton>
  );
}
