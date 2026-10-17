"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { recordAuthenticationSecuritySuccess } from "@/lib/data/authentication-security-audit";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { safeInternalPath } from "./redirects";
import { recordSuccessfulAuthentication } from "@/lib/data/authentication-audit";
const read=(data:FormData,key:string)=>{const value=data.get(key);return typeof value==="string"?value.trim():""};
const loginUrl=(values:Record<string,string>)=>`/login?${new URLSearchParams(values).toString()}`;

export async function sendLoginOtpAction(formData:FormData){const email=read(formData,"email").toLowerCase();const next=safeInternalPath(read(formData,"next"));if(!isSupabaseConfigured())redirect(loginUrl({error:"Supabase environment variables are not configured.",email,next}));if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))redirect(loginUrl({error:"Enter a valid email address.",email,next}));const supabase=await createClient();await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false}});redirect(loginUrl({sent:"1",message:"If this email is associated with an authorized DM3Oi account, a login code will be sent.",email,next}));}

export async function verifyLoginOtpAction(formData:FormData){const email=read(formData,"email").toLowerCase();const token=read(formData,"token").replace(/\s+/g,"");const next=safeInternalPath(read(formData,"next"));if(!isSupabaseConfigured())redirect(loginUrl({error:"Supabase environment variables are not configured.",email,next}));if(!email||!token)redirect(loginUrl({sent:"1",error:"Enter the email code.",email,next}));const supabase=await createClient();const {data:verification,error}=await supabase.auth.verifyOtp({email,token,type:"email"});if(error)redirect(loginUrl({sent:"1",error:"The email code is invalid or has expired.",email,next}));const authenticatedUserId=verification.user?.id;if(!authenticatedUserId){await supabase.auth.signOut();redirect(loginUrl({sent:"1",error:"Your sign-in could not be securely recorded. Request a new code and try again.",email,next}));}try{
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const claims = claimsData?.claims;
  const sessionId = claims?.session_id;

  if (
    claimsError ||
    claims?.sub !== authenticatedUserId ||
    typeof sessionId !== "string"
  ) {
    throw new Error("AUTHENTICATION_SECURITY_EVIDENCE_INVALID");
  }

  await recordSuccessfulAuthentication(authenticatedUserId);
  await recordAuthenticationSecuritySuccess(
    authenticatedUserId,
    sessionId,
    await headers(),
  );
}catch{await supabase.auth.signOut();redirect(loginUrl({sent:"1",error:"Your sign-in could not be securely recorded. Request a new code and try again.",email,next}));}const {data:verifiedMembership,error:membershipError}=await supabase.rpc("verify_my_membership_invitation");if(membershipError){console.error("Membership invitation verification failed",{code:membershipError.code,message:membershipError.message,details:membershipError.details,hint:membershipError.hint});redirect("/account/unprovisioned");}if(verifiedMembership?.length)redirect("/account/pending-activation");redirect(next);}

export async function signOutAction(){if(isSupabaseConfigured()){const supabase=await createClient();await supabase.auth.signOut();}redirect("/");}
