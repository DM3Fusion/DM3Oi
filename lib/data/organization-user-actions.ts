"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { isOrganizationUserRole } from "@/lib/data/user-provisioning";
import { canConfigureOrganizationRole } from "@/lib/auth/organization-permissions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Role = Database["public"]["Enums"]["application_role"];
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const go = (membershipId: string, key: "message" | "error", message: string, returnTo?: string): never =>
  redirect(`${returnTo === "/users" ? "/users" : `/users/${membershipId}`}?${key}=${encodeURIComponent(message)}`);

export async function updateOrganizationMembershipAction(form: FormData) {
  const membershipId = value(form, "membershipId");
  const role = value(form, "role") as Role;
  const access = await getAccessContext();
  const organizationId = access?.activeOrganization?.id;
  if (!organizationId || !access?.activeOrganization)
    return go(membershipId, "error", "You are not authorized to manage organization users.");
  const actorRole = access.activeOrganization.role;
  if (!membershipId || !hasPermission(access, "MANAGE_USERS"))
    return go(membershipId, "error", "You are not authorized to manage organization users.");
  if (!isOrganizationUserRole(role))
    return go(membershipId, "error", "Select a valid organization role.");

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("organization_members")
    .select("id,role")
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!membership) return go(membershipId, "error", "Organization user not found.");
  if (
    !isOrganizationUserRole(membership.role) ||
    !isOrganizationUserRole(role)
  )
    return go(
      membershipId,
      "error",
      "You are not authorized to assign or modify this organization role.",
    );

  const targetRole = membership.role as
    | "BUSINESS_OWNER"
    | "BUSINESS_ADMIN"
    | "STAFF_MANAGER"
    | "STAFF_USER";
  const nextRole = role as
    | "BUSINESS_OWNER"
    | "BUSINESS_ADMIN"
    | "STAFF_MANAGER"
    | "STAFF_USER";

  if (!access.isSuperAdmin) {
    if (!isOrganizationUserRole(actorRole))
      return go(
        membershipId,
        "error",
        "You are not authorized to assign or modify this organization role.",
      );

    const organizationActorRole = actorRole as
      | "BUSINESS_OWNER"
      | "BUSINESS_ADMIN"
      | "STAFF_MANAGER"
      | "STAFF_USER";

    if (
      !canConfigureOrganizationRole(
        organizationActorRole,
        targetRole,
        false,
      ) ||
      !canConfigureOrganizationRole(
        organizationActorRole,
        nextRole,
        false,
      )
    )
      return go(
        membershipId,
        "error",
        "You are not authorized to assign or modify this organization role.",
      );
  }

  const { data: updated, error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();
  if (error || !updated)
    return go(membershipId, "error", "Organization access could not be updated.");
  revalidatePath("/users");
  revalidatePath(`/users/${membershipId}`);
  return go(membershipId, "message", "Organization access updated.");
}


export async function transitionOrganizationMembershipAction(form: FormData) {
  const membershipId = value(form, "membershipId");
  const requestedAction = value(form, "action").toUpperCase();
  const returnTo = value(form, "returnTo") === "/users" ? "/users" : undefined;

  if (!membershipId)
    return go(membershipId, "error", "Organization user not found.", returnTo);

  if (!["ACTIVATE", "SUSPEND", "REACTIVATE", "REVOKE"].includes(requestedAction))
    return go(membershipId, "error", "Select a valid lifecycle action.", returnTo);

  const access = await getAccessContext();
  if (
    !access?.activeOrganization ||
    !hasPermission(access, "MANAGE_USERS")
  )
    return go(
      membershipId,
      "error",
      "You are not authorized to manage organization users.",
      returnTo,
    );

  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id,organization_id,role")
    .eq("id", membershipId)
    .eq("organization_id", access.activeOrganization.id)
    .maybeSingle();

  if (!membership)
    return go(membershipId, "error", "Organization user not found.", returnTo);

  if (!isOrganizationUserRole(membership.role))
    return go(
      membershipId,
      "error",
      "You are not authorized to change this user's lifecycle state.",
      returnTo,
    );

  const lifecycleTargetRole = membership.role as
    | "BUSINESS_OWNER"
    | "BUSINESS_ADMIN"
    | "STAFF_MANAGER"
    | "STAFF_USER";

  if (!access.isSuperAdmin) {
    if (!isOrganizationUserRole(access.activeOrganization.role))
      return go(
        membershipId,
        "error",
        "You are not authorized to change this user's lifecycle state.",
        returnTo,
      );

    const lifecycleActorRole = access.activeOrganization.role as
      | "BUSINESS_OWNER"
      | "BUSINESS_ADMIN"
      | "STAFF_MANAGER"
      | "STAFF_USER";

    if (
      !canConfigureOrganizationRole(
        lifecycleActorRole,
        lifecycleTargetRole,
        false,
      )
    )
      return go(
        membershipId,
        "error",
        "You are not authorized to change this user's lifecycle state.",
        returnTo,
      );
  }

  const { error } = await supabase.rpc("transition_organization_membership", {
    target_membership_id: membershipId,
    target_action: requestedAction,
  });

  if (error) {
    if (error.message.includes("ACTIVE_OPERATIONAL_RESPONSIBILITY"))
      return go(
        membershipId,
        "error",
        "This user still has active operational responsibility. Reassign their open cases, tasks, case assignments, or service requests before revoking access.",
        returnTo,
      );

    if (error.message.toLowerCase().includes("not authorized"))
      return go(
        membershipId,
        "error",
        "You are not authorized to change this user's lifecycle state.",
        returnTo,
      );

    console.error("Organization membership lifecycle update failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      membershipId,
      requestedAction,
    });

    return go(
      membershipId,
      "error",
      "Organization access could not be updated.",
      returnTo,
    );
  }

  revalidatePath("/users");
  revalidatePath(`/users/${membershipId}`);

  const messages: Record<string, string> = {
    ACTIVATE: "Organization access activated.",
    SUSPEND: "Organization access suspended.",
    REACTIVATE: "Organization access reactivated.",
    REVOKE: "Organization access revoked.",
  };

  return go(
    membershipId,
    "message",
    messages[requestedAction] ?? "Organization access updated.",
    returnTo,
  );
}


export async function reassignOrganizationUserWorkAction(form: FormData) {
  const membershipId = value(form, "membershipId");
  const workType = value(form, "workType").toUpperCase();
  const replacementUserId = value(form, "replacementUserId");

  if (!membershipId)
    return go(membershipId, "error", "Organization user not found.");

  if (!["CASES", "TASKS", "SERVICE_REQUESTS"].includes(workType))
    return go(membershipId, "error", "Select a valid workload type.");

  if (!replacementUserId)
    return go(membershipId, "error", "Select an active user for reassignment.");

  const access = await getAccessContext();
  if (
    !access?.activeOrganization ||
    !hasPermission(access, "MANAGE_USERS")
  )
    return go(
      membershipId,
      "error",
      "You are not authorized to manage organization users.",
    );

  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id,user_id,organization_id,role,status")
    .eq("id", membershipId)
    .eq("organization_id", access.activeOrganization.id)
    .maybeSingle();

  if (!membership)
    return go(membershipId, "error", "Organization user not found.");

  if (membership.status !== "REVOKED")
    return go(
      membershipId,
      "error",
      "Work reassignment is available after organization access is revoked.",
    );

  if (
    !isOrganizationUserRole(membership.role) ||
    !isOrganizationUserRole(access.activeOrganization.role)
  )
    return go(
      membershipId,
      "error",
      "You are not authorized to reassign this user's work.",
    );

  const targetRole = membership.role as
    | "BUSINESS_OWNER"
    | "BUSINESS_ADMIN"
    | "STAFF_MANAGER"
    | "STAFF_USER";
  const actorRole = access.activeOrganization.role as
    | "BUSINESS_OWNER"
    | "BUSINESS_ADMIN"
    | "STAFF_MANAGER"
    | "STAFF_USER";

  if (
    !canConfigureOrganizationRole(
      actorRole,
      targetRole,
      access.isSuperAdmin,
    )
  )
    return go(
      membershipId,
      "error",
      "You are not authorized to reassign this user's work.",
    );

  if (replacementUserId === membership.user_id)
    return go(
      membershipId,
      "error",
      "Select a different active user for reassignment.",
    );

  const { data: replacement } = await supabase
    .from("organization_members")
    .select("id,user_id,status,is_active")
    .eq("organization_id", access.activeOrganization.id)
    .eq("user_id", replacementUserId)
    .eq("status", "ACTIVE")
    .eq("is_active", true)
    .maybeSingle();

  if (!replacement)
    return go(
      membershipId,
      "error",
      "Select a valid active organization user.",
    );

  const rpcClient = supabase as unknown as {
    rpc(
      fn: "reassign_revoked_member_work",
      args: {
        target_membership_id: string;
        target_work_type: string;
        replacement_user_id: string;
      },
    ): PromiseLike<{
      data: { affected?: number } | null;
      error: { message: string; code?: string } | null;
    }>;
  };

  const { data, error } = await rpcClient.rpc(
    "reassign_revoked_member_work",
    {
      target_membership_id: membershipId,
      target_work_type: workType,
      replacement_user_id: replacementUserId,
    },
  );

  if (error) {
    console.error("Revoked organization user workload reassignment failed", {
      code: error.code ?? null,
      message: error.message,
      membershipId,
      workType,
      replacementUserId,
    });

    if (
      error.message.includes("active organization user") ||
      error.message.includes("different active user")
    )
      return go(
        membershipId,
        "error",
        "Select a valid active organization user.",
      );

    if (error.message.toLowerCase().includes("not authorized"))
      return go(
        membershipId,
        "error",
        "You are not authorized to reassign this user's work.",
      );

    return go(
      membershipId,
      "error",
      "The selected workload could not be reassigned.",
    );
  }

  revalidatePath("/users");
  revalidatePath(`/users/${membershipId}`);
  revalidatePath("/cases");
  revalidatePath("/tasks");
  revalidatePath("/service-desk");
  revalidatePath("/communications");

  const labels: Record<string, string> = {
    CASES: "Case responsibility",
    TASKS: "Task responsibility",
    SERVICE_REQUESTS: "Service Request responsibility",
  };

  const affected =
    data && typeof data.affected === "number" ? data.affected : null;

  return go(
    membershipId,
    "message",
    affected === null
      ? `${labels[workType]} reassigned.`
      : `${labels[workType]} reassigned (${affected} ${affected === 1 ? "item" : "items"}).`,
  );
}
