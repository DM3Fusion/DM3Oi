import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

test("profile identity save state compares editable value with persisted baseline", () => {
  const form = source("components/profile-identity-form.tsx");
  assert.match(form, /isProfileIdentityDirty\(value, saved\)/);
  assert.match(form, /value !== persisted/);
  assert.match(form, /setSaved\(result\.values\.displayName\)/);
  assert.match(form, /setValue\(event\.target\.value\);\s+setUpdated\(false\)/);
});

test("profile save button communicates clean dirty pending and confirmed states", () => {
  const form = source("components/profile-identity-form.tsx");
  assert.match(form, /"Saving…"/);
  assert.match(form, /"Profile updated"/);
  assert.match(form, /"Save changes"/);
  assert.match(form, /"Save profile"/);
  assert.match(form, /"license-save-button"/);
  assert.match(form, /"profile-save-success"/);
  assert.match(form, /disabled=\{!dirty \|\| pending\}/);
  assert.match(form, /aria-busy=\{pending\}/);
  assert.match(form, /if \(!dirty \|\| pending\) return/);
});

test("profile failures preserve submitted identity and never set success", () => {
  const form = source("components/profile-identity-form.tsx");
  const action = source("lib/data/profile-actions.ts");
  assert.match(form, /if \(!result\.ok\) \{\s+setValue\(result\.values\.displayName\);\s+setError\(result\.error\);\s+return;/);
  assert.match(action, /values: \{ displayName: submittedDisplayName \}/);
  assert.match(action, /return \{ ok: true, values: \{ displayName \} \}/);
});

test("read-only identity fields and avatar controls remain independent", () => {
  const form = source("components/profile-identity-form.tsx");
  const page = source("app/account/profile/page.tsx");
  assert.match(form, /<input value=\{email\} readOnly \/>/);
  assert.match(form, /<textarea value=\{accessSummary\} readOnly rows=\{3\} \/>/);
  assert.doesNotMatch(form, /AvatarUploadForm|removeOwnAvatarAction/);
  assert.match(page, /<AvatarUploadForm \/>/);
  assert.match(page, /action=\{removeOwnAvatarAction\}/);
});
