"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, getInvitationRedirect } from "@/lib/supabase/admin";
import { getIdentityCategory } from "@/lib/auth/identity-category";
import { customerPortalInvitationMetadata } from "@/lib/data/customer-portal-invitation-metadata";
import { sendCustomerPortalInvitationEmail } from "@/lib/data/customer-portal-invitation-email-service";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const destination = (id: string, key: string, message: string) => `/customers/${id}?${key}=${encodeURIComponent(message)}`;
const allowed = ["BUSINESS_OWNER", "BUSINESS_ADMIN"];
const validEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

async function authUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found || data.users.length < 1000) return found ?? null;
  }
  return null;
}

async function authorize(customerId: string) {
  const access = await getAccessContext();
  const org = access?.activeOrganization;
  if (!access?.user || !org || !(access.isSuperAdmin || allowed.includes(org.role))) redirect(destination(customerId, "error", "You are not authorized to manage Portal Access."));
  return { org };
}

export async function manageCustomerPortalAccessAction(form: FormData) {
  const customerId = value(form, "customerId");
  const intent = value(form, "intent");
  const { org } = await authorize(customerId);
  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("id,email").eq("id", customerId).eq("organization_id", org.id).maybeSingle();
  if (!customer) redirect(destination(customerId, "error", "Customer not found."));
  const path = `/customers/${customerId}`;
  const linked = await supabase.from("customer_portal_users").select("id,user_id,is_active").eq("organization_id", org.id).eq("customer_id", customerId).eq("is_active", true).maybeSingle();
  if (linked.error) redirect(destination(customerId, "error", "Portal access could not be checked."));
  if (intent === "disable") {
    const portalAccessId = value(form, "portalAccessId");
    if (!portalAccessId) redirect(destination(customerId, "error", "Portal access record not found."));
    const { error } = await supabase.from("customer_portal_users").update({ is_active: false }).eq("id", portalAccessId).eq("organization_id", org.id).eq("customer_id", customerId);
    if (error) redirect(destination(customerId, "error", "Portal access could not be updated."));
    revalidatePath(path);
    redirect(destination(customerId, "message", "Portal access disabled."));
  }
  if (!customer.email || !validEmail(customer.email.trim())) redirect(destination(customerId, "error", "Add a valid customer email before enabling Portal Access."));
  const email = customer.email.trim().toLowerCase();
  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch { redirect(destination(customerId, "error", "User administration is not configured.")); }
  let authUser = linked.data?.user_id ? (await admin!.auth.admin.getUserById(linked.data.user_id)).data.user : null;
  if (!authUser) authUser = await authUserByEmail(admin!, email);
  if (authUser && authUser.id !== linked.data?.user_id) {
    if (await getIdentityCategory(authUser.id) === "INTERNAL") redirect(destination(customerId, "error", "This email belongs to an internal DM3Oi user and cannot be used for Customer Portal access."));
    const collision = await supabase.from("organization_members").select("id").eq("organization_id", org.id).eq("is_active", true).eq("user_id", authUser.id).maybeSingle();
    if (collision.data) redirect(destination(customerId, "error", "This email belongs to an internal organization user and cannot be provisioned as customer portal access."));
  }
  let invitationUrl: string | null = null;
  if (!authUser) {
    const generated = await admin!.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: getInvitationRedirect(),
        data: customerPortalInvitationMetadata(undefined, org.name),
      },
    });
    if (generated.error || !generated.data.user || !generated.data.properties?.action_link) {
      console.error("Customer portal invitation link generation failed", {
        code: generated.error?.code ?? "INVITATION_LINK_UNAVAILABLE",
      });
      redirect(destination(customerId, "error", "The Customer Portal invitation could not be prepared."));
    }
    authUser = generated.data.user;
    invitationUrl = generated.data.properties.action_link;
  } else if (intent === "resend") {
    if (authUser.email_confirmed_at || authUser.last_sign_in_at) redirect(destination(customerId, "message", "This customer has already activated Portal Access."));
    const generated = await admin!.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: getInvitationRedirect(),
        data: customerPortalInvitationMetadata(authUser.user_metadata, org.name),
      },
    });
    if (generated.error || !generated.data.properties?.action_link) {
      console.error("Customer portal invitation link regeneration failed", {
        code: generated.error?.code ?? "INVITATION_LINK_UNAVAILABLE",
      });
      redirect(destination(customerId, "error", "The Customer Portal invitation could not be prepared."));
    }
    authUser = generated.data.user ?? authUser;
    invitationUrl = generated.data.properties.action_link;
  }
  const profile = await admin!.from("profiles").upsert({ id: authUser.id, email, display_name: authUser.user_metadata?.display_name ?? email, is_active: true });
  if (profile.error) { console.error("Customer portal profile provisioning failed", { code: profile.error.code, message: profile.error.message }); redirect(destination(customerId, "error", "The customer identity could not be prepared.")); }
  const existing = linked.data?.user_id === authUser.id ? linked : await supabase.from("customer_portal_users").select("id").eq("organization_id", org.id).eq("customer_id", customerId).eq("user_id", authUser.id).maybeSingle();
  if (existing.error) redirect(destination(customerId, "error", "Portal access could not be checked."));
  const relation = existing.data
    ? await supabase.from("customer_portal_users").update({ is_active: true }).eq("id", existing.data.id)
    : await supabase.from("customer_portal_users").insert({ organization_id: org.id, customer_id: customerId, user_id: authUser.id, is_active: true });
  if (relation.error) redirect(destination(customerId, "error", "Portal access could not be provisioned."));
  revalidatePath(path);
  if (invitationUrl) {
    const delivery = await sendCustomerPortalInvitationEmail({
      recipientEmail: email,
      organizationName: org.name,
      invitationUrl,
    });
    if (!delivery.ok) {
      console.error("Customer Portal invitation email delivery failed", {
        code: delivery.errorCode,
      });
      redirect(destination(customerId, "error", "Customer Portal access was prepared, but the invitation email could not be sent."));
    }
    redirect(destination(customerId, "message", intent === "resend" ? "Customer Portal invitation resent." : "Customer Portal invitation sent."));
  }
  redirect(destination(customerId, "message", "Portal Access enabled."));
}
