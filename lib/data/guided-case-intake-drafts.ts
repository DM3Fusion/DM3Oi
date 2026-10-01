import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { isIncompleteCompatibilityCaseStatus } from "@/lib/case-lifecycle";
import { createClient } from "@/lib/supabase/server";
import type {
  GuidedCaseIntakeDraft,
  GuidedCasePriority,
  GuidedIntakeAnswers,
  GuidedIntakeFollowUpTask,
  GuidedIntakeRequiredOptionIds,
} from "@/lib/guided-case-intake";
import type { Json } from "@/types/database.generated";
import { parseGuidedIntakePortalResolution } from "@/lib/customer-portal-onboarding";

export type GuidedIntakeNewCustomerDraft = {
  type: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
};

export type GuidedIntakeSavedDraft = {
  id: string;
  submissionKey: string;
  currentStep: number;
  customerMode: "existing" | "new";
  draft: GuidedCaseIntakeDraft;
  newCustomer: GuidedIntakeNewCustomerDraft;
  noticeSentFollowUpIds: string[];
  noticeSentAtByFollowUpId: Record<string, string>;
  updatedAt: string;
};

export type GuidedIntakeDraftSummary = {
  id: string;
  caseId: string | null;
  currentStep: number;
  customerId: string;
  customerName: string;
  caseType: string;
  taxYear: number | null;
  createdByUserId: string;
  canResume: boolean;
  canDelete: boolean;
  updatedAt: string;
};

const emptyNewCustomer = (): GuidedIntakeNewCustomerDraft => ({
  type: "INDIVIDUAL",
  name: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  notes: "",
});

const jsonString = (
  value: Json | undefined,
  key: string,
  fallback = "",
): string => {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value[key] === "string"
  ) {
    return value[key];
  }
  return fallback;
};

const parseNewCustomer = (
  value: Json,
): GuidedIntakeNewCustomerDraft => ({
  type: jsonString(value, "type", "INDIVIDUAL"),
  name: jsonString(value, "name"),
  firstName: jsonString(value, "firstName"),
  lastName: jsonString(value, "lastName"),
  email: jsonString(value, "email"),
  phone: jsonString(value, "phone"),
  notes: jsonString(value, "notes"),
});

const parseAnswers = (value: Json): GuidedIntakeAnswers => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
};

const parseRequiredOptionIds = (value: Json): GuidedIntakeRequiredOptionIds => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([questionId, optionIds]) =>
      Array.isArray(optionIds) &&
      optionIds.every((optionId) => typeof optionId === "string")
        ? [[questionId, optionIds as string[]]]
        : [],
    ),
  );
};

const parseFollowUpTasks = (value: Json): GuidedIntakeFollowUpTask[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, Json | undefined>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.questionId !== "string" ||
      typeof candidate.title !== "string" ||
      typeof candidate.description !== "string" ||
      typeof candidate.assignedUserId !== "string" ||
      typeof candidate.dueDate !== "string" ||
      typeof candidate.completed !== "boolean" ||
      !Array.isArray(candidate.missingOptionIds) ||
      !Array.isArray(candidate.missingOptionLabels)
    )
      return [];
    return [{
      id: candidate.id,
      questionId: candidate.questionId,
      title: candidate.title,
      description: candidate.description,
      assignedUserId: candidate.assignedUserId,
      dueDate: candidate.dueDate,
      status:
        candidate.status === "NOT_STARTED" ||
        candidate.status === "IN_PROGRESS" ||
        candidate.status === "BLOCKED" ||
        candidate.status === "COMPLETED" ||
        candidate.status === "NOT_APPLICABLE"
          ? candidate.status
          : candidate.completed
            ? "COMPLETED"
            : "NOT_STARTED",
      completed: candidate.completed,
      missingOptionIds: candidate.missingOptionIds.filter(
        (entry): entry is string => typeof entry === "string",
      ),
      missingOptionLabels: candidate.missingOptionLabels.filter(
        (entry): entry is string => typeof entry === "string",
      ),
    }];
  });
};

async function requireDraftAccess() {
  const access = await getAccessContext();
  const organizationId = access?.activeOrganization?.id;
  const canCreate = hasPermission(access, "CREATE_CASE");
  const canWork = hasPermission(access, "WORK_CASES");
  const canDelete = hasPermission(access, "DELETE_DRAFT_INTAKES");

  if (
    !access?.user?.id ||
    !organizationId ||
    (!canCreate && !canWork && !canDelete)
  ) {
    throw new Error("not authorized");
  }

  return {
    access,
    organizationId,
    canCreate,
    canWork,
    canDelete,
  };
}

export async function loadGuidedIntakeDraft(
  draftId: string,
  caseId: string | null = null,
): Promise<GuidedIntakeSavedDraft | null> {
  const { access, organizationId, canCreate, canWork } =
    await requireDraftAccess();

  if (caseId ? !canWork : !canCreate) {
    throw new Error("not authorized");
  }

  const supabase = await createClient();

  let query = supabase
    .from("guided_case_intake_drafts")
    .select(
      "id,submission_key,case_id,current_step,customer_mode,customer_id,new_customer,tax_year,description,case_type_id,priority,manager_user_id,staff_user_ids,answers,required_option_ids,follow_up_tasks,portal_onboarding,updated_at",
    )
    .eq("id", draftId)
    .eq("organization_id", organizationId)
    .is("finalized_at", null);

  query = caseId
    ? query.eq("case_id", caseId)
    : query.eq("created_by_user_id", access.user.id);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Guided Intake draft load failed", {
      organizationId,
      draftId,
      code: error.code,
      message: error.message,
    });
    throw new Error("Guided Intake draft is temporarily unavailable.");
  }

  if (!data) return null;

  const parsedFollowUpTasks = parseFollowUpTasks(data.follow_up_tasks);
  let followUpTasks = parsedFollowUpTasks;
  let noticeSentFollowUpIds: string[] = [];
  const noticeSentAtByFollowUpId: Record<string, string> = {};

  if (data.case_id && parsedFollowUpTasks.length) {
    // Temporary schema bridge until generated Supabase types include
    // Guided Intake Task provenance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: persistedTasks, error: persistedTaskError } = await (supabase as any)
      .from("case_tasks")
      .select("id,intake_follow_up_id,status,assigned_user_id,due_at")
      .eq("organization_id", organizationId)
      .eq("case_id", data.case_id)
      .in(
        "intake_follow_up_id",
        parsedFollowUpTasks.map((task) => task.id),
      );

    if (persistedTaskError) {
      console.error("Guided Intake Task state load failed", {
        organizationId,
        draftId,
        caseId: data.case_id,
        code: persistedTaskError.code,
        message: persistedTaskError.message,
      });
      throw new Error("Guided Intake draft is temporarily unavailable.");
    }

    const persistedRows = (persistedTasks ?? []) as Array<{
      id: string;
      intake_follow_up_id: string | null;
      status: string;
      assigned_user_id: string | null;
      due_at: string | null;
    }>;

    const persistedByFollowUpId = new Map(
      persistedRows.flatMap((task) =>
        task.intake_follow_up_id
          ? [[task.intake_follow_up_id, task] as const]
          : [],
      ),
    );

    followUpTasks = parsedFollowUpTasks.map((task) => {
      const persisted = persistedByFollowUpId.get(task.id);
      if (!persisted) return task;

      return {
        ...task,
        assignedUserId:
          persisted.assigned_user_id ?? task.assignedUserId,
        dueDate:
          persisted.due_at?.slice(0, 10) ?? task.dueDate,
        status:
          persisted.status === "NOT_STARTED" ||
          persisted.status === "IN_PROGRESS" ||
          persisted.status === "BLOCKED" ||
          persisted.status === "COMPLETED" ||
          persisted.status === "NOT_APPLICABLE"
            ? persisted.status
            : task.status,
        completed:
          persisted.status === "COMPLETED",
      };
    });

    noticeSentFollowUpIds = persistedRows
      .filter(
        (task) =>
          task.intake_follow_up_id &&
          (
            task.status === "IN_PROGRESS" ||
            task.status === "COMPLETED"
          ),
      )
      .map((task) => task.intake_follow_up_id as string);

    // TASK_STARTED with customer_notice_sent=true is the durable audit
    // event written after the missing-document email succeeds.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: activityRows, error: activityError } = await (supabase as any)
      .from("organization_case_activity")
      .select("event_type,event_data,created_at")
      .eq("organization_id", organizationId)
      .eq("case_id", data.case_id)
      .eq("event_type", "TASK_STARTED")
      .order("created_at", { ascending: true });

    if (activityError) {
      console.error("Guided Intake Task notice activity load failed", {
        organizationId,
        draftId,
        caseId: data.case_id,
        code: activityError.code,
        message: activityError.message,
      });
      throw new Error("Guided Intake draft is temporarily unavailable.");
    }

    const taskIdToFollowUpId = new Map(
      persistedRows.flatMap((task) =>
        task.intake_follow_up_id
          ? [[task.id, task.intake_follow_up_id] as const]
          : [],
      ),
    );

    for (const activity of (activityRows ?? []) as Array<{
      event_data: unknown;
      created_at: string;
    }>) {
      if (
        !activity.event_data ||
        typeof activity.event_data !== "object" ||
        Array.isArray(activity.event_data)
      ) {
        continue;
      }

      const eventData = activity.event_data as Record<string, unknown>;
      if (
        eventData.customer_notice_sent !== true ||
        typeof eventData.task_id !== "string"
      ) {
        continue;
      }

      const followUpId = taskIdToFollowUpId.get(eventData.task_id);
      if (followUpId && !noticeSentAtByFollowUpId[followUpId]) {
        noticeSentAtByFollowUpId[followUpId] = activity.created_at;
      }
    }
  }

  return {
    id: data.id,
    submissionKey: data.submission_key,
    currentStep: data.case_id
      ? Math.max(2, data.current_step)
      : Math.min(1, data.current_step),
    customerMode:
      data.customer_mode === "new" ? "new" : "existing",
    draft: {
      submissionKey: data.submission_key,
      caseId: data.case_id,
      customerId: data.customer_id ?? "",
      taxYear: data.tax_year,
      description: data.description,
      caseTypeId: data.case_type_id ?? "",
      priority: data.priority as GuidedCasePriority,
      managerUserId: data.manager_user_id ?? "",
      staffUserIds: data.staff_user_ids,
      answers: parseAnswers(data.answers),
      requiredOptionIds: parseRequiredOptionIds(data.required_option_ids),
      followUpTasks,
      portalOnboarding: parseGuidedIntakePortalResolution(
        data.portal_onboarding,
      ),
    },
    newCustomer: {
      ...emptyNewCustomer(),
      ...parseNewCustomer(data.new_customer),
    },
    noticeSentFollowUpIds,
    noticeSentAtByFollowUpId,
    updatedAt: data.updated_at,
  };
}

export async function loadGuidedIntakeDraftForCase(
  caseId: string,
): Promise<GuidedIntakeSavedDraft | null> {
  const { organizationId, canWork } = await requireDraftAccess();

  if (!canWork) {
    throw new Error("not authorized");
  }

  const supabase = await createClient();

  const { data: visibleCase, error: visibleCaseError } = await supabase
    .from("organization_cases")
    .select("id,status,customer_id,tax_year,case_type_id")
    .eq("organization_id", organizationId)
    .eq("id", caseId)
    .maybeSingle();

  if (visibleCaseError) {
    console.error("Guided Intake Case access lookup failed", {
      organizationId,
      caseId,
      code: visibleCaseError.code,
      message: visibleCaseError.message,
    });
    throw new Error("Guided Intake draft is temporarily unavailable.");
  }

  if (
    !visibleCase ||
    !isIncompleteCompatibilityCaseStatus(visibleCase.status)
  ) {
    return null;
  }

  const { data: linkedDraft, error: linkedDraftError } = await supabase
    .from("guided_case_intake_drafts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("case_id", caseId)
    .is("finalized_at", null)
    .maybeSingle();

  if (linkedDraftError) {
    console.error("Guided Intake Case draft lookup failed", {
      organizationId,
      caseId,
      code: linkedDraftError.code,
      message: linkedDraftError.message,
    });
    throw new Error("Guided Intake draft is temporarily unavailable.");
  }

  if (!linkedDraft) return null;

  const savedDraft = await loadGuidedIntakeDraft(linkedDraft.id, caseId);
  if (!savedDraft) return null;

  return {
    ...savedDraft,
    draft: {
      ...savedDraft.draft,
      caseId: visibleCase.id,
      customerId: visibleCase.customer_id,
      taxYear: visibleCase.tax_year,
      caseTypeId: visibleCase.case_type_id ?? "",
    },
  };
}

export async function loadGuidedIntakeDraftSummaries(): Promise<
  GuidedIntakeDraftSummary[]
> {

  const { access, organizationId, canCreate, canDelete } =
    await requireDraftAccess();
  const supabase = await createClient();

  const role = access.activeOrganization?.role;
  const canManageOrganizationDrafts =
    canDelete &&
    (
      access.isSuperAdmin ||
      role === "BUSINESS_OWNER" ||
      role === "BUSINESS_ADMIN" ||
      role === "STAFF_MANAGER"
    );

  let query = supabase
    .from("guided_case_intake_drafts")
    .select(
      "id,case_id,current_step,customer_id,tax_year,case_type_id,created_by_user_id,updated_at",
    )
    .eq("organization_id", organizationId)
    .is("finalized_at", null);

  if (!canManageOrganizationDrafts) {
    query = query.eq("created_by_user_id", access.user.id);
  }

  const { data, error } = await query.order(
    "updated_at",
    { ascending: false },
  );

  if (error) {
    console.error("Guided Intake draft list failed", {
      organizationId,
      code: error.code,
      message: error.message,
    });
    throw new Error("Guided Intake drafts are temporarily unavailable.");
  }

  const rows = data ?? [];
  if (!rows.length) return [];

  const customerIds = [
    ...new Set(
      rows.flatMap((row) => (row.customer_id ? [row.customer_id] : [])),
    ),
  ];
  const typeIds = [
    ...new Set(
      rows.flatMap((row) => (row.case_type_id ? [row.case_type_id] : [])),
    ),
  ];

  const [customers, types] = await Promise.all([
    customerIds.length
      ? supabase
          .from("customers")
          .select("id,name")
          .eq("organization_id", organizationId)
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    typeIds.length
      ? supabase
          .from("organization_case_types")
          .select("id,name")
          .eq("organization_id", organizationId)
          .in("id", typeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const relatedError = customers.error ?? types.error;
  if (relatedError) {
    console.error("Guided Intake draft labels failed", {
      organizationId,
      code: relatedError.code,
      message: relatedError.message,
    });
    throw new Error("Guided Intake drafts are temporarily unavailable.");
  }

  const customerNames = new Map(
    (customers.data ?? []).map((item) => [item.id, item.name]),
  );
  const typeNames = new Map(
    (types.data ?? []).map((item) => [item.id, item.name]),
  );

  return rows.map((row) => {
    const ownsDraft = row.created_by_user_id === access.user.id;

  return {
      id: row.id,
      caseId: row.case_id,
      currentStep: row.current_step,
      customerId: row.customer_id ?? "",
      customerName: row.customer_id
        ? customerNames.get(row.customer_id) ?? "Unavailable Customer"
        : "Customer not selected",
      caseType: row.case_type_id
        ? typeNames.get(row.case_type_id) ?? "Unavailable Case Type"
        : "Case Type not selected",
      taxYear: row.tax_year,
      createdByUserId: row.created_by_user_id,
      canResume: canCreate && ownsDraft,
      canDelete:
        !row.case_id && canDelete && (ownsDraft || canManageOrganizationDrafts),
      updatedAt: row.updated_at,
    };
  });
}
