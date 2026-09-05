"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/lib/auth/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export default function PortalNav({ hasMultipleAccounts, enabled = true }: { hasMultipleAccounts: boolean; enabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || navRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      {enabled && <button
        ref={buttonRef}
        className="portal-menu-button"
        type="button"
        aria-expanded={open}
        aria-controls="portal-navigation"
        aria-label={open ? "Close portal navigation" : "Open portal navigation"}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">☰</span>
        <span className="sr-only">Menu</span>
      </button>}
      <nav ref={navRef} id="portal-navigation" className={`portal-nav${open ? " is-open" : ""}${enabled ? "" : " is-disabled"}`} aria-label="Customer portal">
        {enabled && <><Link href="/portal" onClick={() => setOpen(false)}>Home</Link><Link href="/portal/service-requests" onClick={() => setOpen(false)}>Service Requests</Link>{hasMultipleAccounts && <Link href="/portal/select-account" onClick={() => setOpen(false)}>Switch account</Link>}</>}
        <form action={signOutAction}>
          <PendingSubmitButton pendingLabel="Signing out…">Sign Out</PendingSubmitButton>
        </form>
      </nav>
    </>
  );
}
