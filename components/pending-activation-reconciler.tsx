"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PendingActivationReconciler() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const reconcile = () => {
      if (active) router.refresh();
    };

    const interval = window.setInterval(reconcile, 5_000);

    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") reconcile();
    };

    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [router]);

  return null;
}
