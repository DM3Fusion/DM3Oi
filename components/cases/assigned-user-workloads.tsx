import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { platformRoleLabels } from "@/lib/platform-user-filters";
import type { CaseAssigneeWorkload } from "@/lib/case-assignee-workload";
import type { AvatarProfileRow } from "@/lib/data/case-repository";

export function AssignedUserWorkloads({
  workloads,
}: {
  workloads: Array<CaseAssigneeWorkload<AvatarProfileRow>>;
}) {
  return (
    <section className="assigned-workloads case-assigned-workloads" aria-labelledby="assigned-workloads-heading">
      <div className="assigned-workloads-heading">
        <h2 id="assigned-workloads-heading">Assigned User Workload</h2>
        <p>Current assignments and durable associations visible in DM3Oi.</p>
      </div>
      <div className="assigned-workload-grid">
        {workloads.map((item) => {
          const assignee = encodeURIComponent(item.profile.id);
          return (
            <article className="assigned-workload-card" key={item.profile.id}>
              <header>
                <UserAvatar
                  displayName={item.profile.display_name}
                  email={item.profile.email}
                  src={item.profile.avatarUrl}
                />
                <span>
                  <strong>{item.profile.display_name ?? item.profile.email}</strong>
                  <small>
                    {platformRoleLabels[
                      item.role as keyof typeof platformRoleLabels
                    ] ?? item.role.replaceAll("_", " ")}
                  </small>
                </span>
              </header>
              <dl>
                <div>
                  <dt>In Progress</dt>
                  <dd><Link href={`/cases?view=in-progress&assignee=${assignee}`}>{item.inProgress}</Link></dd>
                </div>
                <div>
                  <dt>Overdue</dt>
                  <dd><Link className={item.overdue > 0 ? "case-kpi-overdue" : undefined} href={`/cases?view=overdue&assignee=${assignee}`}>{item.overdue}</Link></dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>{item.completed}</dd>
                </div>
                <div>
                  <dt>Lifetime</dt>
                  <dd>{item.lifetime}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
