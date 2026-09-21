export const communicationsViewCookie = "dm3oi_communications_view";
export type CommunicationsView = "mobile" | "full";

export const normalizeCommunicationsView = (value?: string | null): CommunicationsView =>
  value === "full" ? "full" : "mobile";

export function communicationsDestination(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return "/communications";
  const destination = new URL(path, "https://dm3oi.local");
  destination.searchParams.set("from", "communications");
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
