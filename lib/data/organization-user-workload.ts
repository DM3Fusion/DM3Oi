import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type Assignee = {
  id: string;
  name: string;
};

export type OrganizationUserWorkload = {
  counts: {
    cases: number;
    tasks: number;
    serviceRequests: number;
  };
  assignees: Assignee[];
};

function displayName(profile: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}) {
  return (
    profile.display_name?.trim() ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
    profile.email ||
    "Organization user"
  );
}

export async function getOrganizationUserWorkload(
  organizationId: string,
  userId: string,
): Promise<OrganizationUserWorkload> {
  const admin = createAdminClient();

  const [cases, assignments, tasks, requests, members] = await Promise.all([
    admin
      .from("cases")
      .select("id,manager_user_id,status")
      .eq("organization_id", organizationId)
      .not("status", "in", "(COMPLETED,CLOSED)"),
    admin
      .from("case_assignments")
      .select("case_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("is_active", true),
    admin
      .from("case_tasks")
      .select("id,case_id")
      .eq("organization_id", organizationId)
      .eq("assigned_user_id", userId)
      .not("status", "in", "(COMPLETED,NOT_APPLICABLE)"),
    admin
      .from("service_requests")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("assigned_user_id", userId)
      .not("status", "in", "(RESOLVED,CLOSED)"),
    admin
      .from("organization_members")
      .select(
        "user_id,role,status,is_active,profiles(id,email,first_name,last_name,display_name,is_active)",
      )
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .eq("is_active", true)
      .neq("user_id", userId),
  ]);

  const failures = [cases, assignments, tasks, requests, members].filter(
    (result) => result.error,
  );
  if (failures.length) {
    console.error("Organization user workload lookup failed", {
      organizationId,
      userId,
      errors: failures.map((result) => result.error?.message),
    });
    throw new Error("Organization user workload could not be loaded.");
  }

  const activeCases = cases.data ?? [];
  const activeCaseIds = new Set(activeCases.map((item) => item.id));
  const caseIds = new Set(
    activeCases
      .filter((item) => item.manager_user_id === userId)
      .map((item) => item.id),
  );

  for (const assignment of assignments.data ?? []) {
    if (activeCaseIds.has(assignment.case_id)) caseIds.add(assignment.case_id);
  }

  const activeTaskCount = (tasks.data ?? []).filter((task) =>
    activeCaseIds.has(task.case_id),
  ).length;

  const assignees: Assignee[] = [];
  for (const member of members.data ?? []) {
    if (
      !["BUSINESS_OWNER", "BUSINESS_ADMIN", "STAFF_MANAGER", "STAFF_USER"].includes(
        member.role,
      )
    )
      continue;

    const profile = Array.isArray(member.profiles)
      ? member.profiles[0]
      : member.profiles;

    if (!profile?.is_active) continue;

    assignees.push({
      id: member.user_id,
      name: displayName(profile),
    });
  }

  assignees.sort((a, b) => a.name.localeCompare(b.name));

  return {
    counts: {
      cases: caseIds.size,
      tasks: activeTaskCount,
      serviceRequests: requests.data?.length ?? 0,
    },
    assignees,
  };
}
