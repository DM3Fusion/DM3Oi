import "server-only";
import {
  maskPlatformProfile,
  ORGANIZATION_SUPPORT_IDENTITY,
} from "@/lib/auth/platform-privacy";
import { createAdminClient } from "@/lib/supabase/admin";
import { cache } from "react";

export { maskPlatformProfile, ORGANIZATION_SUPPORT_IDENTITY };

async function resolvePlatformAdminUserIds() {
  const { data, error } = await createAdminClient()
    .from("platform_user_roles")
    .select("user_id")
    .eq("role", "SUPER_ADMIN")
    .eq("is_active", true);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.user_id));
}

export const getPlatformAdminUserIds = cache(resolvePlatformAdminUserIds);
