"use server";
import { cookies } from "next/headers";import { redirect } from "next/navigation";import { revalidatePath } from "next/cache";import { ACTIVE_ORGANIZATION_COOKIE,PLATFORM_CONTEXT_COOKIE_VALUE,requireSuperAdmin } from "@/lib/auth/context";import { createClient } from "@/lib/supabase/server";import { createAdminClient, getInvitationRedirect } from "@/lib/supabase/admin";import type { Database } from "@/types/database.generated";
import type { OrganizationDetailsValues } from "@/lib/platform-organization-details";
type AppRole=Database["public"]["Enums"]["application_role"];type OrgStatus=Database["public"]["Enums"]["organization_status"];const internalRoles:AppRole[]=["BUSINESS_OWNER","BUSINESS_ADMIN","STAFF_MANAGER","STAFF_USER"];
const value=(form:FormData,key:string)=>String(form.get(key)??"").trim();const slugify=(input:string)=>input.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");const destination=(path:string,key:string,message:string,extraKey?:string,extraValue?:string)=>{
 const params=new URLSearchParams({[key]:message});
 if(extraKey&&extraValue)params.set(extraKey,extraValue);
 return `${path}?${params.toString()}`;
};
async function findAuthUserByEmail(admin:ReturnType<typeof createAdminClient>,email:string){for(let page=1;page<=20;page+=1){const {data,error}=await admin.auth.admin.listUsers({page,perPage:100});if(error)throw error;const found=data.users.find(user=>user.email?.toLowerCase()===email.toLowerCase());if(found)return found;if(data.users.length<100)break;}return null}
const friendly=(message:string)=>{if(message.includes("user identity already belongs to another organization"))return "This email address is already associated with another organization and cannot be added to this organization.";if(message.includes("slug already"))return "That organization slug is already in use.";if(message.includes("maximum active BUSINESS_OWNER"))return "This organization already has the maximum of 2 active Business Owners.";if(message.includes("maximum active BUSINESS_ADMIN"))return "This organization already has the maximum of 2 active Business Administrators.";if(message.includes("profile not found"))return "No registered DM3Oi user was found with that email. Ask the user to register first, then provision access here.";if(message.includes("invalid organization role"))return "Select a valid organization role.";if(message.includes("not authorized"))return "You are not authorized to perform this platform action.";return "The platform change could not be completed."};
async function rpcError<T>(operation:PromiseLike<{data:T;error:{message:string;code:string}|null}>,path:string){const result=await operation;if(result.error){console.error("Platform mutation failed",{code:result.error.code,message:result.error.message});redirect(destination(path,"error",friendly(result.error.message)))}return result.data}
type TrialOrganizationConversionDatabase=Database&{public:Database["public"]&{Functions:Database["public"]["Functions"]&{convert_trial_request_to_organization:{Args:{target_trial_request_id:string;target_organization_name:string;target_organization_slug:string;target_conversion_note:string;target_owner_user_id:string;target_owner_email:string;target_owner_identity_verified:boolean};Returns:{id:string;name:string;slug:string;status:string}}}}};

export type OrganizationResetPreview = {
 organizationId:string;
 organizationName:string;
 preservedOwnerUserId:string;
 identityCleanupCandidates:number;
 customers:number;
 customerPortalUsers:number;
 cases:number;
 caseTasks:number;
 caseActivity:number;
 caseAssignments:number;
 caseQuestions:number;
 caseQuestionResponses:number;
 serviceRequests:number;
 serviceRequestMessages:number;
 serviceRequestActivity:number;
 serviceRequestCommunications:number;
 notifications:number;
 organizationUsersRemoved:number;
 membershipEvents:number;
 caseNumberCounters:number;
 customerAnnualNumberCounters:number;
 customerNumberCounters:number;
 serviceRequestAnnualNumberCounters:number;
 analyticsLiveSessions:number;
 analyticsPageViews:number;
};

type OrganizationResetResult = Record<string,unknown> & {
 resetAuditId:string;
 identityCleanupCandidateUserIds:string[];
};

type OrganizationResetDatabase=Database&{
 public:Database["public"]&{
  Functions:Database["public"]["Functions"]&{
   preview_organization_reset:{
    Args:{
     target_organization_id:string;
     preserved_owner_user_id:string;
    };
    Returns:OrganizationResetPreview;
   };
   reset_organization_company_and_users:{
    Args:{
     target_organization_id:string;
     preserved_owner_user_id:string;
     confirmation_text:string;
    };
    Returns:OrganizationResetResult;
   };
  };
 };
};

export type OrganizationResetPreviewState =
 | {ok:false;error:string;preview:null}
 | {ok:true;error:null;preview:OrganizationResetPreview};

export async function previewOrganizationResetAction(
 _previousState:OrganizationResetPreviewState,
 form:FormData,
):Promise<OrganizationResetPreviewState>{
 await requireSuperAdmin();

 const organizationId=value(form,"organizationId");
 const preservedOwnerUserId=value(form,"preservedOwnerUserId");

 if(!organizationId||!preservedOwnerUserId){
  return {
   ok:false,
   error:"Select the Business Owner to preserve before previewing the reset.",
   preview:null,
  };
 }

 const supabase=await createClient();
 const resetClient=supabase as ReturnType<
  typeof import("@supabase/ssr").createServerClient<OrganizationResetDatabase>
 >;

 const result=await resetClient.rpc("preview_organization_reset",{
  target_organization_id:organizationId,
  preserved_owner_user_id:preservedOwnerUserId,
 });

 if(result.error||!result.data){
  console.error("Organization reset preview failed",{
   code:result.error?.code??null,
   message:result.error?.message??null,
   organizationId,
   preservedOwnerUserId,
  });

  return {
   ok:false,
   error:"The organization reset preview could not be prepared.",
   preview:null,
  };
 }

 return {
  ok:true,
  error:null,
  preview:result.data,
 };
}

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
   const [{data:platformRole,error:platformRoleError},{data:profile,error:profileLookupError},{data:existingMembership,error:membershipLookupError}]=await Promise.all([
    admin.from("platform_user_roles").select("id").eq("user_id",ownerAuthUser.id).eq("role","SUPER_ADMIN").eq("is_active",true).maybeSingle(),
    admin.from("profiles").select("id,is_active").eq("id",ownerAuthUser.id).maybeSingle(),
    admin.from("organization_members").select("id,organization_id").eq("user_id",ownerAuthUser.id).maybeSingle(),
   ]);

   if(membershipLookupError){
    console.error("Initial Business Owner membership lookup failed",{message:membershipLookupError.message,trialRequestId,ownerEmail});
    redirect(destination(newPath,"error","The initial Business Owner identity could not be checked."));
   }

   if(existingMembership){
    redirect(destination(newPath,"error","This email address is already associated with another organization and cannot be used as the initial Business Owner."));
   }

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

type OrganizationResetIdentityCleanup = {
 status:string;
 candidateUserIds:string[];
 deletedUserIds:string[];
 retainedUserIds:string[];
 failedUserIds:string[];
};

type OrganizationResetAuditRow = {
 id:string;
 organization_id:string;
 preserved_owner_user_id:string;
 identity_cleanup:OrganizationResetIdentityCleanup|null;
};

const uniqueStrings=(values:unknown):string[]=>Array.isArray(values)
 ? [...new Set(values.filter((item):item is string=>typeof item==="string"&&item.length>0))]
 : [];

async function finalizeOrganizationResetIdentityCleanup(
 admin:ReturnType<typeof createAdminClient>,
 resetAuditId:string,
 deletedUserIds:string[],
 retainedUserIds:string[],
 failedUserIds:string[],
){
 const cleanupClient=admin as unknown as {
  rpc(
   fn:"complete_organization_reset_identity_cleanup",
   args:{
    target_reset_audit_id:string;
    deleted_user_ids:string[];
    retained_user_ids:string[];
    failed_user_ids:string[];
   },
  ):PromiseLike<{
   data:unknown;
   error:{message:string;code?:string}|null;
  }>;
 };

 return cleanupClient.rpc(
  "complete_organization_reset_identity_cleanup",
  {
   target_reset_audit_id:resetAuditId,
   deleted_user_ids:deletedUserIds,
   retained_user_ids:retainedUserIds,
   failed_user_ids:failedUserIds,
  },
 );
}

async function reconcileOrganizationResetIdentities({
 admin,
 resetAuditId,
 organizationId,
 preservedOwnerUserId,
 candidateUserIds,
 previouslyDeletedUserIds=[],
 previouslyRetainedUserIds=[],
}:{
 admin:ReturnType<typeof createAdminClient>;
 resetAuditId:string;
 organizationId:string;
 preservedOwnerUserId:string;
 candidateUserIds:string[];
 previouslyDeletedUserIds?:string[];
 previouslyRetainedUserIds?:string[];
}){
 const {
  getGlobalUserDeletionEligibility,
 }=await import("@/lib/data/platform-user-global-deletion");

 const deletedUserIds:string[]=[];
 const retainedUserIds:string[]=[];
 const failedUserIds:string[]=[];

 const previouslyDeleted=new Set(previouslyDeletedUserIds);
 const previouslyRetained=new Set(previouslyRetainedUserIds);

 for(const userId of candidateUserIds){
  if(userId===preservedOwnerUserId){
   console.error("Preserved owner unexpectedly appeared in reset cleanup candidates",{
    resetAuditId,
    organizationId,
    userId,
   });
   retainedUserIds.push(userId);
   continue;
  }

  /*
   * A completed prior deletion remains deleted. This makes retry safe when
   * cleanup was partially finalized before the request was interrupted.
   */
  if(previouslyDeleted.has(userId)){
   deletedUserIds.push(userId);
   continue;
  }

  /*
   * A PARTIAL retry preserves identities that were already deliberately
   * retained by the prior fail-closed eligibility decision. Only unresolved
   * candidates are reconciled again.
   */
  if(previouslyRetained.has(userId)){
   retainedUserIds.push(userId);
   continue;
  }

  const authLookup=await admin.auth.admin.getUserById(userId);

  if(authLookup.error){
   /*
    * Supabase may return an Auth lookup error for an identity that was already
    * deleted before the request was interrupted. Confirm absence through the
    * profile row before classifying it as deleted. Any database lookup failure
    * remains fail-closed.
    */
   const profile=await admin
    .from("profiles")
    .select("id")
    .eq("id",userId)
    .maybeSingle();

   if(profile.error){
    console.error("Organization reset identity existence reconciliation failed",{
     resetAuditId,
     organizationId,
     userId,
     authMessage:authLookup.error.message,
     profileMessage:profile.error.message,
    });
    failedUserIds.push(userId);
    continue;
   }

   if(!profile.data){
    deletedUserIds.push(userId);
    continue;
   }

   console.error("Organization reset Auth identity lookup failed",{
    resetAuditId,
    organizationId,
    userId,
    message:authLookup.error.message,
   });
   failedUserIds.push(userId);
   continue;
  }

  if(!authLookup.data.user){
   const profile=await admin
    .from("profiles")
    .select("id")
    .eq("id",userId)
    .maybeSingle();

   if(profile.error){
    console.error("Organization reset profile reconciliation failed",{
     resetAuditId,
     organizationId,
     userId,
     message:profile.error.message,
    });
    failedUserIds.push(userId);
    continue;
   }

   if(!profile.data){
    deletedUserIds.push(userId);
    continue;
   }

   failedUserIds.push(userId);
   continue;
  }

  let eligibility;

  try{
   eligibility=await getGlobalUserDeletionEligibility(userId);
  }catch(error){
   console.error("Organization reset identity eligibility check failed",{
    resetAuditId,
    organizationId,
    userId,
    message:error instanceof Error?error.message:"Unknown error",
   });
   failedUserIds.push(userId);
   continue;
  }

  if(!eligibility.eligible){
   retainedUserIds.push(userId);
   continue;
  }

  const deletion=await admin.auth.admin.deleteUser(userId);

  if(deletion.error){
   console.error("Organization reset Auth identity deletion failed",{
    resetAuditId,
    organizationId,
    userId,
    message:deletion.error.message,
   });
   failedUserIds.push(userId);
   continue;
  }

  deletedUserIds.push(userId);
 }

 /*
  * Every candidate must be represented exactly once. The SQL finalizer
  * independently enforces this partition before updating the durable audit.
  */
 return {
  deletedUserIds:[...new Set(deletedUserIds)],
  retainedUserIds:[...new Set(retainedUserIds)],
  failedUserIds:[...new Set(failedUserIds)],
 };
}

export async function resetOrganizationCompanyAndUsersAction(form:FormData){
 await requireSuperAdmin();

 const organizationId=value(form,"organizationId");
 const preservedOwnerUserId=value(form,"preservedOwnerUserId");
 const confirmation=value(form,"confirmation");
 const path=`/admin/organizations/${organizationId}`;

 if(!organizationId||!preservedOwnerUserId){
  redirect(destination(path,"error","Select the Business Owner to preserve."));
 }

 const supabase=await createClient();

 const organization=await supabase
  .from("organizations")
  .select("id,name")
  .eq("id",organizationId)
  .maybeSingle();

 if(organization.error||!organization.data){
  console.error("Organization reset lookup failed",{
   code:organization.error?.code??null,
   message:organization.error?.message??null,
   organizationId,
  });
  redirect(destination(path,"error","The organization could not be verified."));
 }

 const expectedConfirmation=`RESET ${organization.data.name}`;

 if(confirmation!==expectedConfirmation){
  redirect(destination(path,"error",`Type ${expectedConfirmation} exactly to confirm the reset.`));
 }

 const owner=await supabase
  .from("organization_members")
  .select("id,user_id,role,status,is_active")
  .eq("organization_id",organizationId)
  .eq("user_id",preservedOwnerUserId)
  .eq("role","BUSINESS_OWNER")
  .eq("status","ACTIVE")
  .eq("is_active",true)
  .maybeSingle();

 if(owner.error||!owner.data){
  console.error("Organization reset owner verification failed",{
   code:owner.error?.code??null,
   message:owner.error?.message??null,
   organizationId,
   preservedOwnerUserId,
  });
  redirect(destination(path,"error","The preserved user must be an active Business Owner of this organization."));
 }

 const resetClient=supabase as ReturnType<
  typeof import("@supabase/ssr").createServerClient<OrganizationResetDatabase>
 >;

 const result=await resetClient.rpc("reset_organization_company_and_users",{
  target_organization_id:organizationId,
  preserved_owner_user_id:preservedOwnerUserId,
  confirmation_text:confirmation,
 });

 if(result.error){
  console.error("Organization reset failed",{
   code:result.error.code,
   message:result.error.message,
   organizationId,
   preservedOwnerUserId,
  });
  redirect(destination(path,"error","The organization reset could not be completed."));
 }

 const resetResult=result.data;
 const resetAuditId=resetResult?.resetAuditId;
 const candidateUserIds=uniqueStrings(
  resetResult?.identityCleanupCandidateUserIds,
 );

 if(!resetAuditId){
  console.error("Organization reset did not return an audit identifier",{
   organizationId,
   preservedOwnerUserId,
  });

  revalidatePath("/");
  revalidatePath("/admin/organizations");
  revalidatePath(path);
  revalidatePath("/admin/users");

  redirect(destination(
   path,
   "error",
   "Company data was reset, but identity cleanup could not be verified. Review the reset audit before continuing.",
  ));
 }

 /*
  * The database reset is committed before Supabase Auth cleanup. Candidate
  * identities are therefore reconciled independently and fail-closed.
  */
 const admin=createAdminClient();

 const {
  deletedUserIds,
  retainedUserIds,
  failedUserIds,
 }=await reconcileOrganizationResetIdentities({
  admin,
  resetAuditId,
  organizationId,
  preservedOwnerUserId,
  candidateUserIds,
 });

 const cleanupAudit=await finalizeOrganizationResetIdentityCleanup(
  admin,
  resetAuditId,
  deletedUserIds,
  retainedUserIds,
  failedUserIds,
 );

 revalidatePath("/");
 revalidatePath("/admin/organizations");
 revalidatePath(path);
 revalidatePath("/admin/users");

 if(cleanupAudit.error){
  console.error("Organization reset identity cleanup audit finalization failed",{
   resetAuditId,
   organizationId,
   message:cleanupAudit.error.message,
  });

  redirect(destination(
   path,
   "error",
   "Company data and eligible test identities were reset, but the cleanup audit could not be finalized. Use Retry Identity Cleanup below.",
   "resetAuditId",
   resetAuditId,
  ));
 }

 if(failedUserIds.length>0){
  redirect(destination(
   path,
   "error",
   `Company data was reset, but ${failedUserIds.length} test ${failedUserIds.length===1?"identity requires":"identities require"} cleanup retry. Use Retry Identity Cleanup below.`,
   "resetAuditId",
   resetAuditId,
  ));
 }

 const deletedCount=deletedUserIds.length;
 const retainedCount=retainedUserIds.length;

 redirect(destination(
  path,
  "message",
  `Company reset completed. ${organization.data.name}, its setup, and the selected Business Owner were preserved. ${deletedCount} test ${deletedCount===1?"identity was":"identities were"} permanently removed${retainedCount>0?`; ${retainedCount} shared or retained ${retainedCount===1?"identity was":"identities were"} preserved`:""}.`,
 ));
}

export async function retryOrganizationResetIdentityCleanupAction(form:FormData){
 await requireSuperAdmin();

 const organizationId=value(form,"organizationId");
 const resetAuditId=value(form,"resetAuditId");
 const path=`/admin/organizations/${organizationId}`;

 if(!organizationId||!resetAuditId){
  redirect(destination(path,"error","The reset cleanup audit could not be identified."));
 }

 const admin=createAdminClient();

 /*
  * platform_organization_reset_audit intentionally is not yet represented in
  * the generated Database type. Keep this narrow until normal type sync.
  */
 const auditClient=admin as unknown as {
  from(table:"platform_organization_reset_audit"):{
   select(columns:string):{
    eq(column:string,value:string):{
     eq(column:string,value:string):{
      maybeSingle():PromiseLike<{
       data:OrganizationResetAuditRow|null;
       error:{message:string;code?:string}|null;
      }>;
     };
    };
   };
  };
 };

 const audit=await auditClient
  .from("platform_organization_reset_audit")
  .select("id,organization_id,preserved_owner_user_id,identity_cleanup")
  .eq("id",resetAuditId)
  .eq("organization_id",organizationId)
  .maybeSingle();

 if(audit.error||!audit.data){
  console.error("Organization reset retry audit lookup failed",{
   resetAuditId,
   organizationId,
   message:audit.error?.message??null,
  });
  redirect(destination(path,"error","The reset cleanup audit could not be verified."));
 }

 const cleanup=audit.data.identity_cleanup;
 const candidateUserIds=uniqueStrings(cleanup?.candidateUserIds);

 if(!cleanup||!["PENDING","PARTIAL"].includes(cleanup.status)){
  redirect(destination(
   path,
   "message",
   cleanup?.status==="COMPLETE"
    ?"Identity cleanup is already complete."
    :"This reset does not require identity cleanup.",
  ));
 }

 const {
  deletedUserIds,
  retainedUserIds,
  failedUserIds,
 }=await reconcileOrganizationResetIdentities({
  admin,
  resetAuditId,
  organizationId,
  preservedOwnerUserId:audit.data.preserved_owner_user_id,
  candidateUserIds,
  previouslyDeletedUserIds:uniqueStrings(cleanup.deletedUserIds),
  previouslyRetainedUserIds:uniqueStrings(cleanup.retainedUserIds),
 });

 const finalized=await finalizeOrganizationResetIdentityCleanup(
  admin,
  resetAuditId,
  deletedUserIds,
  retainedUserIds,
  failedUserIds,
 );

 revalidatePath("/");
 revalidatePath("/admin/organizations");
 revalidatePath(path);
 revalidatePath("/admin/users");

 if(finalized.error){
  console.error("Organization reset retry audit finalization failed",{
   resetAuditId,
   organizationId,
   message:finalized.error.message,
  });
  redirect(destination(
   path,
   "error",
   "Identity cleanup was reconciled, but its audit could not be finalized. Retry the cleanup.",
   "resetAuditId",
   resetAuditId,
  ));
 }

 if(failedUserIds.length){
  redirect(destination(
   path,
   "error",
   `${failedUserIds.length} test ${failedUserIds.length===1?"identity still requires":"identities still require"} cleanup retry.`,
   "resetAuditId",
   resetAuditId,
  ));
 }

 redirect(destination(
  path,
  "message",
  `Identity cleanup completed. ${deletedUserIds.length} test ${deletedUserIds.length===1?"identity is":"identities are"} permanently removed; ${retainedUserIds.length} shared or retained ${retainedUserIds.length===1?"identity is":"identities are"} preserved.`,
 ));
}

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
