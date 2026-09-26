export type IdentityReferenceCountResult = {
  count: number | null;
  error: { message: string } | null;
};

export interface IdentityReferenceCountQuery
  extends PromiseLike<IdentityReferenceCountResult> {
  eq(column: string, value: string): IdentityReferenceCountQuery;
}

export type OrganizationLifecycleStatusIdentityClient = {
  from(table: "organization_lifecycle_statuses"): {
    select(
      columns: "organization_id",
      options: { count: "exact"; head: true },
    ): IdentityReferenceCountQuery;
  };
};

export function queryOrganizationLifecycleStatusIdentityReferences(
  client: OrganizationLifecycleStatusIdentityClient,
  organizationId: string,
  userId: string,
): PromiseLike<IdentityReferenceCountResult> {
  return client
    .from("organization_lifecycle_statuses")
    .select("organization_id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("updated_by", userId);
}
