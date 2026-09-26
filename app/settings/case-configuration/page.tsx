import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ApplicationIcon } from "@/components/application-icon";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  saveCaseTitle,
  saveCaseType,
} from "@/lib/data/organization-administration-actions";

type SearchParams = Promise<{ message?: string; error?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const access = await getAccessContext();
  if (
    !access?.activeOrganization ||
    !hasPermission(access, "MANAGE_ORGANIZATION_SETTINGS")
  )
    notFound();
  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  const [titles, types, query] = await Promise.all([
    supabase
      .from("organization_case_titles")
      .select("id,label,is_active,sort_order")
      .eq("organization_id", organizationId)
      .order("sort_order")
      .order("label"),
    supabase
      .from("organization_case_types")
      .select("id,name,description,is_active,sort_order")
      .eq("organization_id", organizationId)
      .order("sort_order")
      .order("name"),
    searchParams,
  ]);
  if (titles.error || types.error) {
    console.error("Case configuration query failed", {
      organizationId,
      titleError: titles.error?.message,
      typeError: types.error?.message,
    });
    throw new Error("Case configuration is temporarily unavailable.");
  }
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Case Configuration"
        description="Manage stable Case Titles and Case Types used by intake and reporting."
      />
      {query.error ? <div className="form-alert page-notice">{query.error}</div> : null}
      {query.message ? <div className="success-alert page-notice">{query.message}</div> : null}
      <section className="panel detail-section case-configuration-section">
        <div className="section-head">
          <div><h2>Case Titles</h2><p>Common Case reasons shown during Guided Intake.</p></div>
        </div>
        <form action={saveCaseTitle} className="mini-form">
          <label><span>Title</span><input name="label" required maxLength={180} /></label>
          <label><span>Sort Order</span><input name="sortOrder" type="number" min="0" defaultValue="0" /></label>
          <label><span>Active</span><select name="isActive" defaultValue="true"><option value="true">Active</option><option value="false">Inactive</option></select></label>
          <button className="primary-button"><ApplicationIcon name="add" />New Case Title</button>
        </form>
        <div className="table-scroll">
          <table><thead><tr><th>Title</th><th>Status</th><th>Order</th><th>Edit</th></tr></thead>
            <tbody>{(titles.data ?? []).map((item) => (
              <tr key={item.id}><td><b>{item.label}</b></td><td>{item.is_active ? "Active" : "Inactive"}</td><td>{item.sort_order}</td><td>
                <details><summary>Edit</summary><form action={saveCaseTitle} className="mini-form">
                  <input type="hidden" name="id" value={item.id} />
                  <input name="label" defaultValue={item.label} required maxLength={180} />
                  <input name="sortOrder" type="number" min="0" defaultValue={item.sort_order} />
                  <select name="isActive" defaultValue={String(item.is_active)}><option value="true">Active</option><option value="false">Inactive</option></select>
                  <button>Save</button>
                </form></details>
              </td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="panel detail-section case-configuration-section">
        <div className="section-head">
          <div><h2>Case Types</h2><p>Operational classifications retained as stable reporting dimensions.</p></div>
        </div>
        <form action={saveCaseType} className="mini-form">
          <label><span>Name</span><input name="name" required maxLength={120} /></label>
          <label><span>Description</span><input name="description" /></label>
          <label><span>Sort Order</span><input name="sortOrder" type="number" min="0" defaultValue="0" /></label>
          <label><span>Active</span><select name="isActive" defaultValue="true"><option value="true">Active</option><option value="false">Inactive</option></select></label>
          <button className="primary-button"><ApplicationIcon name="add" />New Case Type</button>
        </form>
        <div className="table-scroll">
          <table><thead><tr><th>Name</th><th>Status</th><th>Order</th><th>Edit</th></tr></thead>
            <tbody>{(types.data ?? []).map((item) => (
              <tr key={item.id}><td><b>{item.name}</b><div className="table-secondary">{item.description ?? ""}</div></td><td>{item.is_active ? "Active" : "Inactive"}</td><td>{item.sort_order}</td><td>
                <details><summary>Edit</summary><form action={saveCaseType} className="mini-form">
                  <input type="hidden" name="id" value={item.id} />
                  <input name="name" defaultValue={item.name} required maxLength={120} />
                  <input name="description" defaultValue={item.description ?? ""} />
                  <input name="sortOrder" type="number" min="0" defaultValue={item.sort_order} />
                  <select name="isActive" defaultValue={String(item.is_active)}><option value="true">Active</option><option value="false">Inactive</option></select>
                  <button>Save</button>
                </form></details>
              </td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
