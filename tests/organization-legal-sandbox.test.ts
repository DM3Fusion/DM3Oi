import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(path, "utf8");

const foundation = source(
  "supabase/migrations/20261010210000_dm3oi_organization_legal_sandbox.sql",
);
const projections = source(
  "supabase/migrations/20261010213000_dm3oi_legal_sandbox_admin_projections.sql",
);
const context = source("lib/auth/context.ts");
const shell = source("components/layout/app-shell.tsx");
const account = source("app/account/page.tsx");
const adminOrganization = source(
  "app/admin/organizations/[organizationId]/page.tsx",
);
const portalLayout = source("app/portal/layout.tsx");
const organizationTable = source(
  "components/platform/organization-table.tsx",
);
const displayName = source(
  "lib/data/organization-display-name.ts",
);
const portalInvitationEmail = source(
  "lib/data/customer-portal-invitation-email-service.ts",
);
const portalProvisioningActions = source(
  "lib/data/customer-portal-provisioning-actions.ts",
);
const portalAccountSelection = source(
  "app/portal/select-account/page.tsx",
);
const userInvitationActions = source(
  "lib/data/user-invitation-actions.ts",
);

test("Sandbox is derived from Trial or Comp, legal state, and the SA display exception", () => {
  assert.match(
    foundation,
    /commercial not in \('TRIAL', 'COMP'\)/,
  );
  assert.match(
    foundation,
    /sandbox_designation_suppressed/,
  );
  assert.match(
    foundation,
    /get_organization_legal_state\([\s\S]*\) <> 'ACTIVE'/,
  );
  assert.match(
    foundation,
    /Does not create or imply legal acceptance/,
  );
});

test("legal authorization is Business Owner only and exact-version evidence is immutable", () => {
  assert.match(
    foundation,
    /Business Owner access required/,
  );
  assert.match(
    foundation,
    /terms_version_id uuid not null/,
  );
  assert.match(
    foundation,
    /privacy_version_id uuid not null/,
  );
  assert.match(
    foundation,
    /Organization legal authorization evidence is immutable/,
  );
  assert.doesNotMatch(
    foundation,
    /grant (select|insert|update|delete)[\s\S]{0,80}organization_legal_authorization_events[\s\S]{0,40}authenticated/i,
  );
});

test("license identity is retained as audit evidence but does not key current legal authorization", () => {
  assert.match(
    foundation,
    /license_id uuid not null/,
  );

  const latestLookups = [
    ...foundation.matchAll(
      /from public\.organization_legal_authorization_events event[\s\S]{0,160}?limit 1;/g,
    ),
  ];

  assert.ok(latestLookups.length >= 3);

  for (const lookup of latestLookups.slice(0, 3)) {
    assert.doesNotMatch(
      lookup[0],
      /event\.license_id = current_license_id/,
    );
  }
});

test("authenticated organization context carries canonical and derived display identity", () => {
  assert.match(context, /displayName: string/);
  assert.match(context, /isSandbox: boolean/);
  assert.match(context, /organization\.display_name/);
  assert.match(context, /organization\.is_sandbox/);

  assert.match(shell, /org\.displayName/);
  assert.match(shell, /item\.displayName/);
});

test("Owner Account exposes exact legal authorization and only Owner actions", () => {
  assert.match(
    account,
    /Organization Legal Authorization/,
  );
  assert.match(
    account,
    /BUSINESS_OWNER/,
  );
  assert.match(
    account,
    /acceptOrganizationLegalDocumentsAction/,
  );
  assert.match(
    account,
    /withdrawOrganizationLegalAcceptanceAction/,
  );
  assert.match(account, /href="\/terms"/);
  assert.match(account, /href="\/privacy"/);
});

test("SUPER_ADMIN receives only narrow Sandbox and legal audit projections", () => {
  assert.match(
    projections,
    /get_platform_organization_sandbox_states/,
  );
  assert.match(
    projections,
    /get_organization_legal_audit_admin/,
  );
  assert.match(
    projections,
    /not public\.is_super_admin/,
  );
  assert.match(
    adminOrganization,
    /Suppress Sandbox designation for approved POC/,
  );
  assert.match(
    adminOrganization,
    /does not[\s\S]*constitute Terms acceptance/i,
  );
});

test("Sandbox display identity reaches platform directory, Portal, and email resolver", () => {
  assert.match(organizationTable, /organization\.displayName/);
  assert.match(
    portalLayout,
    /resolveOrganizationDisplayName/,
  );
  assert.match(
    portalLayout,
    /organizationDisplayName/,
  );
  assert.match(
    displayName,
    /get_organization_display_name_server/,
  );
});

test("customer-facing invitation and Portal identity consistently use the derived organization name", () => {
  assert.match(
    portalInvitationEmail,
    /resolveOrganizationDisplayName/,
  );
  assert.match(
    portalInvitationEmail,
    /organization_name: organizationDisplayName/,
  );
  assert.match(
    portalProvisioningActions,
    /organizationName: org\.displayName/,
  );
  assert.match(
    portalAccountSelection,
    /resolveOrganizationDisplayName/,
  );
  assert.match(
    portalAccountSelection,
    /organizationDisplayNames\.get/,
  );
  assert.match(
    userInvitationActions,
    /organization_name: activeOrganization\.displayName/,
  );
});

test("Supabase RPC methods retain their client binding on Sandbox server paths", () => {
  const platformRepository = source(
    "lib/data/platform-repository.ts",
  );

  assert.match(
    platformRepository,
    /supabase\.rpc\.bind\(supabase\)/,
  );

  assert.match(
    displayName,
    /admin\.rpc\.bind\(admin\)/,
  );

  assert.doesNotMatch(
    platformRepository,
    /const sandboxRpc = supabase\.rpc as unknown/,
  );

  assert.doesNotMatch(
    displayName,
    /const rpc = admin\.rpc as unknown/,
  );
});

test("organization canonical names remain stored independently from Sandbox display identity", () => {
  assert.doesNotMatch(
    foundation,
    /update public\.organizations[\s\S]{0,120}set name\s*=/i,
  );
  assert.match(
    foundation,
    /return organization_name \|\| ' — Sandbox'/,
  );
});
