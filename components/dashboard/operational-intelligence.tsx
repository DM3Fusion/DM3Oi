import Link from "next/link";
import type { AuthorizedOperationalIntelligence } from "@/lib/data/operational-intelligence-repository";

const levelLabel = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase();

function IntelligenceKpi({
  href,
  tone,
  label,
  value,
  detail,
}: {
  href: string | null;
  tone: string;
  label: string;
  value: number | string;
  detail: string;
}) {
  const content = (
    <>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </>
  );
  const className = `intelligence-kpi ${tone}`;
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function OperationalIntelligenceSection({
  intelligence,
}: {
  intelligence: AuthorizedOperationalIntelligence;
}) {
  const { readinessDistribution: readiness, capabilities } = intelligence;
  const maxBucket = Math.max(1, ...readiness.buckets.map((bucket) => bucket.count));
  const bottlenecks = [
    ...intelligence.questionBottlenecks.map((item) => ({
      key: `question-${item.questionId}`,
      kind: "Question",
      label: item.label,
      affectedCases: item.affectedCases,
      detail: `${item.affectedPercent}% of current Cases`,
      href: capabilities.viewQuestions ? "/questions" : null,
    })),
    ...intelligence.taskBottlenecks.map((item) => ({
      key: item.groupKey,
      kind: item.generated ? "Rule-generated task" : "Task",
      label: item.label,
      affectedCases: item.affectedCases,
      detail: [
        `${item.incompleteCount} incomplete`,
        item.blockedCount ? `${item.blockedCount} blocked` : null,
        item.overdueCount ? `${item.overdueCount} overdue` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: capabilities.viewTasks
        ? `/tasks?q=${encodeURIComponent(item.label)}`
        : null,
    })),
  ]
    .sort(
      (left, right) =>
        right.affectedCases - left.affectedCases ||
        left.label.localeCompare(right.label),
    )
    .slice(0, 5);
  const activeRuleActivity =
    intelligence.ruleActivity?.filter(
      (rule) =>
        rule.matchingCases ||
        rule.effectiveShowActions ||
        rule.effectiveRequireActions ||
        rule.generatedTasks,
    ) ?? [];
  const canInspectBottlenecks =
    capabilities.viewQuestions || capabilities.viewTasks;

  return (
    <section className="operational-intelligence" aria-labelledby="operational-intelligence-title">
      <div className="operational-intelligence-title">
        <div>
          <span className="eyebrow">Operational Intelligence</span>
          <h2 id="operational-intelligence-title">Current completion readiness</h2>
          <p>Explainable signals from authorized Cases, Questions, Tasks, and Rules.</p>
        </div>
      </div>

      <div className="intelligence-kpis">
        <IntelligenceKpi href={capabilities.viewCases ? "/cases" : null} tone="tone-green" label="Ready Cases" value={readiness.readyCases} detail={`of ${readiness.totalCurrentCases} current Cases`} />
        <IntelligenceKpi href={capabilities.viewCases ? "/cases" : null} tone="tone-amber" label="Not Ready" value={readiness.notReadyCases} detail="current completion requirements" />
        {capabilities.viewTasks ? <IntelligenceKpi href="/tasks?status=blocked" tone="tone-red" label="Blocked Cases" value={intelligence.blockedWork.caseCount} detail={`${intelligence.blockedWork.taskCount} blocked Tasks`} /> : null}
        <IntelligenceKpi href={capabilities.viewCases ? "/cases" : null} tone="tone-blue" label="Average Progress" value={`${readiness.averageProgress}%`} detail={`${readiness.completedCases} completed Cases excluded`} />
      </div>

      <div className="intelligence-grid">
        <section className="panel intelligence-panel">
          <div className="section-head">
            <div><h2>Readiness Distribution</h2><p>Current Cases by required-work completion</p></div>
          </div>
          {readiness.totalCurrentCases ? (
            <div className="readiness-distribution" role="group" aria-label={readiness.buckets.map((bucket) => `${bucket.label}: ${bucket.count} Cases`).join(", ")}>
              {readiness.buckets.map((bucket) => (
                <div key={bucket.label}>
                  <span>{bucket.label}</span>
                  <i><b style={{ width: `${(bucket.count / maxBucket) * 100}%` }} /></i>
                  <strong>{bucket.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-results">No current Cases are in scope.</div>
          )}
        </section>

        <section className="panel intelligence-panel">
          <div className="section-head">
            <div><h2>Top Bottlenecks</h2><p>Most common current completion requirements</p></div>
          </div>
          {bottlenecks.length ? (
            <div className="intelligence-list">
              {bottlenecks.map((item) => {
                const content = <><span><small>{item.kind}</small><strong>{item.label}</strong><em>{item.detail}</em></span><b>{item.affectedCases} Cases</b></>;
                return item.href ? <Link key={item.key} href={item.href}>{content}</Link> : <div key={item.key}>{content}</div>;
              })}
            </div>
          ) : canInspectBottlenecks ? (
            <div className="no-results">All currently required work is complete.</div>
          ) : (
            <div className="no-results">Bottleneck detail is unavailable for this access level.</div>
          )}
          {capabilities.viewTasks && intelligence.blockedWork.cases.length ? (
            <div className="blocked-case-links">
              <div>
                <strong>Top blocked work</strong>
                <span>{intelligence.blockedWork.topTasks.map((item) => `${item.label} (${item.blockedCount})`).join(" · ")}</span>
              </div>
              <div>
                <strong>Cases carrying blocked work</strong>
                <span>
                  {intelligence.blockedWork.cases.slice(0, 4).map((item, index) => (
                    <span key={item.id}>{index ? " · " : ""}{capabilities.viewCases ? <Link href={`/cases/${item.id}`}>{item.caseNumber}</Link> : item.caseNumber}</span>
                  ))}
                </span>
              </div>
            </div>
          ) : capabilities.viewTasks ? (
            <div className="blocked-work-empty">No Cases currently have blocked required work.</div>
          ) : null}
        </section>
      </div>

      <div className={`intelligence-grid intelligence-lower${intelligence.ruleActivity ? "" : " single"}`}>
        <section className="panel intelligence-panel">
          <div className="section-head">
            <div><h2>Cases Needing Attention</h2><p>Explicit current blockers and incomplete requirements</p></div>
          </div>
          {!capabilities.viewCases ? (
            <div className="no-results">Case-level attention requires Case access.</div>
          ) : intelligence.attentionCases.length ? (
            <div className="attention-case-list">
              {intelligence.attentionCases.slice(0, 6).map((item) => {
                const content = <>
                  <span className={`attention-level level-${item.level.toLowerCase()}`}>{levelLabel(item.level)}</span>
                  <span><strong>{item.caseNumber} · {item.title}</strong><small>{item.customerName ?? "Unknown customer"} · {item.reasons.join(" · ")}</small></span>
                  <b>{item.progressPercent}%</b>
                </>;
                return capabilities.viewCases ? <Link href={`/cases/${item.id}`} key={item.id}>{content}</Link> : <div key={item.id}>{content}</div>;
              })}
            </div>
          ) : (
            <div className="dashboard-healthy"><span aria-hidden>✓</span><div><strong>No current Cases need completion attention</strong><p>All visible current Cases are ready for completion.</p></div></div>
          )}
        </section>

        {intelligence.ruleActivity ? (
          <section className="panel intelligence-panel">
            <div className="section-head">
              <div><h2>Rule Activity</h2><p>Current matches versus durable generated Tasks</p></div>
              {capabilities.viewRules ? <Link href="/questions?view=rules">View Rules →</Link> : null}
            </div>
            {activeRuleActivity.length ? (
              <div className="rule-activity-list">
                {activeRuleActivity.slice(0, 5).map((rule) => (
                  <div key={rule.ruleId}>
                    <strong>{rule.name}</strong>
                    <span><b>{rule.matchingCases}</b> matching Cases</span>
                    {rule.generatedTasks !== null ? <span><b>{rule.generatedTasks}</b> generated Tasks</span> : null}
                    <small>{rule.effectiveShowActions} show · {rule.effectiveRequireActions} require currently effective</small>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-results">No active Rules are currently affecting Cases.</div>
            )}
          </section>
        ) : null}
      </div>
    </section>
  );
}
