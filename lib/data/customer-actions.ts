"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { customerEmailPattern, deriveCustomerName, normalizeCustomerPhone, validateOptionalCustomerAddress } from "@/lib/customer-validation";

export async function updateCustomerAction(data: FormData) {
  const values = {
    name: String(data.get("name") ?? ""), firstName: String(data.get("firstName") ?? ""), lastName: String(data.get("lastName") ?? ""),
    streetAddress: String(data.get("streetAddress") ?? ""), city: String(data.get("city") ?? ""), state: String(data.get("state") ?? ""), postalCode: String(data.get("postalCode") ?? ""),
    email: String(data.get("email") ?? ""), phone: String(data.get("phone") ?? ""), notes: String(data.get("notes") ?? ""), type: String(data.get("type") ?? "INDIVIDUAL"), status: String(data.get("status") ?? "ACTIVE"),
  };
  const fieldErrors: Record<string, string> = validateOptionalCustomerAddress(values);
  const name = deriveCustomerName(values.firstName, values.lastName, values.name);
  const email = values.email.trim().toLowerCase();
  const phone = normalizeCustomerPhone(values.phone);
  if (!name) fieldErrors.name = "Name or structured first/last name is required.";
  if (!customerEmailPattern.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (!phone) fieldErrors.phone = "Enter a valid U.S. phone number.";
  if (!["INDIVIDUAL", "BUSINESS"].includes(values.type)) fieldErrors.type = "Select a valid customer type.";
  if (!["ACTIVE", "INACTIVE", "ARCHIVED"].includes(values.status)) fieldErrors.status = "Select a valid customer status.";
  if (Object.keys(fieldErrors).length) return { ok: false as const, error: "Correct the highlighted fields.", fieldErrors, values };
  const context = await requirePermission("EDIT_CUSTOMER");
  const supabase = await createClient();
  const customerId = String(data.get("customerId") ?? "");
  const { error } = await supabase.from("customers").update({
    name, first_name: values.firstName.trim() || null, last_name: values.lastName.trim() || null,
    street_address: values.streetAddress.trim() || null, city: values.city.trim() || null,
    state: values.state.trim().toUpperCase() || null, postal_code: values.postalCode.trim() || null,
    email, phone: phone!, notes: values.notes.trim() || null,
    type: values.type as "INDIVIDUAL" | "BUSINESS",
    status: values.status as "ACTIVE" | "INACTIVE" | "ARCHIVED",
  }).eq("id",customerId).eq("organization_id",context.activeOrganization.id);
  if (error) {
    console.error("Customer update failed", { code: error.code, message: error.message });
    return { ok: false as const, error: "Customer could not be updated.", fieldErrors: {}, values };
  }
  revalidatePath(`/customers/${customerId}`); revalidatePath("/customers");
  return {ok:true as const};
}
