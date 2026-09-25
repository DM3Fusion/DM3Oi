import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseEnvironment } from "@/lib/config/env";
import type { Database } from "@/types/database.generated";

export const ADMIN_KEY_ENV = "DM3IQCM_SUPABASE_SERVICE_ROLE_KEY";
export function createAdminClient() {
  const { url } = requireSupabaseEnvironment();
  const key = process.env[ADMIN_KEY_ENV]?.trim();
  if (!key) throw new Error("ADMIN_AUTH_NOT_CONFIGURED");
  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
export function getInvitationRedirect() {
  const configured = process.env.DM3IQCM_SITE_URL?.trim();
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const origin =
    configured ||
    (vercel ? `https://${vercel}` : "https://dm3oi.com");
  return `${origin.replace(/\/$/, "")}/auth/invite`;
}
