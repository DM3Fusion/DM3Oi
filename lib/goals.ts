export const goalLifecycleStatuses = [
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;
export const goalPerformanceStates = [
  "NOT_STARTED",
  "ON_TRACK",
  "AT_RISK",
  "ACHIEVED",
  "MISSED",
] as const;
export const goalScopes = ["ORGANIZATION", "INDIVIDUAL"] as const;
export const goalDirections = ["AT_LEAST", "AT_MOST", "EXACT"] as const;
export const goalUnits = ["COUNT", "PERCENT", "CURRENCY", "NUMBER"] as const;
export const goalPeriodKinds = ["MONTHLY", "QUARTERLY", "ANNUAL", "CUSTOM"] as const;

export type GoalLifecycle = (typeof goalLifecycleStatuses)[number];
export type GoalPerformance = (typeof goalPerformanceStates)[number];
export type GoalScope = (typeof goalScopes)[number];
export type GoalDirection = (typeof goalDirections)[number];
export type GoalUnit = (typeof goalUnits)[number];
export type GoalPeriodKind = (typeof goalPeriodKinds)[number];

export type GoalRecord = {
  id: string;
  organization_id: string;
  goal_number: string;
  title: string;
  description: string;
  metric_label: string;
  ownership_scope: GoalScope;
  owner_user_id: string | null;
  owner_display_name: string | null;
  measurement_direction: GoalDirection;
  unit: GoalUnit;
  currency_code: string | null;
  target_value: string;
  baseline_value: string | null;
  period_kind: GoalPeriodKind;
  period_start: string;
  period_end: string;
  lifecycle_status: GoalLifecycle;
  revision: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  current_actual: string | null;
  current_as_of_date: string | null;
  current_progress_entry_id: string | null;
};

export type GoalProgressEntry = {
  id: string;
  actual_value: string;
  as_of_date: string;
  note: string | null;
  supersedes_entry_id: string | null;
  is_superseded: boolean;
  actor_user_id: string | null;
  actor_display_name: string;
  actor_kind: "ORGANIZATION_MEMBER" | "PLATFORM_SUPPORT";
  created_at: string;
};

export type GoalHistoryEntry = {
  id: string;
  event_type:
    | "CREATED"
    | "DEFINITION_CHANGED"
    | "OWNER_CHANGED"
    | "TARGET_CHANGED"
    | "PERIOD_CHANGED"
    | "ACTIVATED"
    | "COMPLETED"
    | "CANCELLED";
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  prior_owner_display_name: string | null;
  new_owner_display_name: string | null;
  note: string | null;
  actor_user_id: string | null;
  actor_display_name: string;
  actor_kind: "ORGANIZATION_MEMBER" | "PLATFORM_SUPPORT";
  created_at: string;
};

const decimalPattern = /^-?\d+(?:\.\d{1,4})?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isGoalDecimal(value: string) {
  return decimalPattern.test(value.trim());
}

export function isGoalCount(value: string) {
  return isGoalDecimal(value) && scaledDecimal(value) % BigInt(10_000) === BigInt(0);
}

export function isGoalPercent(value: string) {
  if (!isGoalDecimal(value)) return false;
  const scaled = scaledDecimal(value);
  return scaled >= BigInt(0) && scaled <= BigInt(1_000_000);
}

function scaledDecimal(value: string) {
  const normalized = value.trim();
  if (!isGoalDecimal(normalized)) throw new Error("Invalid Goal value.");
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const scaled = BigInt(whole) * BigInt(10_000) + BigInt(fraction.padEnd(4, "0"));
  return negative ? -scaled : scaled;
}

export function goalTargetSatisfied(
  direction: GoalDirection,
  actual: string,
  target: string,
) {
  const actualValue = scaledDecimal(actual);
  const targetValue = scaledDecimal(target);
  if (direction === "AT_LEAST") return actualValue >= targetValue;
  if (direction === "AT_MOST") return actualValue <= targetValue;
  return actualValue === targetValue;
}

export function goalProgressPercentage(goal: Pick<
  GoalRecord,
  "measurement_direction" | "baseline_value" | "target_value" | "current_actual"
>) {
  if (goal.current_actual === null || goal.baseline_value === null) return null;
  const actual = scaledDecimal(goal.current_actual);
  const baseline = scaledDecimal(goal.baseline_value);
  const target = scaledDecimal(goal.target_value);
  let numerator: bigint;
  let denominator: bigint;

  if (goal.measurement_direction === "AT_LEAST") {
    if (target <= baseline) return null;
    numerator = actual - baseline;
    denominator = target - baseline;
  } else if (goal.measurement_direction === "AT_MOST") {
    if (target >= baseline) return null;
    numerator = baseline - actual;
    denominator = baseline - target;
  } else {
    if (target === baseline) return null;
    numerator = (baseline > target ? baseline - target : target - baseline)
      - (actual > target ? actual - target : target - actual);
    denominator = baseline > target ? baseline - target : target - baseline;
  }

  const basisPoints = numerator * BigInt(10_000) / denominator;
  if (basisPoints <= BigInt(0)) return 0;
  if (basisPoints >= BigInt(10_000)) return 100;
  return Number(basisPoints) / 100;
}

function dateOrdinal(value: string) {
  if (!datePattern.test(value)) throw new Error("Invalid Goal date.");
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function organizationDateKey(now: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function goalElapsedPercentage(goal: Pick<GoalRecord, "period_start" | "period_end">, today: string) {
  const start = dateOrdinal(goal.period_start);
  const end = dateOrdinal(goal.period_end);
  const current = dateOrdinal(today);
  if (current < start) return 0;
  if (current > end) return 100;
  return ((current - start + 1) / (end - start + 1)) * 100;
}

export function goalPerformance(
  goal: GoalRecord,
  timezone: string,
  now = new Date(),
): GoalPerformance | null {
  if (goal.lifecycle_status === "CANCELLED") return null;
  if (goal.lifecycle_status === "DRAFT") return "NOT_STARTED";
  const today = organizationDateKey(now, timezone);
  if (today < goal.period_start) return "NOT_STARTED";
  const satisfied = goal.current_actual === null
    ? false
    : goalTargetSatisfied(
        goal.measurement_direction,
        goal.current_actual,
        goal.target_value,
      );
  if (goal.lifecycle_status === "COMPLETED" || today > goal.period_end)
    return satisfied ? "ACHIEVED" : "MISSED";
  if (goal.current_actual === null) return "NOT_STARTED";
  if (satisfied) return "ON_TRACK";
  const progress = goalProgressPercentage(goal);
  if (progress === null) return "AT_RISK";
  return progress >= goalElapsedPercentage(goal, today) ? "ON_TRACK" : "AT_RISK";
}

export function formatGoalValue(
  value: string | null,
  unit: GoalUnit,
  currencyCode: string | null,
) {
  if (value === null) return "—";
  if (unit === "COUNT" && !isGoalCount(value))
    throw new Error("COUNT Goal values must be whole numbers.");
  if (unit === "CURRENCY") {
    const currency = currencyCode ?? "USD";
    const symbol = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
    }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;
    const amount = formatScaledDecimal(scaledDecimal(value), 2, 2);
    return amount.startsWith("-")
      ? `-${symbol}${amount.slice(1)}`
      : `${symbol}${amount}`;
  }
  if (unit === "PERCENT") return `${formatScaledDecimal(scaledDecimal(value), 2)}%`;
  return formatScaledDecimal(scaledDecimal(value), unit === "COUNT" ? 0 : 4);
}

function formatScaledDecimal(value: bigint, fractionDigits: number, minimumFractionDigits = 0) {
  const negative = value < BigInt(0);
  let absolute = negative ? -value : value;
  const discardedDigits = 4 - fractionDigits;
  const roundingFactor = BigInt(10) ** BigInt(discardedDigits);
  if (discardedDigits > 0)
    absolute = ((absolute + roundingFactor / BigInt(2)) / roundingFactor) * roundingFactor;
  const displayScale = BigInt(10) ** BigInt(fractionDigits);
  const displayValue = absolute / roundingFactor;
  const whole = (displayValue / displayScale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let fraction = fractionDigits
    ? (displayValue % displayScale).toString().padStart(fractionDigits, "0")
    : "";
  while (fraction.length > minimumFractionDigits && fraction.endsWith("0"))
    fraction = fraction.slice(0, -1);
  return `${negative && absolute !== BigInt(0) ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

type GoalHistoryChangeField = {
  key: string;
  label: string;
};

const goalHistoryChangeFields: Partial<Record<GoalHistoryEntry["event_type"], GoalHistoryChangeField[]>> = {
  DEFINITION_CHANGED: [
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "metricLabel", label: "Measure" },
    { key: "measurementDirection", label: "Direction" },
    { key: "unit", label: "Unit" },
    { key: "currencyCode", label: "Currency" },
  ],
  TARGET_CHANGED: [
    { key: "targetValue", label: "Target" },
    { key: "baselineValue", label: "Baseline" },
  ],
  PERIOD_CHANGED: [
    { key: "periodKind", label: "Period" },
    { key: "periodStart", label: "Start" },
    { key: "periodEnd", label: "End" },
  ],
};

function historySnapshotValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
    return "Updated";
  const text = String(value);
  const readable = /^[A-Z_]+$/.test(text)
    ? text.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    : text;
  return readable.length > 120 ? `${readable.slice(0, 119)}…` : readable;
}

export function goalHistoryChangeDetails(entry: GoalHistoryEntry) {
  const fields = goalHistoryChangeFields[entry.event_type] ?? [];
  return fields.flatMap(({ key, label }) => {
    const before = entry.before_data?.[key];
    const after = entry.after_data?.[key];
    return before === after
      ? []
      : [`${label}: ${historySnapshotValue(before)} → ${historySnapshotValue(after)}`];
  });
}

export function goalPeriodLabel(goal: Pick<GoalRecord, "period_start" | "period_end">) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(new Date(`${goal.period_start}T12:00:00Z`))} – ${formatter.format(new Date(`${goal.period_end}T12:00:00Z`))}`;
}

export type GoalFilters = {
  q: string;
  lifecycle: string;
  performance: string;
  scope: string;
  owner: string;
  period: string;
};

export function filterGoals(
  goals: GoalRecord[],
  filters: GoalFilters,
  timezone: string,
  now = new Date(),
) {
  const query = filters.q.trim().toLowerCase();
  return goals.filter((goal) => {
    const performance = goalPerformance(goal, timezone, now);
    const searchable = [
      goal.goal_number,
      goal.title,
      goal.description,
      goal.owner_display_name ?? "",
    ].join(" ").toLowerCase();
    return (!query || searchable.includes(query))
      && (!filters.lifecycle || goal.lifecycle_status === filters.lifecycle)
      && (!filters.performance || performance === filters.performance)
      && (!filters.scope || goal.ownership_scope === filters.scope)
      && (!filters.owner || goal.owner_user_id === filters.owner)
      && (!filters.period || goal.period_kind === filters.period);
  });
}

export const goalStarterKeys = [
  "TAX_SEASON_RETURNS",
  "OVERDUE_TASKS",
  "SERVICE_REQUEST_RESOLUTION",
  "ACTIVE_CUSTOMER_GROWTH",
  "MONTHLY_ASSIGNED_CASES",
] as const;

export type GoalStarterKey =
  (typeof goalStarterKeys)[number];

export type GoalStarterPreset = {
  key: GoalStarterKey;
  title: string;
  description: string;
  metricLabel: string;
  ownershipScope: GoalScope;
  measurementDirection: GoalDirection;
  unit: GoalUnit;
  currencyCode: string | null;
  targetValue: string;
  baselineValue: string | null;
  periodKind: GoalPeriodKind;
  periodStart: string;
  periodEnd: string;
};

export const organizationGoalStarterKeys = [
  "TAX_SEASON_RETURNS",
  "OVERDUE_TASKS",
  "SERVICE_REQUEST_RESOLUTION",
  "ACTIVE_CUSTOMER_GROWTH",
] as const satisfies readonly GoalStarterKey[];

function goalDateParts(value: string) {
  if (!datePattern.test(value)) {
    throw new Error("Invalid Goal date.");
  }

  const [year, month, day] =
    value.split("-").map(Number);

  return { year, month, day };
}

function goalDateKey(
  year: number,
  month: number,
  day: number,
) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function daysInUtcMonth(
  year: number,
  month: number,
) {
  return new Date(
    Date.UTC(year, month, 0),
  ).getUTCDate();
}

export function goalTaxSeasonPeriod(
  timezone: string,
  now = new Date(),
) {
  const today =
    organizationDateKey(now, timezone);

  const { year } = goalDateParts(today);
  const cutoff = goalDateKey(year, 4, 10);
  const seasonYear =
    today <= cutoff ? year : year + 1;

  return {
    periodStart: goalDateKey(
      seasonYear,
      1,
      1,
    ),
    periodEnd: goalDateKey(
      seasonYear,
      4,
      10,
    ),
  };
}

export function goalAnnualPeriod(
  timezone: string,
  now = new Date(),
) {
  const today =
    organizationDateKey(now, timezone);

  const { year } = goalDateParts(today);

  return {
    periodStart: goalDateKey(year, 1, 1),
    periodEnd: goalDateKey(year, 12, 31),
  };
}

export function goalMonthlyPeriod(
  timezone: string,
  now = new Date(),
) {
  const today =
    organizationDateKey(now, timezone);

  const { year, month } =
    goalDateParts(today);

  return {
    periodStart: goalDateKey(
      year,
      month,
      1,
    ),
    periodEnd: goalDateKey(
      year,
      month,
      daysInUtcMonth(year, month),
    ),
  };
}

export function goalStarterPreset(
  key: GoalStarterKey,
  timezone: string,
  now = new Date(),
): GoalStarterPreset {
  if (key === "TAX_SEASON_RETURNS") {
    const period =
      goalTaxSeasonPeriod(timezone, now);

    return {
      key,
      title:
        "Complete 150 returns by April 10",
      description:
        "Starter Goal: review the return target and tax-season period before activation.",
      metricLabel: "Returns completed",
      ownershipScope: "ORGANIZATION",
      measurementDirection: "AT_LEAST",
      unit: "COUNT",
      currencyCode: null,
      targetValue: "150",
      baselineValue: "0",
      periodKind: "CUSTOM",
      ...period,
    };
  }

  if (key === "OVERDUE_TASKS") {
    const period =
      goalAnnualPeriod(timezone, now);

    return {
      key,
      title: "Keep overdue Tasks below 10",
      description:
        "Starter Goal: keep the number of overdue Tasks below 10. Review the target and period before activation.",
      metricLabel: "Overdue Tasks",
      ownershipScope: "ORGANIZATION",
      measurementDirection: "AT_MOST",
      unit: "COUNT",
      currencyCode: null,
      targetValue: "9",
      baselineValue: null,
      periodKind: "ANNUAL",
      ...period,
    };
  }

  if (
    key === "SERVICE_REQUEST_RESOLUTION"
  ) {
    const period =
      goalAnnualPeriod(timezone, now);

    return {
      key,
      title:
        "Resolve 95% of Service Requests within 2 business days",
      description:
        "Starter Goal: manually record the percentage of Service Requests resolved within 2 business days. Review the target and period before activation.",
      metricLabel:
        "Service Requests resolved within 2 business days",
      ownershipScope: "ORGANIZATION",
      measurementDirection: "AT_LEAST",
      unit: "PERCENT",
      currencyCode: null,
      targetValue: "95",
      baselineValue: null,
      periodKind: "ANNUAL",
      ...period,
    };
  }

  if (
    key === "ACTIVE_CUSTOMER_GROWTH"
  ) {
    const period =
      goalAnnualPeriod(timezone, now);

    return {
      key,
      title:
        "Increase active customers from 400 to 450",
      description:
        "Starter Goal: review the customer baseline, target, and annual period before activation.",
      metricLabel: "Active customers",
      ownershipScope: "ORGANIZATION",
      measurementDirection: "AT_LEAST",
      unit: "COUNT",
      currencyCode: null,
      targetValue: "450",
      baselineValue: "400",
      periodKind: "ANNUAL",
      ...period,
    };
  }

  const period =
    goalMonthlyPeriod(timezone, now);

  return {
    key: "MONTHLY_ASSIGNED_CASES",
    title:
      "Process 40 assigned cases this month",
    description:
      "Starter Goal for an individual employee. Select an eligible organization user and review the monthly target before activation.",
    metricLabel: "Assigned cases processed",
    ownershipScope: "INDIVIDUAL",
    measurementDirection: "AT_LEAST",
    unit: "COUNT",
    currencyCode: null,
    targetValue: "40",
    baselineValue: "0",
    periodKind: "MONTHLY",
    ...period,
  };
}

export function goalStarterPresets(
  timezone: string,
  now = new Date(),
) {
  return goalStarterKeys.map((key) =>
    goalStarterPreset(
      key,
      timezone,
      now,
    ),
  );
}
