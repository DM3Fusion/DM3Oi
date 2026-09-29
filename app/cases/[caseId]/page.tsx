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
  deleteTaskAction,
  moveTaskAction,
  setCaseAssignmentAction,
  transitionCaseStatusAction,
  updateTaskAction,
} from "@/lib/data/case-actions";
import { UserAvatar } from "@/components/user-avatar";
import { CaseQuestions } from "@/components/cases/case-questions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatOrganizationDate, formatOrganizationDateTime, organizationDateInputValue } from "@/lib/organization-timezone";
import { hasPermission, roleHasPermission } from "@/lib/auth/permissions";
import { ApplicationIcon } from "@/components/application-icon";
import { createClient } from "@/lib/supabase/server";
import {
  CANONICAL_ACTIVE_CASE_STATUSES,
  isCanonicalActiveCaseStatus,
  isIncompleteCompatibilityCaseStatus,
} from "@/lib/case-lifecycle";
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
  const { data, item, recentCommunications } = await getLiveCase(caseId);
  if (!item) notFound();
  const supabase = await createClient();
  // Temporary schema bridge until generated Supabase types include
  // organization_task_purposes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purposeQuery = (supabase as any)
    .from("organization_task_purposes")
    .select("id,label")
    .eq("organization_id", data.organizationId)
    .eq("is_active", true)
    .order("sort_order")
    .order("label");

  const dependentsQuestionQuery = supabase
    .from("question_definitions")
    .select("id")
    .eq("organization_id", data.organizationId)
    .eq("question_text", "Are dependents being claimed?")
    .eq("response_type", "YES_NO")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const [purposeResult, dependentsQuestionResult] = await Promise.all([
    purposeQuery,
    dependentsQuestionQuery,
  ]);
  if (purposeResult.error) {
    console.error("Task Purpose query failed", {
      organizationId: data.organizationId,
      code: purposeResult.error.code,
      message: purposeResult.error.message,
    });
    throw new Error("Task configuration is temporarily unavailable.");
  }
  const taskPurposes = (purposeResult.data ?? []) as Array<{
    id: string;
    label: string;
  }>;
  const questions = item.questions;

  if (dependentsQuestionResult.error) {
    console.error("Dependents Question lookup failed", {
      organizationId: data.organizationId,
      code: dependentsQuestionResult.error.code,
      message: dependentsQuestionResult.error.message,
    });
  }

  const finalizedDependentsQuestion = questions.find(
    (question) =>
      question.response_type === "YES_NO" &&
      question.question_text.trim().toLowerCase() ===
        "are dependents being claimed?",
  );

  const dependentsQuestionId =
    finalizedDependentsQuestion?.id ??
    ((dependentsQuestionResult.data as { id?: string } | null)?.id ?? null);

  const dependentsValue =
    item.intakeProgress && dependentsQuestionId
      ? item.intakeProgress.answers[dependentsQuestionId]
      : finalizedDependentsQuestion?.response?.response_value;

  const dependentsClaimed =
    dependentsValue === true || dependentsValue === "true"
      ? "Yes"
      : dependentsValue === false || dependentsValue === "false"
        ? "No"
        : "—";

  const canManage = hasPermission(access, "MANAGE_TASKS");
  const canAssignCases = hasPermission(access, "ASSIGN_CASES");
  const canWorkCases = hasPermission(access, "WORK_CASES");
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
            <h1>{item.customer?.name ?? "Unknown customer"}</h1>
            <dl className="detail-summary-facts">
              <div>
                <dt>Case Type</dt>
                <dd>{item.case_type}</dd>
              </div>
              <div>
                <dt>Tax Year</dt>
                <dd>{item.tax_year ?? "—"}</dd>
              </div>
            </dl>
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
              {item.intakeProgress
                ? `${item.intakeProgress.completedSteps} of ${item.intakeProgress.totalSteps} Guided Intake steps complete`
                : `${item.progress.completedUnits} of ${item.progress.totalUnits} required work items complete`}
            </b>
          </div>
          <ProgressBar percentage={item.progress.progressPercent} />
          <div>
            <span>Due date</span>
            <b>{formatDate(item.due_at ?? undefined)}</b>
          </div>
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          {!item.intakeProgress ? (
            <CaseQuestions questions={questions} />
          ) : null}
          <section className="panel detail-section">
            <div className="section-head">
              <h2>Case Overview</h2>
            </div>
            <p className="description">
              {item.description || "No description provided."}
            </p>
            <dl className="overview-grid case-overview-grid">
              <div>
                <dt>Customer</dt>
                <dd>{item.customer?.name ?? "Unknown customer"}</dd>
              </div>
              <div>
                <dt>Case type</dt>
                <dd>{item.case_type}</dd>
              </div>
              <div>
                <dt>Dependents Claimed</dt>
                <dd>{dependentsClaimed}</dd>
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
            {canWorkCases && isIncompleteCompatibilityCaseStatus(item.status) ? <form
              action={transitionCaseStatusAction}
              className="inline-control"
            >
              <input type="hidden" name="caseId" value={item.id} />
              <label>
                <span>Change status</span>
                <select name="status" defaultValue={item.status}>
                  {!isCanonicalActiveCaseStatus(item.status) ? (
                    <option value={item.status} disabled>
                      {item.status.replaceAll("_", " ")} (current)
                    </option>
                  ) : null}
                  {CANONICAL_ACTIVE_CASE_STATUSES.map((value) => (
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
              <h2>Tasks</h2>
              <span className="count-pill">
                {item.progress.remainingWork.filter((work) => work.kind === "TASK").length} remaining
              </span>
            </div>
            {item.tasks.length ? (
              <div className="task-list">
                {item.tasks.map((task, index) => (
                  <details className="task-record" key={task.id}>
                    <summary className="task-record-summary">
                      <span
                        className={`task-check ${task.status === "COMPLETED" ? "done" : ""}`}
                      >
                        {task.status === "COMPLETED" ? <ApplicationIcon name="check" /> : task.sequence}
                      </span>
                      <span className="task-record-copy">
                        <b>{task.title}</b>
                        {(task as unknown as { task_purpose_label?: string | null }).task_purpose_label ? (
                          <span className="rule-generated-label">
                            {(task as unknown as { task_purpose_label?: string | null }).task_purpose_label}
                          </span>
                        ) : null}
                        {task.generated_by_rule ? (
                          <span className="rule-generated-label">Generated by Rule</span>
                        ) : null}
                        {task.generated_by_intake ? (
                          <span className="rule-generated-label">Intake follow-up</span>
                        ) : null}
                        <span className="task-record-meta">
                          {displayName(
                            data.staff.find(
                              (staff) =>
                                staff.profile.id === task.assigned_user_id,
                            )?.profile,
                          )}{" "}
                          · Due {formatOrganizationDate(task.due_at, data.timezone)}
                        </span>
                      </span>
                      <span className={task.required ? "required" : "optional"}>
                        {task.required ? "Required" : "Optional"}
                      </span>
                      <Badge value={task.status} />
                      <span className="task-row-chevron" aria-hidden="true">›</span>
                    </summary>
                    <div className="task-editor">
                      <form action={updateTaskAction} className="mini-form">
                        <input type="hidden" name="caseId" value={item.id} />
                        <input type="hidden" name="taskId" value={task.id} />
                        <label>
                          <span>Task Purpose</span>
                          <select
                            name="taskPurposeId"
                            defaultValue={
                              (task as unknown as { task_purpose_id?: string | null })
                                .task_purpose_id ?? ""
                            }
                            disabled={!canManage || task.generated_by_rule}
                            required={canManage && !task.generated_by_rule}
                          >
                            <option value="">
                              {task.generated_by_rule
                                ? "System-generated"
                                : "Select purpose…"}
                            </option>
                            {taskPurposes.map((purpose) => (
                              <option key={purpose.id} value={purpose.id}>
                                {purpose.label}
                              </option>
                            ))}
                          </select>
                          {!canManage || task.generated_by_rule ? (
                            <input
                              type="hidden"
                              name="taskPurposeId"
                              value={
                                (task as unknown as { task_purpose_id?: string | null })
                                  .task_purpose_id ?? ""
                              }
                            />
                          ) : null}
                        </label>
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
                            name="dueDate"
                            defaultValue={organizationDateInputValue(task.due_at, data.timezone)}
                            readOnly={!canManage}
                            required={canManage}
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
                          {!task.generated_by_rule ? <form action={deleteTaskAction}>
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
                          </form> : null}
                        </div>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="no-results">
                No tasks are associated with this Case.
              </div>
            )}
            <div className="progress-explainer">
              <b>
                {item.progress.progressPercent}%{" "}
                {item.intakeProgress ? "intake complete" : "complete"}
              </b>
              <span>
                {item.intakeProgress
                  ? `Guided Intake step ${item.intakeProgress.completedSteps} of ${item.intakeProgress.totalSteps}`
                  : `Completed required work (${item.progress.completedUnits}) ÷ currently applicable required work (${item.progress.totalUnits})`}
              </span>
            </div>
          </section>
          <section className="panel detail-section">
            <div className="section-head">
              <h2>Activity</h2>
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
          <section className="panel detail-section case-communications-panel">
            <h2>Customer Communications</h2>
            {recentCommunications.length ? (
              <div className="case-communication-list">
                {recentCommunications.map((communication) => (
                  <article key={communication.id}>
                    <div className="case-communication-meta">
                      <span className={`case-communication-direction ${communication.direction.toLowerCase()}`}>
                        {communication.direction === "INBOUND" ? "Inbound" : "Outbound"}
                      </span>
                      <span>{communication.serviceRequestNumber}</span>
                    </div>
                    <p>{communication.summary}</p>
                    <small>
                      {communication.participantLabel} ·{" "}
                      {formatOrganizationDateTime(communication.createdAt, data.timezone)}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="case-communications-empty">
                No customer communications linked to this case yet.
              </p>
            )}
          </section>
          <section className="panel case-readiness-panel">
            <div className="case-readiness-heading">
              <div>
                <h3>Case Readiness</h3>
                <p>{item.progress.progressPercent}% complete</p>
              </div>
              <span className={item.progress.ready ? "ready" : "not-ready"}>
                {item.intakeProgress
                  ? "Intake in progress"
                  : item.progress.ready
                    ? "Ready"
                    : "Not ready"}
              </span>
            </div>
            <ProgressBar percentage={item.progress.progressPercent} />
            <b className="case-readiness-state">
              {item.intakeProgress
                ? "Finish Guided Intake before Case readiness is evaluated"
                : item.progress.ready
                  ? "Ready for completion"
                  : "Not ready for completion"}
            </b>
            {!item.intakeProgress && item.progress.remainingWork.length ? (
              <div className="case-readiness-remaining">
                <strong>Remaining</strong>
                <ul>
                  {item.progress.remainingWork.slice(0, 5).map((work) => (
                    <li key={`${work.kind}-${work.id}`}>
                      <span>{work.label}</span>
                      <small>
                        {work.kind === "QUESTION"
                          ? "Question"
                          : work.blocked
                            ? "Blocked task"
                            : "Task"}
                      </small>
                    </li>
                  ))}
                </ul>
                {item.progress.remainingWork.length > 5 ? (
                  <small className="case-readiness-more">
                    +{item.progress.remainingWork.length - 5} more required work
                    items
                  </small>
                ) : null}
              </div>
            ) : item.intakeProgress ? (
              <p className="case-readiness-complete">
                Guided Intake is {item.intakeProgress.completedSteps} of{" "}
                {item.intakeProgress.totalSteps} steps complete.
              </p>
            ) : (
              <p className="case-readiness-complete">
                All currently required work is complete.
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
