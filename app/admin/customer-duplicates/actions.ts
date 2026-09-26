"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.generated";

export async function previewCustomerMergeAction(input: { organizationId: string; survivorId: string; mergedId: string }) {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("super_admin_customer_merge_preview", {
      target_organization_id: input.organizationId,
      target_surviving_customer_id: input.survivorId,
      target_merged_customer_id: input.mergedId,
    });
    if (error) throw new Error("The merge preflight was rejected.");
    return { ok: true as const, preview: data };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "The merge could not be previewed." };
  }
}

export async function mergeCustomersAction(input: { organizationId: string; survivorId: string; mergedId: string; fieldResolution: Json; confirmation: string }) {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("super_admin_merge_customers", {
      target_organization_id: input.organizationId,
      target_surviving_customer_id: input.survivorId,
      target_merged_customer_id: input.mergedId,
      target_field_resolution: input.fieldResolution,
      target_confirmation: input.confirmation,
    });
    if (error) {
      console.error("SUPER_ADMIN Customer merge failed", { code: error.code, message: error.message, organizationId: input.organizationId });
      throw new Error(error.message.includes("portal identities") ? "Both Customers have Portal identities. Resolve Portal access before merging." : "The merge was rejected and no records were changed.");
    }
    revalidatePath("/admin/customer-duplicates"); revalidatePath("/customers");
    return { ok: true as const, result: data };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "The merge could not be completed." };
  }
}
