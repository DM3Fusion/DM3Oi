"use client";

import { useState } from "react";
import Link from "next/link";
import { createCustomerAction } from "@/lib/data/case-actions";

type Values = { type: string; name: string; firstName: string; lastName: string; streetAddress: string; city: string; state: string; postalCode: string; email: string; phone: string; notes: string };
const initial: Values = { type: "INDIVIDUAL", name: "", firstName: "", lastName: "", streetAddress: "", city: "", state: "", postalCode: "", email: "", phone: "", notes: "" };

export function CustomerForm() {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const update = (key: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setSummary(null);
  };
  const field = (key: keyof Values, label: string, type = "text") => {
    const required = key === "email" || key === "phone";
    return (
    <label><span>{label}{!required ? <small> Optional</small> : null}</span><input name={key} type={type} required={required} value={values[key]} onChange={(event) => update(key, event.target.value)} aria-invalid={Boolean(errors[key])} />{errors[key] ? <small className="field-error" role="alert">{errors[key]}</small> : null}</label>
    );
  };
  return (
    <form action={async (form) => {
      setPending(true);
      const result = await createCustomerAction(form);
      setPending(false);
      if (!result.ok) { setValues({ ...initial, ...result.values }); setErrors(result.fieldErrors); setSummary(result.error); }
    }} className="entity-form">
      <div className="form-grid">
        <label><span>Customer Type</span><select name="type" value={values.type} onChange={(event) => update("type", event.target.value)}><option value="INDIVIDUAL">INDIVIDUAL</option><option value="BUSINESS">BUSINESS</option></select></label>
        {field("name", "Business / display name")}{field("firstName", "First name")}{field("lastName", "Last name")}
        {field("email","Email","email")}{field("phone","Phone","tel")}
        {field("streetAddress", "Street address")}{field("city", "City")}{field("state", "State")}{field("postalCode", "Postal code")}
        <label className="full"><span>Notes <small>Optional</small></span><textarea name="notes" rows={4} value={values.notes} onChange={(event) => update("notes", event.target.value)} /></label>
      </div>
      <p className="form-help">When a first or last name is provided, the stored display name is derived from those structured fields.</p>
      {summary ? <div className="form-alert" role="alert">{summary}</div> : null}
      <div className="form-actions"><Link href="/customers">Cancel</Link><button className="primary-button" type="submit" disabled={pending}>{pending ? "Creating…" : "Create Customer"}</button></div>
    </form>
  );
}
