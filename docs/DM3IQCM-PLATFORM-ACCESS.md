# DM3Oi Platform Access

DM3Oi separates platform authorization from organization authorization. `SUPER_ADMIN` is a platform role stored in `platform_user_roles`; business and staff roles belong to an organization through `organization_members`. A Super Admin does not need, and must not receive, a synthetic organization membership.

## Platform and organization contexts

An authenticated, active Super Admin is provisioned for internal platform access. When no active organization exists, the root route renders the Platform Administration Back Office. This is a valid state with `isSuperAdmin: true`, `internalAccess: true`, `provisioned: true`, and `activeOrganization: null`.

The Back Office uses live data allowed by existing Super Admin RLS policies. It does not issue case, customer, task, assignment, or activity queries. If no organizations exist, it shows an explicit platform empty state.

When active organizations exist, `getAccessContext()` continues to expose all active organizations to the Super Admin. The active-organization cookie selects a permitted organization; absent a valid cookie, the existing first-active-organization behavior applies. An explicit platform sentinel supports a stable Back Office return even after organizations exist. Entering an organization context enables the existing workspace without changing membership records.

## Tenant boundary

Operational data remains organization scoped. Read functions require an active organization ID before executing tenant queries, and mutation actions continue through `requireInternalContext()`, which requires both internal access and a non-null active organization. Being a Super Admin alone never supplies an organization ID or bypasses tenant scoping.

## Access Pending

`/account/unprovisioned` is only for authenticated identities with no valid platform role, organization membership, or applicable portal provisioning. A provisioned internal user or Super Admin is redirected from that page to `/`. A Super Admin without organizations is therefore shown the Back Office, never labeled Access pending.
