export function taskSearchUrl(pathname: string, currentSearch: string, value: string) {
  const params = new URLSearchParams(currentSearch);
  const normalized = value.trim();
  if (normalized) params.set("q", normalized);
  else params.delete("q");
  return `${pathname}${params.size ? `?${params.toString()}` : ""}`;
}
