"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { isOrganizationUserRole } from "@/lib/data/user-provisioning";
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
  if (!organizationId)
    return go(membershipId, "error", "You are not authorized to manage organization users.");
  if (!membershipId || !hasPermission(access, "MANAGE_USERS"))
    return go(membershipId, "error", "You are not authorized to manage organization users.");
  if (!isOrganizationUserRole(role))
    return go(membershipId, "error", "Select a valid organization role.");

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!membership) return go(membershipId, "error", "Organization user not found.");

  const { data: updated, error } = await supabase
    .from("organization_members")
    .update({ role, is_active: value(form, "active") === "true" })
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
