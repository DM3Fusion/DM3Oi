"use client";

import { avatarInitials } from "@/lib/profile/avatar";
import { useState } from "react";

const pixels = { sm: 25, md: 34, lg: 88 } as const;

export function UserAvatar({
  displayName,
  email,
  src,
  size = "md",
}: {
  displayName?: string | null;
  email?: string | null;
  src?: string | null;
  size?: keyof typeof pixels;
}) {
  const label = displayName || email || "User";
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src && src !== failedSrc);
  return (
    <span
      className={`user-avatar user-avatar-${size}${showImage ? " user-avatar-image" : ""}`}
      title={label}
      aria-label={label}
    >
      {showImage ? (
        // Signed private Storage URLs are short lived and cannot usefully be optimized.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          width={pixels[size]}
          height={pixels[size]}
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        <span aria-hidden>{avatarInitials(displayName, email)}</span>
      )}
    </span>
  );
}
