import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ApplicationIcon } from "@/components/application-icon";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  saveCaseType,
  saveTaskPurpose,
} from "@/lib/data/organization-administration-actions";

type SearchParams = Promise<{ message?: string; error?: string }>;

const customerModeLabel = (value: string) =>
  value === "NEW"
    ? "New Customer"
    : value === "EXISTING"
      ? "Existing Customer"
      : "Any Customer";

const taxYearRuleLabel = (value: string) =>
  value === "CURRENT_YEAR"
    ? "Current Year"
    : value === "PRIOR_YEAR_REQUIRED"
      ? "Prior Year Required"
      : "Any Year";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const access = await getAccessContext();
  if (
    !access?.activeOrganization ||
    !hasPermission(access, "MANAGE_ORGANIZATION_SETTINGS")
  )
    notFound();

  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  // Temporary schema bridge until generated Supabase types include the new
  // Case Type fields and organization_task_purposes table.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [types, purposes, query] = await Promise.all([
    db
      .from("organization_case_types")
      .select(
        "id,name,description,is_active,sort_order,customer_mode,tax_year_rule",
      )
      .eq("organization_id", organizationId)
      .order("sort_order")
      .order("name"),
    db
      .from("organization_task_purposes")
      .select("id,label,description,is_active,sort_order")
      .eq("organization_id", organizationId)
      .order("sort_order")
      .order("label"),
    searchParams,
  ]);

  if (types.error || purposes.error) {
    console.error("Case configuration query failed", {
      organizationId,
      typeError: types.error?.message,
      purposeError: purposes.error?.message,
    });
    throw new Error("Case configuration is temporarily unavailable.");
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Case Configuration"
        description="Manage Case Types and Task Purposes used by your organization."
      />

      {query.error ? (
        <div className="form-alert page-notice">{query.error}</div>
      ) : null}
      {query.message ? (
        <div className="success-alert page-notice">{query.message}</div>
      ) : null}

      <section className="panel detail-section case-configuration-section">
        <div className="section-head">
          <div>
            <h2>Case Types</h2>
            <p>
              Define the initial engagement classification, Customer
              applicability, and Tax Year behavior used during Guided Intake.
            </p>
          </div>
        </div>

        <form action={saveCaseType} className="mini-form">
          <label>
            <span>Name</span>
            <input name="name" required maxLength={120} />
          </label>
          <label>
            <span>Description</span>
            <input name="description" />
          </label>
          <label>
            <span>Customer</span>
            <select name="customerMode" defaultValue="ANY">
              <option value="ANY">Any Customer</option>
              <option value="NEW">New Customer</option>
              <option value="EXISTING">Existing Customer</option>
            </select>
          </label>
          <label>
            <span>Tax Year</span>
            <select name="taxYearRule" defaultValue="ANY_YEAR">
              <option value="ANY_YEAR">Any Year</option>
              <option value="CURRENT_YEAR">Current Year</option>
              <option value="PRIOR_YEAR_REQUIRED">Prior Year Required</option>
            </select>
          </label>
          <label>
            <span>Sort Order</span>
            <input
              name="sortOrder"
              type="number"
              min="0"
              defaultValue="0"
            />
          </label>
          <label>
            <span>Active</span>
            <select name="isActive" defaultValue="true">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          <button className="primary-button">
            <ApplicationIcon name="add" />
            New Case Type
          </button>
        </form>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Customer</th>
                <th>Tax Year</th>
                <th>Status</th>
                <th>Order</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {(types.data ?? []).map((
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                item: any,
              ) => (
                <tr key={item.id}>
                  <td>
                    <b>{item.name}</b>
                    <div className="table-secondary">
                      {item.description ?? ""}
                    </div>
                  </td>
                  <td>{customerModeLabel(item.customer_mode)}</td>
                  <td>{taxYearRuleLabel(item.tax_year_rule)}</td>
                  <td>{item.is_active ? "Active" : "Inactive"}</td>
                  <td>{item.sort_order}</td>
                  <td>
                    <details>
                      <summary>Edit</summary>
                      <form action={saveCaseType} className="mini-form">
                        <input type="hidden" name="id" value={item.id} />
                        <input
                          name="name"
                          defaultValue={item.name}
                          required
                          maxLength={120}
                        />
                        <input
                          name="description"
                          defaultValue={item.description ?? ""}
                        />
                        <select
                          name="customerMode"
                          defaultValue={item.customer_mode}
                        >
                          <option value="ANY">Any Customer</option>
                          <option value="NEW">New Customer</option>
                          <option value="EXISTING">Existing Customer</option>
                        </select>
                        <select
                          name="taxYearRule"
                          defaultValue={item.tax_year_rule}
                        >
                          <option value="ANY_YEAR">Any Year</option>
                          <option value="CURRENT_YEAR">Current Year</option>
                          <option value="PRIOR_YEAR_REQUIRED">
                            Prior Year Required
                          </option>
                        </select>
                        <input
                          name="sortOrder"
                          type="number"
                          min="0"
                          defaultValue={item.sort_order}
                        />
                        <select
                          name="isActive"
                          defaultValue={String(item.is_active)}
                        >
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                        <button>Save</button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel detail-section case-configuration-section">
        <div className="section-head">
          <div>
            <h2>Task Purposes</h2>
            <p>
              Define why manually created Case Tasks exist. Task Purpose is
              required when staff add operational work to a Case.
            </p>
          </div>
        </div>

        <form action={saveTaskPurpose} className="mini-form">
          <label>
            <span>Purpose</span>
            <input name="label" required maxLength={160} />
          </label>
          <label>
            <span>Description</span>
            <input name="description" />
          </label>
          <label>
            <span>Sort Order</span>
            <input
              name="sortOrder"
              type="number"
              min="0"
              defaultValue="0"
            />
          </label>
          <label>
            <span>Active</span>
            <select name="isActive" defaultValue="true">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          <button className="primary-button">
            <ApplicationIcon name="add" />
            New Task Purpose
          </button>
        </form>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Purpose</th>
                <th>Status</th>
                <th>Order</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {(purposes.data ?? []).map((
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                item: any,
              ) => (
                <tr key={item.id}>
                  <td>
                    <b>{item.label}</b>
                    <div className="table-secondary">
                      {item.description ?? ""}
                    </div>
                  </td>
                  <td>{item.is_active ? "Active" : "Inactive"}</td>
                  <td>{item.sort_order}</td>
                  <td>
                    <details>
                      <summary>Edit</summary>
                      <form action={saveTaskPurpose} className="mini-form">
                        <input type="hidden" name="id" value={item.id} />
                        <input
                          name="label"
                          defaultValue={item.label}
                          required
                          maxLength={160}
                        />
                        <input
                          name="description"
                          defaultValue={item.description ?? ""}
                        />
                        <input
                          name="sortOrder"
                          type="number"
                          min="0"
                          defaultValue={item.sort_order}
                        />
                        <select
                          name="isActive"
                          defaultValue={String(item.is_active)}
                        >
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                        <button>Save</button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
