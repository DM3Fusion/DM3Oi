import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getPublicEnvironment } from "@/lib/config/env";
import { safeInternalPath } from "@/lib/auth/redirects";
import { isMeaningfulSessionActivity, SESSION_ACTIVITY_MARKER_COOKIE } from "@/lib/auth/session-policy";
import type { Database } from "@/types/database";
const publicRoutes=["/","/login","/terms","/privacy","/request-trial","/robots.txt","/sitemap.xml","/auth/callback","/auth/invite","/auth/sign-out","/api/public/overview-download"];
const publicAnalyticsRoutes=new Set(["/api/analytics/page-view","/api/analytics/interaction"]);
const ACTIVE_ORGANIZATION_COOKIE="dm3iqcm-active-organization";
const ACTIVE_PORTAL_ACCESS_COOKIE="dm3iqcm-active-portal-access";
type RouteState={profile_active?:boolean;has_active_super_admin_access?:boolean;has_active_organization_access?:boolean;has_active_customer_portal_access?:boolean;has_pending_organization_membership?:boolean;session_policy_valid?:boolean;session_policy_scope?:"INTERNAL"|"CUSTOMER_PORTAL"};
function responseWithCookies(target:URL,source:NextResponse){const redirect=NextResponse.redirect(target);source.cookies.getAll().forEach(cookie=>redirect.cookies.set(cookie));return redirect;}
export async function proxy(request:NextRequest){
 const pathname=request.nextUrl.pathname; const forwardedHeaders=new Headers(request.headers); forwardedHeaders.set("x-dm3oi-route-pathname",pathname); const forwardedRequest={headers:forwardedHeaders}; let response=NextResponse.next({request:forwardedRequest});
 if(pathname==="/auth/callback") return response;
 if(publicAnalyticsRoutes.has(pathname)) return response;
 const protectedRoute=isProtected(pathname); const env=getPublicEnvironment();
 if(!env.configured){if(protectedRoute)return NextResponse.redirect(new URL("/login?error=Supabase%20environment%20variables%20are%20not%20configured.",request.url));return response;}
 const supabase=createServerClient<Database>(env.supabaseUrl,env.supabaseAnonKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll(items){items.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request:forwardedRequest});items.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
 const {data:claimsData}=await supabase.auth.getClaims();
 const authenticated=typeof claimsData?.claims.sub==="string";
 if(!authenticated&&protectedRoute){const target=new URL("/login",request.url);target.searchParams.set("next",safeInternalPath(`${pathname}${request.nextUrl.search}`));return responseWithCookies(target,response);}

 let routeState:RouteState|null=null;
 const enforceSession=authenticated&&(protectedRoute||pathname==="/"||pathname==="/login");
 if(enforceSession){
  const meaningfulActivity=isMeaningfulSessionActivity(request);
  const sessionState=await supabase.rpc("get_my_route_access_state",{target_is_meaningful_activity:meaningfulActivity}).maybeSingle();
  routeState=sessionState.data as RouteState|null;
  if(meaningfulActivity)response.cookies.delete(SESSION_ACTIVITY_MARKER_COOKIE);
  if(sessionState.error||routeState?.session_policy_valid!==true){
   if(sessionState.error)console.error("Proxy session policy lookup failed",{code:sessionState.error.code,message:sessionState.error.message});
   await supabase.auth.signOut({scope:"local"});
   response.cookies.delete(SESSION_ACTIVITY_MARKER_COOKIE);
   response.cookies.delete(ACTIVE_ORGANIZATION_COOKIE);
   response.cookies.delete(ACTIVE_PORTAL_ACCESS_COOKIE);
   if(pathname==="/login")return response;
   const target=new URL("/login",request.url);target.searchParams.set("error","Your session has ended. Sign in again.");
   if(protectedRoute)target.searchParams.set("next",safeInternalPath(`${pathname}${request.nextUrl.search}`));
   return responseWithCookies(target,response);
  }
 }

 if(authenticated&&pathname==="/login")return responseWithCookies(new URL("/",request.url),response);
 if(authenticated&&protectedRoute){
  const profileActive=routeState?.profile_active===true;
  const hasActiveAccess=Boolean(routeState?.has_active_super_admin_access||routeState?.has_active_organization_access||routeState?.has_active_customer_portal_access);
  const hasPendingOrganizationAccess=routeState?.has_pending_organization_membership===true;

  if(!profileActive){
   if(pathname!=="/account/unprovisioned")return responseWithCookies(new URL("/account/unprovisioned",request.url),response);
  }else if(!hasActiveAccess&&hasPendingOrganizationAccess){
   if(pathname!=="/account/pending-activation")return responseWithCookies(new URL("/account/pending-activation",request.url),response);
  }else if(!hasActiveAccess){
   if(pathname!=="/account/unprovisioned")return responseWithCookies(new URL("/account/unprovisioned",request.url),response);
  }
 }
 return response;
}
function isProtected(pathname:string){return !publicAnalyticsRoutes.has(pathname)&&!publicRoutes.some(route=>pathname===route||pathname.startsWith(`${route}/`));}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]};
