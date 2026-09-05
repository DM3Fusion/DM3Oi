"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomerServiceRequestMessageAction } from "@/lib/data/customer-portal-actions";

export function CustomerReplyForm({ serviceRequestId }: { serviceRequestId: string }) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="entity-form customer-reply-form"
      aria-busy={pending}
      onSubmit={async (event) => {
        event.preventDefault();
        if (submittingRef.current) return;
        submittingRef.current = true;
        setPending(true);
        setError(null);
        try {
          const result = await createCustomerServiceRequestMessageAction(new FormData(event.currentTarget));
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setBody("");
          router.refresh();
        } catch (submissionError) {
          console.error("Customer reply request failed", submissionError);
          setError("The reply could not be sent.");
        } finally {
          submittingRef.current = false;
          setPending(false);
        }
      }}
    >
      <input type="hidden" name="serviceRequestId" value={serviceRequestId} />
      {error ? <div className="form-alert" role="alert">{error}</div> : null}
      <label>
        <span>Message</span>
        <textarea name="body" rows={5} required maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <button className="primary-button" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Sending…" : "Send Reply"}
      </button>
    </form>
  );
}
