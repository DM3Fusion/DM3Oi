import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getPublicEnvironment } from "@/lib/config/env";
import { safeInternalPath } from "@/lib/auth/redirects";
import type { Database } from "@/types/database.generated";
const publicRoutes=["/","/login","/terms","/privacy","/request-trial","/robots.txt","/sitemap.xml","/auth/callback","/auth/invite","/auth/sign-out","/api/public/overview-download"];
const publicAnalyticsRoutes=new Set(["/api/analytics/page-view","/api/analytics/interaction"]);
export async function proxy(request:NextRequest){
 const pathname=request.nextUrl.pathname; const forwardedHeaders=new Headers(request.headers); forwardedHeaders.set("x-dm3oi-route-pathname",pathname); const forwardedRequest={headers:forwardedHeaders}; let response=NextResponse.next({request:forwardedRequest});
 if(pathname==="/auth/callback") return response;
 if(publicAnalyticsRoutes.has(pathname)) return response;
 const protectedRoute=isProtected(pathname); const env=getPublicEnvironment();
 if(!env.configured){if(protectedRoute)return NextResponse.redirect(new URL("/login?error=Supabase%20environment%20variables%20are%20not%20configured.",request.url));return response;}
 const supabase=createServerClient<Database>(env.supabaseUrl,env.supabaseAnonKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll(items){items.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request:forwardedRequest});items.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
 const {data:{user}}=await supabase.auth.getUser();
 if(!user&&protectedRoute){const target=new URL("/login",request.url);target.searchParams.set("next",safeInternalPath(`${pathname}${request.nextUrl.search}`));return NextResponse.redirect(target);}
 if(user&&pathname==="/login")return NextResponse.redirect(new URL("/",request.url));
 if(user&&protectedRoute){
  const {data:routeState,error:routeStateError}=await supabase.rpc("get_my_route_access_state").maybeSingle();
  if(routeStateError)console.error("Proxy route access state lookup failed",{code:routeStateError.code,message:routeStateError.message});
  const profileActive=routeState?.profile_active===true;
  const hasActiveAccess=Boolean(routeState?.has_active_super_admin_access||routeState?.has_active_organization_access||routeState?.has_active_customer_portal_access);
  const hasPendingOrganizationAccess=routeState?.has_pending_organization_membership===true;

  if(!profileActive){
   if(pathname!=="/account/unprovisioned")return NextResponse.redirect(new URL("/account/unprovisioned",request.url));
  }else if(!hasActiveAccess&&hasPendingOrganizationAccess){
   if(pathname!=="/account/pending-activation")return NextResponse.redirect(new URL("/account/pending-activation",request.url));
  }else if(!hasActiveAccess){
   if(pathname!=="/account/unprovisioned")return NextResponse.redirect(new URL("/account/unprovisioned",request.url));
  }
 }
 return response;
}
function isProtected(pathname:string){return !publicAnalyticsRoutes.has(pathname)&&!publicRoutes.some(route=>pathname===route||pathname.startsWith(`${route}/`));}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]};
