import { CaseTable } from "./case-table";
import type { CaseRegisterRow } from "@/lib/data/case-repository";
import {
  CaseRegisterFilters,
  type CaseRegisterFilterValues,
} from "./case-register-filters";

export type CaseFilters = CaseRegisterFilterValues;

export function CasesRegister({
  items,
  filters,
}: {
  items: CaseRegisterRow[];
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
