import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type {
  GuidedCaseIntakeDraft,
  GuidedCasePriority,
  GuidedIntakeAnswers,
} from "@/lib/guided-case-intake";
import type { Json } from "@/types/database.generated";

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
  updatedAt: string;
};

export type GuidedIntakeDraftSummary = {
  id: string;
  currentStep: number;
  customerId: string;
  customerName: string;
  caseTitle: string;
  caseType: string;
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

async function requireDraftAccess() {
  const access = await getAccessContext();
  const organizationId = access?.activeOrganization?.id;

  if (
    !access?.user?.id ||
    !organizationId ||
    !hasPermission(access, "CREATE_CASE")
  ) {
    throw new Error("not authorized");
  }

  return {
    access,
    organizationId,
  };
}

export async function loadGuidedIntakeDraft(
  draftId: string,
): Promise<GuidedIntakeSavedDraft | null> {
  const { access, organizationId } = await requireDraftAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("guided_case_intake_drafts")
    .select(
      "id,submission_key,current_step,customer_mode,customer_id,new_customer,case_title_id,description,case_type_id,priority,manager_user_id,staff_user_ids,answers,updated_at",
    )
    .eq("id", draftId)
    .eq("organization_id", organizationId)
    .eq("created_by_user_id", access.user.id)
    .maybeSingle();

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

  return {
    id: data.id,
    submissionKey: data.submission_key,
    currentStep: data.current_step,
    customerMode: data.customer_mode === "new" ? "new" : "existing",
    draft: {
      submissionKey: data.submission_key,
      customerId: data.customer_id ?? "",
      caseTitleId: data.case_title_id ?? "",
      description: data.description,
      caseTypeId: data.case_type_id ?? "",
      priority: data.priority as GuidedCasePriority,
      managerUserId: data.manager_user_id ?? "",
      staffUserIds: data.staff_user_ids,
      answers: parseAnswers(data.answers),
    },
    newCustomer: {
      ...emptyNewCustomer(),
      ...parseNewCustomer(data.new_customer),
    },
    updatedAt: data.updated_at,
  };
}

export async function loadGuidedIntakeDraftSummaries(): Promise<
  GuidedIntakeDraftSummary[]
> {
  const { access, organizationId } = await requireDraftAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("guided_case_intake_drafts")
    .select(
      "id,current_step,customer_id,case_title_id,case_type_id,updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("created_by_user_id", access.user.id)
    .order("updated_at", { ascending: false });

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
  const titleIds = [
    ...new Set(
      rows.flatMap((row) => (row.case_title_id ? [row.case_title_id] : [])),
    ),
  ];
  const typeIds = [
    ...new Set(
      rows.flatMap((row) => (row.case_type_id ? [row.case_type_id] : [])),
    ),
  ];

  const [customers, titles, types] = await Promise.all([
    customerIds.length
      ? supabase
          .from("customers")
          .select("id,name")
          .eq("organization_id", organizationId)
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    titleIds.length
      ? supabase
          .from("organization_case_titles")
          .select("id,label")
          .eq("organization_id", organizationId)
          .in("id", titleIds)
      : Promise.resolve({ data: [], error: null }),
    typeIds.length
      ? supabase
          .from("organization_case_types")
          .select("id,name")
          .eq("organization_id", organizationId)
          .in("id", typeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const relatedError = customers.error ?? titles.error ?? types.error;
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
  const titleNames = new Map(
    (titles.data ?? []).map((item) => [item.id, item.label]),
  );
  const typeNames = new Map(
    (types.data ?? []).map((item) => [item.id, item.name]),
  );

  return rows.map((row) => ({
    id: row.id,
    currentStep: row.current_step,
    customerId: row.customer_id ?? "",
    customerName: row.customer_id
      ? customerNames.get(row.customer_id) ?? "Unavailable Customer"
      : "Customer not selected",
    caseTitle: row.case_title_id
      ? titleNames.get(row.case_title_id) ?? "Unavailable Case Title"
      : "Case Title not selected",
    caseType: row.case_type_id
      ? typeNames.get(row.case_type_id) ?? "Unavailable Case Type"
      : "Case Type not selected",
    updatedAt: row.updated_at,
  }));
}
