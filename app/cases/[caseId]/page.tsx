import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge, ProgressBar } from "@/components/ui";
import {
  getLiveCase,
  displayName,
} from "@/lib/data/case-repository";
import { getAccessContext } from "@/lib/auth/context";
import { formatActivity } from "@/lib/activity-format";
import { formatDate } from "@/lib/format";
import {
  createTaskAction,
  deleteTaskAction,
  moveTaskAction,
  setCaseAssignmentAction,
  transitionCaseStatusAction,
  updateTaskAction,
} from "@/lib/data/case-actions";
import { UserAvatar } from "@/components/user-avatar";
import { getCaseQuestions } from "@/lib/data/question-repository";
import { CaseQuestions } from "@/components/cases/case-questions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";
import { hasPermission, roleHasPermission } from "@/lib/auth/permissions";
const statuses = [
  "NEW",
  "UNASSIGNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING",
  "REVIEW",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
] as const;
const taskStatuses = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "NOT_APPLICABLE",
] as const;
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const [{ caseId }, query, access] = await Promise.all([
    params,
    searchParams,
    getAccessContext(),
  ]);
  const [{ data, item }, questions] = await Promise.all([
    getLiveCase(caseId),
    getCaseQuestions(caseId),
  ]);
  if (!item) notFound();
  const canManage = hasPermission(access, "MANAGE_TASKS");
  const canAssignCases = hasPermission(access, "ASSIGN_CASES");
  const canWorkCases = hasPermission(access, "WORK_CASES");
  const permittedStatuses = canAssignCases
    ? statuses
    : (["IN_PROGRESS", "WAITING", "REVIEW"] as const);
  const activities = data.activities.filter(
    (activity) => activity.case_id === item.id,
  );
  return (
    <>
      {query.error ? (
        <div className="form-alert page-notice">{query.error}</div>
      ) : null}
      {query.message ? (
        <div className="success-alert page-notice">{query.message}</div>
      ) : null}
      <div className="detail-header">
        <div className="breadcrumb">
          <Link href="/cases">Cases</Link>
          <span>/</span>
          {item.case_number}
        </div>
        <div className="detail-title">
          <div>
            <span className="eyebrow">{item.case_number}</span>
            <h1>{item.title}</h1>
            <p>
              {item.customer?.name ?? "Unknown customer"} · {item.case_type}
            </p>
          </div>
          <div className="detail-badges">
            <Badge value={item.status} />
            <Badge value={item.priority} />
          </div>
        </div>
        <div className="detail-progress">
          <div>
            <span>Overall progress</span>
            <b>
              {item.progress.completedRequiredTasks} of{" "}
              {item.progress.totalRequiredTasks} required tasks complete
            </b>
          </div>
          <ProgressBar percentage={item.progress.percentage} />
          <div>
            <span>Due date</span>
            <b>{formatDate(item.due_at ?? undefined)}</b>
          </div>
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <CaseQuestions caseId={item.id} questions={questions} />
          <section className="panel detail-section">
            <div className="section-head">
              <div>
                <h2>Case Overview</h2>
                <p>Live case information and lifecycle</p>
              </div>
            </div>
            <p className="description">
              {item.description || "No description provided."}
            </p>
            <dl className="overview-grid">
              <div>
                <dt>Case type</dt>
                <dd>{item.case_type}</dd>
              </div>
              <div>
                <dt>Opened</dt>
                <dd>{formatDate(item.opened_at)}</dd>
              </div>
              <div>
                <dt>Manager</dt>
                <dd>{displayName(item.manager)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDate(item.updated_at)}</dd>
              </div>
            </dl>
            {canWorkCases ? <form
              action={transitionCaseStatusAction}
              className="inline-control"
            >
              <input type="hidden" name="caseId" value={item.id} />
              <label>
                <span>Change status</span>
                <select name="status" defaultValue={item.status}>
                  {permittedStatuses.map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <PendingSubmitButton pendingLabel="Updating…">Update Status</PendingSubmitButton>
            </form> : null}
          </section>
          <section className="panel detail-section">
            <div className="section-head">
              <div>
                <h2>Tasks</h2>
                <p>Required applicable work determines live progress</p>
              </div>
              <span className="count-pill">
                {item.progress.remainingRequiredTasks} remaining
              </span>
            </div>
            {item.tasks.length ? (
              <div className="task-list">
                {item.tasks.map((task, index) => (
                  <article className="task-record" key={task.id}>
                    <span
                      className={`task-check ${task.status === "COMPLETED" ? "done" : ""}`}
                    >
                      {task.status === "COMPLETED" ? "✓" : task.sequence}
                    </span>
                    <div>
                      <b>{task.title}</b>
                      <span>
                        {displayName(
                          data.staff.find(
                            (staff) =>
                              staff.profile.id === task.assigned_user_id,
                          )?.profile,
                        )}{" "}
                        · Due {formatDate(task.due_at ?? undefined)}
                      </span>
                    </div>
                    <span className={task.required ? "required" : "optional"}>
                      {task.required ? "Required" : "Optional"}
                    </span>
                    <Badge value={task.status} />
                    <details className="task-editor">
                      <summary>Edit task</summary>
                      <form action={updateTaskAction} className="mini-form">
                        <input type="hidden" name="caseId" value={item.id} />
                        <input type="hidden" name="taskId" value={task.id} />
                        <label>
                          <span>Title</span>
                          <input
                            name="title"
                            defaultValue={task.title}
                            required
                            readOnly={!canManage}
                          />
                        </label>
                        <label>
                          <span>Description</span>
                          <input
                            name="description"
                            defaultValue={task.description}
                            readOnly={!canManage}
                          />
                        </label>
                        <label>
                          <span>Assigned staff</span>
                          <select
                            name="assignedUserId"
                            defaultValue={task.assigned_user_id ?? ""}
                            disabled={!canManage}
                          >
                            <option value="">Unassigned</option>
                            {data.staff.map((staff) => (
                              <option
                                key={staff.profile.id}
                                value={staff.profile.id}
                              >
                                {displayName(staff.profile)}
                              </option>
                            ))}
                          </select>
                          {!canManage ? <input type="hidden" name="assignedUserId" value={task.assigned_user_id ?? ""} /> : null}
                        </label>
                        <label>
                          <span>Status</span>
                          <select name="status" defaultValue={task.status}>
                            {taskStatuses.map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Due date</span>
                          <input
                            type="date"
                            name="dueAt"
                            defaultValue={task.due_at?.slice(0, 10)}
                            readOnly={!canManage}
                          />
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            name="requiredCheck"
                            defaultChecked={task.required}
                            disabled={!canManage}
                          />
                          <span>Required task</span>
                        </label>
                        <input
                          type="hidden"
                          name="required"
                          value={task.required ? "true" : "false"}
                        />
                        <div className="mini-actions">
                          <PendingSubmitButton pendingLabel="Saving…">Save Task</PendingSubmitButton>
                        </div>
                      </form>
                      {canManage ? (
                        <div className="task-actions">
                          <form action={moveTaskAction}>
                            <input
                              type="hidden"
                              name="caseId"
                              value={item.id}
                            />
                            <input
                              type="hidden"
                              name="taskId"
                              value={task.id}
                            />
                            <button
                              name="direction"
                              value="UP"
                              disabled={index === 0}
                            >
                              Move Up
                            </button>
                            <button
                              name="direction"
                              value="DOWN"
                              disabled={index === item.tasks.length - 1}
                            >
                              Move Down
                            </button>
                          </form>
                          <form action={deleteTaskAction}>
                            <input
                              type="hidden"
                              name="caseId"
                              value={item.id}
                            />
                            <input
                              type="hidden"
                              name="taskId"
                              value={task.id}
                            />
                            <button className="danger-button" type="submit">
                              Delete Task
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </details>
                  </article>
                ))}
              </div>
            ) : (
              <div className="no-results">
                No tasks have been created for this case.
              </div>
            )}
            <div className="progress-explainer">
              <b>{item.progress.percentage}% complete</b>
              <span>
                Completed required tasks ({item.progress.completedRequiredTasks}
                ) ÷ applicable required tasks (
                {item.progress.totalRequiredTasks})
              </span>
            </div>
            {canManage ? (
              <details className="create-panel">
                <summary>＋ Add Task</summary>
                <form action={createTaskAction} className="mini-form">
                  <input type="hidden" name="caseId" value={item.id} />
                  <label>
                    <span>Task name</span>
                    <input name="title" required />
                  </label>
                  <label>
                    <span>Description</span>
                    <input name="description" />
                  </label>
                  <label>
                    <span>Assigned staff</span>
                    <select name="assignedUserId" defaultValue="">
                      <option value="">Unassigned</option>
                      {data.staff.map((staff) => (
                        <option key={staff.profile.id} value={staff.profile.id}>
                          {displayName(staff.profile)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Due date</span>
                    <input type="date" name="dueAt" />
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" name="required" defaultChecked />
                    <span>Required</span>
                  </label>
                  <PendingSubmitButton pendingLabel="Creating…">Create Task</PendingSubmitButton>
                </form>
              </details>
            ) : null}
          </section>
          <section className="panel detail-section">
            <div className="section-head">
              <div>
                <h2>Activity</h2>
                <p>Append-oriented live case event history</p>
              </div>
            </div>
            <div className="timeline">
              {activities.length ? (
                activities.map((activity) => (
                  <article key={activity.id}>
                    <span />
                    <div>
                      <b>
                        {formatActivity(
                          activity.event_type,
                          activity.event_data,
                        )}
                      </b>
                      <p>
                        {displayName(activity.actor)} ·{" "}
                        {formatOrganizationDateTime(activity.created_at, data.timezone)}
                      </p>
                    </div>
                  </article>
                ))
              ) : (
                <p className="muted">No activity recorded yet.</p>
              )}
            </div>
          </section>
        </div>
        <aside className="detail-side">
          <section className="panel detail-section">
            <h2>Assignments</h2>
            <div className="assigned-list">
              {item.manager ? (
                <div>
                  <UserAvatar displayName={displayName(item.manager)} email={item.manager.email} src={item.manager.avatarUrl} />
                  <span>
                    <b>{displayName(item.manager)}</b>
                    <small>Manager</small>
                  </span>
                </div>
              ) : (
                <p className="muted">No manager assigned.</p>
              )}
              {item.assignedStaff.map((profile) => (
                <div key={profile.id}>
                  <UserAvatar displayName={displayName(profile)} email={profile.email} src={profile.avatarUrl} />
                  <span>
                    <b>{displayName(profile)}</b>
                    <small>Staff</small>
                  </span>
                  {canAssignCases ? (
                    <form action={setCaseAssignmentAction}>
                      <input type="hidden" name="caseId" value={item.id} />
                      <input type="hidden" name="userId" value={profile.id} />
                      <input
                        type="hidden"
                        name="assignmentRole"
                        value="STAFF"
                      />
                      <input type="hidden" name="active" value="false" />
                      <PendingSubmitButton className="text-button" pendingLabel="Removing…">Remove</PendingSubmitButton>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
            {canAssignCases ? (
              <div className="assignment-controls">
                <form action={setCaseAssignmentAction}>
                  <input type="hidden" name="caseId" value={item.id} />
                  <input type="hidden" name="assignmentRole" value="MANAGER" />
                  <select name="userId" required defaultValue="">
                    <option value="" disabled>
                      Change manager…
                    </option>
                    {data.staff
                      .filter((staff) => roleHasPermission(staff.membership.role, "ASSIGN_CASES"))
                      .map((staff) => (
                        <option key={staff.profile.id} value={staff.profile.id}>
                          {displayName(staff.profile)}
                        </option>
                      ))}
                  </select>
                  <PendingSubmitButton pendingLabel="Assigning…">Assign</PendingSubmitButton>
                </form>
                <form action={setCaseAssignmentAction}>
                  <input type="hidden" name="caseId" value={item.id} />
                  <input type="hidden" name="assignmentRole" value="STAFF" />
                  <select name="userId" required defaultValue="">
                    <option value="" disabled>
                      Add staff…
                    </option>
                    {data.staff
                      .filter(
                        (staff) =>
                          !item.assignedStaff.some(
                            (profile) => profile.id === staff.profile.id,
                          ),
                      )
                      .map((staff) => (
                        <option key={staff.profile.id} value={staff.profile.id}>
                          {displayName(staff.profile)}
                        </option>
                      ))}
                  </select>
                  <PendingSubmitButton pendingLabel="Assigning…">Assign</PendingSubmitButton>
                </form>
              </div>
            ) : null}
          </section>
          {[
            [
              "Customer Communications",
              "Linked conversations and correspondence will appear here.",
            ],
            ["Attachments", "Case documents and evidence will appear here."],
            [
              "Completion Review",
              "Completion rules and final approval will appear here.",
            ],
          ].map(([title, text]) => (
            <section className="panel future-panel" key={title}>
              <span>◇</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
                <small>Future milestone</small>
              </div>
            </section>
          ))}
        </aside>
      </div>
    </>
  );
}
