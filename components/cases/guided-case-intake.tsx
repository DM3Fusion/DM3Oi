"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createGuidedCaseAction,
  createInlineIntakeCustomerAction,
} from "@/lib/data/guided-case-intake-actions";
import {
  evaluateGuidedCaseIntake,
  guidedCaseIntakeSteps,
  guidedCasePriorities,
  validateGuidedCaseDetails,
  validateGuidedCustomerStep,
  validateGuidedIntakeQuestions,
  type GuidedCaseIntakeDraft,
  type GuidedIntakeConfiguration,
  type GuidedIntakeFieldErrors,
  type GuidedIntakeQuestion,
} from "@/lib/guided-case-intake";
import {
  customerEmailPattern,
  normalizeCustomerPhone,
} from "@/lib/customer-validation";
import type { Json } from "@/types/database.generated";

type Props = {
  configuration: GuidedIntakeConfiguration;
  submissionKey: string;
};

const fieldError = (errors: GuidedIntakeFieldErrors, key: string) =>
  errors[key] ? (
    <small className="field-error" role="alert">
      {errors[key]}
    </small>
  ) : null;

function QuestionField({
  question,
  value,
  error,
  onChange,
}: {
  question: GuidedIntakeQuestion & { effectiveRequired: boolean };
  value: Json | undefined;
  error?: string;
  onChange: (value: Json | undefined) => void;
}) {
  const controlId = `intake-question-${question.id}`;
  const common = {
    id: controlId,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${controlId}-error` : undefined,
  };
  let control;
  if (question.responseType === "YES_NO") {
    control = (
      <select
        {...common}
        value={typeof value === "boolean" ? String(value) : ""}
        onChange={(event) =>
          onChange(
            event.target.value === ""
              ? undefined
              : event.target.value === "true",
          )
        }
      >
        <option value="">Select an answer</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  } else if (question.responseType === "NUMBER") {
    control = (
      <input
        {...common}
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? undefined : Number(event.target.value),
          )
        }
      />
    );
  } else if (question.responseType === "DATE") {
    control = (
      <input
        {...common}
        type="date"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      />
    );
  } else if (question.responseType === "LONG_TEXT") {
    control = (
      <textarea
        {...common}
        rows={4}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      />
    );
  } else if (question.responseType === "SINGLE_SELECT") {
    control = (
      <select
        {...common}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">Select an answer</option>
        {question.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (question.responseType === "MULTI_SELECT") {
    const selected = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
    control = (
      <fieldset {...common} className="intake-option-list">
        <legend className="sr-only">{question.text}</legend>
        {question.options.map((option) => (
          <label key={option.id}>
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.id]
                    : selected.filter((id) => id !== option.id),
                )
              }
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    );
  } else {
    control = (
      <input
        {...common}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      />
    );
  }
  return (
    <div className="intake-question-card">
      <label htmlFor={controlId}>
        <span>
          {question.text}
          {question.effectiveRequired ? <b aria-label="required"> *</b> : null}
        </span>
        {question.description ? <small>{question.description}</small> : null}
      </label>
      {control}
      {error ? (
        <small id={`${controlId}-error`} className="field-error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

export function GuidedCaseIntake({ configuration, submissionKey }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [customers, setCustomers] = useState(configuration.customers);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    configuration.customers.length ? "existing" : "new",
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [draft, setDraft] = useState<GuidedCaseIntakeDraft>({
    submissionKey,
    customerId: "",
    caseTitleId: "",
    description: "",
    caseTypeId: "",
    priority: configuration.defaultPriority,
    managerUserId: "",
    staffUserIds: [],
    answers: {},
  });
  const [errors, setErrors] = useState<GuidedIntakeFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [customerValues, setCustomerValues] = useState({
    type: "INDIVIDUAL",
    name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [customerErrors, setCustomerErrors] = useState<Record<string, string>>(
    {},
  );
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const scopedConfiguration = useMemo(
    () => ({ ...configuration, customers }),
    [configuration, customers],
  );
  const evaluation = useMemo(
    () => evaluateGuidedCaseIntake(scopedConfiguration, draft.answers),
    [scopedConfiguration, draft.answers],
  );
  const visibleQuestions = evaluation.questions.filter(
    (question) => question.applicable,
  );
  const selectedCustomer = customers.find(
    (customer) => customer.id === draft.customerId,
  );
  const selectedTitle = configuration.caseTitles.find(
    (item) => item.id === draft.caseTitleId,
  );
  const selectedType = configuration.caseTypes.find(
    (item) => item.id === draft.caseTypeId,
  );
  const selectedManager = configuration.managers.find(
    (item) => item.id === draft.managerUserId,
  );
  const selectedStaff = configuration.staff.filter((item) =>
    draft.staffUserIds.includes(item.id),
  );

  const updateDraft = <K extends keyof GuidedCaseIntakeDraft>(
    key: K,
    value: GuidedCaseIntakeDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setFormError(null);
  };
  const updateAnswer = (questionId: string, value: Json | undefined) => {
    setDraft((current) => ({
      ...current,
      answers: { ...current.answers, [questionId]: value },
    }));
    setErrors((current) => ({
      ...current,
      [`question.${questionId}`]: "",
    }));
    setFormError(null);
  };
  const validateStep = () => {
    if (step === 0)
      return validateGuidedCustomerStep(draft, scopedConfiguration);
    if (step === 1)
      return validateGuidedCaseDetails(draft, scopedConfiguration);
    if (step === 2 || step === 3)
      return validateGuidedIntakeQuestions(evaluation);
    return {
      ...validateGuidedCustomerStep(draft, scopedConfiguration),
      ...validateGuidedCaseDetails(draft, scopedConfiguration),
      ...validateGuidedIntakeQuestions(evaluation),
    };
  };
  const continueForward = () => {
    const blockers = validateStep();
    setErrors(blockers);
    if (Object.keys(blockers).length) {
      setFormError("Complete the highlighted items before continuing.");
      return;
    }
    setFormError(null);
    setStep((current) => Math.min(current + 1, guidedCaseIntakeSteps.length - 1));
  };

  const createNewCustomerAndContinue = async () => {
    if (pending) return;

    setPending(true);
    setCustomerErrors({});
    setFormError(null);

    const inlineErrors: Record<string, string> = {};
    const normalizedEmail = customerValues.email.trim().toLowerCase();
    const normalizedPhone = normalizeCustomerPhone(customerValues.phone);
    const canonicalName =
      customerValues.type === "INDIVIDUAL"
        ? `${customerFirstName.trim()} ${customerLastName.trim()}`.trim()
        : customerValues.name.trim();

    if (customerValues.type === "INDIVIDUAL") {
      if (!customerFirstName.trim())
        inlineErrors.firstName = "First Name is required.";
      if (!customerLastName.trim())
        inlineErrors.lastName = "Last Name is required.";
    } else if (!canonicalName) {
      inlineErrors.name = "Business Name is required.";
    }

    if (!customerEmailPattern.test(normalizedEmail))
      inlineErrors.email = "Enter a valid email address.";

    if (!normalizedPhone)
      inlineErrors.phone = "Enter a valid U.S. phone number.";

    if (Object.keys(inlineErrors).length) {
      setCustomerErrors(inlineErrors);
      setFormError("Correct the highlighted fields.");
      setPending(false);
      return;
    }

    const result = await createInlineIntakeCustomerAction({
      ...customerValues,
      name: canonicalName,
      email: normalizedEmail,
    });

    if (!result.ok) {
      setCustomerErrors(result.fieldErrors);
      setFormError(result.error);
      setPending(false);
      return;
    }

    setCustomers((current) => [...current, result.customer]);
    setDraft((current) => ({
      ...current,
      customerId: result.customer.id,
    }));
    setCustomerMode("existing");
    setErrors({});
    setFormError(null);
    setPending(false);
    setStep(1);
  };
  const answerLabel = (question: GuidedIntakeQuestion) => {
    const value = draft.answers[question.id];
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value))
      return value
        .map((id) => question.options.find((option) => option.id === id)?.label)
        .filter(Boolean)
        .join(", ");
    if (question.responseType === "SINGLE_SELECT" && typeof value === "string")
      return question.options.find((option) => option.id === value)?.label ?? "";
    return value === undefined ? "Not answered" : String(value);
  };

  const renderCustomer = () => {
    const filtered = customers.filter((customer) =>
      `${customer.customerNumber} ${customer.name}`
        .toLowerCase()
        .includes(customerSearch.trim().toLowerCase()),
    );
    return (
      <div className="intake-step-content">
        {configuration.canCreateCustomer ? (
          <div className="intake-mode-switch" role="group" aria-label="Customer source">
            <button
              type="button"
              className={customerMode === "existing" ? "active" : ""}
              onClick={() => setCustomerMode("existing")}
            >
              Existing Customer
            </button>
            <button
              type="button"
              className={customerMode === "new" ? "active" : ""}
              onClick={() => setCustomerMode("new")}
            >
              Create New
            </button>
          </div>
        ) : null}
        {customerMode === "existing" ? (
          <div className="intake-customer-picker">
            <label>
              <span>Search Customers</span>
              <input
                type="search"
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Search by name or Customer number"
              />
            </label>
            <label>
              <span>Customer</span>
              <select
                value={draft.customerId}
                onChange={(event) => updateDraft("customerId", event.target.value)}
                aria-invalid={Boolean(errors.customerId)}
              >
                <option value="">Select a Customer</option>
                {filtered.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.customerNumber} — {customer.name}
                  </option>
                ))}
              </select>
              {fieldError(errors, "customerId")}
            </label>
          </div>
        ) : (
          <div className="entity-form intake-inline-customer">
            <div className="form-grid">
              <label>
                <span>Customer Type</span>
                <select
                  value={customerValues.type}
                  onChange={(event) => {
                    const type = event.target.value;
                    setCustomerValues((current) => ({
                      ...current,
                      type,
                      name: type === "INDIVIDUAL" ? "" : current.name,
                    }));
                    setCustomerFirstName("");
                    setCustomerLastName("");
                    setCustomerErrors({});
                    setFormError(null);
                  }}
                >
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="BUSINESS">Business</option>
                </select>
                {fieldError(customerErrors, "type")}
              </label>
              {customerValues.type === "INDIVIDUAL" ? (
                <div className="full intake-customer-name-row">
                  <label>
                    <span>First Name</span>
                    <input
                      type="text"
                      value={customerFirstName}
                      onChange={(event) => {
                        setCustomerFirstName(event.target.value);
                        setCustomerErrors((current) => ({
                          ...current,
                          firstName: "",
                        }));
                        setFormError(null);
                      }}
                      aria-invalid={Boolean(customerErrors.firstName)}
                    />
                    {fieldError(customerErrors, "firstName")}
                  </label>

                  <label>
                    <span>Last Name</span>
                    <input
                      type="text"
                      value={customerLastName}
                      onChange={(event) => {
                        setCustomerLastName(event.target.value);
                        setCustomerErrors((current) => ({
                          ...current,
                          lastName: "",
                        }));
                        setFormError(null);
                      }}
                      aria-invalid={Boolean(customerErrors.lastName)}
                    />
                    {fieldError(customerErrors, "lastName")}
                  </label>
                </div>
              ) : (
                <label>
                  <span>Business Name</span>
                  <input
                    type="text"
                    value={customerValues.name}
                    onChange={(event) => {
                      setCustomerValues((current) => ({
                        ...current,
                        name: event.target.value,
                      }));
                      setCustomerErrors((current) => ({
                        ...current,
                        name: "",
                      }));
                      setFormError(null);
                    }}
                    aria-invalid={Boolean(customerErrors.name)}
                  />
                  {fieldError(customerErrors, "name")}
                </label>
              )}

              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={customerValues.email}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCustomerValues((current) => ({
                      ...current,
                      email: value,
                    }));
                    setCustomerErrors((current) => ({
                      ...current,
                      email:
                        value.trim() &&
                        !customerEmailPattern.test(value.trim().toLowerCase())
                          ? "Enter a valid email address."
                          : "",
                    }));
                    setFormError(null);
                  }}
                  aria-invalid={Boolean(customerErrors.email)}
                />
                {fieldError(customerErrors, "email")}
              </label>

              <label>
                <span>Phone</span>
                <input
                  type="tel"
                  value={customerValues.phone}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCustomerValues((current) => ({
                      ...current,
                      phone: value,
                    }));
                    setCustomerErrors((current) => ({
                      ...current,
                      phone:
                        value.trim() && !normalizeCustomerPhone(value)
                          ? "Enter a valid U.S. phone number."
                          : "",
                    }));
                    setFormError(null);
                  }}
                  aria-invalid={Boolean(customerErrors.phone)}
                />
                {fieldError(customerErrors, "phone")}
              </label>
              <label className="full">
                <span>Notes <small>Optional</small></span>
                <textarea
                  rows={3}
                  value={customerValues.notes}
                  onChange={(event) =>
                    setCustomerValues((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDetails = () => (
    <div className="form-grid intake-step-content">
      <label>
        <span>Case Title</span>
        <select
          value={draft.caseTitleId}
          onChange={(event) => updateDraft("caseTitleId", event.target.value)}
          aria-invalid={Boolean(errors.caseTitleId)}
        >
          <option value="">Select a configured title</option>
          {configuration.caseTitles.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        {fieldError(errors, "caseTitleId")}
      </label>
      <label>
        <span>Case Type</span>
        <select
          value={draft.caseTypeId}
          onChange={(event) => updateDraft("caseTypeId", event.target.value)}
          aria-invalid={Boolean(errors.caseTypeId)}
        >
          <option value="">Select a Case Type</option>
          {configuration.caseTypes.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        {fieldError(errors, "caseTypeId")}
      </label>
      <label className="full">
        <span>Description <small>Optional</small></span>
        <textarea
          rows={4}
          value={draft.description}
          onChange={(event) => updateDraft("description", event.target.value)}
        />
      </label>
      <label>
        <span>Priority</span>
        <select
          value={draft.priority}
          onChange={(event) => updateDraft("priority", event.target.value)}
          aria-invalid={Boolean(errors.priority)}
        >
          {guidedCasePriorities.map((priority) => (
            <option key={priority} value={priority}>{priority}</option>
          ))}
        </select>
        {fieldError(errors, "priority")}
      </label>
      {configuration.canAssign ? (
        <>
          <label>
            <span>Case Manager <small>Optional</small></span>
            <select
              value={draft.managerUserId}
              onChange={(event) => updateDraft("managerUserId", event.target.value)}
              aria-invalid={Boolean(errors.managerUserId)}
            >
              <option value="">Unassigned</option>
              {configuration.managers.map((manager) => (
                <option key={manager.id} value={manager.id}>{manager.name}</option>
              ))}
            </select>
            {fieldError(errors, "managerUserId")}
          </label>
          <fieldset className="full intake-staff-fieldset">
            <legend>Assigned Staff <small>Optional · multiple allowed</small></legend>
            <div className="check-list">
              {configuration.staff.map((member) => (
                <label key={member.id}>
                  <input
                    type="checkbox"
                    checked={draft.staffUserIds.includes(member.id)}
                    onChange={(event) =>
                      updateDraft(
                        "staffUserIds",
                        event.target.checked
                          ? [...draft.staffUserIds, member.id]
                          : draft.staffUserIds.filter((id) => id !== member.id),
                      )
                    }
                  />
                  <span>{member.name}</span>
                </label>
              ))}
            </div>
            {fieldError(errors, "staffUserIds")}
          </fieldset>
        </>
      ) : (
        <p className="intake-note full">Assignments can be added later by a user with assignment permission.</p>
      )}
    </div>
  );

  const renderQuestions = () => (
    <div className="intake-question-list intake-step-content">
      {visibleQuestions.length ? (
        visibleQuestions.map((question) => (
          <QuestionField
            key={question.id}
            question={question}
            value={draft.answers[question.id]}
            error={errors[`question.${question.id}`]}
            onChange={(value) => updateAnswer(question.id, value)}
          />
        ))
      ) : (
        <div className="empty compact-empty"><p>No intake questions currently apply.</p></div>
      )}
    </div>
  );

  const renderRequirements = () => {
    const requiredQuestions = evaluation.questions.filter(
      (question) => question.applicable && question.effectiveRequired,
    );
    const hiddenQuestions = evaluation.questions.filter(
      (question) => !question.applicable,
    );
    return (
      <div className="intake-requirements intake-step-content">
        <h3>Required Intake Answers</h3>
        {requiredQuestions.length ? (
          <ul>
            {requiredQuestions.map((question) => (
              <li key={question.id} className={question.valid ? "satisfied" : "outstanding"}>
                <strong>{question.valid ? "Satisfied" : "Outstanding"}</strong>
                <span>{question.text}</span>
              </li>
            ))}
          </ul>
        ) : <p className="intake-note">No required intake answers apply.</p>}
        <h3>Generated Tasks</h3>
        {evaluation.generatedTasks.length ? (
          <ul>
            {evaluation.generatedTasks.map((task) => (
              <li key={task.actionId} className="conditional">
                <strong>Conditional</strong>
                <span>{task.title}</span>
                <small>{task.required ? "Required Task" : "Task"}{task.blocking ? " · Blocking" : ""} · {task.priority}</small>
              </li>
            ))}
          </ul>
        ) : <p className="intake-note">No Rule-generated Tasks apply.</p>}
        {hiddenQuestions.length ? (
          <p className="intake-note">{hiddenQuestions.length} conditional question{hiddenQuestions.length === 1 ? " is" : "s are"} currently non-applicable and will not block creation.</p>
        ) : null}
      </div>
    );
  };

  const renderReview = () => (
    <div className="intake-review intake-step-content">
      {[
        ["Customer", selectedCustomer ? `${selectedCustomer.customerNumber} — ${selectedCustomer.name}` : "Not selected", 0],
        ["Case Title", selectedTitle?.label ?? "Not selected", 1],
        ["Case Type", selectedType?.name ?? "Not selected", 1],
        ["Description", draft.description || "None", 1],
        ["Priority", draft.priority, 1],
        ["Case Manager", selectedManager?.name ?? "Unassigned", 1],
        ["Assigned Staff", selectedStaff.map((item) => item.name).join(", ") || "Unassigned", 1],
      ].map(([label, value, editStep]) => (
        <div key={String(label)}>
          <dt>{label}</dt><dd>{value}</dd>
          <button type="button" onClick={() => setStep(Number(editStep))}>Edit</button>
        </div>
      ))}
      <div className="intake-review-section">
        <h3>Intake Questions</h3>
        {visibleQuestions.map((question) => (
          <div key={question.id}><b>{question.text}</b><span>{answerLabel(question)}</span></div>
        ))}
        <button type="button" onClick={() => setStep(2)}>Edit Questions</button>
      </div>
      <div className="intake-review-section">
        <h3>Effective Requirements</h3>
        <span>{evaluation.generatedTasks.length} generated Task{evaluation.generatedTasks.length === 1 ? "" : "s"}</span>
        <button type="button" onClick={() => setStep(3)}>Review Requirements</button>
      </div>
    </div>
  );

  const content =
    step === 0 ? renderCustomer() :
      step === 1 ? renderDetails() :
        step === 2 ? renderQuestions() :
          step === 3 ? renderRequirements() :
            step === 4 ? renderReview() : (
              <div className="intake-create-confirmation intake-step-content">
                <h2>Ready to create this Case</h2>
                <p>The server will revalidate the Customer, configuration, assignments, questions, Rules, and requirements before making any changes.</p>
                <p><strong>{selectedTitle?.label}</strong> for <strong>{selectedCustomer?.name}</strong></p>
              </div>
            );

  return (
    <section className="panel guided-case-intake">
      <ol className="intake-stepper" aria-label="Case intake progress">
        {guidedCaseIntakeSteps.map((label, index) => (
          <li key={label} className={index === step ? "active" : index < step ? "complete" : ""} aria-current={index === step ? "step" : undefined}>
            <span>{index + 1}</span><b>{label}</b>
          </li>
        ))}
      </ol>
      <header className="intake-step-heading">
        <p>Step {step + 1} of {guidedCaseIntakeSteps.length}</p>
        <h2>{guidedCaseIntakeSteps[step]}</h2>
      </header>
      {formError ? <div className="form-alert" role="alert">{formError}</div> : null}
      {content}
      <div className="form-actions intake-actions">
        {step === 0 ? <Link href="/cases">Cancel</Link> : (
          <button type="button" className="secondary-button" onClick={() => { setStep((current) => current - 1); setErrors({}); setFormError(null); }} disabled={pending}>Back</button>
        )}
        {step < guidedCaseIntakeSteps.length - 1 ? (
          <button
            type="button"
            className="primary-button"
            onClick={
              step === 0 && customerMode === "new"
                ? createNewCustomerAndContinue
                : continueForward
            }
            disabled={pending}
          >
            {pending && step === 0 && customerMode === "new"
              ? "Creating Customer…"
              : "Continue"}
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setFormError(null);
              const result = await createGuidedCaseAction(draft);
              if (!result.ok) {
                setPending(false);
                setErrors(result.fieldErrors);
                setFormError(result.error);
                if (result.step !== 5) setStep(result.step);
                return;
              }
              router.push(`/cases/${result.caseId}?message=${encodeURIComponent(`Case ${result.caseNumber} created.`)}`);
            }}
          >
            {pending ? "Creating Case…" : "Create Case"}
          </button>
        )}
      </div>
    </section>
  );
}

