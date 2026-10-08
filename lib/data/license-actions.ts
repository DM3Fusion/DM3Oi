"use server";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
const value=(f:FormData,k:string)=>String(f.get(k)??"").trim();
const localDate = (raw: string) => { if (!raw) return null; const parsed = new Date(raw); if (Number.isNaN(parsed.getTime())) throw new Error("invalid date"); return parsed.toISOString(); };
export async function saveLicenseAction(form:FormData){
  await requireSuperAdmin(); const id=value(form,"organizationId");
  if (!id || !value(form,"status") || !value(form,"commercialState")) return { ok:false, error:"License status and commercial state are required." };
  if (!["STANDARD","ENTERPRISE","INTERNAL"].includes(value(form,"planCode"))) return { ok:false, error:"Select a valid license plan." };
  let startsAt:string|null, expiresAt:string|null, graceEndsAt:string|null;
  try { startsAt=localDate(value(form,"startsAt")); expiresAt=localDate(value(form,"expiresAt")); graceEndsAt=localDate(value(form,"graceEndsAt")); } catch { return { ok:false, error:"Enter valid license dates." }; }
  if (startsAt && expiresAt && expiresAt < startsAt) return { ok:false, error:"Expiration cannot precede the start date." };
  if (graceEndsAt && (!expiresAt || graceEndsAt < expiresAt)) return { ok:false, error:"Grace end cannot precede expiration." };
  const supabase=await createClient(); const result=await supabase.rpc("admin_set_organization_license",{target_organization_id:id,target_status:value(form,"status"),target_commercial_state:value(form,"commercialState"),target_plan_code:value(form,"planCode")||"STANDARD",target_starts_at:startsAt,target_expires_at:expiresAt,target_grace_ends_at:graceEndsAt,target_notes:value(form,"notes")||null,target_event_type:value(form,"eventType")||"ACTIVATED"} as never);
  if(result.error || !result.data?.id){ console.error("License update failed",{code:result.error?.code,message:result.error?.message}); return {ok:false,error:result.error?.message?.includes("precedes")?"License dates are invalid.":"License could not be saved."}; }
  const verified=await supabase.from("organization_licenses").select("*").eq("id",result.data.id).eq("organization_id",id).eq("is_current",true).maybeSingle();
  if(verified.error || !verified.data){ console.error("License write could not be verified",{code:verified.error?.code,message:verified.error?.message}); return {ok:false,error:"License was not confirmed after saving. Please try again."}; }
  revalidatePath(`/admin/organizations/${id}`); revalidatePath("/admin/organizations"); return {ok:true,license:verified.data};
}
