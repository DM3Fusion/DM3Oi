import "server-only";
import { getAccessContext } from "@/lib/auth/context";
import {
  getEffectiveOrganizationPermissions,
  hasPermission,
  configurableOrganizationRoles,
  type OrganizationPermissionOverride,
} from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPlatformAdminUserIds } from "@/lib/data/platform-privacy";
import type {
  GuidedCasePriority,
  GuidedIntakeConfiguration,
} from "@/lib/guided-case-intake";
import type { Database } from "@/types/database.generated";

type Role = Database["public"]["Enums"]["application_role"];

export class GuidedCaseIntakeDataError extends Error {
  constructor(message = "Guided Case Intake is temporarily unavailable.") {
    super(message);
    this.name = "GuidedCaseIntakeDataError";
  }
}

const profileName = (profile: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}) =>
  profile.display_name ||
  [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
  profile.email ||
  "Organization member";

export async function loadGuidedCaseIntakeConfiguration(): Promise<{
  access: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>;
  configuration: GuidedIntakeConfiguration;
}> {
  const access = await getAccessContext();
  if (
    !access?.activeOrganization ||
    !hasPermission(access, "CREATE_CASE") ||
    !hasPermission(access, "VIEW_CUSTOMERS")
  ) {
    throw new GuidedCaseIntakeDataError("Guided Case Intake is not authorized.");
  }
  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  const admin = createAdminClient();
  const [
    customers,
    caseTitles,
    caseTypes,
    members,
    questions,
    options,
    rules,
    actions,
    settings,
    overrides,
    platformAdminIds,
  ] = await Promise.all([
    supabase
      .from("organization_customers")
      .select("id,customer_number,name")
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .order("name"),
    supabase
      .from("organization_case_titles")
      .select("id,label")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order")
      .order("label"),
    supabase
      .from("organization_case_types")
      .select("id,name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("organization_members")
      .select("user_id,role")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .eq("status", "ACTIVE"),
    supabase
      .from("organization_question_definitions")
      .select(
        "id,question_text,description,response_type,required,display_order",
      )
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("display_order"),
    supabase
      .from("question_options")
      .select("id,question_id,option_label,option_value,display_order,is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("display_order"),
    admin
      .from("rule_definitions")
      .select(
        "id,organization_id,name,source_question_id,condition_operator,condition_option_id,active",
      )
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("display_order"),
    admin
      .from("rule_actions")
      .select(
        "id,organization_id,rule_definition_id,action_type,target_question_id,task_title,task_description,task_priority,task_required,task_blocking",
      )
      .eq("organization_id", organizationId)
      .is("retired_at", null)
      .order("display_order"),
    admin
      .from("organization_settings")
      .select("default_priority")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    admin
      .from("organization_role_permissions")
      .select("role,permission,is_allowed")
      .eq("organization_id", organizationId),
    getPlatformAdminUserIds(),
  ]);
  const error =
    customers.error ??
    caseTitles.error ??
    caseTypes.error ??
    members.error ??
    questions.error ??
    options.error ??
    rules.error ??
    actions.error ??
    settings.error ??
    overrides.error;
  if (error) {
    console.error("Guided Case Intake configuration query failed", {
      organizationId,
      code: error.code,
      message: error.message,
    });
    throw new GuidedCaseIntakeDataError();
  }

  const memberRows = (members.data ?? []).filter(
    (member) => !platformAdminIds.has(member.user_id),
  );
  const profiles = memberRows.length
    ? await supabase
        .from("profiles")
        .select("id,display_name,first_name,last_name,email,is_active")
        .in(
          "id",
          memberRows.map((member) => member.user_id),
        )
        .eq("is_active", true)
    : { data: [], error: null };
  if (profiles.error) {
    console.error("Guided Case Intake staff query failed", {
      organizationId,
      code: profiles.error.code,
      message: profiles.error.message,
    });
    throw new GuidedCaseIntakeDataError();
  }
  const profileById = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile]),
  );
  const permissionOverrides: OrganizationPermissionOverride[] = (
    overrides.data ?? []
  ).flatMap((override) =>
    configurableOrganizationRoles.some((role) => role === override.role)
      ? [
          {
            role: override.role as OrganizationPermissionOverride["role"],
            permission:
              override.permission as OrganizationPermissionOverride["permission"],
            isAllowed: override.is_allowed,
          },
        ]
      : [],
  );
  const eligible = memberRows.flatMap((member) => {
    const profile = profileById.get(member.user_id);
    if (!profile) return [];
    return [
      {
        id: member.user_id,
        name: profileName(profile),
        role: member.role as Role,
      },
    ];
  });
  const canAssign = hasPermission(access, "ASSIGN_CASES");
  const defaultPriority = settings.data?.default_priority ?? "NORMAL";
  return {
    access,
    configuration: {
      organizationId,
      customers: (customers.data ?? []).map((customer) => ({
        id: customer.id,
        customerNumber: customer.customer_number,
        name: customer.name,
      })),
      caseTitles: caseTitles.data ?? [],
      caseTypes: caseTypes.data ?? [],
      managers: canAssign
        ? eligible
            .filter((member) =>
              getEffectiveOrganizationPermissions(
                member.role,
                permissionOverrides,
              ).has("ASSIGN_CASES"),
            )
            .map(({ id, name }) => ({ id, name }))
        : [],
      staff: canAssign
        ? eligible.map(({ id, name }) => ({ id, name }))
        : [],
      questions: (questions.data ?? []).map((question) => ({
        id: question.id,
        text: question.question_text,
        description: question.description,
        responseType: question.response_type,
        required: question.required,
        displayOrder: question.display_order,
        options: (options.data ?? [])
          .filter((option) => option.question_id === question.id)
          .map((option) => ({
            id: option.id,
            questionId: option.question_id,
            label: option.option_label,
            value: option.option_value,
            displayOrder: option.display_order,
          })),
      })),
      rules: rules.data ?? [],
      actions: actions.data ?? [],
      defaultPriority: defaultPriority as GuidedCasePriority,
      canViewCustomers: true,
      canCreateCustomer: hasPermission(access, "CREATE_CUSTOMER"),
      canAssign,
    },
  };
}
