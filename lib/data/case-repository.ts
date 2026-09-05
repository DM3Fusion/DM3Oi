import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccessContext } from "@/lib/auth/context";
import { hasTenantInternalAccess } from "@/lib/auth/access-routing";
import { attachAvatarUrls, type ProfileWithAvatar } from "@/lib/data/avatar-urls";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.generated";
type Tables = Database["public"]["Tables"];
export type CaseRow = Tables["cases"]["Row"];
export type CustomerRow = Tables["customers"]["Row"];
export type TaskRow = Tables["case_tasks"]["Row"];
export type AssignmentRow = Tables["case_assignments"]["Row"];
export type ActivityRow = Tables["case_activity"]["Row"];
export type ProfileRow = Tables["profiles"]["Row"];
export type AvatarProfileRow = ProfileWithAvatar<ProfileRow>;
export type MemberRow = Tables["organization_members"]["Row"];
export type ServiceRequestRow = Tables["service_requests"]["Row"] & { created_by_user_id: string | null };
export type ServiceRequestActivityRow = { id: string; organization_id: string; service_request_id: string; event_type: string; actor_user_id: string | null; occurred_at: string; previous_value: unknown; new_value: unknown; metadata: unknown };
export interface LiveServiceRequest extends ServiceRequestRow { customer: CustomerRow | null; assigned: AvatarProfileRow | null; creator: AvatarProfileRow | null }
export interface LiveCase extends CaseRow {
  customer: CustomerRow | null;
  manager: AvatarProfileRow | null;
  assignedStaff: AvatarProfileRow[];
  tasks: TaskRow[];
  progress: {
    percentage: number;
    completedRequiredTasks: number;
    totalRequiredTasks: number;
    remainingRequiredTasks: number;
  };
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
}
export class DataAccessError extends Error {
  constructor(message = "Case-management data is temporarily unavailable.") {
    super(message);
    this.name = "DataAccessError";
  }
}
const progressFor = (tasks: TaskRow[]) => {
  const applicable = tasks.filter(
    (task) => task.required && task.status !== "NOT_APPLICABLE",
  );
  const completed = applicable.filter(
    (task) => task.status === "COMPLETED",
  ).length;
  return {
    percentage: applicable.length
      ? Math.round((completed / applicable.length) * 100)
      : 0,
    completedRequiredTasks: completed,
    totalRequiredTasks: applicable.length,
    remainingRequiredTasks: applicable.length - completed,
  };
};
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
  ] = await Promise.all([
    supabase
      .from("cases")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("customers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("case_assignments")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("case_tasks")
      .select("*")
      .eq("organization_id", organizationId)
      .order("sequence"),
    supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("case_activity")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("service_requests").select("*").eq("organization_id", organizationId).order("updated_at", { ascending: false }),
    admin.from("organization_settings").select("timezone").eq("organization_id", organizationId).maybeSingle(),
  ]);
  const error =
    caseResult.error ??
    customerResult.error ??
    assignmentResult.error ??
    taskResult.error ??
    memberResult.error ??
    activityResult.error;
  const requestError = (requestResult as { error?: { code?: string; message?: string; details?: string; hint?: string } | null }).error;
  if (requestError) {
    console.error("Service request query failed", { code: requestError.code, message: requestError.message, details: requestError.details, hint: requestError.hint });
    throw new DataAccessError();
  }
  if (error) {
    console.error("Live organization query failed", {
      code: error.code,
      message: error.message,
    });
    throw new DataAccessError();
  }
  const memberships = memberResult.data ?? [];
  const profileIds = [
    ...new Set([
      ...memberships.map((row) => row.user_id),
      ...(activityResult.data ?? []).flatMap((row) =>
        row.actor_user_id ? [row.actor_user_id] : [],
      ),
      ...((requestResult.data ?? []) as unknown as ServiceRequestRow[]).flatMap((row) => [row.assigned_user_id, row.created_by_user_id].filter((id): id is string => Boolean(id))),
    ]),
  ];
  const profileResult = profileIds.length
    ? await supabase.from("profiles").select("*").in("id", profileIds)
    : { data: [], error: null };
  if (profileResult.error) {
    console.error("Profile query failed", {
      code: profileResult.error.code,
      message: profileResult.error.message,
    });
    throw new DataAccessError();
  }
  const profiles = await attachAvatarUrls(supabase, profileResult.data ?? []);
  const byProfile = new Map(profiles.map((row) => [row.id, row]));
  const customers = customerResult.data ?? [];
  const assignments = assignmentResult.data ?? [];
  const tasks = taskResult.data ?? [];
  const rawCases = caseResult.data ?? [];
  const cases: LiveCase[] = rawCases.map((item) => {
    const itemTasks = tasks.filter((task) => task.case_id === item.id);
    const staffIds = assignments
      .filter((a) => a.case_id === item.id && a.assignment_role === "STAFF")
      .map((a) => a.user_id);
    return {
      ...item,
      customer: customers.find((c) => c.id === item.customer_id) ?? null,
      manager: item.manager_user_id
        ? (byProfile.get(item.manager_user_id) ?? null)
        : null,
      assignedStaff: staffIds.flatMap((id) => {
        const profile = byProfile.get(id);
        return profile ? [profile] : [];
      }),
      tasks: itemTasks,
      progress: progressFor(itemTasks),
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
              ? (byProfile.get(activity.actor_user_id) ?? null)
              : null,
            caseNumber,
          },
        ]
      : [];
  });
  const rawRequests = (requestResult.data ?? []) as unknown as ServiceRequestRow[];
  const serviceRequests: LiveServiceRequest[] = rawRequests.map((request) => ({
    ...request,
    customer: customers.find((customer) => customer.id === request.customer_id) ?? null,
    assigned: request.assigned_user_id ? (byProfile.get(request.assigned_user_id) ?? null) : null,
    creator: request.created_by_user_id ? (byProfile.get(request.created_by_user_id) ?? null) : null,
  }));
  return { organizationId, timezone: settingsResult.data?.timezone ?? "UTC", cases, customers, staff, activities, serviceRequests };
}
export async function getLiveCase(caseId: string) {
  const data = await getLiveOrganizationData();
  return { data, item: data.cases.find((item) => item.id === caseId) ?? null };
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
