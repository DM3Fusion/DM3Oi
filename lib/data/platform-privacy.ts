import "server-only";
import {
  maskPlatformProfile,
  ORGANIZATION_SUPPORT_IDENTITY,
} from "@/lib/auth/platform-privacy";
import { createAdminClient } from "@/lib/supabase/admin";

export { maskPlatformProfile, ORGANIZATION_SUPPORT_IDENTITY };

export async function getPlatformAdminUserIds() {
  const { data, error } = await createAdminClient()
    .from("platform_user_roles")
    .select("user_id")
    .eq("role", "SUPER_ADMIN")
    .eq("is_active", true);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.user_id));
}
