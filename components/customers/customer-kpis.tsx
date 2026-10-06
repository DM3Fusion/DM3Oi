import Link from "next/link";
import {
  customerViewHref,
  type CustomerView,
} from "@/lib/customer-register-dashboard";

export function CustomerKpis({
  counts,
  filters,
  selectedView,
}: {
  counts: { total: number; new: number; returning: number; withoutPortal: number };
  filters: { q?: string; status?: string };
  selectedView?: CustomerView;
}) {
  const items = [
    { label: "Total Customers", count: counts.total },
    { label: "New Customers", count: counts.new, view: "new" as const },
    { label: "Returning Customers", count: counts.returning, view: "returning" as const },
    { label: "Without Portal Access", count: counts.withoutPortal, view: "without-portal" as const },
  ];
  return (
    <nav className="customer-kpis" aria-label="Customer views">
      {items.map((item) => {
        const selected = item.view === selectedView;
        return (
          <Link
            className={`customer-kpi${selected ? " selected" : ""}`}
            href={customerViewHref(filters, item.view)}
            aria-current={selected ? "page" : undefined}
            key={item.label}
          >
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </Link>
        );
      })}
    </nav>
  );
}
