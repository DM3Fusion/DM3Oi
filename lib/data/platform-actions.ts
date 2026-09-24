"use server";
import { cookies } from "next/headers";import { redirect } from "next/navigation";import { revalidatePath } from "next/cache";import { ACTIVE_ORGANIZATION_COOKIE,PLATFORM_CONTEXT_COOKIE_VALUE,requireSuperAdmin } from "@/lib/auth/context";import { createClient } from "@/lib/supabase/server";import { createAdminClient, getInvitationRedirect } from "@/lib/supabase/admin";import type { Database } from "@/types/database.generated";
import type { OrganizationDetailsValues } from "@/lib/platform-organization-details";
type AppRole=Database["public"]["Enums"]["application_role"];type OrgStatus=Database["public"]["Enums"]["organization_status"];const internalRoles:AppRole[]=["BUSINESS_OWNER","BUSINESS_ADMIN","STAFF_MANAGER","STAFF_USER"];
const value=(form:FormData,key:string)=>String(form.get(key)??"").trim();const slugify=(input:string)=>input.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");const destination=(path:string,key:string,message:string)=>`${path}?${key}=${encodeURIComponent(message)}`;
async function findAuthUserByEmail(admin:ReturnType<typeof createAdminClient>,email:string){for(let page=1;page<=20;page+=1){const {data,error}=await admin.auth.admin.listUsers({page,perPage:100});if(error)throw error;const found=data.users.find(user=>user.email?.toLowerCase()===email.toLowerCase());if(found)return found;if(data.users.length<100)break;}return null}
const friendly=(message:string)=>{if(message.includes("slug already"))return "That organization slug is already in use.";if(message.includes("maximum active BUSINESS_OWNER"))return "This organization already has the maximum of 2 active Business Owners.";if(message.includes("maximum active BUSINESS_ADMIN"))return "This organization already has the maximum of 2 active Business Administrators.";if(message.includes("profile not found"))return "No registered DM3Oi user was found with that email. Ask the user to register first, then provision access here.";if(message.includes("invalid organization role"))return "Select a valid organization role.";if(message.includes("not authorized"))return "You are not authorized to perform this platform action.";return "The platform change could not be completed."};
async function rpcError<T>(operation:PromiseLike<{data:T;error:{message:string;code:string}|null}>,path:string){const result=await operation;if(result.error){console.error("Platform mutation failed",{code:result.error.code,message:result.error.message});redirect(destination(path,"error",friendly(result.error.message)))}return result.data}
type TrialOrganizationConversionDatabase=Database&{public:Database["public"]&{Functions:Database["public"]["Functions"]&{convert_trial_request_to_organization:{Args:{target_trial_request_id:string;target_organization_name:string;target_organization_slug:string;target_conversion_note:string;target_owner_user_id:string;target_owner_email:string;target_owner_identity_verified:boolean};Returns:{id:string;name:string;slug:string;status:string}}}}};

export async function createOrganizationAction(form:FormData){
 await requireSuperAdmin();
 const name=value(form,"name");
 const slug=slugify(value(form,"slug"));
 const trialRequestId=value(form,"trialRequestId");
 const conversionNote=value(form,"conversionNote");
 const ownerDisplayName=value(form,"ownerDisplayName");
 const ownerEmail=value(form,"ownerEmail").toLowerCase();
 const newPath=trialRequestId?`/admin/organizations/new?trialRequestId=${encodeURIComponent(trialRequestId)}`:"/admin/organizations/new";

 if(!name||!slug)redirect(destination(newPath,"error","Organization name and slug are required."));

 if(trialRequestId){
  if(!conversionNote||conversionNote.length>1000)redirect(destination(newPath,"error","A conversion note is required and cannot exceed 1,000 characters."));
  if(!ownerDisplayName||ownerDisplayName.length>100)redirect(destination(newPath,"error","Enter the initial Business Owner name."));
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)||ownerEmail.length>254)redirect(destination(newPath,"error","Enter a valid initial Business Owner email address."));

  const session=(await createClient()) as ReturnType<typeof import("@supabase/ssr").createServerClient<TrialOrganizationConversionDatabase>>;
  const admin=createAdminClient();

  let ownerAuthUser;
  try{
   ownerAuthUser=await findAuthUserByEmail(admin,ownerEmail);
  }catch(error){
   console.error("Initial Business Owner identity lookup failed",{error,trialRequestId,ownerEmail});
   redirect(destination(newPath,"error","The initial Business Owner identity could not be checked."));
  }

  let ownerUserId=ownerAuthUser?.id??null;
  let createdOwnerIdentity=false;

  if(ownerAuthUser){
   const [{data:platformRole,error:platformRoleError},{data:profile,error:profileLookupError}]=await Promise.all([
    admin.from("platform_user_roles").select("id").eq("user_id",ownerAuthUser.id).eq("role","SUPER_ADMIN").eq("is_active",true).maybeSingle(),
    admin.from("profiles").select("id,is_active").eq("id",ownerAuthUser.id).maybeSingle(),
   ]);

   if(platformRoleError||profileLookupError||platformRole||profile?.is_active===false){
    redirect(destination(newPath,"error","The selected Business Owner identity cannot be provisioned."));
   }

   const {error:profileError}=await admin.from("profiles").upsert({
    id:ownerAuthUser.id,
    email:ownerEmail,
    display_name:ownerDisplayName,
    is_active:true,
   });

   if(profileError){
    console.error("Initial Business Owner profile preparation failed",{code:profileError.code,message:profileError.message,trialRequestId,ownerEmail});
    redirect(destination(newPath,"error","The initial Business Owner profile could not be prepared."));
   }
  }else{
   const {data:invited,error:inviteError}=await admin.auth.admin.inviteUserByEmail(ownerEmail,{
    redirectTo:getInvitationRedirect(),
    data:{
     display_name:ownerDisplayName,
     organization_name:name,
    },
   });

   if(inviteError||!invited.user){
    console.error("Initial Business Owner invitation failed",{code:inviteError?.code,message:inviteError?.message,trialRequestId,ownerEmail});
    redirect(destination(newPath,"error","The initial Business Owner invitation could not be sent."));
   }

   ownerUserId=invited.user.id;
   createdOwnerIdentity=true;

   const {error:profileError}=await admin.from("profiles").upsert({
    id:ownerUserId,
    email:ownerEmail,
    display_name:ownerDisplayName,
    is_active:true,
   });

   if(profileError){
    await admin.auth.admin.deleteUser(ownerUserId);
    console.error("Initial Business Owner profile preparation failed",{code:profileError.code,message:profileError.message,trialRequestId,ownerEmail});
    redirect(destination(newPath,"error","The initial Business Owner profile could not be prepared; the invitation was rolled back."));
   }
  }

  if(!ownerUserId){
   redirect(destination(newPath,"error","The initial Business Owner could not be prepared."));
  }

  const identityVerified=Boolean(ownerAuthUser?.email_confirmed_at||ownerAuthUser?.last_sign_in_at);

  const result=await session.rpc("convert_trial_request_to_organization",{
   target_trial_request_id:trialRequestId,
   target_organization_name:name,
   target_organization_slug:slug,
   target_conversion_note:conversionNote,
   target_owner_user_id:ownerUserId,
   target_owner_email:ownerEmail,
   target_owner_identity_verified:identityVerified,
  });

  if(result.error){
   if(createdOwnerIdentity){
    const rollback=await admin.auth.admin.deleteUser(ownerUserId);
    if(rollback.error){
     console.error("Initial Business Owner invitation rollback failed",{message:rollback.error.message,trialRequestId,ownerEmail,ownerUserId});
    }
   }

   console.error("Trial Request organization conversion failed",{code:result.error.code,message:result.error.message,trialRequestId});
   const message=result.error.message.includes("organization slug already exists")
    ?"That organization slug is already in use."
    :result.error.message.includes("trial request must be qualified")
      ?"Only a qualified Trial Request can be converted."
      :result.error.message.includes("trial request already converted")
        ?"This Trial Request has already been converted."
        :result.error.message.includes("conversion note required")
          ?"A conversion note is required."
          :result.error.message.includes("initial business owner")
            ?"The initial Business Owner could not be provisioned."
            :"The Trial Request could not be converted to an organization.";
   redirect(destination(newPath,"error",message));
  }

  if(!result.data?.id){
   if(createdOwnerIdentity){
    const rollback=await admin.auth.admin.deleteUser(ownerUserId);
    if(rollback.error){
     console.error("Initial Business Owner invitation rollback failed",{message:rollback.error.message,trialRequestId,ownerEmail,ownerUserId});
    }
   }
   redirect(destination(newPath,"error","The organization could not be confirmed after conversion."));
  }

  revalidatePath("/");
  revalidatePath("/admin/organizations");
  revalidatePath("/admin/users");
  revalidatePath("/admin/trial-requests");
  revalidatePath(`/admin/trial-requests/${trialRequestId}`);
  redirect(`/admin/organizations/${result.data.id}?message=${encodeURIComponent(createdOwnerIdentity?"Organization created from Trial Request and Business Owner invited.":"Organization created from Trial Request and Business Owner provisioned.")}`);
 }

 const supabase=await createClient();
 const created=await rpcError(supabase.rpc("create_organization",{target_name:name,target_slug:slug}),newPath);
 revalidatePath("/");
 revalidatePath("/admin/organizations");
 redirect(`/admin/organizations/${created!.id}?message=${encodeURIComponent("Organization created.")}`);
}
export async function updateOrganizationAction(form:FormData):Promise<{ok:true;values:OrganizationDetailsValues}|{ok:false;error:string}>{await requireSuperAdmin();const id=value(form,"organizationId");const path=`/admin/organizations/${id}`;const status=value(form,"status") as OrgStatus;const name=value(form,"name");const slug=slugify(value(form,"slug"));if(!name||!slug)return {ok:false,error:"Organization name and slug are required."};if(!["ACTIVE","SUSPENDED","ARCHIVED"].includes(status))return {ok:false,error:"Select a valid organization status."};const supabase=await createClient();const result=await supabase.rpc("update_organization",{target_organization_id:id,target_name:name,target_slug:slug,target_status:status});if(result.error||!result.data){console.error("Platform organization update failed",{code:result.error?.code??null,message:result.error?.message??null});return {ok:false,error:friendly(result.error?.message??"")};}revalidatePath("/");revalidatePath("/admin/organizations");revalidatePath(path);return {ok:true,values:{name:result.data.name,slug:result.data.slug,status:result.data.status}}}
export async function provisionMemberAction(form:FormData){await requireSuperAdmin();const id=value(form,"organizationId");const path=`/admin/organizations/${id}`;const role=value(form,"role") as AppRole;if(!internalRoles.includes(role))redirect(destination(path,"error","Select a valid organization role."));const email=value(form,"email").toLowerCase();const supabase=await createClient();const admin=createAdminClient();const existingAuthUser=await findAuthUserByEmail(admin,email);const identityVerified=Boolean(existingAuthUser?.email_confirmed_at||existingAuthUser?.last_sign_in_at);await rpcError(supabase.rpc("provision_organization_member",{target_organization_id:id,target_email:email,target_role:role,target_identity_verified:identityVerified}),path);revalidatePath(path);revalidatePath("/admin/users");redirect(destination(path,"message","User access provisioned."))}
export async function updateMembershipAction(form:FormData){await requireSuperAdmin();const id=value(form,"organizationId");const path=`/admin/organizations/${id}`;const role=value(form,"role") as AppRole;if(!internalRoles.includes(role))redirect(destination(path,"error","Select a valid organization role."));const membershipId=value(form,"membershipId");const supabase=await createClient();const current=await supabase.from("organization_members").select("id,organization_id,is_active").eq("id",membershipId).eq("organization_id",id).maybeSingle();if(current.error||!current.data)redirect(destination(path,"error","Organization membership was not found."));await rpcError(supabase.rpc("update_organization_membership",{target_membership_id:membershipId,target_role:role,target_active:current.data.is_active}),path);revalidatePath(path);revalidatePath("/admin/users");redirect(destination(path,"message","Membership role updated."))}
export async function transitionMembershipAction(form:FormData){await requireSuperAdmin();const id=value(form,"organizationId");const path=`/admin/organizations/${id}`;const membershipId=value(form,"membershipId");const action=value(form,"action").toUpperCase();if(!["ACTIVATE","SUSPEND","REACTIVATE","REVOKE","REINSTATE"].includes(action))redirect(destination(path,"error","Select a valid membership lifecycle action."));const supabase=await createClient();const current=await supabase.from("organization_members").select("id").eq("id",membershipId).eq("organization_id",id).maybeSingle();if(current.error||!current.data)redirect(destination(path,"error","Organization membership was not found."));const result=await supabase.rpc("transition_organization_membership",{target_membership_id:membershipId,target_action:action});if(result.error){console.error("Platform membership lifecycle mutation failed",{code:result.error.code,message:result.error.message});if(result.error.message.includes("ACTIVE_OPERATIONAL_RESPONSIBILITY"))redirect(destination(path,"error","This user still has active operational responsibility. Reassign their open cases, tasks, case assignments, or service requests before revoking access."));redirect(destination(path,"error",friendly(result.error.message)))}revalidatePath(path);revalidatePath("/admin/users");const messages:Record<string,string>={ACTIVATE:"Organization access activated.",SUSPEND:"Organization access suspended.",REACTIVATE:"Organization access reactivated.",REVOKE:"Organization access revoked.",REINSTATE:"Organization access reinstated."};redirect(destination(path,"message",messages[action]??"Membership updated."))}
export async function enterOrganizationWorkspaceAction(form:FormData){const access=await requireSuperAdmin();const id=value(form,"organizationId");if(!access.organizations.some(o=>o.id===id))redirect(destination(`/admin/organizations/${id}`,"error","Only active organizations can be entered."));(await cookies()).set(ACTIVE_ORGANIZATION_COOKIE,id,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/"});redirect("/")}
export async function returnToBackOfficeAction(){await requireSuperAdmin();(await cookies()).set(ACTIVE_ORGANIZATION_COOKIE,PLATFORM_CONTEXT_COOKIE_VALUE,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/"});redirect("/")}

export async function deleteRevokedPlatformUserAction(form:FormData){
  const access=await requireSuperAdmin();
  const userId=value(form,"userId");
  const membershipId=value(form,"membershipId");
  const organizationId=value(form,"organizationId");
  const confirmation=value(form,"confirmation");
  const path=`/admin/users/${userId}`;

  if(confirmation!=="DELETE")redirect(destination(path,"error","Type DELETE exactly to confirm permanent deletion."));
  if(access.user.id===userId)redirect(destination(path,"error","You cannot permanently delete your own platform identity."));

  const {getPlatformUserDeletionEligibility}=await import("@/lib/data/platform-user-deletion");
  const eligibility=await getPlatformUserDeletionEligibility(userId,membershipId);

  if(!eligibility.eligible){
    redirect(destination(path,"error",eligibility.blockers[0]??"Permanent deletion is unavailable."));
  }

  const admin=createAdminClient();
  const membership=await admin
    .from("organization_members")
    .select("id,organization_id,user_id,status")
    .eq("id",membershipId)
    .eq("organization_id",organizationId)
    .eq("user_id",userId)
    .maybeSingle();

  if(membership.error||!membership.data){
    console.error("Permanent deletion membership recheck failed",{message:membership.error?.message??null,userId,membershipId,organizationId});
    redirect(destination(path,"error","Organization membership was not found."));
  }

  if(membership.data.status!=="REVOKED"){
    redirect(destination(path,"error","Organization access must be revoked before permanent deletion."));
  }

  const result=await admin.auth.admin.deleteUser(userId);
  if(result.error){
    console.error("Permanent platform user deletion failed",{message:result.error.message,userId,membershipId,organizationId});
    redirect(destination(path,"error","The user could not be permanently deleted."));
  }

  revalidatePath("/");
  revalidatePath("/admin/users");
  revalidatePath("/admin/organizations");
  revalidatePath(`/admin/organizations/${organizationId}`);
  redirect(destination("/admin/users","message","User permanently deleted."));
}
