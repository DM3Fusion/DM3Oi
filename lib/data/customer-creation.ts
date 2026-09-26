import "server-only";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import {
  validateCustomerCreation,
  type CustomerCreationValues,
} from "@/lib/customer-validation";

export type CustomerCreationResult =
  | {
      ok: true;
      customer: { id: string; customerNumber: string; name: string };
    }
  | {
      ok: false;
      error: string;
      fieldErrors: Record<string, string>;
      values: CustomerCreationValues;
    };

export async function createCustomerForCurrentOrganization(
  values: CustomerCreationValues,
): Promise<CustomerCreationResult> {
  const parsed = validateCustomerCreation(values);
  if (!parsed.ok) return parsed;
  const context = await requirePermission("CREATE_CUSTOMER");
  const supabase = await createClient();
  const { data: created, error } = await supabase.rpc("create_customer_record", {
    target_organization_id: context.activeOrganization.id,
    target_type: parsed.value.type,
    target_name: parsed.value.name,
    target_email: parsed.value.email,
    target_phone: parsed.value.phone,
    target_notes: parsed.value.notes,
    target_first_name: parsed.value.firstName,
    target_last_name: parsed.value.lastName,
    target_street_address: parsed.value.streetAddress,
    target_city: parsed.value.city,
    target_state: parsed.value.state,
    target_postal_code: parsed.value.postalCode,
  });
  if (error || !created) {
    console.error("Create customer failed", {
      organizationId: context.activeOrganization.id,
      code: error?.code,
      message: error?.message,
    });
    return {
      ok: false,
      error: "Customer could not be created. Please try again.",
      fieldErrors: {},
      values,
    };
  }
  revalidatePath("/customers");
  revalidatePath("/cases/new");
  return {
    ok: true,
    customer: {
      id: created.id,
      customerNumber: created.customer_number,
      name: created.name,
    },
  };
}
