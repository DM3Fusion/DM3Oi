"use server";
import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/auth/context";
import { canConfigureOrganizationRole } from "@/lib/auth/organization-permissions";
import { configurableOrganizationPermissions,configurableOrganizationRoles,hasPermission,type ConfigurableOrganizationRole,type Permission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.generated";

type Result={ok:true}|{ok:false;error:string};
const validRole=(role:string):role is ConfigurableOrganizationRole=>configurableOrganizationRoles.some(item=>item===role);
export async function saveOrganizationRolePermissionsAction(input:{role:string;changes:Record<string,boolean>}):Promise<Result>{
 const access=await getAccessContext();const organization=access?.activeOrganization;
 if(!organization||!hasPermission(access,"MANAGE_ROLE_PERMISSIONS")||!validRole(input.role)||!canConfigureOrganizationRole(organization.role,input.role,access.isSuperAdmin))return{ok:false,error:"You are not authorized to configure that role."};
 const changes:Record<string,boolean>={};
 for(const [key,allowed] of Object.entries(input.changes)){const permission=configurableOrganizationPermissions.find(item=>item===key) as Permission|undefined;if(!permission)return{ok:false,error:"The permission selection is invalid."};if(permission==="MANAGE_ROLE_PERMISSIONS"&&(input.role==="STAFF_MANAGER"||input.role==="STAFF_USER"))return{ok:false,error:"That role cannot administer organization access."};if(allowed&&!hasPermission(access,permission))return{ok:false,error:"You cannot grant a permission you do not possess."};changes[permission]=Boolean(allowed);}
 const supabase=await createClient();const result=await supabase.rpc("save_organization_role_permissions",{target_organization_id:organization.id,target_role:input.role,target_changes:changes as Json,target_restore:false});const error=result.error;
 if(error){console.error("Organization role permission save failed",{code:error.code,message:error.message});return{ok:false,error:"Organization access could not be updated."};}
 revalidatePath("/settings/user-access");revalidatePath("/","layout");return{ok:true};
}
export async function restoreOrganizationRolePermissionsAction(role:string):Promise<Result>{
 const access=await getAccessContext();const organization=access?.activeOrganization;
 if(!organization||!hasPermission(access,"MANAGE_ROLE_PERMISSIONS")||!validRole(role)||!canConfigureOrganizationRole(organization.role,role,access.isSuperAdmin))return{ok:false,error:"You are not authorized to restore that role."};
 const supabase=await createClient();const result=await supabase.rpc("save_organization_role_permissions",{target_organization_id:organization.id,target_role:role,target_changes:{},target_restore:true});const error=result.error;
 if(error){console.error("Organization role permission restore failed",{code:error.code,message:error.message});return{ok:false,error:"Recommended defaults could not be restored."};}
 revalidatePath("/settings/user-access");revalidatePath("/","layout");return{ok:true};
}
