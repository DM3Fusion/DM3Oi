"use client";

import {
  evaluateGuidedIntakeQualificationFindings,
  getGuidedIntakeFilingStatusLabel,
} from "@/lib/guided-intake-qualification";

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
  sendGuidedIntakeCustomerRequirementsNoticeAction,
  upsertGuidedIntakeQualificationTaskAction,
  upsertGuidedIntakeFollowUpTaskAction,
} from "@/lib/data/guided-case-intake-actions";
import {
  evaluateGuidedCaseIntake,
  getGuidedIntakeFollowUpRequirements,
  getMissingRequiredOptions,
  guidedFollowUpTaskMatchesMissingOptions,
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

const guidedTaxDocumentQuestionId =
  "911c69ee-14bd-4391-ae87-f5b34047ea60";

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
    const assignmentNormalizedSource =
      !configuration.canAssign && configuration.staff.length === 1
        ? {
            ...source,
            managerUserId: "",
            staffUserIds: [configuration.staff[0].id],
          }
        : source;

    if (assignmentNormalizedSource.caseId) {
      return assignmentNormalizedSource;
    }

    return {
      ...assignmentNormalizedSource,
      ...reconcileGuidedCaseSelection(
        assignmentNormalizedSource.caseTypeId,
        assignmentNormalizedSource.taxYear,
        initialResolvedCustomerMode,
        configuration.caseTypes,
        configuration.currentTaxYear,
      ),
    };
  });
  const [errors, setErrors] = useState<GuidedIntakeFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
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
  const qualificationTaskDialog = useRef<HTMLDialogElement>(null);
  const requiredDocumentsDialog = useRef<HTMLDialogElement>(null);
  const saveProgressDialog = useRef<HTMLDialogElement>(null);
  const [saveAndSendPending, setSaveAndSendPending] = useState(false);
  const [qualificationTaskError, setQualificationTaskError] =
    useState<string | null>(null);
  const [followUpQuestionId, setFollowUpQuestionId] = useState<string | null>(null);
  const [documentAvailabilityIds, setDocumentAvailabilityIds] =
    useState<string[]>([]);
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
  const intakeQuestionEvaluation = {
    ...evaluation,
    questions: evaluation.questions.filter(
      (question) => question.id !== guidedTaxDocumentQuestionId,
    ),
  };

  const visibleQuestions = intakeQuestionEvaluation.questions.filter(
    (question) => question.applicable,
  );

  const effectiveRequiredOptionIds = evaluation.requiredOptionIds;
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
  const missingRequirements = getMissingRequiredOptions(
    evaluation,
    draft.answers,
    effectiveRequiredOptionIds,
  );
  const followUpRequirements = getGuidedIntakeFollowUpRequirements(
    evaluation,
    draft.answers,
    effectiveRequiredOptionIds,
  );
  const activeFollowUpRequirement = followUpRequirements.find(
    (item) => item.question.id === followUpQuestionId,
  );
  const qualificationFindings =
    evaluateGuidedIntakeQualificationFindings(
      configuration,
      draft.answers,
    );

  const requiredQuestionsResolved = !intakeQuestionEvaluation.questions.some((question) => {
    if (
      !question.applicable ||
      !question.effectiveRequired ||
      question.valid
    ) {
      return false;
    }

    const task = draft.followUpTasks.find(
      (item) => item.questionId === question.id,
    );
    return !task || !guidedFollowUpTaskMatchesMissingOptions(
      task,
      evaluation,
      draft.answers,
      effectiveRequiredOptionIds,
    );
  });
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
    void loadGuidedIntakePortalStatusAction(
      draft.customerId,
      draft.caseId,
    ).then((result) => {
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
  }, [draft.caseId, draft.customerId, portalPromptEnabled]);

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
              nextEvaluation.requiredOptionIds[questionId],
            )
          : false;

        return {
          answers,
          requiredOptionIds: nextEvaluation.requiredOptionIds,
          followUpTasks: reconcileGuidedIntakeFollowUpTasks(
            current.followUpTasks.map((task) =>
              task.questionId === questionId && !answerRemainsValid
                ? { ...task, completed: false }
                : task,
            ),
            nextEvaluation,
            answers,
            nextEvaluation.requiredOptionIds,
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
    setSaveAndSendPending(false);
    setFollowUpQuestionId(questionId);
    setFollowUpError(null);
    followUpDialog.current?.showModal();
  };
  const persistDraftAndSendDocumentNotices = async (
    workingDraft: GuidedCaseIntakeDraft,
  ): Promise<
    | { ok: true; sentCount: number }
    | { ok: false; error: string }
  > => {
    const saveResult = await saveGuidedIntakeDraftAction({
      currentStep: step,
      customerMode,
      draft: workingDraft,
      newCustomer: {
        ...customerValues,
        firstName: customerFirstName,
        lastName: customerLastName,
      },
    });

    if (!saveResult.ok) {
      return { ok: false, error: saveResult.error };
    }

    if (!workingDraft.caseId) {
      return { ok: true, sentCount: 0 };
    }

    const noticeResult =
      await sendGuidedIntakeCustomerRequirementsNoticeAction(
        workingDraft.caseId,
      );

    if (!noticeResult.ok) {
      return {
        ok: false,
        error:
          `Progress was saved, but the Customer notice was not sent. ${noticeResult.error}`,
      };
    }

    if (
      noticeResult.sent &&
      !noticeResult.statusUpdated
    ) {
      return {
        ok: false,
        error:
          "The Customer notice was sent, but one or more Task notice states could not be refreshed automatically. Do not resend the notice; review the Case Tasks.",
      };
    }

    return {
      ok: true,
      sentCount: noticeResult.sent ? 1 : 0,
    };
  };

  const finishSaveAndSendNavigation = (
    caseId: string | null,
    sentCount: number,
  ) => {
    const message =
      sentCount > 0
        ? "Intake draft saved and Customer notice sent."
        : "Intake draft saved.";

    if (caseId) {
      router.push(
        `/cases/${caseId}?message=${encodeURIComponent(message)}`,
      );
      return;
    }

    router.push(`/cases?message=${encodeURIComponent(message)}`);
  };

  const saveFollowUpTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeFollowUpRequirement || pending) return;

    const form = new FormData(event.currentTarget);
    const assignedUserId = String(form.get("assignedUserId") ?? "");
    const dueDate = String(form.get("dueDate") ?? "");
    const requestedStatus = String(
      form.get("status") ?? "NOT_STARTED",
    );

    const allowedStatuses = new Set([
      "NOT_STARTED",
      "IN_PROGRESS",
      "WAITING_ON_CUSTOMER",
      "REQUIRED_UNAVAILABLE",
      "COMPLETED",
    ]);

    if (
      !assignedUserId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
      !allowedStatuses.has(requestedStatus)
    ) {
      return;
    }

    const existing = draft.followUpTasks.find(
      (task) =>
        task.questionId === activeFollowUpRequirement.question.id,
    );

    const missingOptionIds =
      activeFollowUpRequirement.missingOptions.map(
        (option) => option.id,
      );

    const missingOptionLabels =
      activeFollowUpRequirement.missingOptions.map(
        (option) => option.label,
      );

    const documentRequirement =
      activeFollowUpRequirement.documentRequirement;

    const status = documentRequirement
      ? "WAITING_ON_CUSTOMER"
      : requestedStatus;

    const task: GuidedIntakeFollowUpTask = {
      id: existing?.id ?? crypto.randomUUID(),
      questionId: activeFollowUpRequirement.question.id,
      title: documentRequirement
        ? "Obtain missing required documents"
        : "Resolve intake question",
      description: documentRequirement
        ? `Outstanding requirements: ${missingOptionLabels.join(", ")}`
        : `Intake question: ${activeFollowUpRequirement.question.text}`,
      missingOptionIds,
      missingOptionLabels,
      assignedUserId,
      dueDate,
      status: status as GuidedIntakeFollowUpTask["status"],
      completed:
        status === "COMPLETED" ||
        status === "REQUIRED_UNAVAILABLE",
    };

    setPending(true);
    setFormError(null);
    setFollowUpError(null);

    const result =
      await upsertGuidedIntakeFollowUpTaskAction(draft, task);

    if (!result.ok) {
      setPending(false);
      setFollowUpError(result.error);
      return;
    }

    const nextFollowUpTasks = existing
      ? draft.followUpTasks.map((item) =>
          item.questionId === task.questionId ? task : item,
        )
      : [...draft.followUpTasks, task];

    const nextDraft: GuidedCaseIntakeDraft = {
      ...draft,
      followUpTasks: nextFollowUpTasks,
    };

    updateDraft("followUpTasks", nextFollowUpTasks);

    if (!saveAndSendPending || !documentRequirement) {
      setPending(false);
      followUpDialog.current?.close();
      return;
    }

    const nextUnstagedDocumentRequirement =
      followUpRequirements.find(
        (requirement) =>
          requirement.documentRequirement &&
          !nextFollowUpTasks.some(
            (candidate) =>
              candidate.questionId === requirement.question.id &&
              guidedFollowUpTaskMatchesMissingOptions(
                candidate,
                evaluation,
                draft.answers,
                effectiveRequiredOptionIds,
              ),
          ),
      );

    if (nextUnstagedDocumentRequirement) {
      setFollowUpQuestionId(
        nextUnstagedDocumentRequirement.question.id,
      );
      setPending(false);

      window.setTimeout(() => {
        followUpDialog.current?.showModal();
      }, 0);

      return;
    }

    followUpDialog.current?.close();

    if (qualificationFindings.length > 0) {
      setPending(false);
      setQualificationTaskError(null);

      window.setTimeout(() => {
        qualificationTaskDialog.current?.showModal();
      }, 0);

      return;
    }

    const saveAndSendResult =
      await persistDraftAndSendDocumentNotices(nextDraft);

    setSaveAndSendPending(false);
    setPending(false);

    if (!saveAndSendResult.ok) {
      setFormError(saveAndSendResult.error);

      window.setTimeout(() => {
        saveProgressDialog.current?.showModal();
      }, 0);

      return;
    }

    finishSaveAndSendNavigation(
      nextDraft.caseId,
      saveAndSendResult.sentCount,
    );
  };

  const saveQualificationTask = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!draft.caseId || pending) return;

    const form = new FormData(event.currentTarget);
    const assignedUserId = String(
      form.get("assignedUserId") ?? "",
    );
    const dueDate = String(form.get("dueDate") ?? "");

    if (
      !assignedUserId ||
      !/^\\d{4}-\\d{2}-\\d{2}$/.test(dueDate)
    ) {
      setQualificationTaskError(
        "Select an assignee and valid Due Date.",
      );
      return;
    }

    setPending(true);
    setQualificationTaskError(null);
    setFormError(null);

    const draftSaveResult = await saveGuidedIntakeDraftAction({
      currentStep: step,
      customerMode,
      draft,
      newCustomer: {
        ...customerValues,
        firstName: customerFirstName,
        lastName: customerLastName,
      },
    });

    if (!draftSaveResult.ok) {
      setPending(false);
      setQualificationTaskError(draftSaveResult.error);
      return;
    }

    const taskResult =
      await upsertGuidedIntakeQualificationTaskAction(
        draft.caseId,
        assignedUserId,
        dueDate,
      );

    if (!taskResult.ok) {
      setPending(false);
      setQualificationTaskError(taskResult.error);
      return;
    }

    const result =
      await persistDraftAndSendDocumentNotices(draft);

    setPending(false);
    setSaveAndSendPending(false);

    if (!result.ok) {
      setQualificationTaskError(result.error);
      return;
    }

    qualificationTaskDialog.current?.close();

    finishSaveAndSendNavigation(
      draft.caseId,
      result.sentCount,
    );
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
      return validateGuidedIntakeQuestions(
        intakeQuestionEvaluation,
        effectiveRequiredOptionIds,
      );

    if (step === 3) {
      const unresolvedDocumentFollowUp = missingRequirements.some(
        (requirement) =>
          !draft.followUpTasks.some(
            (task) =>
              task.questionId === requirement.question.id &&
              guidedFollowUpTaskMatchesMissingOptions(
                task,
                evaluation,
                draft.answers,
                effectiveRequiredOptionIds,
              ),
          ),
      );

      return {
        ...(unresolvedDocumentFollowUp
          ? {
              requiredDocuments:
                "Create or update the follow-up Task for outstanding required documents.",
            }
          : {}),
        ...(!portalResolved
          ? { portalOnboarding: "Resolve Customer Portal onboarding." }
          : {}),
      };
    }
    // Review is a summary step. Earlier steps were already validated while
    // advancing through the intake, and Finish Intake performs the authoritative
    // full server-side validation before finalization. Do not surface hidden
    // field errors on Review that the user cannot resolve from this screen.
    return {};
  };

  const sendPortalInvitation = async (resend: boolean) => {
    if (!draft.customerId || portalPending) return;
    setPortalPending(true);
    setPortalError(null);
    const result = await sendGuidedIntakePortalInvitationAction(
      draft.customerId,
      resend,
      draft.caseId,
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
      draft.caseId,
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

    if (step === 2) {
      setPending(true);

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

      setStep(3);
      return;
    }

    setStep((current) =>
      Math.min(current + 1, guidedCaseIntakeSteps.length - 1),
    );
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

    setFormError(null);

    const unstagedDocumentRequirement =
      followUpRequirements.find(
        (requirement) =>
          requirement.documentRequirement &&
          !draft.followUpTasks.some(
            (task) =>
              task.questionId === requirement.question.id &&
              guidedFollowUpTaskMatchesMissingOptions(
                task,
                evaluation,
                draft.answers,
                effectiveRequiredOptionIds,
              ),
          ),
      );

    if (unstagedDocumentRequirement) {
      setSaveAndSendPending(true);
      setFollowUpQuestionId(
        unstagedDocumentRequirement.question.id,
      );
      setFollowUpError(null);

      saveProgressDialog.current?.close();

      window.setTimeout(() => {
        followUpDialog.current?.showModal();
      }, 0);

      return;
    }

    if (qualificationFindings.length > 0) {
      setSaveAndSendPending(true);
      setQualificationTaskError(null);
      saveProgressDialog.current?.close();

      window.setTimeout(() => {
        qualificationTaskDialog.current?.showModal();
      }, 0);

      return;
    }

    setPending(true);

    const result =
      await persistDraftAndSendDocumentNotices(draft);

    setPending(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    saveProgressDialog.current?.close();

    finishSaveAndSendNavigation(
      draft.caseId,
      result.sentCount,
    );
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
    const normalizedCustomerSearch = customerSearch.trim().toLowerCase();
    const filtered = selectableCustomers.filter((customer) =>
      [
        customer.customerNumber,
        customer.name,
        customer.email ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedCustomerSearch),
    );
    const customerSearchActive = normalizedCustomerSearch.length > 0;
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
                autoComplete="off"
              />
              {customerSearchActive ? (
                <small className="intake-customer-search-summary" aria-live="polite">
                  {filtered.length
                    ? `${filtered.length} matching Customer${filtered.length === 1 ? "" : "s"}`
                    : "No Customers match this search."}
                </small>
              ) : null}
            </label>
            <div className="intake-customer-selection">
              <span className="intake-customer-selection-label">Customer</span>

              {customerSearchActive ? (
                <div
                  className="intake-customer-results"
                  role="listbox"
                  aria-label="Matching Customers"
                >
                  {filtered.length ? (
                    filtered.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className={
                          customer.id === draft.customerId
                            ? "intake-customer-result selected"
                            : "intake-customer-result"
                        }
                        role="option"
                        aria-selected={customer.id === draft.customerId}
                        onClick={() => {
                          selectCustomer(customer.id);
                          setCustomerSearch("");
                        }}
                      >
                        <span className="intake-customer-result-main">
                          <strong>{customer.name}</strong>
                          <small>
                            {customer.customerNumber}
                            {customer.email ? ` · ${customer.email}` : ""}
                          </small>
                        </span>
                        <span className="intake-customer-result-action">
                          Select
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="intake-customer-results-empty">
                      <strong>No matching Customers</strong>
                      <span>
                        Try another name, Customer number, or email address.
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <select
                  value={draft.customerId}
                  onChange={(event) => selectCustomer(event.target.value)}
                  aria-invalid={Boolean(errors.customerId)}
                  className="intake-customer-select"
                >
                  <option value="">Select a Customer</option>
                  {selectableCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.customerNumber} — {customer.name}
                    </option>
                  ))}
                </select>
              )}

              {fieldError(errors, "customerId")}
            </div>
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
          disabled={Boolean(draft.caseId)}
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
            disabled={Boolean(draft.caseId)}
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
        <p className="intake-note full">This Case will be assigned to you automatically.</p>
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
                  const requirement = followUpRequirements.find(
                    (item) => item.question.id === question.id,
                  );
                  const staged = draft.followUpTasks.find(
                    (task) => task.questionId === question.id,
                  );
                  return <div className="intake-question-with-follow-up" key={question.id}>
                    <QuestionField question={question} value={draft.answers[question.id]} error={errors[`question.${question.id}`]} onChange={(value) => updateAnswer(question.id, value)} />
                    {requirement ? (
                      <div className="intake-missing-requirement">
                        <p>
                          <b>
                            {requirement.documentRequirement
                              ? "Missing:"
                              : staged
                                ? "Follow-up Task created:"
                                : "Follow-up required:"}
                          </b>{" "}
                          {requirement.documentRequirement
                            ? requirement.missingOptions
                                .map((option) => option.label)
                                .join(", ")
                            : requirement.question.text}
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
                const requirement = followUpRequirements.find(
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
                    {requirement ? (
                      <div className="intake-missing-requirement">
                        <p>
                          <b>
                            {requirement.documentRequirement
                              ? "Missing:"
                              : staged
                                ? "Follow-up Task created:"
                                : "Follow-up required:"}
                          </b>{" "}
                          {requirement.documentRequirement
                            ? requirement.missingOptions
                                .map((option) => option.label)
                                .join(", ")
                            : requirement.question.text}
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
            </div>
          </>
        ) : null}
        {state === "UNAVAILABLE" ? (
          <>
            <p>{portalStatus?.reason}</p>
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
    const documentQuestion = evaluation.questions.find(
      (question) => question.id === guidedTaxDocumentQuestionId,
    );

    const requiredDocumentIds =
      effectiveRequiredOptionIds[guidedTaxDocumentQuestionId] ?? [];

    const requiredDocuments = documentQuestion
      ? documentQuestion.options
          .filter((option) => requiredDocumentIds.includes(option.id))
          .sort((a, b) => a.displayOrder - b.displayOrder)
      : [];

    const selectedDocumentIds = new Set(
      Array.isArray(draft.answers[guidedTaxDocumentQuestionId])
        ? draft.answers[guidedTaxDocumentQuestionId].filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    );

    const availableDocumentCount = requiredDocuments.filter((document) =>
      selectedDocumentIds.has(document.id),
    ).length;

    const documentRequirement = followUpRequirements.find(
      (requirement) =>
        requirement.question.id === guidedTaxDocumentQuestionId,
    );

    const documentTask = draft.followUpTasks.find(
      (task) => task.questionId === guidedTaxDocumentQuestionId,
    );

    const openDocumentAvailability = () => {
      setDocumentAvailabilityIds(
        requiredDocumentIds.filter((id) => selectedDocumentIds.has(id)),
      );
      requiredDocumentsDialog.current?.showModal();
    };

    return (
      <div className="intake-requirements intake-step-content">
        <section className="intake-required-documents-summary">
          <header>
            <div>
              <p className="eyebrow">Guided Intake</p>
              <h3>Required Documents</h3>
              <p>
                Based on the customer&apos;s answers, DM3Oi determines which
                documents are required. Indicate which documents are currently
                available.
              </p>
            </div>
            {requiredDocuments.length ? (
              <strong>
                {availableDocumentCount} of {requiredDocuments.length} available
              </strong>
            ) : null}
          </header>

          {requiredDocuments.length ? (
            <>
              <ul className="intake-required-document-status-list">
                {requiredDocuments.map((document) => {
                  const available = selectedDocumentIds.has(document.id);

                  return (
                    <li
                      key={document.id}
                      className={available ? "satisfied" : "outstanding"}
                    >
                      <strong>{available ? "Available" : "Outstanding"}</strong>
                      <span>{document.label}</span>
                    </li>
                  );
                })}
              </ul>

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={openDocumentAvailability}
                  disabled={pending}
                >
                  Update Availability
                </button>

                {documentRequirement ? (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() =>
                      openFollowUpTask(guidedTaxDocumentQuestionId)
                    }
                    disabled={pending}
                  >
                    {documentTask
                      ? "Update Missing-Document Task"
                      : "Create Missing-Document Task"}
                  </button>
                ) : null}
              </div>

              {documentRequirement ? (
                <p className="intake-note outstanding">
                  Outstanding:{" "}
                  {documentRequirement.missingOptions
                    .map((option) => option.label)
                    .join(", ")}
                </p>
              ) : (
                <p className="intake-note satisfied">
                  All DM3Oi-required documents are marked available.
                </p>
              )}
            </>
          ) : (
            <p className="intake-note">
              No documents are currently required from the intake answers.
            </p>
          )}

          {fieldError(errors, "requiredDocuments")}
        </section>

        <h3>Generated Tasks</h3>
        {evaluation.generatedTasks.length ? (
          <ul>
            {evaluation.generatedTasks.map((task) => (
              <li key={task.actionId} className="conditional">
                <strong>Conditional</strong>
                <span>{task.title}</span>
                <small>
                  {task.required ? "Required Task" : "Task"}
                  {task.blocking ? " · Blocking" : ""}
                  {" · "}
                  {task.priority}
                  {" · "}Due in {task.dueInDays} day
                  {task.dueInDays === 1 ? "" : "s"}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="intake-note">No Rule-generated Tasks apply.</p>
        )}

        <h3>Follow-up Tasks</h3>
        {draft.followUpTasks.length ? (
          <ul>
            {draft.followUpTasks.map((task) => (
              <li
                key={task.id}
                className={task.completed ? "satisfied" : "outstanding"}
              >
                <strong>{task.completed ? "Completed" : "Open"}</strong>
                <span>
                  {task.title}
                  <small>
                    {task.completed
                      ? "All required documents received"
                      : task.missingOptionLabels.join(", ")}
                    {" · "}Due {task.dueDate}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="intake-note">
            No follow-up Tasks have been created.
          </p>
        )}

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
          <button
            type="button"
            onClick={() => setStep(Number(editStep))}
            disabled={Boolean(draft.caseId) && Number(editStep) < 2}
            title={
              Boolean(draft.caseId) && Number(editStep) < 2
                ? "Case identity is already established."
                : undefined
            }
          >
            {Boolean(draft.caseId) && Number(editStep) < 2 ? "Locked" : "Edit"}
          </button>
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
        <h3>Required Documents</h3>
        <span>
          {(effectiveRequiredOptionIds[guidedTaxDocumentQuestionId] ?? []).length}
          {" "}required document
          {(effectiveRequiredOptionIds[guidedTaxDocumentQuestionId] ?? []).length === 1
            ? ""
            : "s"}
        </span>
        <button type="button" onClick={() => setStep(3)}>
          Review Required Documents
        </button>
      </div>
    </div>
  );

  const completedVisibleQuestions = visibleQuestions.filter(
    (question) => question.valid,
  ).length;

  const requiredVisibleQuestions = visibleQuestions.filter(
    (question) => question.effectiveRequired,
  );

  const completedRequiredQuestions = requiredVisibleQuestions.filter(
    (question) => question.valid,
  ).length;

  const outstandingDocumentLabels = Array.from(
    new Set(
      missingRequirements.flatMap((requirement) =>
        requirement.missingOptions.map((option) => option.label),
      ),
    ),
  );

  const renderIntakeContextPanel = () => {
    const filingStatusLabel =
      getGuidedIntakeFilingStatusLabel(
        configuration,
        draft.answers,
      );

    if (step === 0) {
      return (
        <>
          <p className="intake-context-eyebrow">Customer</p>
          <h3>
            {selectedCustomer ? selectedCustomer.name : "Select a Customer"}
          </h3>
          <div className="intake-context-metrics">
            <div>
              <strong>{selectedCustomer ? "Selected" : "Pending"}</strong>
              <span>Customer Status</span>
            </div>
            <div>
              <strong>{draft.taxYear ?? "—"}</strong>
              <span>Tax Year</span>
            </div>
          </div>
          <p className="intake-context-help">
            Choose the Customer for this Case. Case identity becomes locked once
            the Guided Intake materializes the Case.
          </p>
        </>
      );
    }

    if (step === 1) {
      return (
        <>
          <p className="intake-context-eyebrow">Case Summary</p>
          <h3>{selectedType?.name ?? "Case Details"}</h3>
          <div className="intake-context-list">
            <div>
              <span>Customer</span>
              <strong>{selectedCustomer?.name ?? "Not selected"}</strong>
            </div>
            <div>
              <span>Tax Year</span>
              <strong>{draft.taxYear ?? "—"}</strong>
            </div>
            <div>
              <span>Priority</span>
              <strong>{draft.priority}</strong>
            </div>
            <div>
              <span>Assigned Staff</span>
              <strong>{selectedStaff.length || "—"}</strong>
            </div>
          </div>
        </>
      );
    }

    if (step === 2) {
      return (
        <div className="intake-context-card-grid">
          <section
            className="intake-context-card"
            aria-label="Intake progress"
          >
            <p className="intake-context-eyebrow">Intake Progress</p>
            <h3>Question Summary</h3>

            <div className="intake-context-progress">
              <div>
                <strong>
                  {completedVisibleQuestions}/{visibleQuestions.length}
                </strong>
                <span>Questions Complete</span>
              </div>
              <div>
                <strong>
                  {completedRequiredQuestions}/{requiredVisibleQuestions.length}
                </strong>
                <span>Required Complete</span>
              </div>
            </div>
          </section>

          <section
            className="intake-context-card"
            aria-label="Document requirements"
          >
            <p className="intake-context-eyebrow">Document Requirements</p>
            <h3>
              {outstandingDocumentLabels.length
                ? `${outstandingDocumentLabels.length} Required`
                : "No Required Documents"}
            </h3>

            {outstandingDocumentLabels.length ? (
              <ul className="intake-context-documents">
                {outstandingDocumentLabels.slice(0, 6).map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            ) : (
              <p className="intake-context-help">
                DM3Oi will identify document requirements from the Customer’s
                answers.
              </p>
            )}

            {outstandingDocumentLabels.length > 6 ? (
              <small className="intake-context-more">
                +{outstandingDocumentLabels.length - 6} more
              </small>
            ) : null}
          </section>

          <section
            className="intake-context-card intake-context-card-intelligence"
            aria-label="Case intelligence"
          >
            <p className="intake-context-eyebrow">Case Intelligence</p>
            <h3>Qualification Requirements</h3>

            {!filingStatusLabel ? (
              <p className="intake-context-help">
                Select a filing status to view the qualification requirements
                that still need to be satisfied.
              </p>
            ) : qualificationFindings.length ? (
              <ul className="intake-qualification-list">
                {qualificationFindings.map((finding) => (
                  <li
                    key={finding.key}
                    className={
                      finding.severity === "ISSUE"
                        ? "intake-qualification-item is-issue"
                        : "intake-qualification-item"
                    }
                  >
                    <strong>{finding.title}</strong>
                    <span>{finding.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="intake-qualification-satisfied">
                ✓ {filingStatusLabel} requirements satisfied
              </p>
            )}
          </section>
        </div>
      );
    }

    if (step === 3) {
      return (
        <>
          <p className="intake-context-eyebrow">Requirements</p>
          <h3>Case Readiness</h3>
          <div className="intake-context-progress">
            <div>
              <strong>{outstandingDocumentLabels.length}</strong>
              <span>Documents Outstanding</span>
            </div>
            <div>
              <strong>
                {draft.followUpTasks.filter((task) => !task.completed).length}
              </strong>
              <span>Open Follow-up Tasks</span>
            </div>
          </div>
          <div className="intake-context-divider" />
          <div className="intake-context-list">
            <div>
              <span>Portal</span>
              <strong>{portalResolved ? "Resolved" : "Action Required"}</strong>
            </div>
            <div>
              <span>Generated Tasks</span>
              <strong>{evaluation.generatedTasks.length}</strong>
            </div>
          </div>
        </>
      );
    }

    if (step === 4) {
      return (
        <>
          <p className="intake-context-eyebrow">Review</p>
          <h3>Ready to Finish?</h3>
          <div className="intake-context-list">
            <div>
              <span>Customer</span>
              <strong>{selectedCustomer?.name ?? "Missing"}</strong>
            </div>
            <div>
              <span>Case Type</span>
              <strong>{selectedType?.name ?? "Missing"}</strong>
            </div>
            <div>
              <span>Required Questions</span>
              <strong>
                {completedRequiredQuestions}/{requiredVisibleQuestions.length}
              </strong>
            </div>
            <div>
              <span>Open Follow-up Tasks</span>
              <strong>
                {draft.followUpTasks.filter((task) => !task.completed).length}
              </strong>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <p className="intake-context-eyebrow">Finish Intake</p>
        <h3>{selectedCustomer?.name ?? "Guided Intake"}</h3>
        <div className="intake-context-list">
          <div>
            <span>Case Type</span>
            <strong>{selectedType?.name ?? "—"}</strong>
          </div>
          <div>
            <span>Tax Year</span>
            <strong>{draft.taxYear ?? "—"}</strong>
          </div>
          <div>
            <span>Portal</span>
            <strong>{portalResolved ? "Resolved" : "Action Required"}</strong>
          </div>
        </div>
        <p className="intake-context-help">
          Finish Intake records the Guided Intake as complete. Ongoing tax
          preparation work continues in the organization’s designated systems.
        </p>
      </>
    );
  };

  const content =
    step === 0 ? renderCustomer() :
      step === 1 ? renderDetails() :
        step === 2 ? renderQuestions() :
          step === 3 ? renderRequirements() :
            step === 4 ? renderReview() : (
              <div className="intake-create-confirmation intake-step-content">
                <p>
                  Clicking <strong>Finish Intake</strong> completes the intake
                  process in DM3Oi™; however, Customers can still check the
                  status of their Case using the Customer Portal.
                </p>
                <p>
                  Continue document handling, preparation, filing, payment
                  processing, and other service work in your organization’s
                  designated systems.
                </p>
              </div>
            );

  return (
    <>
    <dialog
      ref={requiredDocumentsDialog}
      className="task-modal intake-document-availability-modal"
      onCancel={(event) => {
        event.preventDefault();
        requiredDocumentsDialog.current?.close();
      }}
    >
      <form
        className="task-modal-form"
        onSubmit={(event) => {
          event.preventDefault();

          const requiredIds =
            effectiveRequiredOptionIds[guidedTaxDocumentQuestionId] ?? [];

          updateAnswer(
            guidedTaxDocumentQuestionId,
            requiredIds.filter((id) =>
              documentAvailabilityIds.includes(id),
            ),
          );

          requiredDocumentsDialog.current?.close();
        }}
      >
        <header>
          <div>
            <p className="eyebrow">Guided Intake</p>
            <h2>Required Documents</h2>
          </div>
          <button
            type="button"
            className="rule-dialog-close task-modal-close"
            aria-label="Close required documents modal"
            onClick={() => requiredDocumentsDialog.current?.close()}
          >
            ×
          </button>
        </header>

        <p>
          Based on the customer&apos;s answers, DM3Oi requires the documents
          below. Indicate which are currently available.
        </p>

        <div className="intake-document-availability-list">
          {(() => {
            const documentQuestion = evaluation.questions.find(
              (question) =>
                question.id === guidedTaxDocumentQuestionId,
            );

            const requiredIds =
              effectiveRequiredOptionIds[guidedTaxDocumentQuestionId] ?? [];

            const documents = documentQuestion
              ? documentQuestion.options
                  .filter((option) => requiredIds.includes(option.id))
                  .sort((a, b) => a.displayOrder - b.displayOrder)
              : [];

            return documents.map((document) => (
              <label key={document.id}>
                <span>{document.label}</span>
                <span className="intake-document-availability-control">
                  <input
                    type="checkbox"
                    checked={documentAvailabilityIds.includes(document.id)}
                    onChange={(event) => {
                      setDocumentAvailabilityIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, document.id])]
                          : current.filter((id) => id !== document.id),
                      );
                    }}
                  />
                  Available
                </span>
              </label>
            ));
          })()}
        </div>

        <div className="task-modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => requiredDocumentsDialog.current?.close()}
          >
            Cancel
          </button>
          <button type="submit" className="primary-button">
            Save Availability
          </button>
        </div>
      </form>
    </dialog>

    <dialog
      ref={qualificationTaskDialog}
      className="task-modal"
      onCancel={(event) => {
        event.preventDefault();
        setSaveAndSendPending(false);
        setQualificationTaskError(null);
        qualificationTaskDialog.current?.close();
      }}
    >
      <form
        className="task-modal-form"
        onSubmit={saveQualificationTask}
      >
        <header>
          <div>
            <p className="eyebrow">Guided Intake Task</p>
            <h2>Resolve qualification requirements</h2>
          </div>
          <button
            type="button"
            className="rule-dialog-close task-modal-close"
            aria-label="Close qualification Task modal"
            onClick={() => {
              setSaveAndSendPending(false);
              setQualificationTaskError(null);
              qualificationTaskDialog.current?.close();
            }}
          >
            <span aria-hidden>×</span>
          </button>
        </header>

        <label>
          <span>Task title</span>
          <input
            value="Resolve qualification requirements"
            readOnly
          />
        </label>

        <div className="intake-modal-context">
          <b>Additional information needed</b>
          <ul>
            {qualificationFindings.map((finding) => (
              <li key={finding.key}>
                <strong>{finding.title}</strong>
                {" — "}
                {finding.message}
              </li>
            ))}
          </ul>
        </div>

        <label>
          <span>Assigned to</span>
          <select
            name="assignedUserId"
            required
            defaultValue={
              draft.staffUserIds[0] ||
              configuration.staff[0]?.id ||
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
        </label>

        <label>
          <span>Status</span>
          <input value="Waiting on Customer" readOnly />
          <small>
            System controlled until the Guided Intake answers
            satisfy the qualification requirements.
          </small>
        </label>

        <label>
          <span>Due Date</span>
          <input
            type="date"
            name="dueDate"
            required
            onChange={(event) => event.currentTarget.blur()}
          />
        </label>

        {qualificationTaskError ? (
          <p className="form-error" role="alert">
            {qualificationTaskError}
          </p>
        ) : null}

        <div className="task-modal-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={pending}
            onClick={() => {
              setSaveAndSendPending(false);
              setQualificationTaskError(null);
              qualificationTaskDialog.current?.close();
            }}
          >
            Keep Working
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={pending}
          >
            {pending
              ? "Saving…"
              : "Save Task and Send Notice"}
          </button>
        </div>
      </form>
    </dialog>

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
        return (
          <form className="task-modal-form" onSubmit={saveFollowUpTask}>
            <header>
              <div>
                <p className="eyebrow">Guided Intake Task</p>
                <h2>{activeTask ? "Update Task" : "Create Follow-up Task"}</h2>
              </div>
              <button
                type="button"
                className="rule-dialog-close task-modal-close"
                aria-label="Close follow-up Task modal"
                onClick={() => {
                  setFollowUpError(null);
                  followUpDialog.current?.close();
                }}
              >
                <span aria-hidden>×</span>
              </button>
            </header>

            <label>
              <span>Task title</span>
              <input
                value={
                  activeFollowUpRequirement?.documentRequirement
                    ? "Obtain missing required documents"
                    : "Resolve intake question"
                }
                readOnly
              />
            </label>

            <div className="intake-modal-context">
              <b>
                {activeFollowUpRequirement?.documentRequirement
                  ? "Outstanding requirements"
                  : "Intake question"}
              </b>
              <p>
                {activeFollowUpRequirement?.documentRequirement
                  ? activeFollowUpRequirement.missingOptions
                      .map((option) => option.label)
                      .join(", ")
                  : activeFollowUpRequirement?.question.text}
              </p>
            </div>

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
                      configuration.staff[0]?.id ||
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
              <span>Status</span>
              {activeFollowUpRequirement?.documentRequirement ? (
                <>
                  <input value="Waiting on Customer" readOnly />
                  <input
                    type="hidden"
                    name="status"
                    value="WAITING_ON_CUSTOMER"
                  />
                  <small>
                    System set while required documents are outstanding.
                  </small>
                </>
              ) : (
                <select
                  name="status"
                  defaultValue={activeTask?.status ?? "NOT_STARTED"}
                >
                  <option value="NOT_STARTED">Not Started</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="WAITING_ON_CUSTOMER">
                    Waiting on Customer
                  </option>
                  <option value="REQUIRED_UNAVAILABLE">
                    Required, but Unavailable
                  </option>
                  <option value="COMPLETED">Completed</option>
                </select>
              )}
            </label>

            <label>
              <span>Due Date</span>
              <input
                type="date"
                name="dueDate"
                required
                defaultValue={activeTask?.dueDate ?? ""}
                onChange={(event) => event.currentTarget.blur()}
              />
            </label>

            {activeTask &&
            !activeTask.completed &&
            activeTask.missingOptionIds.length > 0 ? (
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

            {activeTask?.completed ? (
              <div className="task-notice-sent">
                <span>
                  {activeTask.status === "REQUIRED_UNAVAILABLE"
                    ? activeTask.missingOptionIds.length
                      ? "Required document marked unavailable"
                      : "Required item marked unavailable"
                    : "Task Completed"}
                </span>
              </div>
            ) : null}

            {followUpError ? (
              <div className="task-modal-error" role="alert">
                {followUpError}
              </div>
            ) : null}

            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setFollowUpError(null);
                  followUpDialog.current?.close();
                }}
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
    <dialog
      ref={saveProgressDialog}
      className="task-modal intake-save-progress-modal"
      onCancel={(event) => {
        event.preventDefault();
        saveProgressDialog.current?.close();
      }}
    >
      <form
        className="task-modal-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <header>
          <div>
            <p className="eyebrow">Guided Intake</p>
            <h2>Save and Continue Later?</h2>
          </div>
        </header>

        <div className="intake-save-progress-copy">
          <p>
            Your Guided Intake progress will be saved.
          </p>
          <p>
            If missing-document follow-up Tasks are created, DM3Oi will email
            the Customer with the outstanding document requirements.
          </p>
        </div>

        {formError ? (
          <div className="task-modal-error" role="alert">
            {formError}
          </div>
        ) : null}

        <footer>
          <button
            type="button"
            className="secondary-button"
            disabled={pending}
            onClick={() => saveProgressDialog.current?.close()}
          >
            Keep Working
          </button>

          <button
            type="button"
            className="primary-button"
            disabled={pending}
            onClick={() => {
              void saveAndContinueLater();
            }}
          >
            {pending ? "Saving…" : "Save Progress and Send Notice"}
          </button>
        </footer>
      </form>
    </dialog>

    <section className="guided-case-intake">
      <header className="intake-workspace-heading">
        <div>
          <p className="eyebrow">Case Management</p>
          <h1>
            {selectedCustomer
              ? `Guided Intake — ${selectedCustomer.name}`
              : "Guided Intake"}
          </h1>
          <p>
            Complete the guided workflow. DM3Oi evaluates responses and
            determines the requirements for this Case.
          </p>
        </div>

        <div className="intake-heading-status">
          <span>In Progress</span>
          {draft.taxYear ? <strong>Tax Year {draft.taxYear}</strong> : null}
        </div>
      </header>

      {formError ? (
        <div className="form-alert intake-workspace-alert" role="alert">
          {formError}
        </div>
      ) : null}

      <div
        className={
          step === 2
            ? "intake-workspace intake-workspace-question-step"
            : "intake-workspace"
        }
      >
        <aside className="intake-progress-rail">
          <div className="intake-progress-rail-heading">
            <strong>Guided Intake</strong>
            <span>
              Step {step + 1} of {guidedCaseIntakeSteps.length}
            </span>
          </div>

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
                    <span aria-hidden>
                      {completed ? "✓" : index + 1}
                    </span>
                    <span className="intake-step-copy">
                      <b>{label}</b>
                      <small>
                        {current
                          ? "Current"
                          : completed
                            ? identityLocked
                              ? "Complete · Locked"
                              : "Complete"
                            : "Pending"}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <main className="intake-workspace-main">
          <header className="intake-step-heading">
            <p>
              Step {step + 1} of {guidedCaseIntakeSteps.length}
            </p>
            <h2>{guidedCaseIntakeSteps[step]}</h2>
            <span>
              {step === 0
                ? "Select or create the Customer for this Case."
                : step === 1
                  ? "Establish the Case details, tax year, priority, and assignments."
                  : step === 2
                    ? "Answer the applicable questions. DM3Oi determines requirements from these responses."
                    : step === 3
                      ? "Review the documents DM3Oi requires from the intake answers and record their availability."
                      : step === 4
                        ? "Review the complete Guided Intake before finishing."
                        : "Finish Intake and hand the Case off to the organization’s operational workflow."}
            </span>
          </header>

          <div className="intake-workspace-content">
            {content}
          </div>
        </main>

        <aside
          className={
            step === 2
              ? "intake-context-panel intake-context-panel-question-step"
              : "intake-context-panel"
          }
          aria-label="Guided Intake context"
        >
          {renderIntakeContextPanel()}
        </aside>
      </div>

      <footer className="intake-workspace-footer">
        <div className="intake-actions-left">
          {step >= 2 ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => saveProgressDialog.current?.showModal()}
              disabled={pending}
            >
              {pending ? "Saving…" : "Save and Continue Later"}
            </button>
          ) : null}

          {step === 0 || (Boolean(draft.caseId) && step === 2) ? (
            <Link className="intake-cancel-button" href="/cases">
              {draft.caseId ? "Exit Intake" : "Cancel"}
            </Link>
          ) : null}
        </div>

        <div className="intake-actions-right">
          {step !== 0 && !(Boolean(draft.caseId) && step === 2) ? (
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
          ) : null}

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
                (step === 2 && !requiredQuestionsResolved) ||
                (step === 3 && !portalResolved)
              }
              title={
                step === 2 && !requiredQuestionsResolved
                  ? "Complete all required questions before continuing."
                  : step === 3 && !portalResolved
                    ? "Resolve Customer Portal onboarding before continuing."
                    : undefined
              }
            >
              {pending &&
              step === 0 &&
              customerMode === "new" &&
              !draft.customerId
                ? "Creating Customer…"
                : "Continue to Next Section"}
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
                router.push(
                  `/cases/${result.caseId}?message=${encodeURIComponent(
                    `Case ${result.caseNumber} intake finalized.`,
                  )}`,
                );
              }}
            >
              {pending ? "Finalizing Intake…" : "Finish Intake"}
            </button>
          )}
        </div>
      </footer>
    </section>
    </>
  );
}
