import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccessContext } from "@/lib/auth/context";
import { hasTenantInternalAccess } from "@/lib/auth/access-routing";
import {
  attachAuthorizedAvatarUrls,
  type ProfileWithAvatar,
} from "@/lib/data/avatar-urls";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.generated";
import { getPlatformAdminUserIds, maskPlatformProfile, ORGANIZATION_SUPPORT_IDENTITY } from "@/lib/data/platform-privacy";
import {
  selectRecentCaseCommunications,
  type CaseCommunicationMessage,
  type RecentCaseCommunication,
} from "@/lib/case-communications";
import { calculateCaseReadiness, type CaseReadiness } from "@/lib/case-readiness";
import {
  loadOrganizationCaseRuleEvaluationBundle,
  type CaseRuleEvaluation,
} from "@/lib/data/rule-task-synchronization";
import {
  evaluatedCaseQuestionsFrom,
  type EvaluatedCaseQuestion,
} from "@/lib/data/question-repository";
import {
  requireOrganizationCustomers,
  type OrganizationCustomer,
} from "@/lib/data/organization-customers";
import { guidedCaseIntakeSteps } from "@/lib/guided-case-intake";
import {
  getCaseAssigneeWorkloads,
  type CaseAssigneeWorkload,
} from "@/lib/case-assignee-workload";
import {
  getTaskAssigneeWorkloads,
  type TaskAssigneeWorkload,
  type TaskWorkloadUser,
} from "@/lib/task-assignee-workload";
import { resolveCustomerPortalAccesses } from "@/lib/auth/customer-portal-effectiveness";
type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];
export type CaseRow = Views["organization_cases"]["Row"];
export type CustomerRow = OrganizationCustomer;
export type TaskRow = Views["organization_case_tasks"]["Row"];
export type AssignmentRow = Tables["case_assignments"]["Row"];
export type ActivityRow = Views["organization_case_activity"]["Row"];
export type ProfileRow = Tables["profiles"]["Row"];
export type AvatarProfileRow = ProfileWithAvatar<ProfileRow>;
export type MemberRow = Tables["organization_members"]["Row"];
export type ServiceRequestRow = Views["organization_service_requests"]["Row"];
export type ServiceRequestActivityRow = {
  id: string;
  organization_id: string;
  service_request_id: string;
  event_type: string;
  actor_user_id: string | null;
  occurred_at: string;
  previous_value: unknown;
  new_value: unknown;
  metadata: unknown;
};
export interface LiveServiceRequest extends ServiceRequestRow {
  customer: CustomerRow | null;
  assigned: AvatarProfileRow | null;
  creator: AvatarProfileRow | null;
}
export interface LiveCase extends CaseRow {
  customer: CustomerRow | null;
  manager: AvatarProfileRow | null;
  assignedStaff: AvatarProfileRow[];
  tasks: TaskRow[];
  questions: EvaluatedCaseQuestion[];
  ruleEvaluation: CaseRuleEvaluation;
  progress: CaseReadiness;
  intakeProgress: {
    completedSteps: number;
    totalSteps: number;
    progressPercent: number;
    answers: Record<string, unknown>;
  } | null;
}
export interface CaseRegisterRow {
  id: CaseRow["id"];
  case_number: CaseRow["case_number"];
  title: CaseRow["title"];
  status: CaseRow["status"];
  priority: CaseRow["priority"];
  due_at: CaseRow["due_at"];
  manager_user_id: CaseRow["manager_user_id"];
  customer_id: CaseRow["customer_id"];
  tax_year: CaseRow["tax_year"];
  customer: {
    id: string | null;
    name: string | null;
  } | null;
  assignedStaff: AvatarProfileRow[];
  historicalAssigneeIds: string[];
  progress: Pick<CaseReadiness, "progressPercent">;
  nextTaskDueAt: string | null;
}

export interface StaffMember {
  membership: MemberRow;
  profile: AvatarProfileRow;
}
export interface LiveOrganizationData {
  organizationId: string;
  timezone: string;
  cases: LiveCase[];
  customers: CustomerRow[];
  staff: StaffMember[];
  activities: (ActivityRow & {
    actor: AvatarProfileRow | null;
    caseNumber: string;
  })[];
  serviceRequests: LiveServiceRequest[];
  activeRules: { id: string; name: string }[];
}
export class DataAccessError extends Error {
  constructor(message = "Case-management data is temporarily unavailable.") {
    super(message);
    this.name = "DataAccessError";
  }
}
export async function getLiveOrganizationData(): Promise<LiveOrganizationData> {
  const access = await getAccessContext();
  if (access?.isSuperAdmin && !access.activeOrganization) redirect("/");
  if (!hasTenantInternalAccess(access) || !access?.activeOrganization)
    redirect("/account/unprovisioned");
  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  const admin = createAdminClient();
  const [
    caseResult,
    customerResult,
    assignmentResult,
    taskResult,
    memberResult,
    activityResult,
    requestResult,
    settingsResult,
    platformAdminIds,
    intakeResult,
  ] = await Promise.all([
    supabase
      .from("organization_cases")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("organization_customers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("case_assignments")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("organization_case_tasks")
      .select("*")
      .eq("organization_id", organizationId)
      .order("sequence"),
    supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("organization_case_activity")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("organization_service_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false }),
    admin
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    getPlatformAdminUserIds(),
    admin
      .from("guided_case_intake_drafts")
      .select("case_id,current_step,answers")
      .eq("organization_id", organizationId)
      .not("case_id", "is", null)
      .is("finalized_at", null),
  ]);
  const error =
    caseResult.error ??
    customerResult.error ??
    assignmentResult.error ??
    taskResult.error ??
    memberResult.error ??
    activityResult.error ??
    intakeResult.error;
  const requestError = (
    requestResult as {
      error?: {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
      } | null;
    }
  ).error;
  if (requestError) {
    console.error("Service request query failed", {
      code: requestError.code,
      message: requestError.message,
      details: requestError.details,
      hint: requestError.hint,
    });
    throw new DataAccessError();
  }
  if (error) {
    console.error("Live organization query failed", {
      code: error.code,
      message: error.message,
    });
    throw new DataAccessError();
  }
  const memberships = (memberResult.data ?? []).filter(
    (member) => !platformAdminIds.has(member.user_id),
  );
  const profileIds = [
    ...new Set([
      ...memberships.map((row) => row.user_id),
      ...(activityResult.data ?? []).flatMap((row) =>
        row.actor_user_id ? [row.actor_user_id] : [],
      ),
      ...((requestResult.data ?? []) as unknown as ServiceRequestRow[]).flatMap(
        (row) =>
          [row.assigned_user_id, row.created_by_user_id].filter(
            (id): id is string => Boolean(id),
          ),
      ),
    ]),
  ];
  const customers = requireOrganizationCustomers(customerResult.data ?? []);
  const assignments = assignmentResult.data ?? [];
  const tasks = taskResult.data ?? [];
  const rawCases = caseResult.data ?? [];
  const totalIntakeSteps = guidedCaseIntakeSteps.length;
  const intakeProgressByCase = new Map(
    (intakeResult.data ?? []).flatMap((row) => {
      if (!row.case_id) return [];
      const completedSteps = Math.min(
        Math.max(row.current_step, 0),
        totalIntakeSteps,
      );
      const answers =
        row.answers &&
        typeof row.answers === "object" &&
        !Array.isArray(row.answers)
          ? (row.answers as Record<string, unknown>)
          : {};

      return [[
        row.case_id,
        {
          completedSteps,
          totalSteps: totalIntakeSteps,
          progressPercent:
            totalIntakeSteps > 0
              ? Math.round((completedSteps / totalIntakeSteps) * 100)
              : 0,
          answers,
        },
      ]];
    }),
  );

  const profilePromise = profileIds.length
    ? supabase.from("profiles").select("*").in("id", profileIds)
    : Promise.resolve({ data: [], error: null });

  const [profileResult, ruleEvaluationBundle] = await Promise.all([
    profilePromise,
    loadOrganizationCaseRuleEvaluationBundle(
      organizationId,
      rawCases.map((item) => item.id),
    ),
  ]);

  if (profileResult.error) {
    console.error("Profile query failed", {
      code: profileResult.error.code,
      message: profileResult.error.message,
    });
    throw new DataAccessError();
  }

  const {
    byProfile,
    profileForOrganization,
  } = await buildCaseRepositoryProfileDirectory(
    profileResult.data ?? [],
    platformAdminIds,
  );
  const cases: LiveCase[] = rawCases.map((item) => {
    const itemTasks = tasks.filter((task) => task.case_id === item.id);
    const ruleEvaluation = ruleEvaluationBundle.evaluations.get(item.id)!;
    const questions = evaluatedCaseQuestionsFrom(ruleEvaluation);
    const staffIds = assignments
      .filter((a) => a.case_id === item.id && a.assignment_role === "STAFF")
      .map((a) => a.user_id);
    const intakeProgress = intakeProgressByCase.get(item.id) ?? null;
    const readiness = calculateCaseReadiness({
      questions: questions.map((question) => ({
        id: question.id,
        label: question.question_text,
        responseType: question.response_type,
        responseValue: question.response?.response_value,
        applicable: question.applicable,
        effectiveRequired: question.effectiveRequired,
      })),
      tasks: itemTasks.map((task) => ({
        id: task.id,
        label: task.title,
        status: task.status,
        required: task.required,
        blocking: task.blocking,
      })),
    });

    return {
      ...item,
      customer: customers.find((c) => c.id === item.customer_id) ?? null,
      manager: item.manager_user_id ? profileForOrganization(item.manager_user_id) : null,
      assignedStaff: staffIds.flatMap((id) => {
        const profile = profileForOrganization(id);
        return profile ? [profile] : [];
      }),
      tasks: itemTasks,
      questions,
      ruleEvaluation,
      intakeProgress,
      progress: intakeProgress
        ? {
            ...readiness,
            progressPercent: intakeProgress.progressPercent,
            ready: false,
            completedUnits: intakeProgress.completedSteps,
            totalUnits: intakeProgress.totalSteps,
          }
        : readiness,
    };
  });
  const staff: StaffMember[] = memberships.flatMap((membership) => {
    const profile = byProfile.get(membership.user_id);
    return profile ? [{ membership, profile }] : [];
  });
  const byCase = new Map(rawCases.map((item) => [item.id, item.case_number]));
  const activities = (activityResult.data ?? []).flatMap((activity) => {
    const caseNumber = byCase.get(activity.case_id);
    return caseNumber
      ? [
          {
            ...activity,
            actor: activity.actor_user_id
              ? profileForOrganization(activity.actor_user_id)
              : activity.actor_display_name
                ? { id: "masked-platform-actor", display_name: activity.actor_display_name, first_name: null, last_name: null, email: null, phone: null, title: null, is_active: true, avatar_path: null, avatar_updated_at: null, avatarUrl: null, created_at: "", updated_at: "" }
                : null,
            caseNumber,
          },
        ]
      : [];
  });
  const rawRequests = (requestResult.data ??
    []) as unknown as ServiceRequestRow[];
  const serviceRequests: LiveServiceRequest[] = rawRequests.map((request) => ({
    ...request,
    customer:
      customers.find((customer) => customer.id === request.customer_id) ?? null,
    assigned: request.assigned_user_id ? profileForOrganization(request.assigned_user_id) : null,
    creator: request.created_by_user_id ? profileForOrganization(request.created_by_user_id) : null,
  }));
  return {
    organizationId,
    timezone: settingsResult.data?.timezone ?? "UTC",
    cases,
    customers,
    staff,
    activities,
    serviceRequests,
    activeRules: ruleEvaluationBundle.activeRules,
  };
}
async function buildCaseRepositoryProfileDirectory(
  profileRows: ProfileRow[],
  platformAdminIds: Set<string>,
) {
  const profiles = await attachAuthorizedAvatarUrls(
    profileRows.map((profile) =>
      maskPlatformProfile(profile, platformAdminIds),
    ),
  );
  const byProfile = new Map(profiles.map((row) => [row.id, row]));
  const profileForOrganization = (
    id: string,
  ): AvatarProfileRow | null =>
    platformAdminIds.has(id)
      ? {
          id,
          display_name: ORGANIZATION_SUPPORT_IDENTITY,
          first_name: null,
          last_name: null,
          email: null,
          phone: null,
          title: null,
          is_active: true,
          avatar_path: null,
          avatar_updated_at: null,
          avatarUrl: null,
          created_at: "",
          updated_at: "",
        }
      : (byProfile.get(id) ?? null);

  return {
    profiles,
    byProfile,
    profileForOrganization,
  };
}

export interface ServiceDeskRequest extends ServiceRequestRow {
  customer: CustomerRow | null;
  assigned: ProfileRow | null;
}

export interface ServiceDeskStaffMember {
  membership: MemberRow;
  profile: ProfileRow;
}

export interface ServiceDeskData {
  organizationId: string;
  timezone: string;
  customers: CustomerRow[];
  staff: ServiceDeskStaffMember[];
  serviceRequests: ServiceDeskRequest[];
}

export async function getServiceDeskData(): Promise<ServiceDeskData> {
  const access = await getAccessContext();

  if (access?.isSuperAdmin && !access.activeOrganization) redirect("/");

  if (!hasTenantInternalAccess(access) || !access?.activeOrganization)
    redirect("/account/unprovisioned");

  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  const admin = createAdminClient();

  const [
    customerResult,
    memberResult,
    requestResult,
    settingsResult,
    platformAdminIds,
  ] = await Promise.all([
    supabase
      .from("organization_customers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("organization_service_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false }),
    admin
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    getPlatformAdminUserIds(),
  ]);

  const requestError = requestResult.error;

  if (requestError) {
    console.error("Service Desk request query failed", {
      organizationId,
      code: requestError.code,
      message: requestError.message,
      details: requestError.details,
      hint: requestError.hint,
    });

    throw new DataAccessError();
  }

  const error =
    customerResult.error ??
    memberResult.error ??
    settingsResult.error;

  if (error) {
    console.error("Service Desk query failed", {
      organizationId,
      code: error.code,
      message: error.message,
    });

    throw new DataAccessError();
  }

  const memberships = (memberResult.data ?? []).filter(
    (membership) => !platformAdminIds.has(membership.user_id),
  );

  const rawRequests =
    (requestResult.data ?? []) as unknown as ServiceRequestRow[];

  const profileIds = [
    ...new Set([
      ...memberships.map((membership) => membership.user_id),
      ...rawRequests.flatMap((request) =>
        request.assigned_user_id
          ? [request.assigned_user_id]
          : [],
      ),
    ]),
  ];

  const profileResult = profileIds.length
    ? await supabase
        .from("profiles")
        .select("*")
        .in("id", profileIds)
    : { data: [] as ProfileRow[], error: null };

  if (profileResult.error) {
    console.error("Service Desk profile query failed", {
      organizationId,
      code: profileResult.error.code,
      message: profileResult.error.message,
    });

    throw new DataAccessError();
  }

  const profiles = (profileResult.data ?? []).map((profile) =>
    maskPlatformProfile(profile, platformAdminIds),
  );

  const byProfile = new Map(
    profiles.map((profile) => [profile.id, profile]),
  );

  const profileForOrganization = (
    id: string,
  ): ProfileRow | null =>
    platformAdminIds.has(id)
      ? {
          id,
          display_name: ORGANIZATION_SUPPORT_IDENTITY,
          first_name: null,
          last_name: null,
          email: null,
          phone: null,
          title: null,
          is_active: true,
          avatar_path: null,
          avatar_updated_at: null,
          created_at: "",
          updated_at: "",
        }
      : (byProfile.get(id) ?? null);

  const customers = requireOrganizationCustomers(
    customerResult.data ?? [],
  );

  const staff: ServiceDeskStaffMember[] =
    memberships.flatMap((membership) => {
      const profile = byProfile.get(membership.user_id);

      return profile
        ? [{ membership, profile }]
        : [];
    });

  const serviceRequests: ServiceDeskRequest[] =
    rawRequests.map((request) => ({
      ...request,
      customer:
        customers.find(
          (customer) =>
            customer.id === request.customer_id,
        ) ?? null,
      assigned: request.assigned_user_id
        ? profileForOrganization(
            request.assigned_user_id,
          )
        : null,
    }));

  return {
    organizationId,
    timezone: settingsResult.data?.timezone ?? "UTC",
    customers,
    staff,
    serviceRequests,
  };
}

export interface ServiceRequestDetailCase {
  id: string;
  caseNumber: string;
  title: string;
}

export interface ServiceRequestDetailData {
  organizationId: string;
  timezone: string;
  item: ServiceDeskRequest | null;
  staff: ServiceDeskStaffMember[];
  eligibleCases: ServiceRequestDetailCase[];
}

export async function getServiceRequestDetailData(
  serviceRequestId: string,
): Promise<ServiceRequestDetailData> {
  const access = await getAccessContext();

  if (access?.isSuperAdmin && !access.activeOrganization) redirect("/");

  if (!hasTenantInternalAccess(access) || !access?.activeOrganization)
    redirect("/account/unprovisioned");

  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  const admin = createAdminClient();

  const [
    requestResult,
    memberResult,
    settingsResult,
    platformAdminIds,
  ] = await Promise.all([
    supabase
      .from("organization_service_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", serviceRequestId)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    admin
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    getPlatformAdminUserIds(),
  ]);

  if (requestResult.error) {
    console.error("Service Request detail query failed", {
      organizationId,
      serviceRequestId,
      code: requestResult.error.code,
      message: requestResult.error.message,
      details: requestResult.error.details,
      hint: requestResult.error.hint,
    });

    throw new DataAccessError();
  }

  const error =
    memberResult.error ??
    settingsResult.error;

  if (error) {
    console.error("Service Request detail support query failed", {
      organizationId,
      serviceRequestId,
      code: error.code,
      message: error.message,
    });

    throw new DataAccessError();
  }

  const rawRequest =
    requestResult.data as ServiceRequestRow | null;

  if (!rawRequest) {
    return {
      organizationId,
      timezone: settingsResult.data?.timezone ?? "UTC",
      item: null,
      staff: [],
      eligibleCases: [],
    };
  }

  const memberships = (memberResult.data ?? []).filter(
    (membership) => !platformAdminIds.has(membership.user_id),
  );

  const profileIds = [
    ...new Set([
      ...memberships.map((membership) => membership.user_id),
      ...(rawRequest.assigned_user_id
        ? [rawRequest.assigned_user_id]
        : []),
    ]),
  ];

  const [
    customerResult,
    caseResult,
    profileResult,
  ] = await Promise.all([
    supabase
      .from("organization_customers")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", rawRequest.customer_id)
      .maybeSingle(),
    supabase
      .from("organization_cases")
      .select("id,case_number,title,customer_id")
      .eq("organization_id", organizationId)
      .eq("customer_id", rawRequest.customer_id),
    profileIds.length
      ? supabase
          .from("profiles")
          .select("*")
          .in("id", profileIds)
      : Promise.resolve({
          data: [] as ProfileRow[],
          error: null,
        }),
  ]);

  const relatedError =
    customerResult.error ??
    caseResult.error ??
    profileResult.error;

  if (relatedError) {
    console.error("Service Request detail related-data query failed", {
      organizationId,
      serviceRequestId,
      code: relatedError.code,
      message: relatedError.message,
    });

    throw new DataAccessError();
  }

  const customers = requireOrganizationCustomers(
    customerResult.data ? [customerResult.data] : [],
  );

  const customer = customers[0] ?? null;

  const profiles = (profileResult.data ?? []).map((profile) =>
    maskPlatformProfile(profile, platformAdminIds),
  );

  const byProfile = new Map(
    profiles.map((profile) => [profile.id, profile]),
  );

  const profileForOrganization = (
    id: string,
  ): ProfileRow | null =>
    platformAdminIds.has(id)
      ? {
          id,
          display_name: ORGANIZATION_SUPPORT_IDENTITY,
          first_name: null,
          last_name: null,
          email: null,
          phone: null,
          title: null,
          is_active: true,
          avatar_path: null,
          avatar_updated_at: null,
          created_at: "",
          updated_at: "",
        }
      : (byProfile.get(id) ?? null);

  const staff: ServiceDeskStaffMember[] =
    memberships.flatMap((membership) => {
      const profile = byProfile.get(membership.user_id);

      return profile
        ? [{ membership, profile }]
        : [];
    });

  const item: ServiceDeskRequest = {
    ...rawRequest,
    customer,
    assigned: rawRequest.assigned_user_id
      ? profileForOrganization(rawRequest.assigned_user_id)
      : null,
  };

  const eligibleCases: ServiceRequestDetailCase[] =
    (caseResult.data ?? []).map((candidate) => ({
      id: candidate.id,
      caseNumber: candidate.case_number,
      title: candidate.title,
    }));

  return {
    organizationId,
    timezone: settingsResult.data?.timezone ?? "UTC",
    item,
    staff,
    eligibleCases,
  };
}

export async function getCustomerRegisterData(): Promise<{
  organizationId: string;
  customers: CustomerRow[];
  cases: Array<{
    customer_id: string;
    status: CaseRow["status"];
    tax_year: number | null;
  }>;
  effectivePortalCustomerIds: Set<string>;
}> {
  const access = await getAccessContext();

  if (access?.isSuperAdmin && !access.activeOrganization) redirect("/");

  if (!hasTenantInternalAccess(access) || !access?.activeOrganization)
    redirect("/account/unprovisioned");

  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  const admin = createAdminClient();

  const [customerResult, caseResult, portalResult] = await Promise.all([
    supabase
      .from("organization_customers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("organization_cases")
      .select("customer_id,status,tax_year")
      .eq("organization_id", organizationId),
    admin
      .from("customer_portal_users")
      .select("*")
      .eq("organization_id", organizationId),
  ]);

  const error =
    customerResult.error ??
    caseResult.error ??
    portalResult.error;

  if (error) {
    console.error("Customer register query failed", {
      organizationId,
      code: error.code,
      message: error.message,
    });

    throw new DataAccessError();
  }

  const resolvedPortalAccesses = await resolveCustomerPortalAccesses(
    admin,
    portalResult.data ?? [],
    { authAccountExists: true, profileActive: true },
  );

  return {
    organizationId,
    customers: requireOrganizationCustomers(
      customerResult.data ?? [],
    ),
    cases: (caseResult.data ?? []) as Array<{
      customer_id: string;
      status: CaseRow["status"];
      tax_year: number | null;
    }>,
    effectivePortalCustomerIds: new Set(
      resolvedPortalAccesses
        .filter((item) => item.effective)
        .map((item) => item.link.customer_id),
    ),
  };
}

export async function getTaskRegisterData(): Promise<{
  organizationId: string;
  timezone: string;
  tasks: TaskRow[];
  cases: Array<{ id: string; case_number: string }>;
  workloads: TaskAssigneeWorkload[];
}> {
  const access = await getAccessContext();

  if (access?.isSuperAdmin && !access.activeOrganization) redirect("/");
  if (!hasTenantInternalAccess(access) || !access?.activeOrganization)
    redirect("/account/unprovisioned");

  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  const admin = createAdminClient();

  const [
    taskResult,
    caseResult,
    settingsResult,
    memberResult,
    platformAdminIds,
  ] = await Promise.all([
    supabase
      .from("organization_case_tasks")
      .select("*")
      .eq("organization_id", organizationId)
      .order("sequence"),
    supabase
      .from("organization_cases")
      .select("id,case_number")
      .eq("organization_id", organizationId),
    admin
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("user_id,role,status,is_active")
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .eq("is_active", true),
    getPlatformAdminUserIds(),
  ]);

  const error =
    taskResult.error ??
    caseResult.error ??
    settingsResult.error ??
    memberResult.error;

  if (error) {
    console.error("Task register query failed", {
      organizationId,
      code: error.code,
      message: error.message,
    });
    throw new DataAccessError();
  }

  const eligibleRoles = new Set([
    "BUSINESS_OWNER",
    "BUSINESS_ADMIN",
    "STAFF_MANAGER",
    "STAFF_USER",
  ]);

  const members = (memberResult.data ?? []).filter(
    (member) =>
      eligibleRoles.has(member.role) &&
      !platformAdminIds.has(member.user_id),
  );

  const memberIds = [...new Set(members.map((member) => member.user_id))];

  let profileRows: ProfileRow[] = [];

  if (memberIds.length) {
    const profileResult = await supabase
      .from("profiles")
      .select("*")
      .in("id", memberIds);

    if (profileResult.error) {
      console.error("Task assignee profile query failed", {
        organizationId,
        code: profileResult.error.code,
        message: profileResult.error.message,
      });
      throw new DataAccessError();
    }

    profileRows = profileResult.data ?? [];
  }

  const { byProfile } =
    await buildCaseRepositoryProfileDirectory(
      profileRows,
      platformAdminIds,
    );

  const profilesById = new Map(
    [...byProfile.entries()].filter(([, profile]) => profile.is_active),
  );

  const users: TaskWorkloadUser[] = members.flatMap((member) => {
    const profile = profilesById.get(member.user_id);
    if (!profile) return [];

    const displayName =
      profile.display_name?.trim() ||
      [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      profile.email ||
      "Organization user";

    return [
      {
        role: member.role,
        profile: {
          id: profile.id,
          display_name: displayName,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
        },
      },
    ];
  });

  users.sort((a, b) =>
    (a.profile.display_name ?? a.profile.email ?? "").localeCompare(
      b.profile.display_name ?? b.profile.email ?? "",
    ),
  );

  const timezone = settingsResult.data?.timezone ?? "UTC";
  const tasks = taskResult.data ?? [];

  return {
    organizationId,
    timezone,
    tasks,
    cases: caseResult.data ?? [],
    workloads: getTaskAssigneeWorkloads(users, tasks, timezone),
  };
}

export async function getCasesRegisterData(): Promise<{
  organizationId: string;
  timezone: string;
  cases: CaseRegisterRow[];
  workloads: Array<CaseAssigneeWorkload<AvatarProfileRow>>;
}> {
  const access = await getAccessContext();

  if (access?.isSuperAdmin && !access.activeOrganization) redirect("/");
  if (!hasTenantInternalAccess(access) || !access?.activeOrganization)
    redirect("/account/unprovisioned");

  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  const admin = createAdminClient();

  const [
    caseResult,
    customerResult,
    assignmentResult,
    taskResult,
    settingsResult,
    platformAdminIds,
    intakeResult,
    memberResult,
  ] = await Promise.all([
    supabase
      .from("organization_cases")
      .select(
        "id,case_number,title,status,priority,due_at,manager_user_id,customer_id,tax_year",
      )
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("organization_customers")
      .select("id,name")
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("case_assignments")
      .select("case_id,user_id,assignment_role,is_active")
      .eq("organization_id", organizationId),
    supabase
      .from("organization_case_tasks")
      .select("id,case_id,title,status,required,blocking,due_at")
      .eq("organization_id", organizationId)
      .order("sequence"),
    admin
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    getPlatformAdminUserIds(),
    admin
      .from("guided_case_intake_drafts")
      .select("case_id,current_step")
      .eq("organization_id", organizationId)
      .not("case_id", "is", null)
      .is("finalized_at", null),
    supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .eq("is_active", true),
  ]);

  const error =
    caseResult.error ??
    customerResult.error ??
    assignmentResult.error ??
    taskResult.error ??
    settingsResult.error ??
    intakeResult.error ??
    memberResult.error;

  if (error) {
    console.error("Cases register query failed", {
      organizationId,
      code: error.code,
      message: error.message,
    });
    throw new DataAccessError();
  }

  const rawCases = caseResult.data ?? [];
  const customers = customerResult.data ?? [];
  const assignments = assignmentResult.data ?? [];
  const tasks = taskResult.data ?? [];
  const totalIntakeSteps = guidedCaseIntakeSteps.length;

  const intakeProgressByCase = new Map(
    (intakeResult.data ?? []).flatMap((row) => {
      if (!row.case_id) return [];

      const completedSteps = Math.min(
        Math.max(row.current_step, 0),
        totalIntakeSteps,
      );

      return [[
        row.case_id,
        {
          progressPercent:
            totalIntakeSteps > 0
              ? Math.round((completedSteps / totalIntakeSteps) * 100)
              : 0,
        },
      ]];
    }),
  );

  const staffAssignments = assignments.filter(
    (assignment) =>
      assignment.assignment_role === "STAFF" && assignment.is_active,
  );

  const profileIds = [
    ...new Set(
      [
        ...staffAssignments.map((assignment) => assignment.user_id),
        ...rawCases.flatMap((item) =>
          item.manager_user_id ? [item.manager_user_id] : [],
        ),
        ...(memberResult.data ?? []).map((member) => member.user_id),
      ],
    ),
  ];

  const ruleCaseIds = rawCases
    .filter((item) => !intakeProgressByCase.has(item.id))
    .map((item) => item.id);

  const [profileResult, ruleEvaluationBundle] = await Promise.all([
    profileIds.length
      ? supabase
          .from("profiles")
          .select("*")
          .in("id", profileIds)
      : Promise.resolve({
          data: [] as ProfileRow[],
          error: null,
        }),
    loadOrganizationCaseRuleEvaluationBundle(
      organizationId,
      ruleCaseIds,
    ),
  ]);

  if (profileResult.error) {
    console.error("Cases register profile query failed", {
      organizationId,
      code: profileResult.error.code,
      message: profileResult.error.message,
    });
    throw new DataAccessError();
  }

  const { profileForOrganization } =
    await buildCaseRepositoryProfileDirectory(
      profileResult.data ?? [],
      platformAdminIds,
    );

  const cases: CaseRegisterRow[] = rawCases.map((item) => {
    const itemTasks = tasks.filter(
      (task) => task.case_id === item.id,
    );

    const staffIds = staffAssignments
      .filter((assignment) => assignment.case_id === item.id)
      .map((assignment) => assignment.user_id);

    const assignedStaff = staffIds.flatMap((id) => {
      const profile = profileForOrganization(id);
      return profile ? [profile] : [];
    });

    const intakeProgress =
      intakeProgressByCase.get(item.id) ?? null;

    let progressPercent = intakeProgress?.progressPercent ?? 0;

    if (!intakeProgress) {
      const ruleEvaluation =
        ruleEvaluationBundle.evaluations.get(item.id);

      if (!ruleEvaluation) {
        throw new DataAccessError();
      }

      const questions =
        evaluatedCaseQuestionsFrom(ruleEvaluation);

      progressPercent = calculateCaseReadiness({
        questions: questions.map((question) => ({
          id: question.id,
          label: question.question_text,
          responseType: question.response_type,
          responseValue: question.response?.response_value,
          applicable: question.applicable,
          effectiveRequired: question.effectiveRequired,
        })),
        tasks: itemTasks.map((task) => ({
          id: task.id,
          label: task.title,
          status: task.status,
          required: task.required,
          blocking: task.blocking,
        })),
      }).progressPercent;
    }

    const nextTaskDueAt =
      item.status === "COMPLETED"
        ? null
        : itemTasks
            .filter(
              (task) =>
                task.status !== "COMPLETED" &&
                task.status !== "NOT_APPLICABLE" &&
                Boolean(task.due_at),
            )
            .map((task) => task.due_at)
            .filter((dueAt): dueAt is string => Boolean(dueAt))
            .sort(
              (left, right) =>
                new Date(left).getTime() -
                new Date(right).getTime(),
            )[0] ?? null;

    return {
      ...item,
      customer:
        customers.find(
          (customer) => customer.id === item.customer_id,
        ) ?? null,
      assignedStaff,
      historicalAssigneeIds: [
        ...new Set(
          assignments
            .filter(
              (assignment) =>
                assignment.case_id === item.id &&
                assignment.assignment_role === "STAFF",
            )
            .map((assignment) => assignment.user_id),
        ),
      ],
      progress: {
        progressPercent,
      },
      nextTaskDueAt,
    };
  });

  return {
    organizationId,
    timezone: settingsResult.data?.timezone ?? "UTC",
    cases,
    workloads: getCaseAssigneeWorkloads(
      (memberResult.data ?? []).flatMap((membership) => {
        if (platformAdminIds.has(membership.user_id)) return [];
        const profile = profileForOrganization(membership.user_id);
        return profile?.is_active
          ? [{ role: membership.role, profile }]
          : [];
      }),
      cases,
      settingsResult.data?.timezone ?? "UTC",
    ).sort((left, right) =>
      (left.profile.display_name ?? left.profile.email ?? "").localeCompare(
        right.profile.display_name ?? right.profile.email ?? "",
      ),
    ),
  };
}

export async function getLiveCase(caseId: string) {
  const access = await getAccessContext();

  if (access?.isSuperAdmin && !access.activeOrganization) redirect("/");

  if (!hasTenantInternalAccess(access) || !access?.activeOrganization)
    redirect("/account/unprovisioned");

  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  const admin = createAdminClient();

  const [
    caseResult,
    assignmentResult,
    taskResult,
    memberResult,
    activityResult,
    requestResult,
    settingsResult,
    platformAdminIds,
    intakeResult,
  ] = await Promise.all([
    supabase
      .from("organization_cases")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", caseId)
      .maybeSingle(),
    supabase
      .from("case_assignments")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("case_id", caseId)
      .eq("is_active", true),
    supabase
      .from("organization_case_tasks")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("case_id", caseId)
      .order("sequence"),
    supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("organization_case_activity")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("organization_service_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("case_id", caseId)
      .order("updated_at", { ascending: false }),
    admin
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    getPlatformAdminUserIds(),
    admin
      .from("guided_case_intake_drafts")
      .select("case_id,current_step,answers")
      .eq("organization_id", organizationId)
      .eq("case_id", caseId)
      .is("finalized_at", null)
      .maybeSingle(),
  ]);

  const requestError = (
    requestResult as {
      error?: {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
      } | null;
    }
  ).error;

  if (requestError) {
    console.error("Case detail Service Request query failed", {
      organizationId,
      caseId,
      code: requestError.code,
      message: requestError.message,
      details: requestError.details,
      hint: requestError.hint,
    });

    throw new DataAccessError();
  }

  const error =
    caseResult.error ??
    assignmentResult.error ??
    taskResult.error ??
    memberResult.error ??
    activityResult.error ??
    settingsResult.error ??
    intakeResult.error;

  if (error) {
    console.error("Case detail query failed", {
      organizationId,
      caseId,
      code: error.code,
      message: error.message,
    });

    throw new DataAccessError();
  }

  const rawCase = caseResult.data;

  if (!rawCase) {
    return {
      data: {
        organizationId,
        timezone: settingsResult.data?.timezone ?? "UTC",
        cases: [] as LiveCase[],
        customers: [] as CustomerRow[],
        staff: [] as StaffMember[],
        activities: [] as LiveOrganizationData["activities"],
        serviceRequests: [] as ServiceRequestRow[],
        activeRules: [] as { id: string; name: string }[],
      },
      item: null,
      recentCommunications: [] as RecentCaseCommunication[],
    };
  }

  const memberships = (memberResult.data ?? []).filter(
    (member) => !platformAdminIds.has(member.user_id),
  );

  const assignments = assignmentResult.data ?? [];
  const tasks = taskResult.data ?? [];
  const rawActivities = activityResult.data ?? [];
  const rawRequests =
    (requestResult.data ?? []) as unknown as ServiceRequestRow[];

  const profileIds = [
    ...new Set([
      ...memberships.map((row) => row.user_id),
      ...(rawCase.manager_user_id ? [rawCase.manager_user_id] : []),
      ...assignments.map((assignment) => assignment.user_id),
      ...rawActivities.flatMap((activity) =>
        activity.actor_user_id ? [activity.actor_user_id] : [],
      ),
    ]),
  ];

  const [
    customerResult,
    profileResult,
    ruleEvaluationBundle,
  ] = await Promise.all([
    supabase
      .from("organization_customers")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", rawCase.customer_id)
      .maybeSingle(),
    profileIds.length
      ? supabase
          .from("profiles")
          .select("*")
          .in("id", profileIds)
      : Promise.resolve({
          data: [] as ProfileRow[],
          error: null,
        }),
    loadOrganizationCaseRuleEvaluationBundle(
      organizationId,
      [caseId],
    ),
  ]);

  const relatedError =
    customerResult.error ??
    profileResult.error;

  if (relatedError) {
    console.error("Case detail related-data query failed", {
      organizationId,
      caseId,
      code: relatedError.code,
      message: relatedError.message,
    });

    throw new DataAccessError();
  }

  const customers = requireOrganizationCustomers(
    customerResult.data ? [customerResult.data] : [],
  );

  const {
    byProfile,
    profileForOrganization,
  } = await buildCaseRepositoryProfileDirectory(
    profileResult.data ?? [],
    platformAdminIds,
  );

  const ruleEvaluation =
    ruleEvaluationBundle.evaluations.get(caseId)!;

  const questions =
    evaluatedCaseQuestionsFrom(ruleEvaluation);

  const staffIds = assignments
    .filter(
      (assignment) =>
        assignment.assignment_role === "STAFF",
    )
    .map((assignment) => assignment.user_id);

  const totalIntakeSteps = guidedCaseIntakeSteps.length;
  const intakeRow = intakeResult.data;

  const intakeProgress = intakeRow
    ? (() => {
        const completedSteps = Math.min(
          Math.max(intakeRow.current_step, 0),
          totalIntakeSteps,
        );

        const answers =
          intakeRow.answers &&
          typeof intakeRow.answers === "object" &&
          !Array.isArray(intakeRow.answers)
            ? (intakeRow.answers as Record<string, unknown>)
            : {};

        return {
          completedSteps,
          totalSteps: totalIntakeSteps,
          progressPercent:
            totalIntakeSteps > 0
              ? Math.round(
                  (completedSteps / totalIntakeSteps) * 100,
                )
              : 0,
          answers,
        };
      })()
    : null;

  const readiness = calculateCaseReadiness({
    questions: questions.map((question) => ({
      id: question.id,
      label: question.question_text,
      responseType: question.response_type,
      responseValue: question.response?.response_value,
      applicable: question.applicable,
      effectiveRequired: question.effectiveRequired,
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      label: task.title,
      status: task.status,
      required: task.required,
      blocking: task.blocking,
    })),
  });

  const item: LiveCase = {
    ...rawCase,
    customer:
      customers.find(
        (customer) => customer.id === rawCase.customer_id,
      ) ?? null,
    manager: rawCase.manager_user_id
      ? profileForOrganization(rawCase.manager_user_id)
      : null,
    assignedStaff: staffIds.flatMap((id) => {
      const profile = profileForOrganization(id);
      return profile ? [profile] : [];
    }),
    tasks,
    questions,
    ruleEvaluation,
    intakeProgress,
    progress: intakeProgress
      ? {
          ...readiness,
          progressPercent: intakeProgress.progressPercent,
          ready: false,
          completedUnits: intakeProgress.completedSteps,
          totalUnits: intakeProgress.totalSteps,
        }
      : readiness,
  };

  const staff: StaffMember[] =
    memberships.flatMap((membership) => {
      const profile = byProfile.get(membership.user_id);

      return profile
        ? [{ membership, profile }]
        : [];
    });

  const activities: LiveOrganizationData["activities"] =
    rawActivities.map((activity) => ({
      ...activity,
      actor: activity.actor_user_id
        ? profileForOrganization(activity.actor_user_id)
        : activity.actor_display_name
          ? {
              id: "masked-platform-actor",
              display_name: activity.actor_display_name,
              first_name: null,
              last_name: null,
              email: null,
              phone: null,
              title: null,
              is_active: true,
              avatar_path: null,
              avatar_updated_at: null,
              avatarUrl: null,
              created_at: "",
              updated_at: "",
            }
          : null,
      caseNumber: rawCase.case_number,
    }));

  const linkedRequests = rawRequests.filter(
    (request) => request.case_id === item.id,
  );

  const data = {
    organizationId,
    timezone: settingsResult.data?.timezone ?? "UTC",
    cases: [item],
    customers,
    staff,
    activities,
    serviceRequests: rawRequests,
    activeRules: ruleEvaluationBundle.activeRules,
  };

  const messageResult = linkedRequests.length
    ? await supabase
        .from("organization_service_request_messages")
        .select(
          "id,organization_id,service_request_id,author_type,body,created_at",
        )
        .eq("organization_id", data.organizationId)
        .in(
          "service_request_id",
          linkedRequests.map((request) => request.id),
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(5)
    : {
        data: [] as CaseCommunicationMessage[],
        error: null,
      };

  if (messageResult.error) {
    console.error("Recent Case communications query failed", {
      organizationId,
      caseId,
      code: messageResult.error.code,
      message: messageResult.error.message,
    });

    throw new DataAccessError();
  }

  const recentCommunications =
    selectRecentCaseCommunications({
      organizationId: data.organizationId,
      caseId: item.id,
      caseCustomerId: item.customer_id,
      requests: linkedRequests,
      messages:
        (messageResult.data ?? []) as CaseCommunicationMessage[],
    });

  return {
    data,
    item,
    recentCommunications,
  };
}
export const displayName = (profile: ProfileRow | null | undefined) =>
  profile?.display_name ||
  [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
  profile?.email ||
  "Unassigned";
export const initialsFor = (profile: ProfileRow) =>
  displayName(profile)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
