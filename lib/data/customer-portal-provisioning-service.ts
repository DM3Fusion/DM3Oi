import "server-only";
import type { User } from "@supabase/supabase-js";
import { getIdentityCategory } from "@/lib/auth/identity-category";
import type { CustomerPortalOnboardingStatus } from "@/lib/customer-portal-onboarding";
import {
  canReuseCustomerPortalStatus,
  customerPortalRelationFailureMessage,
  isUsableCustomerPortalEmail,
  type CustomerPortalProvisioningIntent,
} from "@/lib/customer-portal-provisioning";
import { customerPortalInvitationMetadata } from "@/lib/data/customer-portal-invitation-metadata";
import { sendCustomerPortalInvitationEmail } from "@/lib/data/customer-portal-invitation-email-service";
import { createAdminClient, getInvitationRedirect } from "@/lib/supabase/admin";

export class CustomerPortalProvisioningError extends Error {
  constructor(public readonly safeMessage: string) {
    super(safeMessage);
    this.name = "CustomerPortalProvisioningError";
  }
}

async function authUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<User | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      console.error("Customer Portal Auth lookup failed", {
        operation: "authUserByEmail",
        code: error.code,
        message: error.message,
      });
      throw new CustomerPortalProvisioningError(
        "The customer identity could not be checked.",
      );
    }
    const found = data.users.find(
      (user) => user.email?.trim().toLowerCase() === email,
    );
    if (found || data.users.length < 1000) return found ?? null;
  }
  return null;
}

const unavailable = (
  customerId: string,
  recipientEmail: string | null,
  reason: string,
): CustomerPortalOnboardingStatus => ({
  state: "UNAVAILABLE",
  customerId,
  recipientEmail,
  invitationId: null,
  lastSentAt: null,
  sendCount: 0,
  reason,
});

export async function getCustomerPortalOnboardingStatus(input: {
  organizationId: string;
  customerId: string;
  actorUserId?: string;
}): Promise<CustomerPortalOnboardingStatus> {
  const admin = createAdminClient();
  const [organizationResult, customerResult, settingsResult, linksResult] =
    await Promise.all([
      admin
        .from("organizations")
        .select("id,status")
        .eq("id", input.organizationId)
        .maybeSingle(),
      admin
        .from("customers")
        .select("id,email,status")
        .eq("organization_id", input.organizationId)
        .eq("id", input.customerId)
        .maybeSingle(),
      admin
        .from("organization_settings")
        .select("portal_enabled")
        .eq("organization_id", input.organizationId)
        .maybeSingle(),
      admin
        .from("customer_portal_users")
        .select("id,user_id,is_active")
        .eq("organization_id", input.organizationId)
        .eq("customer_id", input.customerId)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1),
    ]);

  const queryError =
    organizationResult.error ??
    customerResult.error ??
    settingsResult.error ??
    linksResult.error;
  if (queryError) {
    console.error("Customer Portal onboarding status query failed", {
      operation: "getCustomerPortalOnboardingStatus",
      organizationId: input.organizationId,
      customerId: input.customerId,
      code: queryError.code,
      message: queryError.message,
    });
    return unavailable(
      input.customerId,
      null,
      "Portal status is temporarily unavailable.",
    );
  }

  const customer = customerResult.data;
  const email = customer?.email?.trim().toLowerCase() ?? null;
  if (!organizationResult.data || organizationResult.data.status !== "ACTIVE")
    return unavailable(input.customerId, email, "This organization is inactive.");
  if (!customer || customer.status !== "ACTIVE")
    return unavailable(input.customerId, email, "This Customer is inactive.");
  if (settingsResult.data?.portal_enabled === false)
    return unavailable(
      input.customerId,
      email,
      "Customer Portal is disabled for this organization.",
    );
  if (!email || !isUsableCustomerPortalEmail(email))
    return unavailable(
      input.customerId,
      email,
      "Add a valid Customer email before inviting.",
    );

  const link = linksResult.data?.[0];
  if (!link) {
    const authUser = await authUserByEmail(admin, email);
    if (authUser && (await getIdentityCategory(authUser.id)) === "INTERNAL")
      return unavailable(
        input.customerId,
        email,
        "This email belongs to an internal DM3Oi user.",
      );
    return {
      state: "NOT_CONFIGURED",
      customerId: input.customerId,
      recipientEmail: email,
      invitationId: null,
      lastSentAt: null,
      sendCount: 0,
      reason: null,
    };
  }
  if (!link.is_active)
    return unavailable(
      input.customerId,
      email,
      "Portal access is disabled for this Customer.",
    );

  const [profileResult, authResult, invitationResult] = await Promise.all([
    admin.from("profiles").select("is_active").eq("id", link.user_id).maybeSingle(),
    admin.auth.admin.getUserById(link.user_id),
    admin
      .from("customer_portal_invitations")
      .select("id,recipient_email,status,last_sent_at,send_count,activated_at")
      .eq("organization_id", input.organizationId)
      .eq("customer_id", input.customerId)
      .eq("user_id", link.user_id)
      .eq("recipient_email", email)
      .order("last_sent_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (profileResult.error || authResult.error || invitationResult.error) {
    const error = profileResult.error ?? authResult.error ?? invitationResult.error;
    console.error("Customer Portal onboarding identity query failed", {
      operation: "getCustomerPortalOnboardingStatus.identity",
      organizationId: input.organizationId,
      customerId: input.customerId,
      code: error?.code,
      message: error?.message,
    });
    return unavailable(
      input.customerId,
      email,
      "Portal status is temporarily unavailable.",
    );
  }
  if (profileResult.data?.is_active !== true)
    return unavailable(
      input.customerId,
      email,
      "Portal identity is inactive and requires platform administration.",
    );
  const authUser = authResult.data.user;
  if (!authUser || authUser.email?.trim().toLowerCase() !== email)
    return unavailable(
      input.customerId,
      email,
      "The Customer email no longer matches the Portal identity.",
    );

  const invitation = invitationResult.data;
  if (authUser.email_confirmed_at || authUser.last_sign_in_at) {
    if (invitation && invitation.status !== "ACTIVATED") {
      const now = new Date().toISOString();
      const reconciliation = await admin
        .from("customer_portal_invitations")
        .update({
          status: "ACTIVATED",
          activated_at: invitation.activated_at ?? now,
          updated_by_user_id: input.actorUserId,
        })
        .eq("id", invitation.id)
        .eq("organization_id", input.organizationId)
        .eq("customer_id", input.customerId);
      if (reconciliation.error)
        console.error("Customer Portal activation reconciliation failed", {
          operation: "reconcileActivation",
          organizationId: input.organizationId,
          customerId: input.customerId,
          code: reconciliation.error.code,
          message: reconciliation.error.message,
        });
    }
    return {
      state: "ACTIVE",
      customerId: input.customerId,
      recipientEmail: email,
      invitationId: invitation?.id ?? null,
      lastSentAt: invitation?.last_sent_at ?? null,
      sendCount: invitation?.send_count ?? 0,
      reason: null,
    };
  }
  if (invitation?.status === "SENT" && invitation.last_sent_at) {
    return {
      state: "INVITATION_SENT",
      customerId: input.customerId,
      recipientEmail: email,
      invitationId: invitation.id,
      lastSentAt: invitation.last_sent_at,
      sendCount: invitation.send_count,
      reason: null,
    };
  }
  return {
    state: "NOT_CONFIGURED",
    customerId: input.customerId,
    recipientEmail: email,
    invitationId: invitation?.id ?? null,
    lastSentAt: invitation?.last_sent_at ?? null,
    sendCount: invitation?.send_count ?? 0,
    reason:
      invitation?.status === "FAILED"
        ? "The last invitation could not be delivered. Try again."
        : null,
  };
}

export async function provisionCustomerPortalAccess(input: {
  organizationId: string;
  organizationName: string;
  customerId: string;
  actorUserId: string;
  intent: CustomerPortalProvisioningIntent;
}): Promise<CustomerPortalOnboardingStatus> {
  const admin = createAdminClient();
  const { data: customer, error: customerError } = await admin
    .from("customers")
    .select("id,name,first_name,email,status")
    .eq("organization_id", input.organizationId)
    .eq("id", input.customerId)
    .maybeSingle();
  if (customerError || !customer)
    throw new CustomerPortalProvisioningError("Customer not found.");
  const email = customer.email?.trim().toLowerCase() ?? "";
  if (customer.status !== "ACTIVE")
    throw new CustomerPortalProvisioningError("This Customer is inactive.");
  if (!isUsableCustomerPortalEmail(email))
    throw new CustomerPortalProvisioningError(
      "Add a valid Customer email before enabling Portal Access.",
    );

  const { data: settings, error: settingsError } = await admin
    .from("organization_settings")
    .select("portal_enabled")
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (settingsError || settings?.portal_enabled === false)
    throw new CustomerPortalProvisioningError(
      "Customer Portal is disabled for this organization.",
    );

  const currentStatus = await getCustomerPortalOnboardingStatus({
    organizationId: input.organizationId,
    customerId: input.customerId,
    actorUserId: input.actorUserId,
  });
  if (canReuseCustomerPortalStatus(input.intent, currentStatus))
    return currentStatus;

  const { data: links, error: linkError } = await admin
    .from("customer_portal_users")
    .select("id,user_id,is_active")
    .eq("organization_id", input.organizationId)
    .eq("customer_id", input.customerId)
    .order("is_active", { ascending: false })
    .limit(1);
  if (linkError)
    throw new CustomerPortalProvisioningError(
      "Portal access could not be checked.",
    );
  const linked = links?.[0];
  let authUser = linked
    ? (await admin.auth.admin.getUserById(linked.user_id)).data.user
    : null;
  if (
    authUser &&
    authUser.email?.trim().toLowerCase() !== email
  ) {
    // A Customer email change invalidates the old identity for onboarding. An
    // explicit send may provision the new address, but never silently relinks it.
    authUser = await authUserByEmail(admin, email);
  }
  if (!authUser) authUser = await authUserByEmail(admin, email);

  if (authUser) {
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("is_active")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profileError)
      throw new CustomerPortalProvisioningError(
        "The customer identity could not be checked.",
      );
    if (profile?.is_active === false)
      throw new CustomerPortalProvisioningError(
        "This identity is globally inactive. A platform administrator must reactivate it before Portal Access can be enabled.",
      );
    if (authUser.id !== linked?.user_id) {
      if ((await getIdentityCategory(authUser.id)) === "INTERNAL")
        throw new CustomerPortalProvisioningError(
          "This email belongs to an internal DM3Oi user and cannot be used for Customer Portal access.",
        );
      const collision = await admin
        .from("organization_members")
        .select("id")
        .eq("organization_id", input.organizationId)
        .eq("is_active", true)
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (collision.data)
        throw new CustomerPortalProvisioningError(
          "This email belongs to an internal organization user and cannot be provisioned as Customer Portal access.",
        );
    }
  }

  let invitationUrl: string | null = null;
  const shouldGenerate =
    !authUser ||
    (input.intent !== "ENABLE" &&
      !authUser.email_confirmed_at &&
      !authUser.last_sign_in_at);
  if (shouldGenerate) {
    const generated = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: getInvitationRedirect(),
        data: customerPortalInvitationMetadata(
          authUser?.user_metadata,
          input.organizationName,
        ),
      },
    });
    if (
      generated.error ||
      !generated.data.user ||
      !generated.data.properties?.action_link
    ) {
      console.error("Customer Portal invitation link generation failed", {
        operation: "generateInvitationLink",
        organizationId: input.organizationId,
        customerId: input.customerId,
        code: generated.error?.code ?? "INVITATION_LINK_UNAVAILABLE",
        message: generated.error?.message,
      });
      throw new CustomerPortalProvisioningError(
        "The Customer Portal invitation could not be prepared.",
      );
    }
    authUser = generated.data.user;
    invitationUrl = generated.data.properties.action_link;
  }
  if (!authUser)
    throw new CustomerPortalProvisioningError(
      "The customer identity could not be prepared.",
    );

  const profile = await admin.from("profiles").upsert({
    id: authUser.id,
    email,
    display_name: authUser.user_metadata?.display_name ?? email,
  });
  if (profile.error) {
    console.error("Customer Portal profile provisioning failed", {
      operation: "provisionProfile",
      code: profile.error.code,
      message: profile.error.message,
    });
    throw new CustomerPortalProvisioningError(
      "The customer identity could not be prepared.",
    );
  }
  const existingLink =
    linked?.user_id === authUser.id
      ? linked
      : (
          await admin
            .from("customer_portal_users")
            .select("id,user_id,is_active")
            .eq("organization_id", input.organizationId)
            .eq("customer_id", input.customerId)
            .eq("user_id", authUser.id)
            .maybeSingle()
        ).data;
  const relation = await admin.from("customer_portal_users").upsert(
    {
      organization_id: input.organizationId,
      customer_id: input.customerId,
      user_id: authUser.id,
      is_active: true,
    },
    { onConflict: "organization_id,customer_id,user_id" },
  );
  if (relation.error) {
    console.error("Customer Portal relation provisioning failed", {
      operation: existingLink ? "reactivatePortalRelation" : "linkPortalIdentity",
      organizationId: input.organizationId,
      customerId: input.customerId,
      code: relation.error.code,
      message: relation.error.message,
    });
    throw new CustomerPortalProvisioningError(
      customerPortalRelationFailureMessage(relation.error),
    );
  }

  if (invitationUrl) {
    const { data: prior, error: priorError } = await admin
      .from("customer_portal_invitations")
      .select("id,send_count,sent_at")
      .eq("organization_id", input.organizationId)
      .eq("customer_id", input.customerId)
      .eq("user_id", authUser.id)
      .eq("recipient_email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (priorError) {
      console.error("Customer Portal invitation lifecycle lookup failed", {
        operation: "lookupInvitationLifecycle",
        organizationId: input.organizationId,
        customerId: input.customerId,
        code: priorError.code,
        message: priorError.message,
      });
      throw new CustomerPortalProvisioningError(
        "The invitation lifecycle could not be checked. Refresh and try again.",
      );
    }
    const pendingValues = {
      organization_id: input.organizationId,
      customer_id: input.customerId,
      user_id: authUser.id,
      recipient_email: email,
      status: "PENDING",
      updated_by_user_id: input.actorUserId,
    };
    let pending = prior
      ? await admin
          .from("customer_portal_invitations")
          .update(pendingValues)
          .eq("id", prior.id)
          .select("id,send_count,sent_at")
          .single()
      : await admin
          .from("customer_portal_invitations")
          .insert({ ...pendingValues, created_by_user_id: input.actorUserId })
          .select("id,send_count,sent_at")
          .single();
    if (!prior && pending.error?.code === "23505") {
      const concurrent = await admin
        .from("customer_portal_invitations")
        .update(pendingValues)
        .eq("organization_id", input.organizationId)
        .eq("customer_id", input.customerId)
        .eq("user_id", authUser.id)
        .eq("recipient_email", email)
        .select("id,send_count,sent_at")
        .single();
      pending = concurrent;
    }
    if (pending.error || !pending.data)
      throw new CustomerPortalProvisioningError(
        "The invitation lifecycle could not be recorded.",
      );

    const delivery = await sendCustomerPortalInvitationEmail({
      recipientEmail: email,
      recipientName:
        customer.name?.trim() ||
        customer.first_name?.trim() ||
        "Customer",
      recipientUserId: authUser.id,
      organizationName: input.organizationName,
      organizationId: input.organizationId,
      customerId: input.customerId,
      invitationUrl,
    });
    const now = new Date().toISOString();
    const lifecycle = delivery.ok
      ? await admin
          .from("customer_portal_invitations")
          .update({
            status: "SENT",
            sent_at: pending.data.sent_at ?? now,
            last_sent_at: now,
            send_count: pending.data.send_count + 1,
            updated_by_user_id: input.actorUserId,
          })
          .eq("id", pending.data.id)
      : await admin
          .from("customer_portal_invitations")
          .update({
            status: "FAILED",
            updated_by_user_id: input.actorUserId,
          })
          .eq("id", pending.data.id);
    if (lifecycle.error)
      console.error("Customer Portal invitation lifecycle update failed", {
        operation: delivery.ok ? "markInvitationSent" : "markInvitationFailed",
        organizationId: input.organizationId,
        customerId: input.customerId,
        code: lifecycle.error.code,
        message: lifecycle.error.message,
      });
    if (delivery.ok && lifecycle.error)
      throw new CustomerPortalProvisioningError(
        "The invitation was sent, but its status could not be confirmed. Refresh before trying again.",
      );
    if (!delivery.ok) {
      console.error("Customer Portal invitation email delivery failed", {
        operation: "deliverInvitation",
        organizationId: input.organizationId,
        customerId: input.customerId,
        code: delivery.errorCode,
      });
      throw new CustomerPortalProvisioningError(
        "Customer Portal access was prepared, but the invitation email could not be sent.",
      );
    }
  }

  const status = await getCustomerPortalOnboardingStatus({
    organizationId: input.organizationId,
    customerId: input.customerId,
    actorUserId: input.actorUserId,
  });
  if (
    input.intent !== "ENABLE" &&
    status.state !== "ACTIVE" &&
    status.state !== "INVITATION_SENT"
  )
    throw new CustomerPortalProvisioningError(
      "The invitation status could not be confirmed. Refresh and try again.",
    );
  return status;
}

export async function disableCustomerPortalAccess(input: {
  organizationId: string;
  customerId: string;
  portalAccessId: string;
  actorUserId: string;
}) {
  const admin = createAdminClient();
  const disabled = await admin
    .from("customer_portal_users")
    .update({ is_active: false })
    .eq("id", input.portalAccessId)
    .eq("organization_id", input.organizationId)
    .eq("customer_id", input.customerId);
  if (disabled.error)
    throw new CustomerPortalProvisioningError(
      "Portal access could not be updated.",
    );
  await admin
    .from("customer_portal_invitations")
    .update({ status: "CANCELLED", updated_by_user_id: input.actorUserId })
    .eq("organization_id", input.organizationId)
    .eq("customer_id", input.customerId)
    .in("status", ["PENDING", "SENT"]);
}
