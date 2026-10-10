import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function recordSuccessfulAuthentication(
  userId: string,
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.rpc(
    "record_authentication_event",
    {
      target_user_id: userId,
    },
  );

  if (error) {
    console.error("Authentication audit write failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    throw new Error("AUTHENTICATION_AUDIT_WRITE_FAILED");
  }
}
