import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type PlatformUserDeletionEligibility = {
  eligible: boolean;
  blockers: string[];
};

type DependencyCheck = {
  label: string;
  run: () => PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>;
};

export async function getPlatformUserDeletionEligibility(
  userId: string,
  membershipId: string,
): Promise<PlatformUserDeletionEligibility> {
  const admin = createAdminClient();
  const blockers: string[] = [];

  const membership = await admin
    .from("organization_members")
    .select("id,organization_id,user_id,status")
    .eq("id", membershipId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membership.error) {
    console.error("Permanent deletion membership lookup failed", {
      message: membership.error.message,
      userId,
      membershipId,
    });
    return {
      eligible: false,
      blockers: ["Dependency checks could not be completed."],
    };
  }

  if (!membership.data) {
    return {
      eligible: false,
      blockers: ["The organization membership could not be found."],
    };
  }

  if (membership.data.status !== "REVOKED") {
    blockers.push("Organization access must be revoked before permanent deletion.");
  }

  const organizationId = membership.data.organization_id;

  const checks: DependencyCheck[] = [
    {
      label: "Another organization membership exists.",
      run: () =>
        admin
          .from("organization_members")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .neq("id", membershipId),
    },
    {
      label: "A platform administrator role exists.",
      run: () =>
        admin
          .from("platform_user_roles")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
    },
    {
      label: "A Customer Portal identity exists.",
      run: () =>
        admin
          .from("customer_portal_users")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
    },
    {
      label: "Case history or case responsibility exists.",
      run: () =>
        admin
          .from("cases")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .or(`manager_user_id.eq.${userId},created_by_user_id.eq.${userId}`),
    },
    {
      label: "Case assignment history exists.",
      run: () =>
        admin
          .from("case_assignments")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .or(`user_id.eq.${userId},assigned_by_user_id.eq.${userId}`),
    },
    {
      label: "Case task history or assignment exists.",
      run: () =>
        admin
          .from("case_tasks")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .or(
            `assigned_user_id.eq.${userId},completed_by_user_id.eq.${userId},created_by_user_id.eq.${userId}`,
          ),
    },
    {
      label: "Case activity history exists.",
      run: () =>
        admin
          .from("case_activity")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("actor_user_id", userId),
    },
    {
      label: "Customer creation history exists.",
      run: () =>
        admin
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("created_by_user_id", userId),
    },
    {
      label: "Question or response history exists.",
      run: async () => {
        const [definitions, responses] = await Promise.all([
          admin
            .from("question_definitions")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("created_by_user_id", userId),
          admin
            .from("case_question_responses")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("responded_by_user_id", userId),
        ]);

        return {
          count: (definitions.count ?? 0) + (responses.count ?? 0),
          error: definitions.error ?? responses.error,
        };
      },
    },
    {
      label: "Service Desk history or responsibility exists.",
      run: async () => {
        const [requests, activity, messages, communications] = await Promise.all([
          admin
            .from("service_requests")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .or(
              `assigned_user_id.eq.${userId},created_by_user_id.eq.${userId}`,
            ),
          admin
            .from("service_request_activity")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("actor_user_id", userId),
          admin
            .from("service_request_messages")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("author_user_id", userId),
          admin
            .from("service_request_communications")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .or(`actor_user_id.eq.${userId},recipient_user_id.eq.${userId}`),
        ]);

        return {
          count:
            (requests.count ?? 0) +
            (activity.count ?? 0) +
            (messages.count ?? 0) +
            (communications.count ?? 0),
          error:
            requests.error ??
            activity.error ??
            messages.error ??
            communications.error,
        };
      },
    },
    {
      label: "Rule or configuration history exists.",
      run: async () => {
        const [definitions, actions] = await Promise.all([
          admin
            .from("rule_definitions")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .or(
              `created_by_user_id.eq.${userId},updated_by_user_id.eq.${userId}`,
            ),
          admin
            .from("rule_actions")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .or(
              `created_by_user_id.eq.${userId},updated_by_user_id.eq.${userId}`,
            ),
        ]);

        return {
          count: (definitions.count ?? 0) + (actions.count ?? 0),
          error: definitions.error ?? actions.error,
        };
      },
    },
    {
      label: "Organization administration history exists.",
      run: async () => {
        const [
          settings,
          lifecycleStatuses,
          rolePermissions,
          licenses,
          licenseEvents,
        ] = await Promise.all([
          admin
            .from("organization_settings")
            .select("organization_id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("updated_by", userId),
          admin
            .from("organization_lifecycle_statuses")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("updated_by", userId),
          admin
            .from("organization_role_permissions")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("updated_by", userId),
          admin
            .from("organization_licenses")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .or(`created_by.eq.${userId},updated_by.eq.${userId}`),
          admin
            .from("organization_license_events")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("actor_user_id", userId),
        ]);

        return {
          count:
            (settings.count ?? 0) +
            (lifecycleStatuses.count ?? 0) +
            (rolePermissions.count ?? 0) +
            (licenses.count ?? 0) +
            (licenseEvents.count ?? 0),
          error:
            settings.error ??
            lifecycleStatuses.error ??
            rolePermissions.error ??
            licenses.error ??
            licenseEvents.error,
        };
      },
    },
  ];

  const results = await Promise.all(
    checks.map(async (check) => ({
      label: check.label,
      result: await check.run(),
    })),
  );

  for (const { label, result } of results) {
    if (result.error) {
      console.error("Permanent deletion dependency lookup failed", {
        label,
        message: result.error.message,
        userId,
        membershipId,
      });
      blockers.push("Dependency checks could not be completed.");
      continue;
    }

    if ((result.count ?? 0) > 0) {
      blockers.push(label);
    }
  }

  return {
    eligible: blockers.length === 0,
    blockers: [...new Set(blockers)],
  };
}
