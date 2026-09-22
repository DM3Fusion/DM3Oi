"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { isOrganizationUserRole } from "@/lib/data/user-provisioning";
import { canConfigureOrganizationRole } from "@/lib/auth/organization-permissions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

type Role = Database["public"]["Enums"]["application_role"];
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const go = (membershipId: string, key: "message" | "error", message: string): never =>
  redirect(`/users/${membershipId}?${key}=${encodeURIComponent(message)}`);

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
    !isOrganizationUserRole(role) ||
    !isOrganizationUserRole(actorRole)
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
  const organizationActorRole = actorRole as
    | "BUSINESS_OWNER"
    | "BUSINESS_ADMIN"
    | "STAFF_MANAGER"
    | "STAFF_USER";

  if (
    !canConfigureOrganizationRole(
      organizationActorRole,
      targetRole,
      access.isSuperAdmin,
    ) ||
    !canConfigureOrganizationRole(
      organizationActorRole,
      nextRole,
      access.isSuperAdmin,
    )
  )
    return go(
      membershipId,
      "error",
      "You are not authorized to assign or modify this organization role.",
    );

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

  if (!membershipId)
    return go(membershipId, "error", "Organization user not found.");

  if (!["ACTIVATE", "SUSPEND", "REACTIVATE", "REVOKE"].includes(requestedAction))
    return go(membershipId, "error", "Select a valid lifecycle action.");

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
    .select("id,organization_id,role")
    .eq("id", membershipId)
    .eq("organization_id", access.activeOrganization.id)
    .maybeSingle();

  if (!membership)
    return go(membershipId, "error", "Organization user not found.");

  if (
    !isOrganizationUserRole(membership.role) ||
    !isOrganizationUserRole(access.activeOrganization.role)
  )
    return go(
      membershipId,
      "error",
      "You are not authorized to change this user's lifecycle state.",
    );

  const lifecycleTargetRole = membership.role as
    | "BUSINESS_OWNER"
    | "BUSINESS_ADMIN"
    | "STAFF_MANAGER"
    | "STAFF_USER";
  const lifecycleActorRole = access.activeOrganization.role as
    | "BUSINESS_OWNER"
    | "BUSINESS_ADMIN"
    | "STAFF_MANAGER"
    | "STAFF_USER";

  if (
    !canConfigureOrganizationRole(
      lifecycleActorRole,
      lifecycleTargetRole,
      access.isSuperAdmin,
    )
  )
    return go(
      membershipId,
      "error",
      "You are not authorized to change this user's lifecycle state.",
    );

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
      );

    if (error.message.toLowerCase().includes("not authorized"))
      return go(
        membershipId,
        "error",
        "You are not authorized to change this user's lifecycle state.",
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
  );
}
