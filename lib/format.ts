export const humanize = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export const formatDate = (value?: string) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "—";

const platformDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export const formatPlatformDateTime = (value?: string | null) =>
  value ? platformDateTimeFormatter.format(new Date(value)) : "—";
export const formatRelativeDate = (value: string, now = new Date()) => { const days = Math.round((new Date(value).getTime() - now.getTime()) / 86400000); if (days === 0) return "Today"; if (days === 1) return "Tomorrow"; if (days === -1) return "Yesterday"; return days > 0 ? `In ${days} days` : `${Math.abs(days)} days ago`; };
