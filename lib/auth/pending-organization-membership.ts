export type PendingOrganizationMembership = {
  membership_id: string;
  organization_id: string;
  organization_name: string;
  status: "INVITED" | "VERIFIED";
};

type PendingMembershipRpcClient = {
  rpc(
    fn: "get_my_pending_organization_membership",
  ): PromiseLike<{
    data: PendingOrganizationMembership[] | null;
    error: {
      code?: string;
      message: string;
      details?: string | null;
      hint?: string | null;
    } | null;
  }>;
};

export async function getMyPendingOrganizationMembership(client: unknown) {
  const rpcClient = client as PendingMembershipRpcClient;
  const { data, error } = await rpcClient.rpc(
    "get_my_pending_organization_membership",
  );

  if (error) {
    console.error("Pending organization membership lookup failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  return data?.[0] ?? null;
}
