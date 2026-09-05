import { humanize } from "@/lib/format";
export const serviceRequestStatuses = ["NEW","OPEN","PENDING_CUSTOMER","ON_HOLD","RESOLVED","CLOSED"] as const;
export const serviceRequestPriorities = ["LOW","NORMAL","HIGH","URGENT"] as const;
export const serviceRequestLabel = (value: string) => humanize(value);
export const formatServiceRequestUpdatedAt = (value: string | Date) => new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
