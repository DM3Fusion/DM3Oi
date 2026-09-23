"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { analyticsSessionId } from "@/lib/analytics-session";

const HEARTBEAT_INTERVAL_MS = 60 * 1000;

async function sendPresenceHeartbeat() {
  try {
    await fetch("/api/analytics/presence", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "heartbeat",
        sessionId: analyticsSessionId(),
      }),
      keepalive: true,
    });
  } catch {
    // Presence must never interrupt the application.
  }
}

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
        sessionId: analyticsSessionId(),
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
          sessionId: analyticsSessionId(),
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

  useEffect(() => {
    void sendPresenceHeartbeat();

    const intervalId = window.setInterval(
      () => {
        if (
          document.visibilityState === "visible"
        ) {
          void sendPresenceHeartbeat();
        }
      },
      HEARTBEAT_INTERVAL_MS,
    );

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible"
      ) {
        void sendPresenceHeartbeat();
      }
    };

    const handleFocus = () => {
      void sendPresenceHeartbeat();
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    window.addEventListener(
      "focus",
      handleFocus,
    );

    return () => {
      window.clearInterval(intervalId);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );

      window.removeEventListener(
        "focus",
        handleFocus,
      );
    };
  }, []);

  return null;
}
