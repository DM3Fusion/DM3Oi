"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;

    void fetch("/api/analytics/page-view", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: pathname,
        referrer: document.referrer || null,
        platform: navigator.platform || "",
        maxTouchPoints:
          navigator.maxTouchPoints || 0,
        webdriver:
          navigator.webdriver === true,
      }),
      keepalive: true,
    }).catch(() => {
      // Analytics must never interrupt the application.
    });
  }, [pathname]);

  useEffect(() => {
    let sent = false;

    const sendInteractionEvidence = () => {
      if (sent) return;
      sent = true;

      void fetch("/api/analytics/interaction", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          webdriver:
            navigator.webdriver === true,
        }),
        keepalive: true,
      }).catch(() => {
        // Analytics must never interrupt the application.
      });

      window.removeEventListener(
        "pointerdown",
        sendInteractionEvidence,
      );
      window.removeEventListener(
        "keydown",
        sendInteractionEvidence,
      );
      window.removeEventListener(
        "touchstart",
        sendInteractionEvidence,
      );
    };

    window.addEventListener(
      "pointerdown",
      sendInteractionEvidence,
      { passive: true },
    );

    window.addEventListener(
      "keydown",
      sendInteractionEvidence,
    );

    window.addEventListener(
      "touchstart",
      sendInteractionEvidence,
      { passive: true },
    );

    return () => {
      window.removeEventListener(
        "pointerdown",
        sendInteractionEvidence,
      );
      window.removeEventListener(
        "keydown",
        sendInteractionEvidence,
      );
      window.removeEventListener(
        "touchstart",
        sendInteractionEvidence,
      );
    };
  }, []);

  return null;
}
