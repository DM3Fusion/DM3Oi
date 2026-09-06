type SearchableUser={role:string;is_active:boolean;profiles:unknown};
type UserProfile={display_name?:string|null;email?:string|null};
export const normalizeUserQuery=(value?:string)=>(value??"").trim().slice(0,200);
export function userMatchesSearch(member:SearchableUser,query:string){const term=normalizeUserQuery(query).toLowerCase();if(!term)return true;const profile=(Array.isArray(member.profiles)?member.profiles[0]:member.profiles) as UserProfile|null;return [profile?.display_name,profile?.email,member.role.replaceAll("_"," "),member.is_active?"active":"inactive"].some(value=>value?.toLowerCase().includes(term));}
