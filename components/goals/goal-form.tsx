"use client";

import { useState } from "react";
import Link from "next/link";
import { saveGoalAction } from "@/lib/data/goal-actions";
import type { GoalOwnerOption } from "@/lib/data/goals-repository";
import type {
  GoalDirection,
  GoalPeriodKind,
  GoalRecord,
  GoalScope,
  GoalStarterPreset,
  GoalUnit,
} from "@/lib/goals";
import { PendingSubmitButton } from "@/components/pending-submit-button";

type GoalDraft = {
  title: string;
  metricLabel: string;
  description: string;
  ownershipScope: GoalScope;
  ownerUserId: string;
  measurementDirection: GoalDirection;
  unit: GoalUnit;
  currencyCode: string;
  targetValue: string;
  baselineValue: string;
  periodKind: GoalPeriodKind;
  periodStart: string;
  periodEnd: string;
};

function initialDraft(goal: GoalRecord | null): GoalDraft {
  return {
    title: goal?.title ?? "",
    metricLabel: goal?.metric_label ?? "",
    description: goal?.description ?? "",
    ownershipScope:
      goal?.ownership_scope ?? "ORGANIZATION",
    ownerUserId: goal?.owner_user_id ?? "",
    measurementDirection:
      goal?.measurement_direction ?? "AT_LEAST",
    unit: goal?.unit ?? "COUNT",
    currencyCode:
      goal?.currency_code ?? "USD",
    targetValue: goal?.target_value ?? "",
    baselineValue:
      goal?.baseline_value ?? "",
    periodKind:
      goal?.period_kind ?? "CUSTOM",
    periodStart: goal?.period_start ?? "",
    periodEnd: goal?.period_end ?? "",
  };
}

function starterDraft(
  starter: GoalStarterPreset,
): GoalDraft {
  return {
    title: starter.title,
    metricLabel: starter.metricLabel,
    description: starter.description,
    ownershipScope:
      starter.ownershipScope,
    ownerUserId: "",
    measurementDirection:
      starter.measurementDirection,
    unit: starter.unit,
    currencyCode:
      starter.currencyCode ?? "USD",
    targetValue: starter.targetValue,
    baselineValue:
      starter.baselineValue ?? "",
    periodKind: starter.periodKind,
    periodStart: starter.periodStart,
    periodEnd: starter.periodEnd,
  };
}

export function GoalForm({
  goal,
  owners,
  starters = [],
}: {
  goal: GoalRecord | null;
  owners: GoalOwnerOption[];
  starters?: GoalStarterPreset[];
}) {
  const [draft, setDraft] = useState<GoalDraft>(
    () => initialDraft(goal),
  );
  const [starterKey, setStarterKey] =
    useState("");

  function change<K extends keyof GoalDraft>(
    key: K,
    value: GoalDraft[K],
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function selectStarter(key: string) {
    setStarterKey(key);

    if (!key) {
      setDraft(initialDraft(null));
      return;
    }

    const starter = starters.find(
      (item) => item.key === key,
    );

    if (starter) {
      setDraft(starterDraft(starter));
    }
  }

  return (
    <form
      action={saveGoalAction}
      className="panel form-panel entity-form goal-form"
    >
      <input
        type="hidden"
        name="goalId"
        value={goal?.id ?? ""}
      />
      <input
        type="hidden"
        name="expectedRevision"
        value={goal?.revision ?? ""}
      />

      {!goal && starters.length ? (
        <div className="goal-starter-picker">
          <label>
            <span>Start with a template</span>
            <select
              value={starterKey}
              onChange={(event) =>
                selectStarter(event.target.value)
              }
            >
              <option value="">
                Blank Goal
              </option>
              {starters.map((starter) => (
                <option
                  key={starter.key}
                  value={starter.key}
                >
                  {starter.title}
                </option>
              ))}
            </select>
          </label>
          <p className="form-help">
            Starter Goals are editable
            examples. Review the target,
            period, ownership, and baseline
            before activation.
          </p>
        </div>
      ) : null}

      <div className="form-grid">
        <label>
          <span>Title</span>
          <input
            name="title"
            maxLength={160}
            value={draft.title}
            onChange={(event) =>
              change("title", event.target.value)
            }
            required
          />
        </label>

        <label>
          <span>Measure</span>
          <input
            name="metricLabel"
            maxLength={120}
            value={draft.metricLabel}
            onChange={(event) =>
              change(
                "metricLabel",
                event.target.value,
              )
            }
            placeholder="Examples: Cases completed, retention rate"
            required
          />
        </label>

        <label className="full">
          <span>Description</span>
          <textarea
            name="description"
            maxLength={4000}
            value={draft.description}
            onChange={(event) =>
              change(
                "description",
                event.target.value,
              )
            }
            rows={4}
          />
        </label>

        <label>
          <span>Scope</span>
          <select
            name="ownershipScope"
            value={draft.ownershipScope}
            onChange={(event) => {
              const next =
                event.target.value as GoalScope;
              setDraft((current) => ({
                ...current,
                ownershipScope: next,
                ownerUserId:
                  next === "INDIVIDUAL"
                    ? current.ownerUserId
                    : "",
              }));
            }}
          >
            <option value="ORGANIZATION">
              Organization
            </option>
            <option value="INDIVIDUAL">
              Individual
            </option>
          </select>
        </label>

        {draft.ownershipScope ===
        "INDIVIDUAL" ? (
          <label>
            <span>Owner</span>
            <select
              name="ownerUserId"
              value={draft.ownerUserId}
              onChange={(event) =>
                change(
                  "ownerUserId",
                  event.target.value,
                )
              }
              required
            >
              <option value="">
                Select owner
              </option>
              {owners.map((owner) => (
                <option
                  key={owner.userId}
                  value={owner.userId}
                >
                  {owner.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input
            type="hidden"
            name="ownerUserId"
            value=""
          />
        )}

        <label>
          <span>Direction</span>
          <select
            name="measurementDirection"
            value={draft.measurementDirection}
            onChange={(event) =>
              change(
                "measurementDirection",
                event.target
                  .value as GoalDirection,
              )
            }
          >
            <option value="AT_LEAST">
              At least
            </option>
            <option value="AT_MOST">
              At most
            </option>
            <option value="EXACT">
              Exactly
            </option>
          </select>
        </label>

        <label>
          <span>Unit</span>
          <select
            name="unit"
            value={draft.unit}
            onChange={(event) =>
              change(
                "unit",
                event.target.value as GoalUnit,
              )
            }
          >
            <option value="COUNT">
              Count
            </option>
            <option value="PERCENT">
              Percent
            </option>
            <option value="CURRENCY">
              Currency
            </option>
            <option value="NUMBER">
              Number
            </option>
          </select>
        </label>

        {draft.unit === "CURRENCY" ? (
          <label>
            <span>Currency code</span>
            <input
              name="currencyCode"
              value={draft.currencyCode}
              onChange={(event) =>
                change(
                  "currencyCode",
                  event.target.value,
                )
              }
              maxLength={3}
              pattern="[A-Za-z]{3}"
              required
            />
          </label>
        ) : (
          <input
            type="hidden"
            name="currencyCode"
            value=""
          />
        )}

        <label>
          <span>Target value</span>
          <input
            name="targetValue"
            inputMode="decimal"
            pattern={
              draft.unit === "COUNT"
                ? "-?[0-9]+"
                : "-?[0-9]+(?:\\.[0-9]{1,4})?"
            }
            value={draft.targetValue}
            onChange={(event) =>
              change(
                "targetValue",
                event.target.value,
              )
            }
            required
          />
        </label>

        <label>
          <span>
            Baseline value{" "}
            <small>Optional</small>
          </span>
          <input
            name="baselineValue"
            inputMode="decimal"
            pattern={
              draft.unit === "COUNT"
                ? "-?[0-9]+"
                : "-?[0-9]+(?:\\.[0-9]{1,4})?"
            }
            value={draft.baselineValue}
            onChange={(event) =>
              change(
                "baselineValue",
                event.target.value,
              )
            }
          />
        </label>

        <label>
          <span>Period</span>
          <select
            name="periodKind"
            value={draft.periodKind}
            onChange={(event) =>
              change(
                "periodKind",
                event.target
                  .value as GoalPeriodKind,
              )
            }
          >
            <option value="MONTHLY">
              Monthly
            </option>
            <option value="QUARTERLY">
              Quarterly
            </option>
            <option value="ANNUAL">
              Annual
            </option>
            <option value="CUSTOM">
              Custom
            </option>
          </select>
        </label>

        <label>
          <span>Period start</span>
          <input
            type="date"
            name="periodStart"
            value={draft.periodStart}
            onChange={(event) =>
              change(
                "periodStart",
                event.target.value,
              )
            }
            required
          />
        </label>

        <label>
          <span>Period end</span>
          <input
            type="date"
            name="periodEnd"
            value={draft.periodEnd}
            onChange={(event) =>
              change(
                "periodEnd",
                event.target.value,
              )
            }
            required
          />
        </label>
      </div>

      <p className="form-help">
        Monthly, quarterly, and annual
        periods must use their complete
        calendar boundaries. Progress is
        entered manually in this release.
      </p>

      <div className="form-actions">
        <PendingSubmitButton
          className="primary-button"
          pendingLabel="Saving Goal…"
        >
          {goal
            ? "Save Goal"
            : "Create Goal"}
        </PendingSubmitButton>
        <Link
          href={
            goal
              ? `/goals/${goal.id}`
              : "/goals"
          }
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
