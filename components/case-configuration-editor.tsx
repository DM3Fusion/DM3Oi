"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplicationIcon } from "@/components/application-icon";
import {
  saveCaseTypeInModal,
  saveTaskPurposeInModal,
} from "@/lib/data/organization-administration-actions";

export type CaseTypeConfiguration = {
  id: string;
  name: string;
  description: string | null;
  customerMode: "ANY" | "NEW" | "EXISTING";
  taxYearRule: "ANY_YEAR" | "CURRENT_YEAR" | "PRIOR_YEAR_REQUIRED";
  sortOrder: number;
  isActive: boolean;
};

export type TaskPurposeConfiguration = {
  id: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

type EditorState<T> = { mode: "create" | "edit"; item: T | null } | null;

const customerModeLabel = (value: CaseTypeConfiguration["customerMode"]) =>
  value === "NEW"
    ? "New Customer"
    : value === "EXISTING"
      ? "Existing Customer"
      : "Any Customer";

const taxYearRuleLabel = (value: CaseTypeConfiguration["taxYearRule"]) =>
  value === "CURRENT_YEAR"
    ? "Current Year"
    : value === "PRIOR_YEAR_REQUIRED"
      ? "Prior Year Required"
      : "Any Year";

export function CaseConfigurationEditor({
  caseTypes,
  taskPurposes,
}: {
  caseTypes: CaseTypeConfiguration[];
  taskPurposes: TaskPurposeConfiguration[];
}) {
  const router = useRouter();
  const caseTypeDialog = useRef<HTMLDialogElement>(null);
  const taskPurposeDialog = useRef<HTMLDialogElement>(null);
  const caseTypeTitleId = useId();
  const taskPurposeTitleId = useId();
  const [caseTypeEditor, setCaseTypeEditor] =
    useState<EditorState<CaseTypeConfiguration>>(null);
  const [taskPurposeEditor, setTaskPurposeEditor] =
    useState<EditorState<TaskPurposeConfiguration>>(null);
  const [caseTypeRevision, setCaseTypeRevision] = useState(0);
  const [taskPurposeRevision, setTaskPurposeRevision] = useState(0);
  const [pending, setPending] = useState<"case-type" | "task-purpose" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function openCaseType(item: CaseTypeConfiguration | null) {
    setError(null);
    setMessage(null);
    setCaseTypeRevision((revision) => revision + 1);
    setCaseTypeEditor({ mode: item ? "edit" : "create", item });
    caseTypeDialog.current?.showModal();
  }

  function openTaskPurpose(item: TaskPurposeConfiguration | null) {
    setError(null);
    setMessage(null);
    setTaskPurposeRevision((revision) => revision + 1);
    setTaskPurposeEditor({ mode: item ? "edit" : "create", item });
    taskPurposeDialog.current?.showModal();
  }

  function closeCaseType() {
    if (pending) return;
    setError(null);
    caseTypeDialog.current?.close();
    setCaseTypeEditor(null);
  }

  function closeTaskPurpose() {
    if (pending) return;
    setError(null);
    taskPurposeDialog.current?.close();
    setTaskPurposeEditor(null);
  }

  async function submitCaseType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending("case-type");
    setError(null);
    try {
      const result = await saveCaseTypeInModal(new FormData(event.currentTarget));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      caseTypeDialog.current?.close();
      setCaseTypeEditor(null);
      setMessage("Case Type saved.");
      router.refresh();
    } catch {
      setError("The Case Type could not be saved.");
    } finally {
      setPending(null);
    }
  }

  async function submitTaskPurpose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending("task-purpose");
    setError(null);
    try {
      const result = await saveTaskPurposeInModal(
        new FormData(event.currentTarget),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      taskPurposeDialog.current?.close();
      setTaskPurposeEditor(null);
      setMessage("Task Purpose saved.");
      router.refresh();
    } catch {
      setError("The Task Purpose could not be saved.");
    } finally {
      setPending(null);
    }
  }

  const caseType = caseTypeEditor?.item;
  const taskPurpose = taskPurposeEditor?.item;

  return (
    <>
      {message ? (
        <div className="success-alert page-notice" role="status">
          {message}
        </div>
      ) : null}

      <section className="panel detail-section case-configuration-section">
        <div className="section-head">
          <div>
            <h2>Case Types</h2>
            <p>
              Define the initial engagement classification, Customer
              applicability, and Tax Year behavior used during Guided Intake.
            </p>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => openCaseType(null)}
          >
            <ApplicationIcon name="add" />
            New Case Type
          </button>
        </div>

        <div className="case-configuration-list case-type-list" aria-label="Case Types">
          <div className="case-configuration-row case-configuration-header" aria-hidden="true">
            <span>Case Type</span>
            <span>Customer</span>
            <span>Tax Year</span>
            <span>Status</span>
            <span>Order</span>
          </div>
          {caseTypes.map((item) => (
            <button
              type="button"
              className="case-configuration-row case-configuration-data-row"
              key={item.id}
              aria-label={`Edit Case Type ${item.name}`}
              aria-haspopup="dialog"
              onClick={() => openCaseType(item)}
            >
              <span className="case-configuration-primary">
                <span className="case-configuration-field-label">Case Type</span>
                <strong>{item.name}</strong>
                {item.description ? <small>{item.description}</small> : null}
              </span>
              <span>
                <span className="case-configuration-field-label">Customer</span>
                <span>{customerModeLabel(item.customerMode)}</span>
              </span>
              <span>
                <span className="case-configuration-field-label">Tax Year</span>
                <span>{taxYearRuleLabel(item.taxYearRule)}</span>
              </span>
              <span>
                <span className="case-configuration-field-label">Status</span>
                <span>{item.isActive ? "Active" : "Inactive"}</span>
              </span>
              <span>
                <span className="case-configuration-field-label">Order</span>
                <span>{item.sortOrder}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel detail-section case-configuration-section">
        <div className="section-head">
          <div>
            <h2>Task Purposes</h2>
            <p>
              Define why manually created Case Tasks exist. Task Purpose is
              required when staff add operational work to a Case.
            </p>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => openTaskPurpose(null)}
          >
            <ApplicationIcon name="add" />
            New Task Purpose
          </button>
        </div>

        <div className="case-configuration-list task-purpose-list" aria-label="Task Purposes">
          <div className="case-configuration-row case-configuration-header" aria-hidden="true">
            <span>Task Purpose</span>
            <span>Status</span>
            <span>Order</span>
          </div>
          {taskPurposes.map((item) => (
            <button
              type="button"
              className="case-configuration-row case-configuration-data-row"
              key={item.id}
              aria-label={`Edit Task Purpose ${item.label}`}
              aria-haspopup="dialog"
              onClick={() => openTaskPurpose(item)}
            >
              <span className="case-configuration-primary">
                <span className="case-configuration-field-label">Task Purpose</span>
                <strong>{item.label}</strong>
                {item.description ? <small>{item.description}</small> : null}
              </span>
              <span>
                <span className="case-configuration-field-label">Status</span>
                <span>{item.isActive ? "Active" : "Inactive"}</span>
              </span>
              <span>
                <span className="case-configuration-field-label">Order</span>
                <span>{item.sortOrder}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <dialog
        ref={caseTypeDialog}
        className="case-configuration-dialog"
        aria-labelledby={caseTypeTitleId}
        onCancel={(event) => {
          event.preventDefault();
          closeCaseType();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeCaseType();
        }}
      >
        <form
          key={`case-type-${caseType?.id ?? "new"}-${caseTypeRevision}`}
          className="case-configuration-form"
          onSubmit={submitCaseType}
        >
          <header>
            <div>
              <p className="eyebrow">Case Configuration</p>
              <h2 id={caseTypeTitleId}>
                {caseTypeEditor?.mode === "edit"
                  ? "Edit Case Type"
                  : "Create Case Type"}
              </h2>
            </div>
            <button
              type="button"
              className="rule-dialog-close"
              aria-label="Close Case Type modal"
              disabled={pending === "case-type"}
              onClick={closeCaseType}
            >
              <ApplicationIcon name="close" />
            </button>
          </header>
          {caseType ? <input type="hidden" name="id" value={caseType.id} /> : null}
          <fieldset disabled={pending === "case-type"}>
            <label className="full">
              <span>Name</span>
              <input name="name" defaultValue={caseType?.name ?? ""} required maxLength={120} />
            </label>
            <label className="full">
              <span>Description</span>
              <textarea name="description" defaultValue={caseType?.description ?? ""} rows={3} />
            </label>
            <label>
              <span>Customer</span>
              <select name="customerMode" defaultValue={caseType?.customerMode ?? "ANY"}>
                <option value="ANY">Any Customer</option>
                <option value="NEW">New Customer</option>
                <option value="EXISTING">Existing Customer</option>
              </select>
            </label>
            <label>
              <span>Tax Year</span>
              <select name="taxYearRule" defaultValue={caseType?.taxYearRule ?? "ANY_YEAR"}>
                <option value="ANY_YEAR">Any Year</option>
                <option value="CURRENT_YEAR">Current Year</option>
                <option value="PRIOR_YEAR_REQUIRED">Prior Year Required</option>
              </select>
            </label>
            <label>
              <span>Sort Order</span>
              <input name="sortOrder" type="number" min="0" defaultValue={caseType?.sortOrder ?? 0} />
            </label>
            <label>
              <span>Status</span>
              <select name="isActive" defaultValue={String(caseType?.isActive ?? true)}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
          </fieldset>
          {error && pending !== "task-purpose" ? <div className="form-alert" role="alert">{error}</div> : null}
          <footer>
            <button type="button" className="secondary-button" disabled={pending === "case-type"} onClick={closeCaseType}>Cancel</button>
            <button type="submit" className="primary-button" disabled={pending === "case-type"}>
              {pending === "case-type" ? "Saving…" : "Save Case Type"}
            </button>
          </footer>
        </form>
      </dialog>

      <dialog
        ref={taskPurposeDialog}
        className="case-configuration-dialog"
        aria-labelledby={taskPurposeTitleId}
        onCancel={(event) => {
          event.preventDefault();
          closeTaskPurpose();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeTaskPurpose();
        }}
      >
        <form
          key={`task-purpose-${taskPurpose?.id ?? "new"}-${taskPurposeRevision}`}
          className="case-configuration-form"
          onSubmit={submitTaskPurpose}
        >
          <header>
            <div>
              <p className="eyebrow">Case Configuration</p>
              <h2 id={taskPurposeTitleId}>
                {taskPurposeEditor?.mode === "edit"
                  ? "Edit Task Purpose"
                  : "Create Task Purpose"}
              </h2>
            </div>
            <button
              type="button"
              className="rule-dialog-close"
              aria-label="Close Task Purpose modal"
              disabled={pending === "task-purpose"}
              onClick={closeTaskPurpose}
            >
              <ApplicationIcon name="close" />
            </button>
          </header>
          {taskPurpose ? <input type="hidden" name="id" value={taskPurpose.id} /> : null}
          <fieldset disabled={pending === "task-purpose"}>
            <label className="full">
              <span>Purpose</span>
              <input name="label" defaultValue={taskPurpose?.label ?? ""} required maxLength={160} />
            </label>
            <label className="full">
              <span>Description</span>
              <textarea name="description" defaultValue={taskPurpose?.description ?? ""} rows={3} />
            </label>
            <label>
              <span>Sort Order</span>
              <input name="sortOrder" type="number" min="0" defaultValue={taskPurpose?.sortOrder ?? 0} />
            </label>
            <label>
              <span>Status</span>
              <select name="isActive" defaultValue={String(taskPurpose?.isActive ?? true)}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
          </fieldset>
          {error && pending !== "case-type" ? <div className="form-alert" role="alert">{error}</div> : null}
          <footer>
            <button type="button" className="secondary-button" disabled={pending === "task-purpose"} onClick={closeTaskPurpose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={pending === "task-purpose"}>
              {pending === "task-purpose" ? "Saving…" : "Save Task Purpose"}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
