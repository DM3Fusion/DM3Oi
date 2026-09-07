export type OrganizationDetailsValues = {
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
};

export const isOrganizationDetailsDirty = (
  values: OrganizationDetailsValues,
  saved: OrganizationDetailsValues,
) =>
  values.name !== saved.name ||
  values.slug !== saved.slug ||
  values.status !== saved.status;
