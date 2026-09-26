"use client";
import { useEffect, useState } from "react";

type Props = { action: (formData: FormData) => void; initial: { postal: string; mode: string; timezone: string; priority: string }; saved: boolean };
export function OrganizationDefaultsForm({ action, initial, saved }: Props) {
  const [values, setValues] = useState(initial);
  const dirty = values.postal !== initial.postal || values.mode !== initial.mode || values.timezone !== initial.timezone || values.priority !== initial.priority;
  useEffect(() => { if (saved) window.history.replaceState({}, "", "/administration/defaults"); }, [saved]);
  const update = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues(current => ({ ...current, [key]: event.target.value }));
  return <form action={action} className="entity-form"><label><span>Business ZIP / Postal Code</span><input name="businessPostalCode" value={values.postal} onChange={update("postal")} placeholder="12345"/></label><label><span>Time Zone</span><select name="timezoneMode" value={values.mode} onChange={update("mode")}><option value="ZIP">Use ZIP-derived timezone</option><option value="MANUAL">Manual override</option></select></label><label><span>Time Zone Override</span><input name="timezone" value={values.timezone} onChange={update("timezone")} placeholder="America/New_York"/></label><p className="muted">Resolved time zone: {values.mode === "ZIP" ? initial.timezone : values.timezone}</p><label><span>Default Case Priority</span><select name="defaultPriority" value={values.priority} onChange={update("priority")}><option>NORMAL</option><option>LOW</option><option>HIGH</option><option>URGENT</option></select></label><div className="form-actions"><a href="/administration">Cancel</a><button className={dirty ? "primary-button defaults-save-dirty" : "primary-button"}>{saved && !dirty ? "Changes Saved" : "Save Changes"}</button></div>{dirty && <small className="defaults-unsaved-status" role="status">Unsaved changes</small>}</form>;
}
