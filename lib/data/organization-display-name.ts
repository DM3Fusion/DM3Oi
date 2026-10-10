import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type RpcResult<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};

export async function resolveOrganizationDisplayName(
  organizationId: string,
  fallbackName: string,
): Promise<string> {
  const admin = createAdminClient();
  const rpc = admin.rpc.bind(admin) as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<RpcResult<string>>;

  const result = await rpc("get_organization_display_name_server", {
    target_organization_id: organizationId,
  });

  if (result.error || !result.data?.trim()) {
    console.error("Organization display-name lookup failed", {
      organizationId,
      code: result.error?.code,
      message: result.error?.message,
    });
    return fallbackName;
  }

  return result.data.trim();
}
