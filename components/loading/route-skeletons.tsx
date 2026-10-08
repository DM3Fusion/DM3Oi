function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={className}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

function SkeletonLine({ width = "100%" }: { width?: string }) {
  return <span className="route-skeleton-line" style={{ width }} />;
}

export function PageHeaderSkeleton({ label = "Loading page heading" }: { label?: string }) {
  return (
    <LoadingRegion label={label} className="route-skeleton-header">
      <SkeletonLine width="7rem" />
      <SkeletonLine width="min(21rem, 70vw)" />
    </LoadingRegion>
  );
}

export function KpiGridSkeleton({
  count = 6,
  label = "Loading summary",
}: {
  count?: number;
  label?: string;
}) {
  return (
    <LoadingRegion label={label} className="route-skeleton-kpis">
      <div className="route-skeleton-kpi-grid">
        {Array.from({ length: count }, (_, index) => (
          <div className="route-skeleton-card" key={index}>
            <SkeletonLine width="62%" />
            <SkeletonLine width="34%" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function WorkloadCardsSkeleton({ label = "Loading assigned workload" }: { label?: string }) {
  return (
    <LoadingRegion label={label} className="panel route-skeleton-panel route-skeleton-workload">
      <div className="route-skeleton-section-head">
        <SkeletonLine width="13rem" />
        <SkeletonLine width="8rem" />
      </div>
      <div className="route-skeleton-workload-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="route-skeleton-workload-card" key={index}>
            <span className="route-skeleton-avatar" />
            <div>
              <SkeletonLine width="75%" />
              <SkeletonLine width="52%" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function TableSkeleton({
  label = "Loading table",
  rows = 5,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <LoadingRegion label={label} className="panel route-skeleton-panel route-skeleton-table">
      <div className="route-skeleton-filters">
        <SkeletonLine width="min(25rem, 100%)" />
        <SkeletonLine width="9rem" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div className="route-skeleton-table-row" key={index}>
          <SkeletonLine width="40%" />
          <SkeletonLine width="18%" />
          <SkeletonLine width="16%" />
          <SkeletonLine width="12%" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function ReportSectionSkeleton({
  label = "Loading report section",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <LoadingRegion label={label} className="panel route-skeleton-panel route-skeleton-report">
      <div className="route-skeleton-section-head">
        <div>
          <SkeletonLine width="12rem" />
          <SkeletonLine width="min(26rem, 70vw)" />
        </div>
      </div>
      <div className={compact ? "route-skeleton-report-compact" : "route-skeleton-report-grid"}>
        {Array.from({ length: compact ? 3 : 6 }, (_, index) => (
          <div className="route-skeleton-card" key={index}>
            <SkeletonLine width="68%" />
            <SkeletonLine width="42%" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function DashboardBodySkeleton() {
  return (
    <div className="route-loading-stack">
      <KpiGridSkeleton count={4} label="Loading Dashboard summary" />
      <div className="route-skeleton-two-column">
        <ReportSectionSkeleton label="Loading attention summary" compact />
        <ReportSectionSkeleton label="Loading Cases needing attention" compact />
      </div>
      <ReportSectionSkeleton label="Loading Dashboard metrics" />
    </div>
  );
}

export function ServiceDeskBodySkeleton() {
  return (
    <div className="route-loading-stack">
      <KpiGridSkeleton count={8} label="Loading Service Desk summary" />
      <TableSkeleton label="Loading recent Service Requests" rows={8} />
    </div>
  );
}

export function RootRouteSkeleton() {
  return (
    <div className="route-loading-stack">
      <PageHeaderSkeleton label="Loading page" />
      <LoadingRegion
        label="Loading page content"
        className="panel route-skeleton-panel"
      >
        <div className="route-skeleton-section-head">
          <div>
            <SkeletonLine width="11rem" />
            <SkeletonLine width="min(24rem, 70vw)" />
          </div>
        </div>
        <div className="route-skeleton-report-grid">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="route-skeleton-card" key={index}>
              <SkeletonLine width="66%" />
              <SkeletonLine width="44%" />
            </div>
          ))}
        </div>
      </LoadingRegion>
    </div>
  );
}

export function CasesBodySkeleton() {
  return (
    <div className="route-loading-stack">
      <KpiGridSkeleton label="Loading Case summary" />
      <WorkloadCardsSkeleton label="Loading Case workload" />
      <TableSkeleton label="Loading Case register" />
    </div>
  );
}

export function CasesRouteSkeleton() {
  return (
    <div className="route-loading-stack">
      <PageHeaderSkeleton label="Loading Cases" />
      <CasesBodySkeleton />
    </div>
  );
}

export function TasksBodySkeleton() {
  return (
    <div className="route-loading-stack">
      <KpiGridSkeleton count={4} label="Loading Task summary" />
      <WorkloadCardsSkeleton label="Loading Task workload" />
      <TableSkeleton label="Loading Task register" />
    </div>
  );
}

export function TasksRouteSkeleton() {
  return (
    <div className="route-loading-stack">
      <PageHeaderSkeleton label="Loading Tasks" />
      <TasksBodySkeleton />
    </div>
  );
}

export function ReportsRouteSkeleton() {
  return (
    <div className="route-loading-stack">
      <PageHeaderSkeleton label="Loading Reports" />
      <ReportSectionSkeleton label="Loading Business Reach" compact />
      <ReportSectionSkeleton label="Loading operational reports" />
    </div>
  );
}
