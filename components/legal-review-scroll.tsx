"use client";

import { useEffect } from "react";

export function LegalReviewScroll({
  targetId,
}: {
  targetId: string | null;
}) {
  useEffect(() => {
    if (!targetId) return;

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [targetId]);

  return null;
}
