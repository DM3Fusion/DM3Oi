"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function PendingSubmitButton({
  children,
  pendingLabel = "Working…",
  className,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; pendingLabel?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      type="submit"
      className={`${className ?? ""}${pending ? " is-pending" : ""}`.trim()}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
