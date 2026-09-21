"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { communicationsViewCookie, type CommunicationsView } from "@/lib/communications-view";

export function CommunicationsViewToggle({ view }: { view: CommunicationsView }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const nextView = view === "full" ? "mobile" : "full";
  const label = view === "full" ? "Return to Mobile View" : "View Full Site";
  const selectView = () => {
    setPending(true);
    document.cookie = `${communicationsViewCookie}=${nextView}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  };
  return <div className="communications-view-toggle"><button type="button" className="secondary-button" onClick={selectView} disabled={pending} aria-busy={pending}>{pending ? "Switching…" : label}</button></div>;
}
