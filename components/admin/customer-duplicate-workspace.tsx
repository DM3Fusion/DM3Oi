"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mergeCustomersAction, previewCustomerMergeAction } from "@/app/admin/customer-duplicates/actions";
import type { Database, Json } from "@/types/database.generated";
import type { DuplicatePair } from "@/lib/customer-data-management";
import type { OrganizationCustomer } from "@/lib/data/organization-customers";

type Customer = OrganizationCustomer;
type Organization = { id: string; name: string; status: string; customerCount: number };
type History = Database["public"]["Tables"]["customer_merge_history"]["Row"];
type MergePreview = { eligible: boolean; portal_collision: boolean; unknown_dependencies: string[]; dependency_counts: { cases: number; service_requests: number; guided_intake_drafts: number; portal_links: number; survivor_portal_links: number } };
const fields = ["first_name", "last_name", "name", "email", "phone", "street_address", "city", "state", "postal_code", "type", "status"] as const;

export function CustomerDuplicateWorkspace({ organizations, organizationId, customers, pairs, history }: { organizations: Organization[]; organizationId: string; customers: Customer[]; pairs: DuplicatePair[]; history: History[] }) {
  const router = useRouter();
  const [selectedPair, setSelectedPair] = useState<DuplicatePair | null>(pairs[0] ?? null);
  const [survivorId, setSurvivorId] = useState(selectedPair?.leftId ?? "");
  const [values, setValues] = useState<Record<string, string | null>>({});
  const [notesStrategy, setNotesStrategy] = useState("COMBINE");
  const [customNotes, setCustomNotes] = useState("");
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pairCustomers = useMemo(() => selectedPair ? [customers.find((customer) => customer.id === selectedPair.leftId), customers.find((customer) => customer.id === selectedPair.rightId)].filter(Boolean) as Customer[] : [], [customers, selectedPair]);
  const survivor = pairCustomers.find((customer) => customer.id === survivorId) ?? pairCustomers[0];
  const merged = pairCustomers.find((customer) => customer.id !== survivor?.id);
  const expected = survivor && merged ? `MERGE ${merged.customer_number} INTO ${survivor.customer_number}` : "";

  const choosePair = (pair: DuplicatePair) => { setSelectedPair(pair); setSurvivorId(pair.leftId); setValues({}); setNotesStrategy("COMBINE"); setCustomNotes(""); setPreview(null); setConfirmation(""); setError(null); };
  const chooseField = (field: typeof fields[number], source: "SURVIVOR" | "MERGED") => {
    setValues((current) => {
      const next = { ...current };
      if (source === "SURVIVOR") delete next[field];
      else next[field] = merged?.[field] ?? null;
      return next;
    });
  };
  const previewMerge = async () => {
    if (!survivor || !merged) return;
    setPending(true); setError(null);
    const response = await previewCustomerMergeAction({ organizationId, survivorId: survivor.id, mergedId: merged.id });
    setPending(false);
    if (!response.ok) { setError(response.error); return; }
    setPreview(response.preview as unknown as MergePreview);
  };
  const merge = async () => {
    if (!survivor || !merged) return;
    const resolved = Object.fromEntries(fields.map((field) => [field, values[field] === undefined ? survivor[field] : values[field]]));
    if (notesStrategy === "CUSTOM") resolved.notes = customNotes;
    setPending(true); setError(null);
    const response = await mergeCustomersAction({ organizationId, survivorId: survivor.id, mergedId: merged.id, confirmation, fieldResolution: { values: resolved, notes_strategy: notesStrategy } as Json });
    setPending(false);
    if (!response.ok) { setError(response.error); return; }
    router.refresh(); setSelectedPair(null); setPreview(null); setConfirmation("");
  };

  return <div className="customer-data-workspace">
    <section className="panel customer-data-step"><label><span>Organization</span><select value={organizationId} onChange={(event) => router.push(event.target.value ? `/admin/customer-duplicates?organizationId=${encodeURIComponent(event.target.value)}` : "/admin/customer-duplicates")}><option value="">Select an organization</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {organization.customerCount} Customers</option>)}</select></label></section>
    {organizationId ? <section className="panel"><div className="section-head"><div><h2>Candidate pairs</h2><p>{pairs.length} reviewed pair{pairs.length === 1 ? "" : "s"}; name alone never creates a match.</p></div></div>{pairs.length ? <div className="duplicate-pair-list">{pairs.map((pair) => { const left = customers.find((customer) => customer.id === pair.leftId); const right = customers.find((customer) => customer.id === pair.rightId); return <button type="button" className={selectedPair === pair ? "duplicate-pair selected" : "duplicate-pair"} key={`${pair.leftId}:${pair.rightId}`} onClick={() => choosePair(pair)}><strong>{left?.customer_number} · {left?.name}</strong><span>and {right?.customer_number} · {right?.name}</span><small>{pair.reasons.join(" · ")}</small></button>; })}</div> : <div className="empty compact-empty"><h2>No likely duplicates</h2><p>No strong identity signals match within this organization.</p></div>}</section> : null}
    {survivor && merged ? <>
      <section className="duplicate-comparison">{pairCustomers.map((customer) => <article className={customer.id === survivor.id ? "panel selected" : "panel"} key={customer.id}><div className="section-head"><div><h2>{customer.customer_number}</h2><p>{customer.name}</p></div><input type="radio" name="survivor" checked={customer.id === survivor.id} onChange={() => { setSurvivorId(customer.id); setValues({}); setPreview(null); setConfirmation(""); }} aria-label={`Keep ${customer.customer_number}`} /></div><dl className="detail-facts"><div><dt>Email</dt><dd>{customer.email ?? "—"}</dd></div><div><dt>Phone</dt><dd>{customer.phone ?? "—"}</dd></div><div><dt>Address</dt><dd>{[customer.street_address, customer.city, customer.state, customer.postal_code].filter(Boolean).join(", ") || "—"}</dd></div><div><dt>Status / type</dt><dd>{customer.status} · {customer.type}</dd></div><div><dt>Notes</dt><dd>{customer.notes ?? "—"}</dd></div></dl></article>)}</section>
      <section className="panel"><div className="section-head"><div><h2>Field resolution</h2><p>The survivor keeps its ID, Customer number, organization, creator, and timestamps. Display name is re-derived whenever structured first/last name is present.</p></div></div><div className="merge-field-grid">{fields.map((field) => <label key={field}><span>{field.replaceAll("_", " ")}</span><select value={values[field] === undefined ? "SURVIVOR" : "MERGED"} onChange={(event) => chooseField(field, event.target.value as "SURVIVOR" | "MERGED")}><option value="SURVIVOR">{survivor[field] ?? "—"} (survivor)</option><option value="MERGED">{merged[field] ?? "—"} (merged)</option></select></label>)}</div><label><span>Notes resolution</span><select value={notesStrategy} onChange={(event) => setNotesStrategy(event.target.value)}><option value="COMBINE">Combine with Customer-number labels (recommended)</option><option value="SURVIVOR">Use survivor notes</option><option value="MERGED">Use duplicate notes</option><option value="CUSTOM">Custom replacement</option></select></label>{notesStrategy === "CUSTOM" ? <label><span>Custom notes</span><textarea rows={5} value={customNotes} onChange={(event) => setCustomNotes(event.target.value)} /></label> : null}<button type="button" className="secondary-button" onClick={previewMerge} disabled={pending}>{pending ? "Checking…" : "Preview relationship moves"}</button></section>
    </> : null}
    {error ? <div className="form-alert" role="alert">{error}</div> : null}
    {preview && survivor && merged ? <section className="panel customer-danger-zone"><div className="section-head"><div><h2>Irreversible merge confirmation</h2><p>All checks run again under locks inside one database transaction.</p></div></div><dl className="detail-facts"><div><dt>Cases</dt><dd>{preview.dependency_counts.cases}</dd></div><div><dt>Service Requests</dt><dd>{preview.dependency_counts.service_requests}</dd></div><div><dt>Guided Intake drafts</dt><dd>{preview.dependency_counts.guided_intake_drafts}</dd></div><div><dt>Portal links moving</dt><dd>{preview.dependency_counts.portal_links}</dd></div><div><dt>Portal links on survivor</dt><dd>{preview.dependency_counts.survivor_portal_links}</dd></div></dl>{preview.dependency_counts.survivor_portal_links > 0 && preview.dependency_counts.portal_links === 0 ? <p className="muted">Moved Case and Service Request history will become visible through the survivor&apos;s existing Portal identity.</p> : null}{preview.portal_collision ? <div className="form-alert">Blocked: both Customers have Portal identities. Resolve Portal access first.</div> : null}{preview.unknown_dependencies.length ? <div className="form-alert">Blocked by unhandled dependencies: {preview.unknown_dependencies.join(", ")}</div> : null}<p>Type <strong>{expected}</strong></p><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-label="Merge confirmation" /><button type="button" className="danger-button" disabled={!preview.eligible || pending || confirmation !== expected} onClick={merge}>{pending ? "Merging…" : `Merge ${merged.customer_number} into ${survivor.customer_number}`}</button></section> : null}
    {organizationId && history.length ? <section className="panel"><div className="section-head"><div><h2>Recent merge history</h2><p>Durable snapshots remain after the losing Customer row is deleted.</p></div></div><div className="table-scroll"><table><thead><tr><th>Performed</th><th>Survivor</th><th>Merged</th><th>Moved</th><th>Actor</th></tr></thead><tbody>{history.map((entry) => <tr key={entry.id}><td>{new Date(entry.performed_at).toLocaleString()}</td><td>{entry.surviving_customer_number}</td><td>{entry.merged_customer_number}</td><td><code>{JSON.stringify(entry.dependency_move_summary)}</code></td><td>{entry.performed_by_user_id}</td></tr>)}</tbody></table></div></section> : null}
  </div>;
}
