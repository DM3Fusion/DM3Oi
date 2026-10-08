"use client";
import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "./config";
import type { Database } from "@/types/database";
export function createClient(options?:{detectSessionInUrl?:boolean}){const {url,anonKey}=requireSupabaseConfig();return createBrowserClient<Database>(url,anonKey,{auth:{detectSessionInUrl:options?.detectSessionInUrl??true}});}
