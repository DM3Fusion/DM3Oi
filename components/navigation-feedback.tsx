"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);
  const currentLocation = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
  const pending = pendingDestination !== null && pendingDestination !== currentLocation;

  useEffect(() => {
    const acknowledge = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target || anchor.hasAttribute("download") || anchor.origin !== window.location.origin) return;
      const destination = `${anchor.pathname}${anchor.search}`;
      const current = `${window.location.pathname}${window.location.search}`;
      if (destination !== current) setPendingDestination(destination);
    };
    document.addEventListener("click", acknowledge, true);
    return () => document.removeEventListener("click", acknowledge, true);
  }, []);

  return <div className={`route-progress${pending ? " is-active" : ""}`} role="progressbar" aria-label="Loading page" aria-hidden={!pending}><span /></div>;
}
