"use server";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { safeInternalPath } from "./redirects";
const read=(data:FormData,key:string)=>{const value=data.get(key);return typeof value==="string"?value.trim():""};
const loginUrl=(values:Record<string,string>)=>`/login?${new URLSearchParams(values).toString()}`;

export async function signInAction(formData:FormData){if(!isSupabaseConfigured())redirect(loginUrl({error:"Supabase environment variables are not configured."}));const email=read(formData,"email").toLowerCase();const password=read(formData,"password");const next=safeInternalPath(read(formData,"next"));if(!email||!password)redirect(loginUrl({error:"Email and password are required.",email,next}));const supabase=await createClient();const {error}=await supabase.auth.signInWithPassword({email,password});if(error)redirect(loginUrl({error:"Invalid email or password.",email,next}));redirect(next);}

export async function sendLoginOtpAction(formData:FormData){const email=read(formData,"email").toLowerCase();const next=safeInternalPath(read(formData,"next"));if(!isSupabaseConfigured())redirect(loginUrl({mode:"otp",error:"Supabase environment variables are not configured.",email,next}));if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))redirect(loginUrl({mode:"otp",error:"Enter a valid email address.",email,next}));const supabase=await createClient();await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false}});redirect(loginUrl({mode:"otp",sent:"1",message:"If this email is associated with an authorized DM3Oi account, a login code will be sent.",email,next}));}

export async function verifyLoginOtpAction(formData:FormData){const email=read(formData,"email").toLowerCase();const token=read(formData,"token").replace(/\s+/g,"");const next=safeInternalPath(read(formData,"next"));if(!isSupabaseConfigured())redirect(loginUrl({mode:"otp",error:"Supabase environment variables are not configured.",email,next}));if(!email||!token)redirect(loginUrl({mode:"otp",sent:"1",error:"Enter the email code.",email,next}));const supabase=await createClient();const {error}=await supabase.auth.verifyOtp({email,token,type:"email"});if(error)redirect(loginUrl({mode:"otp",sent:"1",error:"The email code is invalid or has expired.",email,next}));redirect(next);}

export async function signOutAction(){if(isSupabaseConfigured()){const supabase=await createClient();await supabase.auth.signOut();}redirect("/login");}
