import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.generated";
import type { SupabaseClient } from "@supabase/supabase-js";

type TrialIdentityReferenceDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      trial_request_status_history: {
        Row: {
          id: string;
          actor_user_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      trial_requests: {
        Row: {
          id: string;
          qualification_reviewed_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
  };
};

type TrialIdentityClient = SupabaseClient<TrialIdentityReferenceDatabase>;

export type GlobalUserDeletionEligibility = {
  eligible: boolean;
  blockers: string[];
};

type CountResult = {
  count: number | null;
  error: { message: string } | null;
};

type DependencyCheck = {
  label: string;
  run: () => PromiseLike<CountResult>;
};

export async function getGlobalUserDeletionEligibility(
  userId: string,
): Promise<GlobalUserDeletionEligibility> {
  const admin = createAdminClient();
  const trialAdmin = admin as unknown as TrialIdentityClient;
  const blockers: string[] = [];

  /*
   * This predicate is intentionally global rather than organization-scoped.
   *
   * It is used after an organization reset has removed the selected
   * organization's transactional data and access relationships. At that
   * point an identity may be permanently removed only when nothing anywhere
   * else in DM3Oi still requires it.
   *
   * Any lookup failure is fail-closed.
   */
  const checks: DependencyCheck[] = [
    {
      label: "Another organization membership exists.",
      run: () =>
        admin
          .from("organization_members")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
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
      label: "Case history or responsibility exists.",
      run: async () => {
        const [cases, assignments, tasks, activity, responses] =
          await Promise.all([
            admin
              .from("cases")
              .select("id", { count: "exact", head: true })
              .or(
                `manager_user_id.eq.${userId},created_by_user_id.eq.${userId}`,
              ),
            admin
              .from("case_assignments")
              .select("id", { count: "exact", head: true })
              .or(
                `user_id.eq.${userId},assigned_by_user_id.eq.${userId}`,
              ),
            admin
              .from("case_tasks")
              .select("id", { count: "exact", head: true })
              .or(
                `assigned_user_id.eq.${userId},completed_by_user_id.eq.${userId},created_by_user_id.eq.${userId}`,
              ),
            admin
              .from("case_activity")
              .select("id", { count: "exact", head: true })
              .eq("actor_user_id", userId),
            admin
              .from("case_question_responses")
              .select("id", { count: "exact", head: true })
              .eq("responded_by_user_id", userId),
          ]);

        return {
          count:
            (cases.count ?? 0) +
            (assignments.count ?? 0) +
            (tasks.count ?? 0) +
            (activity.count ?? 0) +
            (responses.count ?? 0),
          error:
            cases.error ??
            assignments.error ??
            tasks.error ??
            activity.error ??
            responses.error,
        };
      },
    },
    {
      label: "Customer history exists.",
      run: () =>
        admin
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("created_by_user_id", userId),
    },
    {
      label: "Service Desk history or responsibility exists.",
      run: async () => {
        const [requests, activity, messages, communications] =
          await Promise.all([
            admin
              .from("service_requests")
              .select("id", { count: "exact", head: true })
              .or(
                `requester_user_id.eq.${userId},assigned_user_id.eq.${userId},created_by_user_id.eq.${userId}`,
              ),
            admin
              .from("service_request_activity")
              .select("id", { count: "exact", head: true })
              .eq("actor_user_id", userId),
            admin
              .from("service_request_messages")
              .select("id", { count: "exact", head: true })
              .eq("author_user_id", userId),
            admin
              .from("service_request_communications")
              .select("id", { count: "exact", head: true })
              .or(
                `actor_user_id.eq.${userId},recipient_user_id.eq.${userId}`,
              ),
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
      label: "Notification history exists.",
      run: () =>
        admin
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("recipient_user_id", userId),
    },
    {
      label: "Question configuration history exists.",
      run: () =>
        admin
          .from("question_definitions")
          .select("id", { count: "exact", head: true })
          .eq("created_by_user_id", userId),
    },
    {
      label: "Rule configuration history exists.",
      run: async () => {
        const [definitions, actions] = await Promise.all([
          admin
            .from("rule_definitions")
            .select("id", { count: "exact", head: true })
            .or(
              `created_by_user_id.eq.${userId},updated_by_user_id.eq.${userId}`,
            ),
          admin
            .from("rule_actions")
            .select("id", { count: "exact", head: true })
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
      label: "Organization configuration history exists.",
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
            .eq("updated_by", userId),
          admin
            .from("organization_lifecycle_statuses")
            .select("id", { count: "exact", head: true })
            .eq("updated_by", userId),
          admin
            .from("organization_role_permissions")
            .select("id", { count: "exact", head: true })
            .eq("updated_by", userId),
          admin
            .from("organization_licenses")
            .select("id", { count: "exact", head: true })
            .or(`created_by.eq.${userId},updated_by.eq.${userId}`),
          admin
            .from("organization_license_events")
            .select("id", { count: "exact", head: true })
            .eq("actor_user_id", userId),
        ]);

        const organizationConfigurationResults = [
          ["organization_settings", settings],
          ["organization_lifecycle_statuses", lifecycleStatuses],
          ["organization_role_permissions", rolePermissions],
          ["organization_licenses", licenses],
          ["organization_license_events", licenseEvents],
        ] as const;

        for (const [source, result] of organizationConfigurationResults) {
          if (result.error) {
            console.error(
              "Global identity deletion organization configuration lookup failed",
              {
                source,
                userId,
                code: "code" in result.error ? result.error.code : null,
                message: result.error.message,
                details: "details" in result.error ? result.error.details : null,
                hint: "hint" in result.error ? result.error.hint : null,
              },
            );
          }
        }

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
    {
      label: "Trial administration history exists.",
      run: async () => {
        const [history, requests] = await Promise.all([
          trialAdmin
            .from("trial_request_status_history")
            .select("id", { count: "exact", head: true })
            .eq("actor_user_id", userId),
          trialAdmin
            .from("trial_requests")
            .select("id", { count: "exact", head: true })
            .eq("qualification_reviewed_by", userId),
        ]);

        return {
          count: (history.count ?? 0) + (requests.count ?? 0),
          error: history.error ?? requests.error,
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
      console.error("Global identity deletion dependency lookup failed", {
        label,
        message: result.error.message,
        userId,
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
