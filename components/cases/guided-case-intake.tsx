"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  finalizeGuidedCaseAction,
  createInlineIntakeCustomerAction,
  materializeGuidedCaseAction,
  saveGuidedIntakeDraftAction,
  loadGuidedIntakePortalStatusAction,
  sendGuidedIntakePortalInvitationAction,
  setGuidedIntakePortalNotRequiredAction,
  sendGuidedIntakeMissingDocumentsNoticeAction,
  upsertGuidedIntakeFollowUpTaskAction,
} from "@/lib/data/guided-case-intake-actions";
import {
  evaluateGuidedCaseIntake,
  canCompleteIntakeFollowUpTask,
  getMissingRequiredOptions,
  isGuidedQuestionAnswerValid,
  reconcileGuidedIntakeFollowUpTasks,
  guidedCaseIntakeSteps,
  guidedQuestionGroups,
  guidedQuestionGroupLabels,
  guidedCasePriorities,
  getGuidedCaseTypesForCustomerMode,
  getGuidedCaseTaxYearOptions,
  getGuidedIntakeSelectableCustomers,
  reconcileGuidedCaseSelection,
  reconcileGuidedCaseTaxYear,
  resolveGuidedDraftCustomerMode,
  validateGuidedCaseDetails,
  validateGuidedCustomerStep,
  validateGuidedIntakeQuestions,
  type GuidedCaseIntakeDraft,
  type GuidedIntakeConfiguration,
  type GuidedIntakeFieldErrors,
  type GuidedIntakeQuestion,
  type GuidedIntakeFollowUpTask,
} from "@/lib/guided-case-intake";
import {
  customerEmailPattern,
  normalizeCustomerPhone,
} from "@/lib/customer-validation";
import type { Json } from "@/types/database.generated";
import {
  portalOnboardingResolvedForIntake,
  unresolvedPortalOnboarding,
  type CustomerPortalOnboardingStatus,
} from "@/lib/customer-portal-onboarding";

type Props = {
  configuration: GuidedIntakeConfiguration;
  draftCustomerIds: string[];
  submissionKey: string;
  initialDraft?: GuidedCaseIntakeDraft;
  initialStep?: number;
  initialCustomerMode?: "existing" | "new";
  initialNewCustomer?: {
    type: string;
    name: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    notes: string;
  };
  initialNoticeSentFollowUpIds?: string[];
  initialNoticeSentAtByFollowUpId?: Record<string, string>;
};

const fieldError = (errors: GuidedIntakeFieldErrors, key: string) =>
  errors[key] ? (
    <small className="field-error" role="alert">
      {errors[key]}
    </small>
  ) : null;

const formatCustomerPhone = (value: string) => {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 10);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6)
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};


function QuestionField({
  question,
  value,
  error,
  onChange,
}: {
  question: GuidedIntakeQuestion & {
    effectiveRequired: boolean;
    answered: boolean;
    valid: boolean;
  };
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
    const validOptionIds = new Set(question.options.map((option) => option.id));
    const selected = Array.isArray(value)
      ? value.filter(
          (item): item is string =>
            typeof item === "string" && validOptionIds.has(item),
        )
      : [];

    control = question.requireAllOptions ? (
      <fieldset {...common} className="intake-required-options">
        <legend className="sr-only">{question.text}</legend>
        <div
          className="intake-required-options-heading intake-received-only-heading"
          aria-hidden="true"
        >
          <span>Document / Item</span>
          <span>Received</span>
        </div>

        {question.options.map((option) => (
          <div
            className="intake-required-option-row intake-received-only-row"
            key={option.id}
          >
            <span>{option.label}</span>
            <label>
              <span className="sr-only">{option.label} received</span>
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
            </label>
          </div>
        ))}
      </fieldset>
    ) : (
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
  const selectedCount =
    question.responseType === "MULTI_SELECT" && Array.isArray(value)
      ? question.options.filter((option) =>
          value.includes(option.id),
        ).length
      : 0;

  const completed =
    question.valid &&
    (question.effectiveRequired || question.answered);

  return (
    <div
      className={`intake-question-card${completed ? " complete" : ""}`}
    >
      <label htmlFor={controlId}>
        <span className="intake-question-title-row">
          <span>
            {question.text}
            {question.effectiveRequired ? (
              <b aria-label="required"> *</b>
            ) : null}
          </span>

          {question.responseType === "MULTI_SELECT" ? (
            <em
              className={
                question.valid
                  ? "intake-question-progress complete"
                  : "intake-question-progress"
              }
            >
              {question.requireAllOptions
                ? `${selectedCount} of ${question.options.length} received`
                : `${selectedCount} of ${question.options.length} selected`}
            </em>
          ) : question.effectiveRequired ? (
            <em
              className={
                question.valid
                  ? "intake-question-progress complete"
                  : "intake-question-progress required"
              }
            >
              {question.valid ? "Complete" : "Required"}
            </em>
          ) : null}
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

export function GuidedCaseIntake({
  configuration,
  draftCustomerIds,
  submissionKey,
  initialDraft,
  initialStep = 0,
  initialCustomerMode,
  initialNewCustomer,
  initialNoticeSentFollowUpIds = [],
  initialNoticeSentAtByFollowUpId = {},
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [customers, setCustomers] = useState(configuration.customers);
  const initialResolvedCustomerMode = resolveGuidedDraftCustomerMode(
    initialDraft?.customerId ?? "",
    initialCustomerMode,
    configuration.customers.length ? "existing" : "new",
  );
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    initialResolvedCustomerMode,
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [draft, setDraft] = useState<GuidedCaseIntakeDraft>(() => {
    const source = initialDraft ?? {
      submissionKey,
      caseId: null,
      customerId: "",
      taxYear: null,
      description: "",
      caseTypeId: "",
      priority: configuration.defaultPriority,
      managerUserId: "",
      staffUserIds: [],
      answers: {},
      requiredOptionIds: {},
      followUpTasks: [],
      portalOnboarding: unresolvedPortalOnboarding(),
    };
    return {
      ...source,
      ...reconcileGuidedCaseSelection(
        source.caseTypeId,
        source.taxYear,
        initialResolvedCustomerMode,
        configuration.caseTypes,
        configuration.currentTaxYear,
      ),
    };
  });
  const [errors, setErrors] = useState<GuidedIntakeFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [noticeSentFollowUpIds, setNoticeSentFollowUpIds] =
    useState<Set<string>>(
      () => new Set(initialNoticeSentFollowUpIds),
    );
  const [noticeSentAtByFollowUpId] = useState<Record<string, string>>(
    initialNoticeSentAtByFollowUpId,
  );
  const [portalPending, setPortalPending] = useState(
    configuration.portalOnboardingMode === "PROMPT_DURING_CASE_INTAKE" &&
      Boolean(initialDraft?.customerId),
  );
  const [portalStatus, setPortalStatus] =
    useState<CustomerPortalOnboardingStatus | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const followUpDialog = useRef<HTMLDialogElement>(null);
  const [followUpQuestionId, setFollowUpQuestionId] = useState<string | null>(null);
  const [customerValues, setCustomerValues] = useState({
    type: initialNewCustomer?.type ?? "INDIVIDUAL",
    name: initialNewCustomer?.name ?? "",
    email: initialNewCustomer?.email ?? "",
    phone: formatCustomerPhone(initialNewCustomer?.phone ?? ""),
    notes: initialNewCustomer?.notes ?? "",
  });
  const [customerErrors, setCustomerErrors] = useState<Record<string, string>>(
    {},
  );
  const [customerFirstName, setCustomerFirstName] = useState(
    initialNewCustomer?.firstName ?? "",
  );
  const [customerLastName, setCustomerLastName] = useState(
    initialNewCustomer?.lastName ?? "",
  );
  const scopedConfiguration = useMemo(
    () => ({ ...configuration, customers }),
    [configuration, customers],
  );
  const evaluation = useMemo(
    () =>
      evaluateGuidedCaseIntake(
        scopedConfiguration,
        draft.answers,
        {},
      ),
    [scopedConfiguration, draft.answers],
  );
  const visibleQuestions = evaluation.questions.filter(
    (question) => question.applicable,
  );
  const selectableCustomers = useMemo(
    () =>
      getGuidedIntakeSelectableCustomers(
        customers,
        draftCustomerIds,
        initialDraft?.customerId,
      ),
    [customers, draftCustomerIds, initialDraft?.customerId],
  );
  const selectedCustomer = customers.find(
    (customer) => customer.id === draft.customerId,
  );
  const availableCaseTypes = useMemo(
    () =>
      getGuidedCaseTypesForCustomerMode(
        configuration.caseTypes,
        customerMode,
      ),
    [configuration.caseTypes, customerMode],
  );

  const selectedType = configuration.caseTypes.find(
    (item) => item.id === draft.caseTypeId,
  );
  const selectableTaxYears = getGuidedCaseTaxYearOptions(
    selectedType,
    configuration.taxYearOptions,
    configuration.currentTaxYear,
  );
  const selectedManager = configuration.managers.find(
    (item) => item.id === draft.managerUserId,
  );
  const selectedStaff = configuration.staff.filter((item) =>
    draft.staffUserIds.includes(item.id),
  );
  const requiredQuestionsComplete = !evaluation.questions.some(
    (question) =>
      question.applicable &&
      question.effectiveRequired &&
      !question.valid,
  );
  const missingRequirements = getMissingRequiredOptions(
    evaluation,
    draft.answers,
    draft.requiredOptionIds,
  );
  const activeFollowUpRequirement = missingRequirements.find(
    (item) => item.question.id === followUpQuestionId,
  );
  const portalPromptEnabled =
    configuration.portalOnboardingMode === "PROMPT_DURING_CASE_INTAKE";
  const portalResolved = portalOnboardingResolvedForIntake(
    configuration.portalOnboardingMode ?? "MANUAL_ONLY",
    draft.customerId,
    portalStatus,
    draft.portalOnboarding,
  );

  useEffect(() => {
    if (!portalPromptEnabled || !draft.customerId) {
      return;
    }
    let active = true;
    void loadGuidedIntakePortalStatusAction(draft.customerId).then((result) => {
      if (!active) return;
      setPortalPending(false);
      if (!result.ok) {
        setPortalStatus(null);
        setPortalError(result.error);
        return;
      }
      setPortalStatus(result.status);
      setDraft((current) => {
        if (current.customerId !== result.status.customerId) return current;
        if (result.status.state === "ACTIVE")
          return {
            ...current,
            portalOnboarding: {
              resolution: "ACTIVE",
              customerId: current.customerId,
              recipientEmail: result.status.recipientEmail ?? undefined,
              invitationId: result.status.invitationId ?? undefined,
            },
          };
        if (result.status.state === "INVITATION_SENT")
          return {
            ...current,
            portalOnboarding: {
              resolution: "INVITATION_SENT",
              customerId: current.customerId,
              recipientEmail: result.status.recipientEmail ?? undefined,
              invitationId: result.status.invitationId ?? undefined,
            },
          };
        if (
          current.portalOnboarding.resolution === "NOT_REQUIRED" &&
          current.portalOnboarding.customerId === current.customerId
        )
          return current;
        return { ...current, portalOnboarding: unresolvedPortalOnboarding() };
      });
    });
    return () => {
      active = false;
    };
  }, [draft.customerId, portalPromptEnabled]);

  const selectCustomer = (customerId: string) => {
    setPortalStatus(null);
    setPortalError(null);
    setPortalPending(Boolean(customerId) && portalPromptEnabled);
    setDraft((current) => ({
      ...current,
      customerId,
      portalOnboarding: unresolvedPortalOnboarding(),
    }));
    setErrors((current) => ({
      ...current,
      customerId: "",
      portalOnboarding: "",
    }));
    setFormError(null);
  };

  const changeCustomerMode = (nextMode: "existing" | "new") => {
    if (nextMode === customerMode) return;
    setCustomerMode(nextMode);
    setCustomerSearch("");
    setPortalStatus(null);
    setPortalError(null);
    setPortalPending(false);
    setDraft((current) => ({
      ...current,
      customerId: "",
      portalOnboarding: unresolvedPortalOnboarding(),
      ...reconcileGuidedCaseSelection(
        current.caseTypeId,
        current.taxYear,
        nextMode,
        configuration.caseTypes,
        configuration.currentTaxYear,
      ),
    }));
    setErrors((current) => ({
      ...current,
      customerId: "",
      caseTypeId: "",
      taxYear: "",
      portalOnboarding: "",
    }));
    setFormError(null);
  };

  const updateDraft = <K extends keyof GuidedCaseIntakeDraft>(
    key: K,
    value: GuidedCaseIntakeDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setFormError(null);
  };

  const updateTaxYear = (taxYear: number | null) => {
    setDraft((current) => ({
      ...current,
      taxYear,
    }));
    setErrors((current) => ({
      ...current,
      taxYear: "",
    }));
    setFormError(null);
  };

  const updateCaseType = (caseTypeId: string) => {
    const caseType = configuration.caseTypes.find(
      (item) => item.id === caseTypeId,
    );
    setDraft((current) => ({
      ...current,
      caseTypeId,
      taxYear: reconcileGuidedCaseTaxYear(
        caseType,
        current.taxYear,
        configuration.currentTaxYear,
      ),
    }));
    setErrors((current) => ({
      ...current,
      caseTypeId: "",
      taxYear: "",
    }));
    setFormError(null);
  };

  const updateAnswer = (questionId: string, value: Json | undefined) => {
    const question = configuration.questions.find((item) => item.id === questionId);
    setDraft((current) => ({
      ...current,
      ...(() => {
        const answers = { ...current.answers, [questionId]: value };
        const nextEvaluation = evaluateGuidedCaseIntake(
          scopedConfiguration,
          answers,
          current.requiredOptionIds,
        );
        const answerRemainsValid = question
          ? isGuidedQuestionAnswerValid(
              question,
              value,
              current.requiredOptionIds[questionId],
            )
          : false;
        return {
          answers,
          followUpTasks: reconcileGuidedIntakeFollowUpTasks(
            current.followUpTasks.map((task) =>
              task.questionId === questionId && !answerRemainsValid
                ? { ...task, completed: false }
                : task,
            ),
            nextEvaluation,
            answers,
            current.requiredOptionIds,
          ),
        };
      })(),
    }));
    setErrors((current) => ({
      ...current,
      [`question.${questionId}`]: "",
    }));
    setFormError(null);
  };
  const openFollowUpTask = (questionId: string) => {
    setFollowUpQuestionId(questionId);
    followUpDialog.current?.showModal();
  };
  const saveFollowUpTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeFollowUpRequirement || pending) return;
    const form = new FormData(event.currentTarget);
    const assignedUserId = String(form.get("assignedUserId") ?? "");
    const dueDate = String(form.get("dueDate") ?? "");
    if (!assignedUserId || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return;
    const existing = draft.followUpTasks.find(
      (task) => task.questionId === activeFollowUpRequirement.question.id,
    );
    const missingOptionIds = activeFollowUpRequirement.missingOptions.map(
      (option) => option.id,
    );
    const missingOptionLabels = activeFollowUpRequirement.missingOptions.map(
      (option) => option.label,
    );
    const task: GuidedIntakeFollowUpTask = {
      id: existing?.id ?? crypto.randomUUID(),
      questionId: activeFollowUpRequirement.question.id,
      title: "Obtain missing required documents",
      description: `Outstanding requirements: ${missingOptionLabels.join(", ")}`,
      missingOptionIds,
      missingOptionLabels,
      assignedUserId,
      dueDate,
      completed: existing?.completed ?? false,
    };

    setPending(true);
    setFormError(null);
    const result = await upsertGuidedIntakeFollowUpTaskAction(draft, task);
    setPending(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    updateDraft(
      "followUpTasks",
      existing
        ? draft.followUpTasks.map((item) =>
            item.questionId === task.questionId ? task : item,
          )
        : [...draft.followUpTasks, task],
    );
    followUpDialog.current?.close();
  };

  const sendFollowUpNotice = async (task: GuidedIntakeFollowUpTask) => {
    if (
      !draft.caseId ||
      pending ||
      noticeSentFollowUpIds.has(task.id)
    ) {
      return;
    }

    setPending(true);
    setFormError(null);

    const result =
      await sendGuidedIntakeMissingDocumentsNoticeAction(
        draft.caseId,
        task.id,
      );

    setPending(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    setNoticeSentFollowUpIds((current) => {
      const next = new Set(current);
      next.add(task.id);
      return next;
    });

    if (!result.statusUpdated) {
      setFormError(
        "The notice was sent, but the Task status could not be refreshed automatically. Do not resend the notice; review the Case Task.",
      );
    }
  };

  const completeFollowUpTask = (task: GuidedIntakeFollowUpTask) => {
    if (!canCompleteIntakeFollowUpTask(task, evaluation)) {
      setFormError(
        "Mark every tracked required document as received before completing its follow-up Task.",
      );
      return;
    }
    updateDraft(
      "followUpTasks",
      draft.followUpTasks.map((item) =>
        item.id === task.id ? { ...item, completed: true } : item,
      ),
    );
  };
  const validateStep = () => {
    if (step === 0)
      return validateGuidedCustomerStep(draft, scopedConfiguration);
    if (step === 1)
      return validateGuidedCaseDetails(
        draft,
        scopedConfiguration,
        customerMode,
      );
    if (step === 2)
      return validateGuidedIntakeQuestions(evaluation, draft.requiredOptionIds);
    if (step === 3)
      return {
        ...validateGuidedIntakeQuestions(evaluation, draft.requiredOptionIds),
        ...(!portalResolved
          ? { portalOnboarding: "Resolve Customer Portal onboarding." }
          : {}),
      };
    return {
      ...validateGuidedCustomerStep(draft, scopedConfiguration),
      ...validateGuidedCaseDetails(
        draft,
        scopedConfiguration,
        customerMode,
      ),
      ...validateGuidedIntakeQuestions(evaluation, draft.requiredOptionIds),
      ...(!portalResolved
        ? { portalOnboarding: "Resolve Customer Portal onboarding." }
        : {}),
    };
  };

  const sendPortalInvitation = async (resend: boolean) => {
    if (!draft.customerId || portalPending) return;
    setPortalPending(true);
    setPortalError(null);
    const result = await sendGuidedIntakePortalInvitationAction(
      draft.customerId,
      resend,
    );
    setPortalPending(false);
    if (!result.ok) {
      setPortalError(result.error);
      return;
    }
    setPortalStatus(result.status);
    setDraft((current) => ({
      ...current,
      portalOnboarding:
        result.status.state === "ACTIVE"
          ? {
              resolution: "ACTIVE",
              customerId: current.customerId,
              recipientEmail: result.status.recipientEmail ?? undefined,
              invitationId: result.status.invitationId ?? undefined,
            }
          : {
              resolution: "INVITATION_SENT",
              customerId: current.customerId,
              recipientEmail: result.status.recipientEmail ?? undefined,
              invitationId: result.status.invitationId ?? undefined,
            },
    }));
    setErrors((current) => ({ ...current, portalOnboarding: "" }));
  };

  const setPortalNotRequired = async (notRequired: boolean) => {
    if (!draft.customerId || portalPending) return;
    setPortalPending(true);
    setPortalError(null);
    const result = await setGuidedIntakePortalNotRequiredAction(
      draft.customerId,
      notRequired,
    );
    setPortalPending(false);
    if (!result.ok) {
      setPortalError(result.error);
      return;
    }
    setDraft((current) => ({
      ...current,
      portalOnboarding: result.resolution,
    }));
    setErrors((current) => ({ ...current, portalOnboarding: "" }));
  };
  const continueForward = async () => {
    const blockers = validateStep();
    setErrors(blockers);
    if (Object.keys(blockers).length) {
      setFormError("Complete the highlighted items before continuing.");
      return;
    }
    setFormError(null);

    if (step === 1) {
      setPending(true);
      const result = await materializeGuidedCaseAction(draft, customerMode);
      setPending(false);
      if (!result.ok) {
        setErrors(result.fieldErrors);
        setFormError(result.error);
        if (result.step !== 1) setStep(result.step);
        return;
      }
      setDraft((current) => ({ ...current, caseId: result.caseId }));
      setStep(2);
      return;
    }

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
      firstName: customerFirstName,
      lastName: customerLastName,
    });

    if (!result.ok) {
      setCustomerErrors(result.fieldErrors);
      setFormError(result.error);
      setPending(false);
      return;
    }

    setCustomers((current) => [...current, result.customer]);
    setPortalPending(portalPromptEnabled);
    setDraft((current) => ({
      ...current,
      customerId: result.customer.id,
      portalOnboarding: unresolvedPortalOnboarding(),
    }));
    setErrors({});
    setFormError(null);
    setPending(false);
    setStep(1);
  };
  const saveAndContinueLater = async () => {
    if (pending) return;

    if (
      step >= 2 &&
      missingRequirements.some(
        (requirement) =>
          !draft.followUpTasks.some(
            (task) => task.questionId === requirement.question.id,
          ),
      )
    ) {
      setFormError(
        "Create a follow-up Task for each missing required-document group before saving this intake.",
      );
      return;
    }

    setPending(true);
    setFormError(null);

    const result = await saveGuidedIntakeDraftAction({
      currentStep: step,
      customerMode,
      draft,
      newCustomer: {
        ...customerValues,
        firstName: customerFirstName,
        lastName: customerLastName,
      },
    });

    setPending(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    router.push("/cases?message=Intake%20draft%20saved");
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
    const filtered = selectableCustomers.filter((customer) =>
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
              onClick={() => changeCustomerMode("existing")}
            >
              Existing Customer
            </button>
            <button
              type="button"
              className={customerMode === "new" ? "active" : ""}
              onClick={() => changeCustomerMode("new")}
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
                onChange={(event) => selectCustomer(event.target.value)}
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
                    const value = formatCustomerPhone(event.target.value);
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
        <span>Case Type</span>
        <select
          value={draft.caseTypeId}
          onChange={(event) => updateCaseType(event.target.value)}
          aria-invalid={Boolean(errors.caseTypeId)}
        >
          <option value="">Select a Case Type</option>
          {availableCaseTypes.map((item) => (
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
      {selectedType?.taxYearRule === "CURRENT_YEAR" ? (
        <p className="intake-note">
          Tax Year: <strong>{configuration.currentTaxYear}</strong>
        </p>
      ) : selectedType ? (
        <label>
          <span>Tax Year</span>
          <select
            required
            value={draft.taxYear ?? ""}
            onChange={(event) =>
              updateTaxYear(
                event.target.value === "" ? null : Number(event.target.value),
              )
            }
            aria-invalid={Boolean(errors.taxYear)}
          >
            <option value="">Select a Tax Year</option>
            {selectableTaxYears.map((taxYear) => (
              <option key={taxYear} value={taxYear}>
                {taxYear}
              </option>
            ))}
          </select>
          {fieldError(errors, "taxYear")}
        </label>
      ) : null}
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
          <fieldset
            className={`full intake-staff-fieldset${errors.staffUserIds ? " has-error" : ""}`}
          >
            <legend>Assigned Staff <b aria-label="required"> *</b> <small>At least one required · multiple allowed</small></legend>
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

  const renderQuestions = () => {
    if (!visibleQuestions.length) {
      return (
        <div className="intake-question-list intake-step-content">
          <div className="empty compact-empty">
            <p>No intake questions currently apply.</p>
          </div>
        </div>
      );
    }

    const grouped = guidedQuestionGroups
      .map((group) => ({
        group,
        questions: visibleQuestions
          .filter((question) => question.group === group)
          .sort((a, b) => a.displayOrder - b.displayOrder),
      }))
      .filter((section) => section.questions.length > 0);

    const unassigned = visibleQuestions
      .filter((question) => !question.group)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    return (
      <div className="intake-question-groups intake-step-content">
        {grouped.map((section) => {
          const requiredQuestions = section.questions.filter(
            (question) => question.effectiveRequired,
          );
          const requiredComplete = requiredQuestions.filter(
            (question) => question.valid,
          ).length;

          return (
            <section
              className="intake-question-group"
              key={section.group}
            >
              <header>
                <h3>{guidedQuestionGroupLabels[section.group]}</h3>
                {requiredQuestions.length ? (
                  <span>
                    {requiredComplete} of {requiredQuestions.length} required
                    complete
                  </span>
                ) : null}
              </header>

              <div className="intake-question-list">
                {section.questions.map((question) => {
                  const missing = missingRequirements.find(
                    (item) => item.question.id === question.id,
                  );
                  const staged = draft.followUpTasks.find(
                    (task) => task.questionId === question.id,
                  );
                  return <div className="intake-question-with-follow-up" key={question.id}>
                    <QuestionField question={question} value={draft.answers[question.id]} error={errors[`question.${question.id}`]} onChange={(value) => updateAnswer(question.id, value)} />
                    {missing ? (
                      <div className="intake-missing-requirement">
                        <p>
                          <b>Missing:</b>{" "}
                          {missing.missingOptions
                            .map((option) => option.label)
                            .join(", ")}
                        </p>
                        <div className="mini-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => openFollowUpTask(question.id)}
                            disabled={pending}
                          >
                            {staged ? "Update Task" : "Create Follow-up Task"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>;
                })}
              </div>
            </section>
          );
        })}

        {unassigned.length ? (
          <section className="intake-question-group">
            <header>
              <h3>Other</h3>
            </header>
            <div className="intake-question-list">
              {unassigned.map((question) => {
                const missing = missingRequirements.find(
                  (item) => item.question.id === question.id,
                );
                const staged = draft.followUpTasks.find(
                  (task) => task.questionId === question.id,
                );
                return (
                  <div
                    className="intake-question-with-follow-up"
                    key={question.id}
                  >
                    <QuestionField
                      question={question}
                      value={draft.answers[question.id]}
                      error={errors[`question.${question.id}`]}
                      onChange={(value) => updateAnswer(question.id, value)}
                    />
                    {missing ? (
                      <div className="intake-missing-requirement">
                        <p>
                          <b>Missing:</b>{" "}
                          {missing.missingOptions
                            .map((option) => option.label)
                            .join(", ")}
                        </p>
                        <div className="mini-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => openFollowUpTask(question.id)}
                            disabled={pending}
                          >
                            {staged ? "Update Task" : "Create Follow-up Task"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    );
  };

  const renderPortalOnboarding = () => {
    if (!portalPromptEnabled) return null;
    const notRequired =
      draft.portalOnboarding.resolution === "NOT_REQUIRED" &&
      draft.portalOnboarding.customerId === draft.customerId;
    const state = notRequired ? "NOT_REQUIRED" : portalStatus?.state;
    return (
      <section className="intake-portal-onboarding" aria-live="polite">
        <header>
          <div>
            <p className="eyebrow">Customer Portal Access</p>
            <h3>
              {state === "ACTIVE"
                ? "Customer Portal Active"
                : state === "INVITATION_SENT"
                  ? "Invitation Sent"
                  : state === "NOT_REQUIRED"
                    ? "Not Required for This Case"
                    : state === "UNAVAILABLE"
                      ? "Portal invitation unavailable"
                      : "Portal access has not been activated for this customer."}
            </h3>
          </div>
          <strong className={portalResolved ? "satisfied" : "outstanding"}>
            {portalResolved ? "Resolved" : "Required"}
          </strong>
        </header>
        {portalPending && !portalStatus ? <p>Checking Portal status…</p> : null}
        {state === "ACTIVE" ? (
          <p>
            This customer can access the Customer Portal for Service Requests,
            case progress, and messages. No action required.
          </p>
        ) : null}
        {state === "INVITATION_SENT" ? (
          <>
            <p>
              Sent to <strong>{portalStatus?.recipientEmail}</strong>
              {portalStatus?.lastSentAt
                ? ` on ${new Date(portalStatus.lastSentAt).toLocaleString()}`
                : ""}. Activation is still pending.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={portalPending}
                onClick={() => void sendPortalInvitation(true)}
              >
                {portalPending ? "Sending…" : "Resend Invitation"}
              </button>
            </div>
          </>
        ) : null}
        {state === "NOT_CONFIGURED" || (!state && !portalPending) ? (
          <>
            <p>
              Customer email: <strong>{selectedCustomer?.email ?? "Not available"}</strong>
            </p>
            {portalStatus?.reason ? <p>{portalStatus.reason}</p> : null}
            <div className="form-actions">
              <button
                type="button"
                className="primary-button"
                disabled={portalPending}
                onClick={() => void sendPortalInvitation(false)}
              >
                {portalPending ? "Sending…" : "Send Portal Invitation"}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={portalPending}
                onClick={() => void setPortalNotRequired(true)}
              >
                Not Required for This Case
              </button>
            </div>
          </>
        ) : null}
        {state === "UNAVAILABLE" ? (
          <>
            <p>{portalStatus?.reason}</p>
            <button
              type="button"
              className="text-button"
              disabled={portalPending}
              onClick={() => void setPortalNotRequired(true)}
            >
              Not Required for This Case
            </button>
          </>
        ) : null}
        {state === "NOT_REQUIRED" ? (
          <>
            <p>Portal access will not block this intake.</p>
            <button
              type="button"
              className="text-button"
              disabled={portalPending}
              onClick={() => void setPortalNotRequired(false)}
            >
              Undo / Reconsider
            </button>
          </>
        ) : null}
        {portalError ? <div className="form-alert" role="alert">{portalError}</div> : null}
        {fieldError(errors, "portalOnboarding")}
      </section>
    );
  };

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
                <small>{task.required ? "Required Task" : "Task"}{task.blocking ? " · Blocking" : ""} · {task.priority} · Due in {task.dueInDays} day{task.dueInDays === 1 ? "" : "s"}</small>
              </li>
            ))}
          </ul>
        ) : <p className="intake-note">No Rule-generated Tasks apply.</p>}
        <h3>Missing-document Follow-up Tasks</h3>
        {draft.followUpTasks.length ? <ul>{draft.followUpTasks.map((task) => <li key={task.id} className={task.completed ? "satisfied" : "outstanding"}><strong>{task.completed ? "Completed" : "Open"}</strong><span>{task.title}<small>{task.missingOptionLabels.join(", ")} · Due {task.dueDate}</small></span>{!task.completed ? <button type="button" className="text-button" onClick={() => completeFollowUpTask(task)}>Complete Task</button> : null}</li>)}</ul> : <p className="intake-note">No missing-document follow-up Tasks have been created.</p>}
        {hiddenQuestions.length ? (
          <p className="intake-note">{hiddenQuestions.length} conditional question{hiddenQuestions.length === 1 ? " is" : "s are"} currently non-applicable and will not block creation.</p>
        ) : null}
        {renderPortalOnboarding()}
      </div>
    );
  };

  const renderReview = () => (
    <div className="intake-review intake-step-content">
      {[
        ["Customer", selectedCustomer ? `${selectedCustomer.customerNumber} — ${selectedCustomer.name}` : "Not selected", 0],
        ["Case Type", selectedType?.name ?? "Not selected", 1],
        ["Tax Year", draft.taxYear ?? "Not selected", 0],
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
                <p><strong>{selectedType?.name}</strong> for <strong>{selectedCustomer?.name}</strong> · Tax Year <strong>{draft.taxYear}</strong></p>
              </div>
            );

  return (
    <>
    <dialog
      ref={followUpDialog}
      className="task-modal"
      onCancel={(event) => {
        event.preventDefault();
        followUpDialog.current?.close();
      }}
    >
      {(() => {
        const activeTask = draft.followUpTasks.find(
          (task) => task.questionId === followUpQuestionId,
        );
        const noticeSent = activeTask
          ? noticeSentFollowUpIds.has(activeTask.id)
          : false;
        const taskStatus = activeTask?.completed
          ? "Completed"
          : noticeSent
            ? "In Progress"
            : "Not Started";

        return (
          <form className="task-modal-form" onSubmit={saveFollowUpTask}>
            <header>
              <div>
                <p className="eyebrow">Guided Intake Task</p>
                <h2>{activeTask ? "Update Task" : "Create Follow-up Task"}</h2>
              </div>
              <button
                type="button"
                className="rule-dialog-close"
                aria-label="Close follow-up Task modal"
                onClick={() => followUpDialog.current?.close()}
              >
                <span aria-hidden>×</span>
              </button>
            </header>

            <label>
              <span>Task title</span>
              <input value="Obtain missing required documents" readOnly />
            </label>

            <div className="intake-modal-context">
              <b>Outstanding requirements</b>
              <p>
                {activeFollowUpRequirement?.missingOptions
                  .map((option) => option.label)
                  .join(", ")}
              </p>
            </div>

            {activeTask ? (
              <label>
                <span>Status</span>
                <input value={taskStatus} readOnly />
              </label>
            ) : null}

            <label>
              <span>Assigned to</span>
              {configuration.canReassignFollowUpTasks || !activeTask ? (
                <>
                  <select
                    name="assignedUserId"
                    required
                    defaultValue={
                      activeTask?.assignedUserId ||
                      draft.staffUserIds[0] ||
                      ""
                    }
                  >
                    <option value="">Select Staff</option>
                    {configuration.staff.map((member) => (
                      <option value={member.id} key={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <input
                    value={
                      configuration.staff.find(
                        (member) => member.id === activeTask.assignedUserId,
                      )?.name ?? "Assigned Staff"
                    }
                    readOnly
                  />
                  <input
                    type="hidden"
                    name="assignedUserId"
                    value={activeTask.assignedUserId}
                  />
                </>
              )}
            </label>

            <label>
              <span>Due Date</span>
              <input
                type="date"
                name="dueDate"
                required
                defaultValue={activeTask?.dueDate ?? ""}
              />
            </label>

            {activeTask && !activeTask.completed ? (
              <div className="task-notice-action">
                {!noticeSent ? (
                  <>
                    <button
                      type="button"
                      className="secondary-button task-notice-button"
                      onClick={() => void sendFollowUpNotice(activeTask)}
                      disabled={pending}
                    >
                      {pending ? "Sending…" : "Send Document Request"}
                    </button>
                    <span className="task-notice-help">
                      Email the Customer the missing-document instructions and
                      start this Task.
                    </span>
                  </>
                ) : (
                  <div className="task-notice-sent-pill">
                    <strong>Document Request Sent</strong>
                    {noticeSentAtByFollowUpId[activeTask.id] ? (
                      <small>
                        {new Intl.DateTimeFormat("en-US", {
                          timeZone: configuration.timezone,
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }).format(
                          new Date(
                            noticeSentAtByFollowUpId[activeTask.id],
                          ),
                        )}
                        {" · "}
                        {new Intl.DateTimeFormat("en-US", {
                          timeZone: configuration.timezone,
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(
                          new Date(
                            noticeSentAtByFollowUpId[activeTask.id],
                          ),
                        )}
                      </small>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {activeTask && !activeTask.completed ? (
              <div className="task-notice-action">
                <button
                  type="button"
                  className="secondary-button task-complete-button"
                  disabled={pending}
                  onClick={() => completeFollowUpTask(activeTask)}
                >
                  Complete Task
                </button>
                <span className="task-complete-help">
                  Complete after documents are verified.
                </span>
              </div>
            ) : null}

            {activeTask?.completed ? (
              <div className="task-notice-sent">
                <span>Task Completed</span>
              </div>
            ) : null}

            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => followUpDialog.current?.close()}
              >
                Cancel
              </button>
              <button className="primary-button" disabled={pending}>
                {pending
                  ? "Saving…"
                  : activeTask
                    ? "Save Task"
                    : "Create Task"}
              </button>
            </footer>
          </form>
        );
      })()}
    </dialog>
    <section className="panel guided-case-intake">
      <ol className="intake-stepper" aria-label="Case intake progress">
        {guidedCaseIntakeSteps.map((label, index) => {
          const completed = index < step;
          const current = index === step;
          const identityLocked = Boolean(draft.caseId) && index < 2;

          return (
            <li
              key={label}
              className={current ? "active" : completed ? "complete" : ""}
              aria-current={current ? "step" : undefined}
            >
              <button
                type="button"
                className="intake-step-tab"
                disabled={!completed || identityLocked}
                onClick={() => {
                  if (!completed || identityLocked) return;
                  setStep(index);
                  setErrors({});
                  setFormError(null);
                }}
                aria-label={
                  completed && !identityLocked
                    ? `Go back to ${label}`
                    : identityLocked
                      ? `${label}, Case identity is already established`
                    : current
                      ? `${label}, current step`
                      : `${label}, not yet available`
                }
              >
                <span>{index + 1}</span>
                <b>{label}</b>
              </button>
            </li>
          );
        })}
      </ol>
      <header className="intake-step-heading">
        <p>Step {step + 1} of {guidedCaseIntakeSteps.length}</p>
        <h2>
          {selectedCustomer
            ? `Guided Intake for ${selectedCustomer.name}`
            : "Guided Intake"}
        </h2>
        <h3>{guidedCaseIntakeSteps[step]}</h3>
      </header>
      {formError ? <div className="form-alert" role="alert">{formError}</div> : null}
      {content}
      <div className="form-actions intake-actions">
        <div className="intake-actions-left">
          {step >= 2 ? (
            <button
              type="button"
              className="secondary-button"
              onClick={saveAndContinueLater}
              disabled={pending}
            >
              {pending ? "Saving…" : "Save and Continue Later"}
            </button>
          ) : null}
          {step === 0 || (Boolean(draft.caseId) && step === 2) ? (
            <Link className="intake-cancel-button" href="/cases">
              {draft.caseId ? "Exit Intake" : "Cancel"}
            </Link>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setStep((current) => current - 1);
                setErrors({});
                setFormError(null);
              }}
              disabled={pending}
            >
              Back
            </button>
          )}
        </div>
        {step < guidedCaseIntakeSteps.length - 1 ? (
          <button
            type="button"
            className="primary-button"
            onClick={
              step === 0 && customerMode === "new"
                ? draft.customerId
                  ? continueForward
                  : createNewCustomerAndContinue
                : continueForward
            }
            disabled={
              pending ||
              portalPending ||
              (step === 2 && !requiredQuestionsComplete) ||
              (step === 3 && !portalResolved)
            }
            title={
              step === 2 && !requiredQuestionsComplete
                ? "Complete all required questions before continuing."
                : step === 3 && !portalResolved
                  ? "Resolve Customer Portal onboarding before continuing."
                : undefined
            }
          >
            {pending && step === 0 && customerMode === "new" && !draft.customerId
              ? "Creating Customer…"
              : "Continue"}
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            disabled={pending || portalPending || !portalResolved}
            onClick={async () => {
              setPending(true);
              setFormError(null);
              const result = await finalizeGuidedCaseAction(
                draft,
                customerMode,
              );
              if (!result.ok) {
                setPending(false);
                setErrors(result.fieldErrors);
                setFormError(result.error);
                if (result.step !== 5) setStep(result.step);
                return;
              }
              router.push(`/cases/${result.caseId}?message=${encodeURIComponent(`Case ${result.caseNumber} intake finalized.`)}`);
            }}
          >
            {pending ? "Finalizing Intake…" : "Finish Intake"}
          </button>
        )}
      </div>
    </section>
    </>
  );
}
