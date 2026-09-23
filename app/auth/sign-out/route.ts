import { NextResponse, type NextRequest } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
export async function POST(request:NextRequest){if(isSupabaseConfigured()){const supabase=await createClient();await supabase.auth.signOut();}return NextResponse.redirect(new URL("/",request.url),303);}
