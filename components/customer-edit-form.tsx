"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateCustomerAction } from "@/lib/data/customer-actions";
import { normalizeCustomerPhone } from "@/lib/customer-validation";

type Values = { name: string; firstName: string; lastName: string; streetAddress: string; city: string; state: string; postalCode: string; email: string; phone: string; notes: string; type: string; status: string };
const canonical = (values: Values) => ({ ...values, email: values.email.trim().toLowerCase(), phone: normalizeCustomerPhone(values.phone) ?? values.phone.trim() });

export function CustomerEditForm({ customerId, initial }: { customerId: string; initial: Values }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const dirty=JSON.stringify(canonical(values))!==JSON.stringify(canonical(saved));
  const update = (key: keyof Values, value: string) => { setValues((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); setSummary(null); setJustSaved(false); };
  const field = (key: keyof Values, label: string, type = "text", required = false) => <label><span>{label}{!required ? <small> Optional</small> : null}</span><input name={key} type={type} required={required} value={values[key]} onChange={(event) => update(key, event.target.value)} aria-invalid={Boolean(errors[key])} />{errors[key] ? <small className="field-error" role="alert">{errors[key]}</small> : null}</label>;
  return (
    <form onSubmit={async (event) => {
      event.preventDefault(); setPending(true); setSummary(null);
      const result = await updateCustomerAction(new FormData(event.currentTarget)); setPending(false);
      if (!result.ok) { setValues(result.values); setErrors(result.fieldErrors); setSummary(result.error); return; }
      setSaved(values); setJustSaved(true); router.refresh();
    }} className="entity-form">
      <input type="hidden" name="customerId" value={customerId} />
      <div className="form-grid">
        {field("name", "Business / display name")}{field("firstName", "First name")}{field("lastName", "Last name")}
        {field("email", "Email", "email", true)}{field("phone", "Phone", "tel", true)}
        {field("streetAddress", "Street address")}{field("city", "City")}{field("state", "State")}{field("postalCode", "Postal code")}
        <label><span>Customer type</span><select name="type" value={values.type} onChange={(event) => update("type", event.target.value)}><option value="INDIVIDUAL">Individual</option><option value="BUSINESS">Business</option></select>{errors.type ? <small className="field-error">{errors.type}</small> : null}</label>
        <label><span>Status</span><select name="status" value={values.status} onChange={(event) => update("status", event.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></select>{errors.status ? <small className="field-error">{errors.status}</small> : null}</label>
        <label className="full"><span>Notes <small>Optional</small></span><textarea name="notes" rows={5} value={values.notes} onChange={(event) => update("notes", event.target.value)} /></label>
      </div>
      <p className="form-help">Structured first/last name fields take precedence when deriving the display name.</p>
      {summary ? <div className="form-alert" role="alert">{summary}</div> : null}
      <div className="form-actions"><Link href={`/customers/${customerId}`}>Cancel</Link><button className={dirty ? "license-save-button" : "primary-button"} type="submit" disabled={pending}>{pending?"Saving…":justSaved?"Changes Saved":"Save changes"}</button></div>
    </form>
  );
}
