import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getPublicEnvironment } from "@/lib/config/env";
import { safeInternalPath } from "@/lib/auth/redirects";
import type { Database } from "@/types/database.generated";
const publicRoutes=["/","/login","/terms","/privacy","/request-trial","/robots.txt","/sitemap.xml","/auth/callback","/auth/invite","/auth/sign-out"];
export async function proxy(request:NextRequest){
 let response=NextResponse.next({request}); const env=getPublicEnvironment(); const pathname=request.nextUrl.pathname;
 if(pathname==="/auth/callback") return response;
 if(!env.configured){if(isProtected(pathname))return NextResponse.redirect(new URL("/login?error=Supabase%20environment%20variables%20are%20not%20configured.",request.url));return response;}
 const supabase=createServerClient<Database>(env.supabaseUrl,env.supabaseAnonKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll(items){items.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});items.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
 const {data:{user}}=await supabase.auth.getUser();
 if(!user&&isProtected(pathname)){const target=new URL("/login",request.url);target.searchParams.set("next",safeInternalPath(`${pathname}${request.nextUrl.search}`));return NextResponse.redirect(target);}
 if(user&&pathname==="/login")return NextResponse.redirect(new URL("/",request.url));
 if(user&&isProtected(pathname)&&pathname!=="/account/unprovisioned"){const [platform,membership,portal]=await Promise.all([supabase.from("platform_user_roles").select("id").eq("user_id",user.id).eq("role","SUPER_ADMIN").eq("is_active",true).limit(1),supabase.from("organization_members").select("id").eq("user_id",user.id).eq("is_active",true).limit(1),supabase.from("customer_portal_users").select("id").eq("user_id",user.id).eq("is_active",true).limit(1)]);if(!platform.data?.length&&!membership.data?.length&&!portal.data?.length)return NextResponse.redirect(new URL("/account/unprovisioned",request.url));}
 return response;
}
function isProtected(pathname:string){return !publicRoutes.some(route=>pathname===route||pathname.startsWith(`${route}/`));}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]};
