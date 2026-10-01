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
  completeCaseAction,
  sendMissingDocumentsNoticeAction,
  setCaseAssignmentAction,
  transitionCaseStatusAction,
  updateTaskAction,
} from "@/lib/data/case-actions";
import { UserAvatar } from "@/components/user-avatar";
import { CaseQuestions } from "@/components/cases/case-questions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { CaseCompletionModal } from "@/components/cases/case-completion-modal";
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

  const qualifierQuestionsQuery = supabase
    .from("question_definitions")
    .select("id,question_text")
    .eq("organization_id", data.organizationId)
    .eq("response_type", "YES_NO")
    .eq("active", true)
    .in("question_text", [
      "Are dependents being claimed?",
      "Is self-employment or business income involved?",
    ]);

  const editableIntakeQuery = supabase
    .from("guided_case_intake_drafts")
    .select("id")
    .eq("organization_id", data.organizationId)
    .eq("case_id", item.id)
    .is("finalized_at", null)
    .maybeSingle();

  const finalizedIntakeQuery = supabase
    .from("guided_case_intake_drafts")
    .select("id")
    .eq("organization_id", data.organizationId)
    .eq("case_id", item.id)
    .not("finalized_at", "is", null)
    .maybeSingle();

  const [
    purposeResult,
    qualifierQuestionsResult,
    editableIntakeResult,
    finalizedIntakeResult,
  ] = await Promise.all([
    purposeQuery,
    qualifierQuestionsQuery,
    editableIntakeQuery,
    finalizedIntakeQuery,
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

  if (editableIntakeResult.error) {
    console.error("Editable Guided Intake lookup failed", {
      organizationId: data.organizationId,
      caseId: item.id,
      code: editableIntakeResult.error.code,
      message: editableIntakeResult.error.message,
    });
    throw new Error("Case intake status is temporarily unavailable.");
  }

  if (finalizedIntakeResult.error) {
    console.error("Finalized Guided Intake lookup failed", {
      organizationId: data.organizationId,
      caseId: item.id,
      code: finalizedIntakeResult.error.code,
      message: finalizedIntakeResult.error.message,
    });
    throw new Error("Case intake status is temporarily unavailable.");
  }

  if (qualifierQuestionsResult.error) {
    console.error("Case qualifier Question lookup failed", {
      organizationId: data.organizationId,
      code: qualifierQuestionsResult.error.code,
      message: qualifierQuestionsResult.error.message,
    });
  }

  const qualifierDefinitions = qualifierQuestionsResult.data ?? [];

  const finalizedDependentsQuestion = questions.find(
    (question) =>
      question.response_type === "YES_NO" &&
      question.question_text.trim().toLowerCase() ===
        "are dependents being claimed?",
  );

  const dependentsQuestionId =
    finalizedDependentsQuestion?.id ??
    qualifierDefinitions.find(
      (question) =>
        question.question_text === "Are dependents being claimed?",
    )?.id ??
    null;

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

  const finalizedSelfEmploymentQuestion = questions.find(
    (question) =>
      question.response_type === "YES_NO" &&
      question.question_text.trim().toLowerCase() ===
        "is self-employment or business income involved?",
  );

  const selfEmploymentQuestionId =
    finalizedSelfEmploymentQuestion?.id ??
    qualifierDefinitions.find(
      (question) =>
        question.question_text ===
        "Is self-employment or business income involved?",
    )?.id ??
    null;

  const selfEmploymentValue =
    item.intakeProgress && selfEmploymentQuestionId
      ? item.intakeProgress.answers[selfEmploymentQuestionId]
      : finalizedSelfEmploymentQuestion?.response?.response_value;

  const hasSelfEmployment =
    selfEmploymentValue === true || selfEmploymentValue === "true";

  const openedLocalDate = organizationDateInputValue(
    item.opened_at,
    data.timezone,
  );
  const updatedLocalDate = organizationDateInputValue(
    item.updated_at,
    data.timezone,
  );

  const inclusiveDurationDays = (() => {
    const parseLocalDate = (value: string) => {
      const [year, month, day] = value.split("-").map(Number);
      return Date.UTC(year, month - 1, day);
    };

    if (!openedLocalDate || !updatedLocalDate) return null;

    const difference =
      Math.floor(
        (parseLocalDate(updatedLocalDate) -
          parseLocalDate(openedLocalDate)) /
          86_400_000,
      ) + 1;

    return Math.max(1, difference);
  })();

  const caseReadOnly = item.status === "COMPLETED";
  const canManage =
    !caseReadOnly && hasPermission(access, "MANAGE_TASKS");
  const canAssignCases =
    !caseReadOnly && hasPermission(access, "ASSIGN_CASES");
  const canWorkCases =
    !caseReadOnly && hasPermission(access, "WORK_CASES");
  const canEditGuidedIntake =
    canWorkCases &&
    isCanonicalActiveCaseStatus(item.status) &&
    Boolean(editableIntakeResult.data);

  const canCompleteCase =
    canWorkCases &&
    isCanonicalActiveCaseStatus(item.status) &&
    Boolean(finalizedIntakeResult.data) &&
    item.progress.ready;

  const taxOutcome = (
    item as typeof item & {
      tax_outcome?: "REFUND" | "BALANCE_DUE" | "ZERO_BALANCE" | null;
    }
  ).tax_outcome ?? null;

  const completedCaseStatus =
    taxOutcome === "REFUND"
      ? "Refund Issued"
      : taxOutcome === "BALANCE_DUE"
        ? "Payment Due"
        : taxOutcome === "ZERO_BALANCE"
          ? "Tax Return Complete"
          : "Case Complete";


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
            {canEditGuidedIntake ? (
              <Link
                className="secondary-button"
                href={`/cases/new?case=${item.id}`}
              >
                Edit Case
              </Link>
            ) : null}
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
            <div className="case-overview-profile">
              <h3>Customer / Return Profile</h3>
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
                {hasSelfEmployment ? (
                  <div>
                    <dt>Self-Employment / Business Income</dt>
                    <dd>Yes</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <div className="case-timing-card">
              <h3>Case Timing</h3>
              <dl className="case-timing-grid">
                <div>
                  <dt>Opened</dt>
                  <dd>
                    {formatOrganizationDate(item.opened_at, data.timezone)}
                  </dd>
                </div>
                <div>
                  <dt>Last Updated</dt>
                  <dd>
                    {formatOrganizationDate(item.updated_at, data.timezone)}
                  </dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>
                    {inclusiveDurationDays === null
                      ? "—"
                      : `${inclusiveDurationDays} ${
                          inclusiveDurationDays === 1 ? "day" : "days"
                        }`}
                  </dd>
                </div>
              </dl>
            </div>

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
                {item.tasks.map((task) => (
                  <details
                    className={`task-record${caseReadOnly ? " read-only" : ""}`}
                    id={`task-${task.id}`}
                    key={task.id}
                  >
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
                      {!caseReadOnly ? (
                        <span className="task-row-chevron" aria-hidden="true">›</span>
                      ) : null}
                    </summary>
                    <div className="task-editor">
                      <form action={updateTaskAction} className="mini-form">
                        <input type="hidden" name="caseId" value={item.id} />
                        <input type="hidden" name="taskId" value={task.id} />
                        {task.generated_by_rule || task.generated_by_intake ? (
                          <label>
                            <span>Task Purpose</span>
                            <input
                              value={
                                (task as unknown as {
                                  task_purpose_label?: string | null;
                                }).task_purpose_label ?? "System-generated"
                              }
                              readOnly
                            />
                            <input
                              type="hidden"
                              name="taskPurposeId"
                              value={
                                (task as unknown as {
                                  task_purpose_id?: string | null;
                                }).task_purpose_id ?? ""
                              }
                            />
                          </label>
                        ) : (
                          <label>
                            <span>Task Purpose</span>
                            <select
                              name="taskPurposeId"
                              defaultValue={
                                (task as unknown as {
                                  task_purpose_id?: string | null;
                                }).task_purpose_id ?? ""
                              }
                              disabled={!canManage}
                              required={canManage}
                            >
                              <option value="">Select purpose…</option>
                              {taskPurposes.map((purpose) => (
                                <option key={purpose.id} value={purpose.id}>
                                  {purpose.label}
                                </option>
                              ))}
                            </select>
                            {!canManage ? (
                              <input
                                type="hidden"
                                name="taskPurposeId"
                                value={
                                  (task as unknown as {
                                    task_purpose_id?: string | null;
                                  }).task_purpose_id ?? ""
                                }
                              />
                            ) : null}
                          </label>
                        )}
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
                        {task.generated_by_rule || task.generated_by_intake ? (
                          <label>
                            <span>Status</span>
                            <input
                              value={task.status.replaceAll("_", " ")}
                              readOnly
                            />
                            <input
                              type="hidden"
                              name="status"
                              value={task.status}
                            />
                          </label>
                        ) : (
                          <label>
                            <span>Status</span>
                            <select name="status" defaultValue={task.status}>
                              {taskStatuses.map((value) => (
                                <option key={value}>{value}</option>
                              ))}
                            </select>
                          </label>
                        )}
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
                        <div className="mini-actions">
                          <PendingSubmitButton pendingLabel="Saving…">Save Task</PendingSubmitButton>
                        </div>
                      </form>
                      {task.generated_by_intake &&
                      task.status === "NOT_STARTED" ? (
                        <div className="task-notice-action">
                          <form
                            action={sendMissingDocumentsNoticeAction}
                            className="mini-actions"
                          >
                            <input type="hidden" name="caseId" value={item.id} />
                            <input type="hidden" name="taskId" value={task.id} />
                            <PendingSubmitButton
                              className="secondary-button task-notice-button"
                              pendingLabel="Sending…"
                            >
                              Send Notice
                            </PendingSubmitButton>
                          </form>
                          <span className="task-notice-help">
                            Send Notice to Customer to start task
                          </span>
                        </div>
                      ) : task.generated_by_intake &&
                        task.status === "IN_PROGRESS" ? (
                        <div className="task-notice-sent">
                          <span>Email Sent</span>
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
          {!item.intakeProgress ? (
            <section className="panel case-readiness-panel">
              <div className="case-readiness-heading">
                <div>
                  <h3>
                    {item.status === "COMPLETED"
                      ? "Case Status"
                      : "Case Readiness"}
                  </h3>
                  <p>{item.progress.progressPercent}% complete</p>
                </div>
                {item.status === "COMPLETED" ? (
                  <span className="ready">Complete</span>
                ) : (
                  <span className={item.progress.ready ? "ready" : "not-ready"}>
                    {item.progress.ready ? "Ready" : "Not ready"}
                  </span>
                )}
              </div>
              <ProgressBar percentage={item.progress.progressPercent} />
              <b className="case-readiness-state">
                {item.status === "COMPLETED"
                  ? completedCaseStatus
                  : item.progress.ready
                    ? "Ready for completion"
                    : "Not ready for completion"}
              </b>
              {item.status === "COMPLETED" ? (
                <p className="case-readiness-complete">
                  This completed Case is read-only.
                </p>
              ) : item.progress.remainingWork.length ? (
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
              ) : (
                <>
                  <p className="case-readiness-complete">
                    All currently required DM3Oi work is complete.
                  </p>

                  {canCompleteCase ? (
                    <div className="case-completion-control">
                      <p>
                        Click Complete Case once tax preparation is finished and
                        the final tax outcome is known.
                      </p>
                      <CaseCompletionModal
                        caseId={item.id}
                        action={completeCaseAction}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
