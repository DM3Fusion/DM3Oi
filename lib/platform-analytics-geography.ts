const geographyTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "numeric",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatGeographyLastAccessed(value: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  const parts = geographyTimestampFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const month = part("month");
  const day = part("day");
  const year = part("year");
  const hour = part("hour");
  const minute = part("minute");
  const dayPeriod = part("dayPeriod");

  if (!month || !day || !year || !hour || !minute || !dayPeriod) {
    return null;
  }

  return `${month}/${day}/${year} ${hour}:${minute} ${dayPeriod}`;
}
