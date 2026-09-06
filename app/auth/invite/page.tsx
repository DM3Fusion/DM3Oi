"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function InvitePage(){
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{void (async()=>{
  const params=new URLSearchParams(window.location.hash.replace(/^#/,""));
  const accessToken=params.get("access_token"); const refreshToken=params.get("refresh_token"); const authError=params.get("error")||params.get("error_code");
  window.history.replaceState(null,"",window.location.pathname);
  if(authError||!accessToken||!refreshToken){setError("Invitation link expired or is invalid.");return;}
  const supabase=createClient({detectSessionInUrl:false});
  const established=await supabase.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
  if(established.error||!established.data.user){setError("Invitation link expired or is invalid.");return;}
  const verified=await supabase.auth.getUser();
  if(!verified.data.user||verified.data.user.id!==established.data.user.id){await supabase.auth.signOut({scope:"local"});setError("The invitation could not establish a session.");return;}
  window.location.replace("/auth/invite/complete");
 })();},[]);
 return <main className="public-main"><section className="auth-card"><h1>{error?"Invitation link expired":"Accepting invitation"}</h1><p>{error??"Establishing your DM3Oi session…"}</p>{error?<Link className="primary-button" href="/login">Return to Sign In</Link>:null}</section></main>;
}
