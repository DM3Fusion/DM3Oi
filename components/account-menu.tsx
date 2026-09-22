"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { signOutAction } from "@/lib/auth/actions";
import { ApplicationIcon } from "@/components/application-icon";
import { UserAvatar } from "@/components/user-avatar";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export function AccountMenu({
  displayName,
  title,
  email,
  avatarUrl,
}: {
  displayName: string;
  title?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      const details = detailsRef.current;

      if (
        details?.open &&
        event.target instanceof Node &&
        !details.contains(event.target)
      ) {
        details.removeAttribute("open");
      }
    }

    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, []);

  function closeMenu() {
    detailsRef.current?.removeAttribute("open");
  }

  return (
    <details ref={detailsRef} className="account-menu">
      <summary aria-label="Open account menu">
        <span className="account-menu-banner-identity">
          <strong>{displayName}</strong>
          {title ? <small>{title}</small> : null}
        </span>
        <UserAvatar displayName={displayName} email={email} src={avatarUrl} />
      </summary>
      <div className="account-menu-popover">
        <div>
          <strong>{displayName}</strong>
          <small>{email}</small>
        </div>
        <Link href="/account/profile" onClick={closeMenu}>
          My Profile
        </Link>
        <form action={signOutAction}>
          <PendingSubmitButton pendingLabel="Signing out…">
            <ApplicationIcon name="sign-out" />
            Sign Out
          </PendingSubmitButton>
        </form>
      </div>
    </details>
  );
}
