import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260927004000_dm3oi_owner_configured_required_items.sql",
  "utf8",
);

const intake = readFileSync(
  "components/cases/guided-case-intake.tsx",
  "utf8",
);

const editor = readFileSync(
  "components/question-options-editor.tsx",
  "utf8",
);

const action = readFileSync(
  "lib/data/question-actions.ts",
  "utf8",
);

const loader = readFileSync(
  "lib/data/guided-case-intake.ts",
  "utf8",
);

test("staff intake exposes Received only for organization-required items", () => {
  assert.match(intake, /Document \/ Item/);
  assert.match(intake, />Received</);
  assert.match(intake, /question\.requireAllOptions/);
  assert.doesNotMatch(intake, /onRequiredChange/);
  assert.doesNotMatch(
    intake,
    /required received/,
  );
});

test("Question configuration owns required-item selection", () => {
  assert.match(editor, /Require every displayed item/);
  assert.match(
    editor,
    /Every displayed item is required/,
  );
  assert.doesNotMatch(
    editor,
    /Determine required items during intake/,
  );
  assert.doesNotMatch(
    editor,
    /trackRequiredOptions/,
  );
});

test("server action cannot enable retired tracked-required mode", () => {
  assert.match(
    action,
    /target_track_required_options: false/,
  );
  assert.match(
    loader,
    /question\.id === "911c69ee-14bd-4391-ae87-f5b34047ea60"/,
  );
  assert.doesNotMatch(
    loader,
    /trackRequiredOptions:\s*question\.track_required_options/,
  );
});

test("migration converts tracked configurations and blocks reactivation", () => {
  assert.match(
    migration,
    /require_all_options = true,\s*track_required_options = false/,
  );
  assert.match(
    migration,
    /check \(track_required_options = false\)/,
  );
  assert.match(
    migration,
    /required_option_ids = '\{\}'::jsonb/,
  );
});

test("Mimms required-document guidance is configuration-owned", () => {
  assert.match(
    migration,
    /911c69ee-14bd-4391-ae87-f5b34047ea60/,
  );
  assert.match(
    migration,
    /Each document listed below is required for this Case/,
  );
});
