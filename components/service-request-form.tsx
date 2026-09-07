"use client";
import Link from "next/link";
import { useState } from "react";
import { createServiceRequestAction } from "@/lib/data/service-request-actions";
type Values = {
  customerId: string;
  subject: string;
  description: string;
  priority: string;
  assignedUserId: string;
};
export function ServiceRequestForm({ customers, staff, canAssign }: { customers: { id: string; customer_number: string; name: string }[]; staff: { id: string; name: string }[]; canAssign: boolean }) {
  const initial: Values = {
    customerId: "",
    subject: "",
    description: "",
    priority: "NORMAL",
    assignedUserId: "",
  };
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const update = (key: keyof Values, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
    setSummary(null);
  };
  const invalid = (key: keyof Values) => ({
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": errors[key] ? `${key}-error` : undefined,
  });
  return (
    <form
      className="entity-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const result = await createServiceRequestAction(new FormData(e.currentTarget));
        setPending(false);
        if (!result.ok) {
          setValues(result.values);
          setErrors(result.fieldErrors);
          setSummary(result.error);
        }
      }}
    >
      <div className="form-grid">
        <label>
          <span>Customer</span>
          <select name="customerId" value={values.customerId} onChange={(e) => update("customerId", e.target.value)} required {...invalid("customerId")}>
            <option value="" disabled>
              Select a customer
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.customer_number} — {c.name}
              </option>
            ))}
          </select>
          {errors.customerId && (
            <small id="customerId-error" className="field-error" role="alert">
              {errors.customerId}
            </small>
          )}
        </label>
        <label>
          <span>Priority</span>
          <select name="priority" value={values.priority} onChange={(e) => update("priority", e.target.value)} {...invalid("priority")}>
            {["LOW", "NORMAL", "HIGH", "URGENT"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          {errors.priority && (
            <small id="priority-error" className="field-error" role="alert">
              {errors.priority}
            </small>
          )}
        </label>
        <label className="full">
          <span>Subject</span>
          <input name="subject" value={values.subject} maxLength={240} required onChange={(e) => update("subject", e.target.value)} {...invalid("subject")} />
          {errors.subject && (
            <small id="subject-error" className="field-error" role="alert">
              {errors.subject}
            </small>
          )}
        </label>
        <label className="full">
          <span>Description</span>
          <textarea name="description" rows={7} required value={values.description} onChange={(e) => update("description", e.target.value)} {...invalid("description")} />
          {errors.description && (
            <small id="description-error" className="field-error" role="alert">
              {errors.description}
            </small>
          )}
        </label>
        {canAssign ? (
          <label>
            <span>
              Assigned To <small>Optional</small>
            </span>
            <select name="assignedUserId" value={values.assignedUserId} onChange={(e) => update("assignedUserId", e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {summary && (
        <div className="form-alert" role="alert">
          {summary}
        </div>
      )}
      <div className="form-actions">
        <Link href="/service-desk">Cancel</Link>
        <button className="primary-button" disabled={pending}>
          {pending ? "Creating…" : "Create Service Request"}
        </button>
      </div>
    </form>
  );
}
