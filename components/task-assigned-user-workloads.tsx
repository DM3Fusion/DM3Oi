import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { platformRoleLabels } from "@/lib/platform-user-filters";
import type { TaskAssigneeWorkload } from "@/lib/task-assignee-workload";

export function TaskAssignedUserWorkloads({
  workloads,
}: {
  workloads: TaskAssigneeWorkload[];
}) {
  return (
    <section
      className="assigned-workloads task-assigned-workloads"
      aria-labelledby="task-assigned-workloads-heading"
    >
      <div className="assigned-workloads-heading">
        <h2 id="task-assigned-workloads-heading">Assigned User Workload</h2>
        <p>Current Task workload and durable completion attribution.</p>
      </div>

      <div className="assigned-workload-grid">
        {workloads.map((item) => {
          const assignee = encodeURIComponent(item.profile.id);

          return (
            <article
              className="assigned-workload-card task-assigned-workload-card"
              key={item.profile.id}
            >
              <header>
                <UserAvatar
                  displayName={item.profile.display_name}
                  email={item.profile.email}
                  src={item.profile.avatarUrl}
                />
                <span>
                  <strong>
                    {item.profile.display_name ?? item.profile.email}
                  </strong>
                  <small>
                    {platformRoleLabels[
                      item.role as keyof typeof platformRoleLabels
                    ] ?? item.role.replaceAll("_", " ")}
                  </small>
                </span>
              </header>

              <dl>
                <div>
                  <dt>Not Started</dt>
                  <dd>
                    <Link
                      href={`/tasks?status=not-started&assignee=${assignee}`}
                    >
                      {item.notStarted}
                    </Link>
                  </dd>
                </div>

                <div>
                  <dt>In Progress</dt>
                  <dd>
                    <Link
                      href={`/tasks?status=in-progress&assignee=${assignee}`}
                    >
                      {item.inProgress}
                    </Link>
                  </dd>
                </div>

                <div>
                  <dt>Overdue</dt>
                  <dd>
                    <Link
                      className={
                        item.overdue > 0 ? "case-kpi-overdue" : undefined
                      }
                      href={`/tasks?due=overdue&assignee=${assignee}`}
                    >
                      {item.overdue}
                    </Link>
                  </dd>
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
