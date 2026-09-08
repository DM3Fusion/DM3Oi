"use client";

import Link from "next/link";
import { FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setServiceRequestCaseAction } from "@/lib/data/service-request-actions";

type CaseOption = {
  id: string;
  caseNumber: string;
  title: string;
};

export function ServiceRequestCaseLink({
  requestId,
  initialCase,
  eligibleCases,
  canManage,
}: {
  requestId: string;
  initialCase: CaseOption | null;
  eligibleCases: CaseOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [linkedCase, setLinkedCase] = useState(initialCase);
  const [selectedId, setSelectedId] = useState(initialCase?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function close() {
    setSelectedId(linkedCase?.id ?? "");
    setError(null);
    dialog.current?.close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !selectedId || selectedId === linkedCase?.id) return;
    setPending(true);
    setError(null);
    try {
      const result = await setServiceRequestCaseAction({ requestId, caseId: selectedId, expectedCaseId: linkedCase?.id ?? null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const selected = eligibleCases.find((candidate) => candidate.id === selectedId) ?? null;
      setLinkedCase(selected);
      setMessage(linkedCase ? "Case link changed." : "Service Request assigned to Case.");
      dialog.current?.close();
      router.refresh();
    } catch {
      setError("The Case link could not be saved. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function unlink() {
    if (pending || !linkedCase) return;
    setPending(true);
    setError(null);
    try {
      const result = await setServiceRequestCaseAction({ requestId, caseId: null, expectedCaseId: linkedCase.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLinkedCase(null);
      setSelectedId("");
      setMessage("Case link removed.");
      dialog.current?.close();
      router.refresh();
    } catch {
      setError("The Case link could not be removed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="service-request-case-link full">
      <dt>Case</dt>
      <dd>
        {linkedCase ? (
          <Link className="case-link" href={`/cases/${linkedCase.id}`}>
            {linkedCase.caseNumber} — {linkedCase.title}
          </Link>
        ) : (
          <span>Not linked</span>
        )}
        {canManage ? (
          <button
            type="button"
            className="case-customer-change"
            disabled={pending}
            onClick={() => {
              setMessage(null);
              setError(null);
              dialog.current?.showModal();
            }}
          >
            {linkedCase ? "Change Case" : "Assign to Case"}
          </button>
        ) : null}
      </dd>
      {message ? <span className="case-customer-message" role="status">{message}</span> : null}
      {canManage ? (
        <dialog
          ref={dialog}
          className="case-customer-dialog service-request-case-dialog"
          aria-labelledby={titleId}
          onCancel={(event) => {
            event.preventDefault();
            if (!pending) close();
          }}
        >
          <form className="entity-form" onSubmit={submit}>
            <div>
              <h2 id={titleId}>{linkedCase ? "Change Case" : "Assign to Case"}</h2>
              <p>Select a Case for this Service Request&apos;s customer.</p>
            </div>
            <fieldset className="case-customer-selector" disabled={pending}>
              <legend>Eligible Cases</legend>
              <div className="case-customer-results">
                {eligibleCases.length ? eligibleCases.map((candidate) => (
                  <label key={candidate.id}>
                    <input
                      type="radio"
                      name="caseId"
                      value={candidate.id}
                      checked={selectedId === candidate.id}
                      onChange={() => setSelectedId(candidate.id)}
                    />
                    <span>
                      <strong>{candidate.caseNumber}</strong>
                      <small>{candidate.title}</small>
                    </span>
                  </label>
                )) : <p>No eligible cases are available for this customer.</p>}
              </div>
            </fieldset>
            {error ? <div className="form-alert" role="alert">{error}</div> : null}
            <div className="case-customer-actions">
              <button type="button" className="secondary-button" disabled={pending} onClick={close}>Cancel</button>
              {linkedCase ? (
                <button type="button" className="secondary-button" disabled={pending} onClick={unlink}>
                  {pending ? "Removing…" : "Remove Case Link"}
                </button>
              ) : null}
              <button type="submit" className="primary-button" disabled={pending || !selectedId || selectedId === linkedCase?.id}>
                {pending ? "Saving…" : linkedCase ? "Change Case" : "Assign to Case"}
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}
