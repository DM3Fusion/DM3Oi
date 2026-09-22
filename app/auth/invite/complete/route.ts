import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/context";

export async function GET(request:NextRequest){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.redirect(new URL("/login?error=The%20invitation%20could%20not%20establish%20a%20session.",request.url));const {data:verifiedMembership,error}=await supabase.rpc("verify_my_membership_invitation");if(error){console.error("Invitation membership verification failed",{code:error.code,message:error.message,details:error.details,hint:error.hint});return NextResponse.redirect(new URL("/account/unprovisioned",request.url));}const response=NextResponse.redirect(new URL(verifiedMembership?.length?"/account/pending-activation":"/",request.url));response.cookies.delete(ACTIVE_ORGANIZATION_COOKIE);return response;}
