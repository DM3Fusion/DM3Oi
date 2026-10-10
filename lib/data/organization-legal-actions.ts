"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getAccessContext,
  requireSuperAdmin,
} from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

type RpcResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<RpcResult>;
};

const rpcClient = (client: unknown): RpcClient =>
  client as RpcClient;

export async function acceptOrganizationLegalDocumentsAction(
  formData: FormData,
) {
  const organizationId = String(
    formData.get("organizationId") ?? "",
  ).trim();

  if (
    !organizationId ||
    formData.get("legalConsent") !== "accepted"
  ) {
    redirect("/account?legal-error=consent-required");
  }

  const access = await getAccessContext();

  if (
    !access?.activeOrganization ||
    access.activeOrganization.id !== organizationId ||
    access.activeOrganization.role !== "BUSINESS_OWNER"
  ) {
    redirect("/account?legal-error=owner-required");
  }

  const supabase = await createClient();
  const result = await rpcClient(supabase).rpc(
    "accept_current_organization_legal_documents",
    {
      target_organization_id: organizationId,
    },
  );

  if (result.error) {
    console.error("Organization legal acceptance failed", {
      organizationId,
      code: result.error.code,
      message: result.error.message,
    });
    redirect("/account?legal-error=accept");
  }

  revalidatePath("/account");
  revalidatePath("/", "layout");
  revalidatePath("/portal", "layout");

  redirect("/account?legal-accepted=1");
}

export async function withdrawOrganizationLegalAcceptanceAction(
  formData: FormData,
) {
  const organizationId = String(
    formData.get("organizationId") ?? "",
  ).trim();

  const access = await getAccessContext();

  if (
    !organizationId ||
    !access?.activeOrganization ||
    access.activeOrganization.id !== organizationId ||
    access.activeOrganization.role !== "BUSINESS_OWNER"
  ) {
    redirect("/account?legal-error=owner-required");
  }

  const supabase = await createClient();
  const result = await rpcClient(supabase).rpc(
    "withdraw_organization_legal_acceptance",
    {
      target_organization_id: organizationId,
    },
  );

  if (result.error) {
    console.error("Organization legal withdrawal failed", {
      organizationId,
      code: result.error.code,
      message: result.error.message,
    });
    redirect("/account?legal-error=withdraw");
  }

  revalidatePath("/account");
  revalidatePath("/", "layout");
  revalidatePath("/portal", "layout");

  redirect("/account?legal-withdrawn=1");
}

export async function setOrganizationSandboxSuppressionAction(
  formData: FormData,
) {
  await requireSuperAdmin();

  const organizationId = String(
    formData.get("organizationId") ?? "",
  ).trim();

  if (!organizationId) {
    redirect("/admin/organizations?error=organization-required");
  }

  const suppressed =
    formData.get("sandboxSuppressed") === "true";

  const supabase = await createClient();
  const result = await rpcClient(supabase).rpc(
    "admin_set_organization_sandbox_suppressed",
    {
      target_organization_id: organizationId,
      target_suppressed: suppressed,
    },
  );

  if (result.error) {
    console.error("Sandbox designation update failed", {
      organizationId,
      code: result.error.code,
      message: result.error.message,
    });

    redirect(
      `/admin/organizations/${organizationId}?error=${encodeURIComponent(
        "Sandbox designation could not be updated.",
      )}`,
    );
  }

  revalidatePath(`/admin/organizations/${organizationId}`);
  revalidatePath("/admin/organizations");
  revalidatePath("/", "layout");
  revalidatePath("/portal", "layout");

  redirect(
    `/admin/organizations/${organizationId}?message=${encodeURIComponent(
      suppressed
        ? "Sandbox designation suppressed."
        : "Automatic Sandbox designation restored.",
    )}`,
  );
}
