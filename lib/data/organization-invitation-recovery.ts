import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type InvitationRecoveryResult =
  | "ROLLED_BACK_DELETED"
  | "ROLLED_BACK_RESTORED"
  | "RECOVERY_RETAINED";

type InvitationOperationInput = {
  operationId: string;
  initiatorId: string;
};

export async function completeOrganizationInvitation(
  input: InvitationOperationInput,
): Promise<boolean> {
  try {
    const admin = createAdminClient();

    const { error } = await admin.rpc(
      "complete_organization_membership_invitation",
      {
        target_operation_id: input.operationId,
        target_initiator_id: input.initiatorId,
      },
    );

    if (error) {
      console.error("Organization invitation completion failed", {
        operationId: input.operationId,
        code: error.code,
        message: error.message,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error("Organization invitation completion threw", {
      operationId: input.operationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

export async function recoverOrganizationInvitation(
  input: InvitationOperationInput,
): Promise<InvitationRecoveryResult | null> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc(
      "rollback_organization_membership_invitation",
      {
        target_operation_id: input.operationId,
        target_initiator_id: input.initiatorId,
      },
    );

    if (error) {
      console.error("Organization invitation recovery failed", {
        operationId: input.operationId,
        code: error.code,
        message: error.message,
      });
      return null;
    }

    if (
      data === "ROLLED_BACK_DELETED" ||
      data === "ROLLED_BACK_RESTORED" ||
      data === "RECOVERY_RETAINED"
    ) {
      return data;
    }

    console.error("Organization invitation recovery returned an invalid state", {
      operationId: input.operationId,
      result: data,
    });

    return null;
  } catch (error) {
    console.error("Organization invitation recovery threw", {
      operationId: input.operationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}
