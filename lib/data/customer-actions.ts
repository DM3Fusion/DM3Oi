"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { customerEmailPattern, normalizeCustomerPhone } from "@/lib/customer-validation";
export async function updateCustomerAction(data: FormData) {
  const values={name:String(data.get("name")??""),email:String(data.get("email")??""),phone:String(data.get("phone")??""),notes:String(data.get("notes")??""),status:String(data.get("status")??"ACTIVE")};
  const fieldErrors:Record<string,string>={}; const email=values.email.trim().toLowerCase(); const phone=normalizeCustomerPhone(values.phone);
  if(!values.name.trim()) fieldErrors.name="Name is required.";
  if(!customerEmailPattern.test(email)) fieldErrors.email="Enter a valid email address.";
  if(!phone) fieldErrors.phone="Enter a valid U.S. phone number.";
  if(!["ACTIVE","INACTIVE","ARCHIVED"].includes(values.status)) fieldErrors.status="Select a valid customer status.";
  if(Object.keys(fieldErrors).length) return {ok:false as const,error:"Correct the highlighted fields.",fieldErrors,values};
  const context=await requirePermission("EDIT_CUSTOMER"); const supabase=await createClient();
  const {error}=await supabase.from("customers").update({name:values.name.trim(),email,phone:phone!,notes:values.notes.trim()||null,status:values.status as "ACTIVE"|"INACTIVE"|"ARCHIVED"}).eq("id",String(data.get("customerId")??"")).eq("organization_id",context.activeOrganization.id);
  if(error){console.error("Customer update failed",{code:error.code,message:error.message});return {ok:false as const,error:"Customer could not be updated.",fieldErrors:{},values};}
  const id=String(data.get("customerId")??"");revalidatePath(`/customers/${id}`);revalidatePath("/customers");return {ok:true as const};
}
