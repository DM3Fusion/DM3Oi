import { CaseTable } from "./case-table";
import type { LiveCase } from "@/lib/data/case-repository";
import {
  CaseRegisterFilters,
  type CaseRegisterFilterValues,
} from "./case-register-filters";

export interface CaseFilters extends CaseRegisterFilterValues {}

export function CasesRegister({
  items,
  filters,
}: {
  items: LiveCase[];
  filters: CaseFilters;
}) {
  return (
    <section className="panel">
      <CaseRegisterFilters filters={filters} />

      <div className="table-meta">
        <span>
          <b>{items.length}</b> cases
        </span>
        <span>
          {filters.status && filters.status !== "ALL"
            ? `Status: ${filters.status.replaceAll("-", " ")}`
            : "Live organization data"}
        </span>
      </div>

      {items.length ? (
        <CaseTable items={items} />
      ) : (
        <div className="no-results">No cases match these filters.</div>
      )}
    </section>
  );
}
