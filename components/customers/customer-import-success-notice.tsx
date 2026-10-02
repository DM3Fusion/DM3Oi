"use client";

import { useEffect } from "react";

export function CustomerImportSuccessNotice({
  message,
}: {
  message: string;
}) {
  useEffect(() => {
    const url = new URL(window.location.href);

    if (!url.searchParams.has("message")) return;

    url.searchParams.delete("message");

    const query = url.searchParams.toString();
    const cleanUrl =
      `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;

    window.history.replaceState(
      window.history.state,
      "",
      cleanUrl,
    );
  }, []);

  return (
    <div className="success-alert page-notice">
      {message}
    </div>
  );
}
