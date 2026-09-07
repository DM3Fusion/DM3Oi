import type { CustomerPortalCaseSummary } from "@/lib/data/customer-portal-case-repository";

const safePercentage = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

export function PortalCaseSummaries({ cases }: { cases: CustomerPortalCaseSummary[] }) {
  if (!cases.length) {
    return (
      <section className="portal-case-empty" aria-labelledby="portal-cases-heading">
        <h2 id="portal-cases-heading">No active cases</h2>
        <p>You don’t currently have any work in progress.</p>
      </section>
    );
  }

  const singular = cases.length === 1;
  return (
    <section className="portal-case-section" aria-labelledby="portal-cases-heading">
      <h2 id="portal-cases-heading">{singular ? "Your Case" : "Active Cases"}</h2>
      <div className={`portal-case-grid${singular ? " single" : ""}`}>
        {cases.map((item) => {
          const percentage = safePercentage(item.progress_percent);
          return (
            <article className="portal-case-card" key={item.case_number}>
              <div className="portal-case-heading">
                <div>
                  <strong>{item.service_label || item.case_number}</strong>
                  <span>{item.case_number}</span>
                </div>
                <span className="portal-case-status">{item.customer_status}</span>
              </div>
              <div className="portal-case-progress-copy">
                <strong>{percentage}% Complete</strong>
              </div>
              <div
                className="portal-case-progress"
                role="progressbar"
                aria-label={`${item.case_number} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percentage}
                aria-valuetext={`${percentage}% complete`}
              >
                <span style={{ width: `${percentage}%` }} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
