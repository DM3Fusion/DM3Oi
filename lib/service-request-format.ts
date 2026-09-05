import { humanize } from "@/lib/format";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";
export const serviceRequestStatuses = ["NEW","OPEN","PENDING_CUSTOMER","ON_HOLD","RESOLVED","CLOSED"] as const;
export const serviceRequestPriorities = ["LOW","NORMAL","HIGH","URGENT"] as const;
export const serviceRequestLabel = (value: string) => humanize(value);
export const formatServiceRequestUpdatedAt = (value: string | Date, timezone?: string | null) => formatOrganizationDateTime(value, timezone);
