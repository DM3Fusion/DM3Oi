import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isOrganizationDetailsDirty,
  type OrganizationDetailsValues,
} from "../lib/platform-organization-details.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const initial: OrganizationDetailsValues = {
  name: "Mimms Tax Service",
  slug: "mimms-tax-service",
  status: "ACTIVE",
};

test("organization details begin clean and each editable field participates", () => {
  assert.equal(isOrganizationDetailsDirty(initial, initial), false);
  assert.equal(
    isOrganizationDetailsDirty({ ...initial, name: "Changed" }, initial),
    true,
  );
  assert.equal(
    isOrganizationDetailsDirty({ ...initial, slug: "changed" }, initial),
    true,
  );
  assert.equal(
    isOrganizationDetailsDirty({ ...initial, status: "SUSPENDED" }, initial),
    true,
  );
});

test("restoring an edited value exactly clears dirty state", () => {
  const changed = { ...initial, name: "Changed" };
  assert.equal(isOrganizationDetailsDirty(changed, initial), true);
  assert.equal(
    isOrganizationDetailsDirty({ ...changed, name: initial.name }, initial),
    false,
  );
});

test("Save changes reuses the approved attention class and resets its saved baseline", () => {
  const form = source("components/platform-organization-details-form.tsx");
  assert.match(form, /useState\(initial\)/);
  assert.match(form, /isOrganizationDetailsDirty\(values, saved\)/);
  assert.match(form, /dirty \? "license-save-button" : "primary-button"/);
  assert.match(form, /setValues\(result\.values\)/);
  assert.match(form, /setSaved\(result\.values\)/);
  assert.match(form, /pending \? "Saving…" : justSaved \? "Changes Saved" : "Save changes"/);
});

test("failed saves preserve edited controls while pending saves reject duplicates", () => {
  const form = source("components/platform-organization-details-form.tsx");
  assert.match(form, /if \(submittingRef\.current\) return/);
  assert.match(form, /disabled=\{pending\}/);
  assert.match(form, /aria-busy=\{pending\}/);
  assert.match(form, /if \(!result\.ok\)[\s\S]*setError\(result\.error\)[\s\S]*return/);
  assert.match(form, /finally[\s\S]*submittingRef\.current = false[\s\S]*setPending\(false\)/);
  const failureBlock = form.match(/if \(!result\.ok\)[\s\S]*?return;/)?.[0] ?? "";
  assert.doesNotMatch(failureBlock, /setValues|setSaved/);
});

test("avatar actions remain separate and License behavior is unchanged", () => {
  const page = source("app/admin/organizations/[organizationId]/page.tsx");
  const form = source("components/platform-organization-details-form.tsx");
  const license = source("components/license-form.tsx");
  assert.match(page, /avatarAction=\{/);
  assert.match(form, /<\/form>[\s\S]*\{avatarAction\}[\s\S]*form="platform-organization-details-form"/);
  assert.doesNotMatch(form, /avatar_path|hasAvatar|Upload \/ Change|Remove/);
  assert.match(license, /saveLicenseAction/);
  assert.match(license, /dirty\?"license-save-button":"primary-button"/);
});
