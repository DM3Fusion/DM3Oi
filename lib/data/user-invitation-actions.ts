"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin, getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import {
  createAdminClient,
  getInvitationRedirect,
  getInvitationVerificationUrl,
} from "@/lib/supabase/admin";
import {
  assignableOrganizationUserRoles,
  isOrganizationUserRole,
  organizationInvitationMetadata,
  organizationRoleLimit,
  type OrganizationUserRole,
} from "@/lib/data/user-provisioning";
import type { Database } from "@/types/database.generated";
import type { User } from "@supabase/supabase-js";
import { canInviteOrganizationUsers, hasPermission } from "@/lib/auth/permissions";
import { resolvePendingInviteIdentityRepair } from "@/lib/data/pending-invite-identity";
import { sendOrganizationInvitationEmail } from "@/lib/data/organization-invitation-email-service";
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
async function authIdentityIsVerified(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return false;
  return Boolean(data.user.email_confirmed_at || data.user.last_sign_in_at);
}

async function requireActiveOrganization(
  session: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  path: string,
) {
  if (!organizationId) return null;
  const { data, error } = await session
    .from("organizations")
    .select("id,name")
    .eq("id", organizationId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error || !data) go(path, "error", "Select an active organization.");
  return data;
}
export async function inviteUserAction(form: FormData) {
  await requireSuperAdmin();
  const email = value(form, "email").toLowerCase();
  const title = value(form, "title").slice(0, 100);
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
  const invitationOrganization = await requireActiveOrganization(
    session,
    organizationId,
    "/admin/users/new",
  );
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
    const existingAdmin = adminClient("/admin/users/new");
    const identityVerified = await authIdentityIsVerified(
      existingAdmin,
      existing.id,
    );
    const { error } = await session.rpc("provision_organization_member", {
      target_organization_id: organizationId,
      target_email: email,
      target_role: role,
      target_identity_verified: identityVerified,
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
      title: title || null,
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
    const identityVerified = Boolean(
      existingAuthUser.email_confirmed_at || existingAuthUser.last_sign_in_at,
    );
    const { error } = await session.rpc("provision_organization_member", {
      target_organization_id: organizationId,
      target_email: email,
      target_role: role,
      target_identity_verified: identityVerified,
    });
    if (error) go("/admin/users/new", "error", roleError(error.message));
    revalidatePath("/admin/users");
    go(
      `/admin/users/${existingAuthUser.id}`,
      "message",
      "Existing Auth user access provisioned.",
    );
  }
  const organizationInvitationData = invitationOrganization
    ? organizationInvitationMetadata(
        { display_name: displayName, title: title || null },
        invitationOrganization.name,
      )
    : { display_name: displayName, title: title || null };
  const generatedOrganizationInvitation = Boolean(sendInvitation && invitationOrganization);
  let invitedUser: User | null = null;
  let invitationUrl: string | null = null;
  if (generatedOrganizationInvitation) {
    const generated = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo: getInvitationRedirect(),
          data: organizationInvitationData,
        },
      });
    if (
      generated.error ||
      !generated.data.user ||
      !generated.data.properties?.hashed_token ||
      generated.data.properties.verification_type !== "invite"
    ) {
      console.error("Auth user invitation link generation failed", {
        message: generated.error?.message,
      });
      go("/admin/users/new", "error", "The invitation could not be prepared.");
    }
    invitedUser = generated.data.user;
    invitationUrl = getInvitationVerificationUrl(generated.data.properties!);
  } else if (sendInvitation) {
    const invited = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: getInvitationRedirect(),
      data: organizationInvitationData,
    });
    if (invited.error || !invited.data.user) {
      console.error("Auth user invitation failed", { message: invited.error?.message });
      go(
        "/admin/users/new",
        "error",
        invited.error?.message.toLowerCase().includes("already")
          ? "A user with this email already exists."
          : "The invitation could not be sent.",
      );
    }
    invitedUser = invited.data.user;
  } else {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { display_name: displayName, title: title || null },
    });
    if (created.error || !created.data.user) {
      console.error("Auth user creation failed", { message: created.error?.message });
      go("/admin/users/new", "error", "The user could not be created.");
    }
    invitedUser = created.data.user;
  }
  if (!invitedUser)
    go("/admin/users/new", "error", "The invitation could not be completed.");
  const preparedUser = invitedUser!;
  const userId = preparedUser.id;
  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email,
    display_name: displayName,
    title: title || null,
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
    const identityVerified = Boolean(
      preparedUser.email_confirmed_at || preparedUser.last_sign_in_at,
    );
    const { error } = await session.rpc("provision_organization_member", {
      target_organization_id: organizationId,
      target_email: email,
      target_role: role,
      target_identity_verified: identityVerified,
    });
    if (error) {
      await admin.auth.admin.deleteUser(userId);
      go(
        "/admin/users/new",
        "error",
        `${roleError(error.message)} The invitation was rolled back.`,
      );
    }
    if (sendInvitation && invitationOrganization && invitationUrl) {
      const membership = await admin
        .from("organization_members")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (membership.error || !membership.data) {
        await admin.auth.admin.deleteUser(userId);
        go("/admin/users/new", "error", "The invitation could not be recorded.");
      }
      const membershipId = membership.data!.id;
      const delivery = await sendOrganizationInvitationEmail({
        resend: false,
        organizationId,
        organizationName: invitationOrganization.name,
        membershipId,
        recipientUserId: userId,
        recipientEmail: email,
        recipientFirstName: displayName.split(/\s+/)[0],
        recipientName: displayName,
        role,
        invitationUrl,
      });
      if (!delivery.ok) {
        console.error("Platform organization invitation delivery failed", {
          operation: "sendInvitation",
          organizationId,
          membershipId,
          code: delivery.errorCode,
        });
        await admin.auth.admin.deleteUser(userId);
        go("/admin/users/new", "error", "The invitation could not be sent.");
      }
    }
  }
  revalidatePath("/");
  revalidatePath("/admin/users");
  redirect(
    `/admin/users/${userId}?message=${encodeURIComponent(sendInvitation ? "User invited." : "User created.")}`,
  );
}

export async function inviteOrganizationUserAction(form: FormData) {
  const path = "/users/new";
  const access = await getAccessContext();
  const organization = access?.activeOrganization;
  if (
    !access?.user ||
    !organization ||
    !canInviteOrganizationUsers(access)
  )
    go(path, "error", "You are not authorized to invite organization users.");
  const activeOrganization = organization!;
  const actorUser = access!.user;

  const email = value(form, "email").toLowerCase();
  const title = value(form, "title").slice(0, 100);
  const firstName = value(form, "firstName");
  const lastName = value(form, "lastName");
  const displayName = `${firstName} ${lastName}`.trim();
  const role = value(form, "role") as OrganizationUserRole;
  if (
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    email.length > 320 ||
    !firstName ||
    !lastName ||
    firstName.length > 80 ||
    lastName.length > 80
  )
    go(path, "error", "Enter a valid first name, last name, and email address.");

  const session = await createClient();
  const { data: actorMembership } = await session
    .from("organization_members")
    .select("role")
    .eq("organization_id", activeOrganization.id)
    .eq("user_id", actorUser.id)
    .eq("is_active", true)
    .maybeSingle();
  if (
    !actorMembership ||
    (actorMembership.role !== "BUSINESS_OWNER" &&
      actorMembership.role !== "BUSINESS_ADMIN")
  )
    go(path, "error", "You are not authorized to invite organization users.");
  const actorRole = actorMembership!.role as OrganizationUserRole;

  const assignableRoles = assignableOrganizationUserRoles(actorRole);
  if (!isOrganizationUserRole(role) || !assignableRoles.includes(role))
    go(path, "error", "Select a role you are authorized to assign.");

  const limit = organizationRoleLimit(role);
  if (limit !== null) {
    const { count, error: countError } = await session
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", activeOrganization.id)
      .eq("role", role)
      .eq("is_active", true);
    if (countError)
      go(path, "error", "Organization role capacity could not be verified.");
    if ((count ?? 0) >= limit)
      go(
        path,
        "error",
        `This organization already has the maximum of ${limit} active ${role === "BUSINESS_OWNER" ? "Business Owners" : "Business Administrators"}.`,
      );
  }

  const admin = adminClient(path);
  const existingAuthUser = await findAuthUserByEmail(admin, email);
  let userId = existingAuthUser?.id;
  let createdUser = false;
  let invitationUrl: string | null = null;

  if (existingAuthUser) {
    const [{ data: platformRole }, { data: profile, error: profileLookupError }] =
      await Promise.all([
        admin
          .from("platform_user_roles")
          .select("id")
          .eq("user_id", existingAuthUser.id)
          .eq("role", "SUPER_ADMIN")
          .eq("is_active", true)
          .maybeSingle(),
        admin
          .from("profiles")
          .select("id,email,first_name,last_name,display_name,title,is_active")
          .eq("id", existingAuthUser.id)
          .maybeSingle(),
      ]);
    if (platformRole || profileLookupError || profile?.is_active === false)
      go(path, "error", "The invitation could not be completed for this user.");

    const resolvedFirstName =
      profile?.first_name?.trim() || firstName;
    const resolvedLastName =
      profile?.last_name?.trim() || lastName;
    const resolvedDisplayName =
      profile?.display_name?.trim() ||
      `${resolvedFirstName} ${resolvedLastName}`.trim() ||
      displayName;
    const resolvedTitle =
      profile?.title?.trim() || title || null;

    const { error: profileError } = await admin.from("profiles").upsert({
      id: existingAuthUser.id,
      email: profile?.email?.trim() || email,
      first_name: resolvedFirstName,
      last_name: resolvedLastName,
      display_name: resolvedDisplayName,
      title: resolvedTitle,
      is_active: true,
    });

    if (profileError)
      go(path, "error", "The invitation could not be completed for this user.");
  } else {
    const { data: invited, error: inviteError } =
      await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo: getInvitationRedirect(),
          data: {
            first_name: firstName,
            last_name: lastName,
            display_name: displayName,
            title: title || null,
            organization_name: activeOrganization.name,
          },
        },
      });
    if (
      inviteError ||
      !invited.user ||
      !invited.properties?.hashed_token ||
      invited.properties.verification_type !== "invite"
    ) {
      console.error("Organization user invitation link generation failed", {
        code: inviteError?.code,
        message: inviteError?.message,
      });
      go(path, "error", "The invitation could not be prepared.");
    }
    userId = invited.user!.id;
    invitationUrl = getInvitationVerificationUrl(invited.properties!);
    createdUser = true;
    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      title: title || null,
      is_active: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      go(
        path,
        "error",
        "The user profile could not be prepared; the invitation was rolled back.",
      );
    }
  }

  if (!userId) go(path, "error", "The invitation could not be completed.");
  const targetUserId = userId!;
  const { data: memberships, error: membershipLookupError } = await admin
    .from("organization_members")
    .select("id,organization_id,role,is_active,status,verified_at")
    .eq("user_id", targetUserId);

  if (membershipLookupError) {
    if (createdUser) await admin.auth.admin.deleteUser(targetUserId);
    go(path, "error", "The user's existing organization access could not be checked.");
  }

  const crossOrganizationMembership = memberships?.find(
    (membership) => membership.organization_id !== activeOrganization.id,
  );

  if (crossOrganizationMembership) {
    if (createdUser) await admin.auth.admin.deleteUser(targetUserId);
    go(
      path,
      "error",
      "This email address is already associated with another organization and cannot be added to this organization.",
    );
  }

  const priorMembership =
    memberships?.find(
      (membership) => membership.organization_id === activeOrganization.id,
    ) ?? null;
  if (priorMembership?.status === "ACTIVE") {
    if (createdUser) await admin.auth.admin.deleteUser(targetUserId);
    go(path, "error", "A user with this email already belongs to this organization.");
  }

  if (priorMembership?.status === "SUSPENDED") {
    if (createdUser) await admin.auth.admin.deleteUser(targetUserId);
    go(
      path,
      "error",
      "This user's organization access is suspended. Reactivate the existing membership instead of sending a new invitation.",
    );
  }

  if (priorMembership?.status === "REVOKED") {
    if (createdUser) await admin.auth.admin.deleteUser(targetUserId);
    go(
      path,
      "error",
      "This user's organization access was revoked. Only SUPER_ADMIN can reinstate the existing membership.",
    );
  }

  if (priorMembership?.status === "VERIFIED") {
    if (createdUser) await admin.auth.admin.deleteUser(targetUserId);
    go(
      path,
      "error",
      "This user has already verified the invitation and is waiting for administrator activation.",
    );
  }

  const identityVerified = Boolean(
    existingAuthUser?.email_confirmed_at || existingAuthUser?.last_sign_in_at,
  );

  const membershipResult = priorMembership
    ? await session
        .from("organization_members")
        .update({
          role,
          status: identityVerified ? "VERIFIED" : "INVITED",
          is_active: false,
          verified_at: identityVerified ? new Date().toISOString() : null,
          suspended_at: null,
          revoked_at: null,
        })
        .eq("id", priorMembership.id)
        .eq("organization_id", activeOrganization.id)
        .select("id")
        .maybeSingle()
    : await session
        .from("organization_members")
        .insert({
          organization_id: activeOrganization.id,
          user_id: targetUserId,
          role,
          status: identityVerified ? "VERIFIED" : "INVITED",
          is_active: false,
          verified_at: identityVerified ? new Date().toISOString() : null,
        })
        .select("id")
        .maybeSingle();
  if (membershipResult.error || !membershipResult.data) {
    if (createdUser) await admin.auth.admin.deleteUser(targetUserId);
    go(path, "error", roleError(membershipResult.error?.message ?? ""));
  }
  const membershipId = membershipResult.data!.id;

  if (
    existingAuthUser &&
    !existingAuthUser.email_confirmed_at &&
    !existingAuthUser.last_sign_in_at
  ) {
    const generated = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: getInvitationRedirect(),
        data: {
          ...organizationInvitationMetadata(
            existingAuthUser.user_metadata,
            activeOrganization.name,
          ),
          first_name:
            typeof existingAuthUser.user_metadata?.first_name === "string" &&
            existingAuthUser.user_metadata.first_name.trim()
              ? existingAuthUser.user_metadata.first_name
              : firstName,
          last_name:
            typeof existingAuthUser.user_metadata?.last_name === "string" &&
            existingAuthUser.user_metadata.last_name.trim()
              ? existingAuthUser.user_metadata.last_name
              : lastName,
          display_name:
            typeof existingAuthUser.user_metadata?.display_name === "string" &&
            existingAuthUser.user_metadata.display_name.trim()
              ? existingAuthUser.user_metadata.display_name
              : displayName,
          title:
            typeof existingAuthUser.user_metadata?.title === "string" &&
            existingAuthUser.user_metadata.title.trim()
              ? existingAuthUser.user_metadata.title
              : title || null,
        },
      },
    });
    if (
      generated.error ||
      !generated.data.properties?.hashed_token ||
      generated.data.properties.verification_type !== "invite"
    ) {
      if (priorMembership)
        await admin
          .from("organization_members")
          .update({
            role: priorMembership.role,
            status: priorMembership.status,
            is_active: priorMembership.is_active,
            verified_at: priorMembership.verified_at,
          })
          .eq("id", priorMembership.id)
          .eq("organization_id", activeOrganization.id);
      else
        await admin
          .from("organization_members")
          .delete()
          .eq("id", membershipId)
          .eq("organization_id", activeOrganization.id);
      console.error("Existing organization user invitation link generation failed", {
        code: generated.error?.code,
        message: generated.error?.message,
      });
      go(path, "error", "The invitation could not be prepared.");
    }
    invitationUrl = getInvitationVerificationUrl(generated.data.properties!);
  }

  let invitationTransportSent = false;
  if (invitationUrl) {
    const delivery = await sendOrganizationInvitationEmail({
      resend: Boolean(existingAuthUser),
      organizationId: activeOrganization.id,
      organizationName: activeOrganization.name,
      membershipId,
      recipientUserId: targetUserId,
      recipientEmail: email,
      recipientFirstName: firstName,
      recipientName: displayName,
      role,
      invitationUrl,
    });
    if (!delivery.ok) {
      console.error("Organization user invitation delivery failed", {
        operation: existingAuthUser ? "resendInvitation" : "sendInvitation",
        organizationId: activeOrganization.id,
        membershipId,
        code: delivery.errorCode,
      });
      if (createdUser) await admin.auth.admin.deleteUser(targetUserId);
      else if (priorMembership)
        await admin
          .from("organization_members")
          .update({
            role: priorMembership.role,
            status: priorMembership.status,
            is_active: priorMembership.is_active,
            verified_at: priorMembership.verified_at,
          })
          .eq("id", membershipId);
      else
        await admin
          .from("organization_members")
          .delete()
          .eq("id", membershipId)
          .eq("organization_id", activeOrganization.id);
      go(path, "error", "The invitation could not be sent.");
    }
    invitationTransportSent = delivery.transport === "SENT";
  }

  const { error: membershipEventError } = await session.rpc(
    "record_organization_membership_invitation_event",
    {
      target_membership_id: membershipId,
      target_event_type: identityVerified ? "VERIFIED" : "INVITED",
    },
  );
  if (membershipEventError) {
    console.error("Organization membership invitation audit failed", {
      code: membershipEventError.code,
      message: membershipEventError.message,
      membershipId,
    });
    if (!invitationTransportSent) {
      if (createdUser) await admin.auth.admin.deleteUser(targetUserId);
      else if (priorMembership)
        await admin
          .from("organization_members")
          .update({
            role: priorMembership.role,
            status: priorMembership.status,
            is_active: priorMembership.is_active,
            verified_at: priorMembership.verified_at,
          })
          .eq("id", membershipId);
      else
        await admin
          .from("organization_members")
          .delete()
          .eq("id", membershipId)
          .eq("organization_id", activeOrganization.id);
      go(path, "error", "The invitation could not be recorded.");
    }
    // SMTP acceptance is authoritative. Never invalidate an emailed link or
    // roll back its membership because a later audit write failed.
  }

  revalidatePath("/users");
  redirect(
    `/users?message=${encodeURIComponent(existingAuthUser?.email_confirmed_at || existingAuthUser?.last_sign_in_at ? "Organization access added." : "Invitation sent.")}`,
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
  let membership: { id: string; status: string; role: string } | null = null;
  let organizationName: string | null = null;
  if (organizationId) {
    const session = await createClient();
    const [{ data: member }, { data: platformRole }, { data: organization }] = await Promise.all([
      session.from("organization_members").select("id,status,role").eq("organization_id", organizationId).eq("user_id", targetUserId).maybeSingle(),
      admin.from("platform_user_roles").select("id").eq("user_id", targetUserId).eq("role", "SUPER_ADMIN").eq("is_active", true).maybeSingle(),
      session.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    ]);
    if (!member || !organization || member.status !== "INVITED" || (!isPlatformAdmin && platformRole))
      return { ok: false, error: "Only pending invitations can be resent." };
    membership = member;
    organizationName = organization.name;
  }
  const { data: target, error: lookupError } = await admin.auth.admin.getUserById(targetUserId);
  const targetUser = target?.user;
  if (lookupError || !targetUser?.email) return { ok: false, error: "The invitation could not be resent." };
  if (!organizationId && (targetUser.email_confirmed_at || targetUser.last_sign_in_at))
    return { ok: false, error: "This user has already completed account activation." };
  if (organizationId && membership && organizationName) {
    const { data: profile, error: profileLookupError } = await admin
      .from("profiles")
      .select("email,first_name,last_name,display_name,title")
      .eq("id", targetUserId)
      .maybeSingle();
    if (profileLookupError)
      return { ok: false, error: "The invitation identity could not be checked." };
    const repair = resolvePendingInviteIdentityRepair({
      profile,
      authEmail: targetUser.email,
      userMetadata: targetUser.user_metadata,
    });
    if (repair) {
      const repaired = await admin.from("profiles").upsert({ id: targetUserId, ...repair });
      if (repaired.error) {
        console.error("Pending invitation identity repair failed", {
          operation: "repairPendingInviteIdentity",
          organizationId,
          targetUserId,
          code: repaired.error.code,
          message: repaired.error.message,
        });
        return { ok: false, error: "The invitation identity could not be repaired." };
      }
    }
    const resendData = organizationInvitationMetadata(
      targetUser.user_metadata,
      organizationName,
    );
    const generated = await admin.auth.admin.generateLink({
      type: "invite",
      email: targetUser.email,
      options: { redirectTo: getInvitationRedirect(), data: resendData },
    });
    if (
      generated.error ||
      !generated.data.properties?.hashed_token ||
      generated.data.properties.verification_type !== "invite"
    ) {
      console.error("Invitation resend link generation failed", {
        code: generated.error?.code,
        message: generated.error?.message,
      });
      return { ok: false, error: "Unable to resend invitation." };
    }
    const firstName = repair?.first_name ?? profile?.first_name ?? "";
    const lastName = repair?.last_name ?? profile?.last_name ?? "";
    const recipientName = (
      repair?.display_name ??
      profile?.display_name ??
      `${firstName} ${lastName}`.trim()
    ) || targetUser.email;
    const delivery = await sendOrganizationInvitationEmail({
      resend: true,
      organizationId,
      organizationName,
      membershipId: membership.id,
      recipientUserId: targetUserId,
      recipientEmail: targetUser.email,
      recipientFirstName: firstName || recipientName,
      recipientName,
      role: membership.role,
      invitationUrl: getInvitationVerificationUrl(generated.data.properties),
    });
    if (!delivery.ok) {
      console.error("Invitation resend delivery failed", {
        operation: "resendInvitation",
        organizationId,
        targetUserId,
        code: delivery.errorCode,
      });
      return { ok: false, error: "Unable to resend invitation." };
    }
  } else {
    const { error } = await admin.auth.admin.inviteUserByEmail(targetUser.email, {
      redirectTo: getInvitationRedirect(),
      data: targetUser.user_metadata,
    });
    if (error) {
      console.error("Invitation resend failed", { code: error.code, message: error.message });
      return { ok: false, error: "Unable to resend invitation." };
    }
  }

  if (organizationId) {
    const session = await createClient();
    const { error: eventError } = await session.rpc(
      "record_organization_membership_invitation_event",
      {
        target_membership_id: membership!.id,
        target_event_type: "INVITATION_RESENT",
      },
    );

    if (eventError) {
      console.error("Invitation resend audit failed", {
        code: eventError.code,
        message: eventError.message,
        membershipId: membership!.id,
      });
      return { ok: false, error: "The invitation was sent, but its audit event could not be recorded." };
    }
  }

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
    if (organizationId) {
      const session = await createClient();
      const [{ data: member }, { data: platformRole }] = await Promise.all([
        session.from("organization_members").select("id,status").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
        admin.from("platform_user_roles").select("id").eq("user_id", userId).eq("role", "SUPER_ADMIN").eq("is_active", true).maybeSingle(),
      ]);
      if (!member || member.status !== "INVITED" || (!access.isSuperAdmin && platformRole)) return false;
      const { data, error } = await admin.auth.admin.getUserById(userId);
      return !error && Boolean(data?.user?.email);
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
    .upsert({
      id: userId,
      display_name: value(form, "displayName"),
      title: value(form, "title").slice(0, 100) || null,
      email,
      is_active: value(form, "active") === "true",
    });
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
  const admin = adminClient(path);
  const identityVerified = await authIdentityIsVerified(admin, userId);
  const { error } = await session.rpc("provision_organization_member", {
    target_organization_id: organizationId,
    target_email: profileEmail,
    target_role: role,
    target_identity_verified: identityVerified,
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
  const membershipId = value(form, "membershipId");
  const session = await createClient();
  const { data: membership, error: membershipError } = await session
    .from("organization_members")
    .select("id,is_active")
    .eq("id", membershipId)
    .single();

  if (membershipError || !membership)
    go(path, "error", "Organization membership could not be found.");

  const currentMembership = membership!;

  const { error } = await session.rpc("update_organization_membership", {
    target_membership_id: membershipId,
    target_role: role,
    target_active: currentMembership.is_active,
  });
  if (error) go(path, "error", roleError(error.message));
  revalidatePath(path);
  revalidatePath("/admin/users");
  go(path, "message", "Membership updated.");
}

export async function transitionUserMembershipAction(form: FormData) {
  await requireSuperAdmin();

  const userId = value(form, "userId");
  const membershipId = value(form, "membershipId");
  const requestedAction = value(form, "action").toUpperCase();
  const path = `/admin/users/${userId}`;

  if (
    !membershipId ||
    !["ACTIVATE", "SUSPEND", "REACTIVATE", "REVOKE", "REINSTATE"].includes(
      requestedAction,
    )
  )
    go(path, "error", "Select a valid lifecycle action.");

  const session = await createClient();
  const { error } = await session.rpc("transition_organization_membership", {
    target_membership_id: membershipId,
    target_action: requestedAction,
  });

  if (error) {
    if (error.message.includes("ACTIVE_OPERATIONAL_RESPONSIBILITY"))
      go(
        path,
        "error",
        "This user still has active operational responsibility. Reassign their open cases, tasks, case assignments, or service requests before revoking access.",
      );

    console.error("SUPER_ADMIN membership lifecycle update failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      membershipId,
      requestedAction,
    });

    go(path, "error", "Organization membership lifecycle could not be updated.");
  }

  revalidatePath(path);
  revalidatePath("/admin/users");
  revalidatePath("/admin/organizations");

  const messages: Record<string, string> = {
    ACTIVATE: "Organization access activated.",
    SUSPEND: "Organization access suspended.",
    REACTIVATE: "Organization access reactivated.",
    REVOKE: "Organization access revoked.",
    REINSTATE: "Organization access reinstated.",
  };

  go(path, "message", messages[requestedAction] ?? "Membership updated.");
}
