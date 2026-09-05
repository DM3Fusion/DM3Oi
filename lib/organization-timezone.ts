import tzLookup from "tz-lookup";
import zipcodes from "zipcodes";

export const isValidTimeZone = (value: unknown): value is string => {
  if (typeof value !== "string" || !value.trim()) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
};

export const resolveUsZipTimeZone = (postalCode: string): string | null => {
  const match = postalCode.trim().match(/^(\d{5})(?:-\d{4})?$/);
  if (!match) return null;
  const location = zipcodes.lookup(match[1]);
  if (!location) return null;
  try { return tzLookup(location.latitude, location.longitude); } catch { return null; }
};

export type OrganizationDateTimeStyle = "numeric" | "medium";

export const formatOrganizationDateTime = (value: string | Date | null | undefined, timezone?: string | null, style: OrganizationDateTimeStyle = "numeric") => {
  if (!value) return "—";
  const timeZone = isValidTimeZone(timezone) ? timezone : "UTC";
  const options: Intl.DateTimeFormatOptions = style === "medium"
    ? { timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }
    : { timeZone, month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true };
  try { return new Intl.DateTimeFormat("en-US", options).format(new Date(value)); }
  catch { return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(value)); }
};
