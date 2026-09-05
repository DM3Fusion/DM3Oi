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

const partsInTimeZone = (value: Date, timeZone: string) => Object.fromEntries(
  new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" })
    .formatToParts(value)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]),
) as Record<string, number>;

export const startOfOrganizationDay = (now: Date, timezone?: string | null) => {
  const timeZone = isValidTimeZone(timezone) ? timezone : "UTC";
  const local = partsInTimeZone(now, timeZone);
  const localMidnight = Date.UTC(local.year, local.month - 1, local.day);
  let instant = localMidnight;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const atGuess = new Date(instant);
    const parts = partsInTimeZone(atGuess, timeZone);
    const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    instant = localMidnight - (representedAsUtc - atGuess.getTime());
  }
  return new Date(instant);
};

export const formatOrganizationDateTime = (value: string | Date | null | undefined, timezone?: string | null, style: OrganizationDateTimeStyle = "numeric") => {
  if (!value) return "—";
  const timeZone = isValidTimeZone(timezone) ? timezone : "UTC";
  const options: Intl.DateTimeFormatOptions = style === "medium"
    ? { timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }
    : { timeZone, month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true };
  try { return new Intl.DateTimeFormat("en-US", options).format(new Date(value)); }
  catch { return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(value)); }
};
