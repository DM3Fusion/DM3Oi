"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin, getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, getInvitationRedirect } from "@/lib/supabase/admin";
import { isOrganizationUserRole } from "@/lib/data/user-provisioning";
import type { Database } from "@/types/database.generated";
import { hasPermission } from "@/lib/auth/permissions";
type Role = Database["public"]["Enums"]["application_role"];
const value = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const go = (path: string, key: string, message: string): never =>
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
const roleError = (m: string) =>
  m.includes("maximum active BUSINESS_OWNER")
    ? "This organization already has the maximum of 2 active Business Owners."
    : m.includes("maximum active BUSINESS_ADMIN")
      ? "This organization already has the maximum of 2 active Business Administrators."
      : m.includes("not authorized")
        ? "You are not authorized to create platform users."
        : "User provisioning could not be completed.";
function adminClient(path: string): ReturnType<typeof createAdminClient> {
  try {
    return createAdminClient();
  } catch {
    return go(path, "error", "User administration is not configured.");
  }
}
async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) return null;
    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email,
    );
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  return null;
}
async function requireActiveOrganization(
  session: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  path: string,
) {
  if (!organizationId) return;
  const { data, error } = await session
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error || !data) go(path, "error", "Select an active organization.");
}
export async function inviteUserAction(form: FormData) {
  await requireSuperAdmin();
  const email = value(form, "email").toLowerCase();
  const displayName = value(form, "displayName");
  const organizationId = value(form, "organizationId");
  const role = value(form, "role") as Role;
  const active = value(form, "active") !== "false";
  const sendInvitation = form.get("sendInvitation") === "on";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !displayName)
    go("/admin/users/new", "error", "Enter a valid email and display name.");
  if (organizationId && !isOrganizationUserRole(role))
    go("/admin/users/new", "error", "Select a valid organization role.");
  const session = await createClient();
  await requireActiveOrganization(session, organizationId, "/admin/users/new");
  const { data: existing } = await session
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    if (!organizationId)
      go(
        "/admin/users/new",
        "error",
        "A user with this email already exists. Select an organization to provision additional access.",
      );
    const { error } = await session.rpc("provision_organization_member", {
      target_organization_id: organizationId,
      target_email: email,
      target_role: role,
    });
    if (error) go("/admin/users/new", "error", roleError(error.message));
    revalidatePath("/admin/users");
    go(
      `/admin/users/${existing.id}`,
      "message",
      "Existing user access provisioned.",
    );
  }
  const admin = adminClient("/admin/users/new");
  const existingAuthUser = await findAuthUserByEmail(admin, email);
  if (existingAuthUser) {
    const { error: profileError } = await admin.from("profiles").upsert({
      id: existingAuthUser.id,
      email,
      display_name: displayName,
      is_active: active,
    });
    if (profileError) {
      console.error("Existing Auth profile preparation failed", {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
      });
      go(
        "/admin/users/new",
        "error",
        "The existing Auth identity could not be prepared for application access.",
      );
    }
    if (!organizationId)
      go(
        `/admin/users/${existingAuthUser.id}`,
        "message",
        "This user already existed; the missing application profile was prepared.",
      );
    const { error } = await session.rpc("provision_organization_member", {
      target_organization_id: organizationId,
      target_email: email,
      target_role: role,
    });
    if (error) go("/admin/users/new", "error", roleError(error.message));
    revalidatePath("/admin/users");
    go(
      `/admin/users/${existingAuthUser.id}`,
      "message",
      "Existing Auth user access provisioned.",
    );
  }
  const { data: invited, error: inviteError } = sendInvitation
    ? await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: getInvitationRedirect(),
        data: { display_name: displayName },
      })
    : await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });
  if (inviteError || !invited.user) {
    console.error("Auth user invitation failed", {
      message: inviteError?.message,
    });
    go(
      "/admin/users/new",
      "error",
      inviteError?.message.toLowerCase().includes("already")
        ? "A user with this email already exists."
        : "The invitation could not be sent.",
    );
  }
  const invitedUser = invited.user!;
  if (!invitedUser)
    go("/admin/users/new", "error", "The invitation could not be completed.");
  const userId = invitedUser.id;
  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email,
    display_name: displayName,
    is_active: active,
  });
  if (profileError) {
    console.error("Invited user profile preparation failed", {
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
    });
    await admin.auth.admin.deleteUser(userId);
    go(
      "/admin/users/new",
      "error",
      "The user profile could not be prepared; the invitation was rolled back.",
    );
  }
  if (organizationId) {
    const { error } = await session.rpc("provision_organization_member", {
      target_organization_id: organizationId,
      target_email: email,
      target_role: role,
    });
    if (error) {
      await admin.auth.admin.deleteUser(userId);
      go(
        "/admin/users/new",
        "error",
        `${roleError(error.message)} The invitation was rolled back.`,
      );
    }
  }
  revalidatePath("/");
  revalidatePath("/admin/users");
  redirect(
    `/admin/users/${userId}?message=${encodeURIComponent(sendInvitation ? "User invited." : "User created.")}`,
  );
}

export async function resendUserInviteAction(form: FormData) {
  const targetUserId = value(form, "userId");
  const organizationId = value(form, "organizationId");
  const access = await getAccessContext();
  if (!access?.user) return { ok: false, error: "You are not authorized to resend invitations." };
  const isPlatformAdmin = access.isSuperAdmin;
  const orgAdmin =
    access.activeOrganization?.id === organizationId &&
    hasPermission(access, "MANAGE_USERS");
  if (!isPlatformAdmin && !orgAdmin) return { ok: false, error: "You are not authorized to resend invitations." };
  const admin = adminClient("/admin/users");
  if (!isPlatformAdmin) {
    const session = await createClient();
    const [{ data: member }, { data: platformRole }] = await Promise.all([
      session.from("organization_members").select("id").eq("organization_id", organizationId).eq("user_id", targetUserId).maybeSingle(),
      admin.from("platform_user_roles").select("id").eq("user_id", targetUserId).eq("role", "SUPER_ADMIN").eq("is_active", true).maybeSingle(),
    ]);
    if (!member || platformRole) return { ok: false, error: "You are not authorized to resend invitations." };
  }
  const { data: target, error: lookupError } = await admin.auth.admin.getUserById(targetUserId);
  const targetUser = target?.user;
  if (lookupError || !targetUser?.email) return { ok: false, error: "The invitation could not be resent." };
  if (targetUser.email_confirmed_at || targetUser.last_sign_in_at) return { ok: false, error: "This user has already completed account activation." };
  const { error } = await admin.auth.admin.inviteUserByEmail(targetUser.email, { redirectTo: getInvitationRedirect(), data: targetUser.user_metadata });
  if (error) { console.error("Invitation resend failed", { code: error.code, message: error.message }); return { ok: false, error: "Unable to resend invitation." }; }
  return { ok: true };
}
export async function getInvitationEligibility(userId: string, organizationId?: string) {
  const access = await getAccessContext();
  const orgAdmin =
    access?.activeOrganization?.id === organizationId &&
    hasPermission(access, "MANAGE_USERS");
  if (!access?.user || (!access.isSuperAdmin && !orgAdmin)) return false;
  try {
    const admin = createAdminClient();
    if (!access.isSuperAdmin) {
      const session = await createClient();
      const [{ data: member }, { data: platformRole }] = await Promise.all([
        session.from("organization_members").select("id").eq("organization_id", organizationId!).eq("user_id", userId).maybeSingle(),
        admin.from("platform_user_roles").select("id").eq("user_id", userId).eq("role", "SUPER_ADMIN").eq("is_active", true).maybeSingle(),
      ]);
      if (!member || platformRole) return false;
    }
    const { data, error } = await admin.auth.admin.getUserById(userId);
    const user = data?.user;
    return !error && Boolean(user?.email) && !user?.email_confirmed_at && !user?.last_sign_in_at;
  } catch { return false; }
}
export async function updateUserProfileAction(form: FormData) {
  try { await requireSuperAdmin(); } catch { return { ok: false as const, error: "You are not authorized to edit user identities." }; }
  const userId = value(form, "userId");
  const email = value(form, "email").toLowerCase();
  if (!userId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false as const, error: "Enter a valid email address." };
  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch { return { ok: false as const, error: "User administration is not configured." }; }
  const { data: duplicate } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .neq("id", userId)
    .maybeSingle();
  if (duplicate)
    return { ok: false as const, error: "A user with this email already exists." };
  const { data: authUser, error: authError } =
    await admin.auth.admin.updateUserById(userId, { email });
  if (authError || !authUser.user) {
    console.error("Auth identity email update failed", {
      code: authError?.code,
      message: authError?.message,
      userId,
    });
    return { ok: false as const, error: authError?.message.toLowerCase().includes("already") ? "A user with this email already exists." : "The Auth email could not be updated." };
  }
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      display_name: value(form, "displayName"),
      email,
      is_active: value(form, "active") === "true",
    })
    .eq("id", userId);
  if (profileError) {
    console.error("Auth email updated but profile synchronization failed", {
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
      userId,
    });
    return { ok: false as const, error: "Auth email updated, but the application profile could not be synchronized. Contact support." };
  }
  revalidatePath("/admin/users");
  return { ok: true as const };
}
export async function addUserMembershipAction(form: FormData) {
  await requireSuperAdmin();
  const userId = value(form, "userId");
  const path = `/admin/users/${userId}`;
  const organizationId = value(form, "organizationId");
  const role = value(form, "role") as Role;
  if (!isOrganizationUserRole(role))
    go(path, "error", "Select a valid organization role.");
  const session = await createClient();
  await requireActiveOrganization(session, organizationId, path);
  const { data: profile, error: profileError } = await session
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();
  if (profileError || !profile?.email)
    go(path, "error", "The user profile has no provisionable email.");
  const profileEmail = profile!.email!;
  const { error } = await session.rpc("provision_organization_member", {
    target_organization_id: organizationId,
    target_email: profileEmail,
    target_role: role,
  });
  if (error) go(path, "error", roleError(error.message));
  revalidatePath(path);
  revalidatePath("/admin/users");
  go(path, "message", "Organization access provisioned.");
}
export async function updateUserMembershipAction(form: FormData) {
  await requireSuperAdmin();
  const userId = value(form, "userId");
  const path = `/admin/users/${userId}`;
  const role = value(form, "role") as Role;
  if (!isOrganizationUserRole(role))
    go(path, "error", "Select a valid organization role.");
  const session = await createClient();
  const { error } = await session.rpc("update_organization_membership", {
    target_membership_id: value(form, "membershipId"),
    target_role: role,
    target_active: value(form, "active") === "true",
  });
  if (error) go(path, "error", roleError(error.message));
  revalidatePath(path);
  revalidatePath("/admin/users");
  go(path, "message", "Membership updated.");
}
