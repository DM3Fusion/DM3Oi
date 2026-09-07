import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { createCaseAction } from "@/lib/data/case-actions";
import { getLiveOrganizationData, displayName } from "@/lib/data/case-repository";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission, roleHasPermission } from "@/lib/auth/permissions";
import Link from "next/link";
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [data, params, access] = await Promise.all([getLiveOrganizationData(), searchParams, getAccessContext()]);
  if (!hasPermission(access, "CREATE_CASE")) notFound();
  const managers = data.staff.filter((item) => roleHasPermission(item.membership.role, "ASSIGN_CASES"));
  return (
    <>
      <PageHeader eyebrow="Cases" title="Create Case" description="Open live operational work for a customer. The case number is generated securely." />
      <section className="panel form-panel">
        {params.error ? <div className="form-alert">{params.error}</div> : null}
        {data.customers.length ? (
          <form action={createCaseAction} className="entity-form">
            <div className="form-grid">
              <label>
                <span>Customer</span>
                <select name="customerId" required defaultValue="">
                  <option value="" disabled>
                    Select a customer
                  </option>
                  {data.customers
                    .filter((c) => c.status === "ACTIVE")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.customer_number} — {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>Case Type</span>
                <input name="caseType" required placeholder="e.g. Enrollment" />
              </label>
              <label className="full">
                <span>Case Title</span>
                <input name="title" required maxLength={180} />
              </label>
              <label className="full">
                <span>Description</span>
                <textarea name="description" rows={4} />
              </label>
              <label>
                <span>Priority</span>
                <select name="priority" defaultValue="NORMAL">
                  {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Due Date</span>
                <input name="dueAt" type="date" />
              </label>
              <label>
                <span>
                  Manager <small>Optional</small>
                </span>
                <select name="managerUserId" defaultValue="">
                  <option value="">Unassigned</option>
                  {managers.map((item) => (
                    <option key={item.profile.id} value={item.profile.id}>
                      {displayName(item.profile)}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>
                  Assigned Staff <small>Optional</small>
                </legend>
                <div className="check-list">
                  {data.staff
                    .filter((item) => item.membership.role === "STAFF_USER")
                    .map((item) => (
                      <label key={item.profile.id}>
                        <input type="checkbox" name="staffUserIds" value={item.profile.id} />
                        <span>{displayName(item.profile)}</span>
                      </label>
                    ))}
                </div>
              </fieldset>
              <label className="full">
                <span>
                  Initial Required Tasks <small>Optional · one per line</small>
                </span>
                <textarea name="initialTasks" rows={5} placeholder={"Verify request details\nReview supporting records\nPrepare completion review"} />
              </label>
            </div>
            <div className="form-actions">
              <Link href="/cases">Cancel</Link>
              <button className="primary-button" type="submit">
                Create Case
              </button>
            </div>
          </form>
        ) : (
          <div className="empty compact-empty">
            <h2>A customer is required</h2>
            <p>Create a customer before opening the first case.</p>
            <Link href="/customers/new" className="primary-button">
              Create Customer
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
