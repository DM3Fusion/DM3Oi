"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import {
  CustomerPortalProvisioningError,
  disableCustomerPortalAccess,
  provisionCustomerPortalAccess,
} from "@/lib/data/customer-portal-provisioning-service";

const value = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
const destination = (id: string, key: string, message: string) =>
  `/customers/${id}?${key}=${encodeURIComponent(message)}`;
const allowed = ["BUSINESS_OWNER", "BUSINESS_ADMIN"];

async function authorize(customerId: string) {
  const access = await getAccessContext();
  const org = access?.activeOrganization;
  if (
    !access?.user ||
    !org ||
    !(access.isSuperAdmin || allowed.includes(org.role))
  )
    redirect(
      destination(
        customerId,
        "error",
        "You are not authorized to manage Portal Access.",
      ),
    );
  return { access, org };
}

export async function manageCustomerPortalAccessAction(form: FormData) {
  const customerId = value(form, "customerId");
  const intent = value(form, "intent");
  const { access, org } = await authorize(customerId);
  const path = `/customers/${customerId}`;

  try {
    if (intent === "disable") {
      const portalAccessId = value(form, "portalAccessId");
      if (!portalAccessId)
        redirect(
          destination(customerId, "error", "Portal access record not found."),
        );
      await disableCustomerPortalAccess({
        organizationId: org.id,
        customerId,
        portalAccessId,
        actorUserId: access.user.id,
      });
      revalidatePath(path);
      redirect(destination(customerId, "message", "Portal access disabled."));
    }

    const status = await provisionCustomerPortalAccess({
      organizationId: org.id,
      organizationName: org.name,
      customerId,
      actorUserId: access.user.id,
      intent: intent === "resend" ? "RESEND" : "ENABLE",
    });
    revalidatePath(path);
    if (status.state === "ACTIVE" || status.state === "NOT_CONFIGURED")
      redirect(destination(customerId, "message", "Portal Access enabled."));
    redirect(
      destination(
        customerId,
        "message",
        intent === "resend"
          ? "Customer Portal invitation resent."
          : "Customer Portal invitation sent.",
      ),
    );
  } catch (error) {
    if (error instanceof CustomerPortalProvisioningError)
      redirect(destination(customerId, "error", error.safeMessage));
    throw error;
  }
}
