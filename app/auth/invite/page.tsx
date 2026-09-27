"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function InvitePage(){
 const [error,setError]=useState<string|null>(null);
 const [authenticatedFailure,setAuthenticatedFailure]=useState(false);
 useEffect(()=>{void (async()=>{
  const query=new URLSearchParams(window.location.search);
  const fragment=new URLSearchParams(window.location.hash.replace(/^#/,""));
  const tokenHash=query.get("token_hash");
  const verificationType=query.get("type");
  const completionError=query.get("error")==="membership_verification";
  const accessToken=fragment.get("access_token"); const refreshToken=fragment.get("refresh_token"); const authError=fragment.get("error")||fragment.get("error_code");
  window.history.replaceState(null,"",window.location.pathname);
  if(completionError){setAuthenticatedFailure(true);setError("Your account was authenticated, but organization invitation verification could not be completed. Contact your DM3Oi administrator before trying again.");return;}
  if(authError){setError("Invitation link expired or is invalid.");return;}
  const supabase=createClient({detectSessionInUrl:false});
  const established=tokenHash&&verificationType==="invite"
   ? await supabase.auth.verifyOtp({token_hash:tokenHash,type:"invite"})
   : accessToken&&refreshToken
    ? await supabase.auth.setSession({access_token:accessToken,refresh_token:refreshToken})
    : null;
  if(!established){setError("Invitation link expired or is invalid.");return;}
  if(established.error||!established.data.user){setError("Invitation link expired or is invalid.");return;}
  const verified=await supabase.auth.getUser();
  if(!verified.data.user||verified.data.user.id!==established.data.user.id){await supabase.auth.signOut({scope:"local"});setError("The invitation could not establish a session.");return;}
  window.location.replace("/auth/invite/complete");
 })();},[]);
 return <main className="public-main"><section className="auth-card"><h1>{authenticatedFailure?"Invitation verification pending":error?"Invitation link expired":"Accepting invitation"}</h1><p>{error??"Establishing your DM3Oi session…"}</p>{authenticatedFailure?<form action="/auth/sign-out" method="post"><button className="secondary-button" type="submit">Sign out</button></form>:error?<Link className="primary-button" href="/login">Return to Sign In</Link>:null}</section></main>;
}
