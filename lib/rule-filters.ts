export type RuleStatusFilter = "all" | "active" | "inactive";
export const normalizeRuleQuery = (value?: string) => value?.trim().slice(0, 200) ?? "";
export const normalizeRuleStatus = (value?: string): RuleStatusFilter =>
  value === "active" || value === "inactive" ? value : "all";
export function ruleMatchesSearch(
  rule: { name: string; description: string; summary: string; active: boolean },
  query: string,
  status: RuleStatusFilter,
) {
  if (status === "active" && !rule.active) return false;
  if (status === "inactive" && rule.active) return false;
  const needle = query.toLocaleLowerCase();
  return !needle || [rule.name, rule.description, rule.summary].some((value) =>
    value.toLocaleLowerCase().includes(needle),
  );
}
