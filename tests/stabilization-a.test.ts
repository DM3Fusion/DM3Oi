import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCustomerPortalSettingsWrite,
  buildOrganizationDefaultsWrite,
} from "../lib/organization-settings.ts";
import {
  LicenseLookupError,
  licenseQueryDataOrThrow,
} from "../lib/auth/license-query.ts";
import { hasTenantInternalAccess } from "../lib/auth/access-routing.ts";
import {
  CustomerPortalDataError,
  customerPortalDataOrThrow,
  requireCustomerPortalQuerySuccess,
} from "../lib/data/customer-portal-query.ts";
import {
  queryOrganizationLifecycleStatusIdentityReferences,
  type IdentityReferenceCountQuery,
  type OrganizationLifecycleStatusIdentityClient,
} from "../lib/data/platform-user-deletion-query.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("revoked-user lifecycle dependency query uses the table's composite-key column", async () => {
  const calls: Array<[string, unknown, unknown?]> = [];
  const result = Promise.resolve({ count: 0, error: null });
  const query: IdentityReferenceCountQuery = {
    eq(column, value) {
      calls.push(["eq", column, value]);
      return query;
    },
    then: result.then.bind(result),
  };
  const client: OrganizationLifecycleStatusIdentityClient = {
    from(table) {
      calls.push(["from", table]);
      return {
        select(columns, options) {
          calls.push(["select", columns, options]);
          return query;
        },
      };
    },
  };

  await queryOrganizationLifecycleStatusIdentityReferences(
    client,
    "organization-id",
    "user-id",
  );

  assert.deepEqual(calls, [
    ["from", "organization_lifecycle_statuses"],
    ["select", "organization_id", { count: "exact", head: true }],
    ["eq", "organization_id", "organization-id"],
    ["eq", "updated_by", "user-id"],
  ]);

  const deletion = source("lib/data/platform-user-deletion.ts");
  const administrationCheckStart = deletion.indexOf(
    'label: "Organization administration history exists."',
  );
  const lifecycleBlock = deletion.slice(
    administrationCheckStart,
    deletion.indexOf("const results", administrationCheckStart),
  );
  assert.match(
    lifecycleBlock,
    /queryOrganizationLifecycleStatusIdentityReferences/,
  );
  assert.doesNotMatch(
    lifecycleBlock,
    /\.from\("organization_lifecycle_statuses"\)/,
  );
});

test("organization defaults payload owns no Customer Portal fields", () => {
  const parsed = buildOrganizationDefaultsWrite(
    {
      businessPostalCode: "12345",
      timezoneMode: "MANUAL",
      timezone: "America/New_York",
      defaultPriority: "HIGH",
    },
    "organization-id",
    "actor-id",
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.deepEqual(Object.keys(parsed.value.organization).sort(), [
    "business_postal_code",
  ]);
  assert.deepEqual(Object.keys(parsed.value.settings).sort(), [
    "default_priority",
    "organization_id",
    "timezone",
    "timezone_resolved_from_postal_code",
    "timezone_source",
    "updated_by",
  ]);

  const existing = {
    portal_enabled: false,
    portal_submission_enabled: false,
    portal_show_priority: false,
  };
  const merged = { ...existing, ...parsed.value.settings };
  assert.equal(merged.portal_enabled, false);
  assert.equal(merged.portal_submission_enabled, false);
  assert.equal(merged.portal_show_priority, false);
  assert.equal(
    "portal_enabled" in parsed.value.settings ||
      "portal_submission_enabled" in parsed.value.settings ||
      "portal_show_priority" in parsed.value.settings,
    false,
  );
});

test("Customer Portal payload owns no defaults or organization fields", () => {
  const parsed = buildCustomerPortalSettingsWrite(
    {
      portalEnabled: "false",
      portalSubmissionEnabled: "true",
      portalShowPriority: "false",
    },
    "organization-id",
    "actor-id",
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.deepEqual(parsed.value, {
    organization_id: "organization-id",
    portal_enabled: false,
    portal_submission_enabled: true,
    portal_show_priority: false,
    updated_by: "actor-id",
  });
  for (const unrelatedField of [
    "business_postal_code",
    "default_priority",
    "timezone",
    "timezone_source",
    "timezone_resolved_from_postal_code",
  ]) {
    assert.equal(unrelatedField in parsed.value, false);
  }
});

test("settings forms do not submit unrelated hidden defaults", () => {
  const defaultsForm = source("components/organization-defaults-form.tsx");
  const portalForm = source("app/administration/customer-portal/page.tsx");
  const actions = source("lib/data/organization-administration-actions.ts");
  const defaultsAction = actions.slice(
    actions.indexOf("export async function saveOrganizationDefaults"),
    actions.indexOf("export async function saveCustomerPortalSettings"),
  );
  const portalAction = actions.slice(
    actions.indexOf("export async function saveCustomerPortalSettings"),
    actions.indexOf("export async function saveCaseType"),
  );

  assert.doesNotMatch(
    defaultsForm,
    /name="portal(?:Enabled|SubmissionEnabled|ShowPriority)"/,
  );
  assert.doesNotMatch(
    portalForm,
    /name="(?:businessPostalCode|timezoneMode|timezone|defaultPriority)"/,
  );
  assert.doesNotMatch(defaultsAction, /portal_(?:enabled|submission_enabled|show_priority)/);
  assert.doesNotMatch(portalAction, /\.from\("organizations"\)/);
  assert.doesNotMatch(
    portalAction,
    /business_postal_code|default_priority|timezone_source|timezone_resolved_from_postal_code/,
  );
});

test("license query distinguishes absence, active data, and lookup failure", () => {
  const missingLicense = licenseQueryDataOrThrow({ data: null, error: null });
  assert.equal(missingLicense, null);
  assert.equal(
    hasTenantInternalAccess({
      internalAccess: true,
      activeOrganization: {},
      license: missingLicense,
    }),
    true,
  );

  const activeLicense = { license_status: "ACTIVE", workspaceAllowed: true };
  const resolvedActiveLicense = licenseQueryDataOrThrow({
    data: activeLicense,
    error: null,
  });
  assert.equal(resolvedActiveLicense, activeLicense);
  assert.equal(
    hasTenantInternalAccess({
      internalAccess: true,
      activeOrganization: {},
      license: resolvedActiveLicense,
    }),
    true,
  );

  assert.throws(
    () =>
      licenseQueryDataOrThrow({
        data: null,
        error: { code: "PGRST000", message: "lookup failed" },
      }),
    LicenseLookupError,
  );
});

test("portal query guard preserves successful empties and rejects failures", () => {
  const empty = { data: [] as unknown[], count: 0, error: null };
  assert.equal(
    requireCustomerPortalQuerySuccess(empty, "list"),
    empty,
  );
  assert.deepEqual(customerPortalDataOrThrow(empty, "list"), []);
  assert.equal(
    customerPortalDataOrThrow({ data: null, error: null }, "detail"),
    null,
  );

  const logs: unknown[] = [];
  assert.throws(
    () =>
      customerPortalDataOrThrow(
        {
          data: null,
          error: { code: "PGRST001", message: "query failed" },
        },
        "detail",
        (...values) => logs.push(values),
      ),
    CustomerPortalDataError,
  );
  assert.equal(logs.length, 1);
});

test("portal pages guard query results before empty and not-found branches", () => {
  const home = source("app/portal/page.tsx");
  const list = source("app/portal/service-requests/page.tsx");
  const detail = source(
    "app/portal/service-requests/[serviceRequestId]/page.tsx",
  );

  assert.match(home, /requireCustomerPortalQuerySuccess/);
  assert.match(list, /customerPortalDataOrThrow/);
  assert.ok(
    detail.indexOf("customerPortalDataOrThrow") <
      detail.indexOf("if (!request) notFound()"),
  );
  assert.match(detail, /customerPortalDataOrThrow[\s\S]*service-request-messages/);
});
