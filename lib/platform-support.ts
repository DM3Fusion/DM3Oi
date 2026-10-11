export const platformSupportCategories = [
  "TERMS",
  "PRIVACY",
  "LICENSING",
  "ACCOUNT",
  "TECHNICAL",
  "OTHER",
] as const;

export type PlatformSupportCategory =
  (typeof platformSupportCategories)[number];

export const platformSupportCategoryLabels:
  Record<PlatformSupportCategory, string> = {
    TERMS: "Terms of Service",
    PRIVACY: "Privacy",
    LICENSING: "Licensing",
    ACCOUNT: "Account",
    TECHNICAL: "Technical",
    OTHER: "Other",
  };

export const platformSupportStatuses = [
  "SUBMITTED",
  "RECEIVED",
  "IN_REVIEW",
  "RESPONDED",
  "CLOSED",
] as const;

export type PlatformSupportStatus =
  (typeof platformSupportStatuses)[number];

export const platformSupportStatusLabels:
  Record<PlatformSupportStatus, string> = {
    SUBMITTED: "Submitted",
    RECEIVED: "Received",
    IN_REVIEW: "In Review",
    RESPONDED: "Responded",
    CLOSED: "Closed",
  };

export const isPlatformSupportCategory = (
  value: string,
): value is PlatformSupportCategory =>
  platformSupportCategories.includes(
    value as PlatformSupportCategory,
  );

export const isPlatformSupportStatus = (
  value: string,
): value is PlatformSupportStatus =>
  platformSupportStatuses.includes(
    value as PlatformSupportStatus,
  );
