"use client";

import { FormEvent, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reassignCaseCustomerAction } from "@/lib/data/case-actions";

type CustomerOption = {
  id: string;
  name: string;
  customerNumber: string;
};

export function CaseCustomerReassignment({
  caseId,
  caseNumber,
  currentCustomer,
  customers,
}: {
  caseId: string;
  caseNumber: string;
  currentCustomer: CustomerOption;
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [displayedCustomer, setDisplayedCustomer] = useState(currentCustomer);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const eligibleCustomers = useMemo(
    () => customers.filter((customer) => customer.id !== displayedCustomer.id),
    [customers, displayedCustomer.id],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const matches = eligibleCustomers.filter((customer) =>
    [customer.name, customer.customerNumber].some((value) =>
      value.toLocaleLowerCase().includes(normalizedSearch),
    ),
  );

  function close() {
    setSearch("");
    setSelectedId("");
    setError(null);
    dialog.current?.close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !selectedId) return;
    setPending(true);
    setError(null);
    try {
      const result = await reassignCaseCustomerAction({
        caseId,
        targetCustomerId: selectedId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const selected = eligibleCustomers.find(
        (customer) => customer.id === selectedId,
      );
      if (selected) setDisplayedCustomer(selected);
      setMessage("Case customer updated.");
      close();
      router.refresh();
    } catch {
      setError("The Case customer could not be changed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="case-customer-overview">
      <dt>Customer</dt>
      <dd>
        <span>{displayedCustomer.name}</span>
        <button
          type="button"
          className="case-customer-change"
          onClick={() => {
            setMessage(null);
            dialog.current?.showModal();
          }}
        >
          Change Customer
        </button>
      </dd>
      {message ? (
        <span className="case-customer-message" role="status">
          {message}
        </span>
      ) : null}
      <dialog
        ref={dialog}
        className="case-customer-dialog"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          if (!pending) close();
        }}
      >
        <form className="entity-form" onSubmit={submit}>
          <div>
            <h2 id={titleId}>Reassign Case to Another Customer</h2>
            <p>You are changing the customer associated with {caseNumber}.</p>
          </div>
          <div className="case-customer-current">
            <span>Current Customer</span>
            <strong>{displayedCustomer.name}</strong>
          </div>
          <fieldset className="case-customer-selector" disabled={pending}>
            <legend>New Customer</legend>
            <div className="customer-search-control">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Search customers..."
                aria-label="Search active organization customers"
                autoComplete="off"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear customer search"
                >
                  ×
                </button>
              ) : null}
            </div>
            <div className="case-customer-results">
              {matches.length ? (
                matches.map((customer) => (
                  <label key={customer.id}>
                    <input
                      type="radio"
                      name="targetCustomerId"
                      value={customer.id}
                      checked={selectedId === customer.id}
                      onChange={() => setSelectedId(customer.id)}
                    />
                    <span>
                      <strong>{customer.name}</strong>
                      <small>{customer.customerNumber}</small>
                    </span>
                  </label>
                ))
              ) : (
                <p>No active customers match this search.</p>
              )}
            </div>
          </fieldset>
          <p className="case-customer-warning">
            This may change which Customer Portal account can see this Case.
          </p>
          {error ? (
            <div className="form-alert" role="alert">
              {error}
            </div>
          ) : null}
          <div className="case-customer-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={pending || !selectedId}
            >
              {pending ? "Reassigning…" : "Reassign Case"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
