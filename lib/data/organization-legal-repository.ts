import "server-only";

import {
  getAccessContext,
  requireSuperAdmin,
} from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export type OrganizationLegalState =
  | "NOT_CONFIGURED"
  | "NOT_ACCEPTED"
  | "UPDATE_REQUIRED"
  | "WITHDRAWN"
  | "ACTIVE";

export type OrganizationLegalDocuments = {
  terms_version_id: string;
  terms_version: string;
  terms_effective_date: string;
  privacy_version_id: string;
  privacy_version: string;
  privacy_effective_date: string;
};

export type OrganizationLegalStateResult = {
  state: OrganizationLegalState;
  can_accept: boolean;
  is_sandbox: boolean;
  sandbox_designation_suppressed: boolean;
  canonical_name: string;
  display_name: string;
  current_documents: OrganizationLegalDocuments | null;
};

export type OrganizationLegalAuditEvent = {
  id: string;
  event_type: "ACCEPTED" | "WITHDRAWN";
  license_id: string;
  terms_version_id: string;
  terms_version: string;
  terms_effective_date: string;
  privacy_version_id: string;
  privacy_version: string;
  privacy_effective_date: string;
  acted_by: string;
  actor_email: string | null;
  actor_display_name: string | null;
  acted_at: string;
};

export type OrganizationLegalAudit = {
  organization_id: string;
  canonical_name: string;
  display_name: string;
  is_sandbox: boolean;
  sandbox_designation_suppressed: boolean;
  legal_state: OrganizationLegalState;
  current_documents: OrganizationLegalDocuments | null;
  events: OrganizationLegalAuditEvent[];
};

type RpcResult<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<RpcResult<unknown>>;
};

const rpcClient = (client: unknown): RpcClient =>
  client as RpcClient;

export async function getMyOrganizationLegalState(
  organizationId: string,
): Promise<OrganizationLegalStateResult | null> {
  const access = await getAccessContext();

  if (
    !access?.activeOrganization ||
    access.activeOrganization.id !== organizationId
  ) {
    return null;
  }

  const supabase = await createClient();
  const result = await rpcClient(supabase).rpc(
    "get_my_organization_legal_state",
    {
      target_organization_id: organizationId,
    },
  );

  if (result.error) {
    console.error("Organization legal state lookup failed", {
      organizationId,
      code: result.error.code,
      message: result.error.message,
    });
    return null;
  }

  return result.data as OrganizationLegalStateResult | null;
}

export async function getOrganizationLegalAuditAdmin(
  organizationId: string,
): Promise<OrganizationLegalAudit | null> {
  await requireSuperAdmin();

  const supabase = await createClient();
  const result = await rpcClient(supabase).rpc(
    "get_organization_legal_audit_admin",
    {
      target_organization_id: organizationId,
    },
  );

  if (result.error) {
    console.error("Organization legal audit lookup failed", {
      organizationId,
      code: result.error.code,
      message: result.error.message,
    });
    throw new Error(
      "Organization legal authorization data is temporarily unavailable.",
    );
  }

  return result.data as OrganizationLegalAudit | null;
}
