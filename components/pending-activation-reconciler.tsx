"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function PendingActivationReconciler() {
  const router = useRouter();
  const [checking, startTransition] = useTransition();

  return (
    <button
      className="secondary-button"
      disabled={checking}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
    >
      {checking ? "Checking…" : "Check activation"}
    </button>
  );
}
