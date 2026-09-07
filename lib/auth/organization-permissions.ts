import type { ApplicationRole } from "@/lib/auth/permissions";
import type { ConfigurableOrganizationRole } from "@/lib/auth/permissions";

export function canConfigureOrganizationRole(actorRole:ApplicationRole,targetRole:ConfigurableOrganizationRole,isSuperAdmin=false){
 if(isSuperAdmin)return true;
 if(actorRole==="BUSINESS_OWNER")return targetRole!=="BUSINESS_OWNER";
 if(actorRole==="BUSINESS_ADMIN")return targetRole==="STAFF_MANAGER"||targetRole==="STAFF_USER";
 return false;
}
