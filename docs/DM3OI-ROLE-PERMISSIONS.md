# DM3Oi role and permission architecture

`lib/auth/permissions.ts` is the application capability source. Navigation visibility is not authorization. Server-side pages and actions remain authoritative, and database RLS is the final tenant/data-isolation layer.

Settings is the visible organization-configuration hub. Its configuration cards are capability-filtered, while Users remains a separate destination in the Administration sidebar group. `/administration` is retained as a protected internal route namespace for the existing configuration pages; its index redirects authorized users to `/settings`.

Organization user details use `/users/[membershipId]`, with the organization membership ID as the canonical identifier. `VIEW_USERS` grants read-only detail access, while `MANAGE_USERS` gates organization role/status and invitation controls. Every lookup and update matches both the membership ID and active organization ID, so foreign-organization and nonexistent memberships use the standard not-found/unauthorized behavior. `PUBLIC_USER` is excluded. This organization-scoped route is intentionally separate from the SUPER_ADMIN-only `/admin/users/[userId]` platform identity route.

## Roles and limits

| Role | Existing limit | Enforcement |
|---|---:|---|
| SUPER_ADMIN | 1 active | `one_active_super_admin_uidx` partial unique index |
| BUSINESS_OWNER | 2 active per organization | `enforce_constrained_role_limit()` trigger |
| BUSINESS_ADMIN | 2 active per organization | `enforce_constrained_role_limit()` trigger |
| STAFF_MANAGER | Unlimited | No count constraint |
| STAFF_USER | Unlimited | No count constraint |
| PUBLIC_USER | Unlimited | Portal linkage; not an internal organization-member role |

## Capability matrix

✓ means allowed. R means read/operational access without the corresponding administration capability. — means denied.

| Area / capability | SUPER_ADMIN | BUSINESS_OWNER | BUSINESS_ADMIN | STAFF_MANAGER | STAFF_USER | PUBLIC_USER |
|---|---:|---:|---:|---:|---:|---:|
| Platform management | ✓ | — | — | — | — | — |
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Cases: view/work | ✓ | ✓ | ✓ | ✓ | R | — |
| Cases: create/assign | ✓ | ✓ | ✓ | ✓ | — | — |
| Service Desk: view/create | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Service Desk: manage/assign | ✓ | ✓ | ✓ | ✓ | — | — |
| Communications: view | ✓ | ✓ | ✓ | ✓ | R | — |
| Communications: respond/manage | ✓ | ✓ | ✓ | ✓ | — | — |
| Customers: view/create/edit | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Tasks: view/work | ✓ | ✓ | ✓ | ✓ | R | — |
| Tasks: assign | ✓ | ✓ | ✓ | ✓ | — | — |
| Questions & Rules: view | ✓ | ✓ | ✓ | ✓ | R | — |
| Questions & Rules: manage | ✓ | ✓ | ✓ | ✓ | — | — |
| Reports: view | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Users: view | ✓ | ✓ | ✓ | ✓ | R | — |
| Users: manage/invite/change roles | ✓ | ✓ | ✓ | — | — | — |
| Administration | ✓ | ✓ | ✓ | — | — | — |
| Organization settings: manage | ✓ | ✓ | ✓ | — | — | — |
| Settings: view | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Customer Portal | — | — | — | — | — | ✓ |

SUPER_ADMIN receives organization capabilities only while operating in an active organization context; platform context remains distinct. Portal access continues to derive from authorized customer portal links rather than internal membership.

## Organization-configurable User Access

`/settings/user-access` presents the actual navigation capabilities and supported management capabilities for `BUSINESS_OWNER`, `BUSINESS_ADMIN`, `STAFF_MANAGER`, and `STAFF_USER`. `SUPER_ADMIN` and `PUBLIC_USER` are never tenant-configurable columns. The static `rolePermissionMatrix` is the DM3Oi-recommended default, so existing and new organizations retain intended access without requiring seeded rows. Tenant-scoped `organization_role_permissions` rows store explicit organization selections; effective access resolves the recommended default, then the matching organization/role override.

Permissions are role-level only. There are no per-user exceptions. A user's active organization membership role plus that organization's overrides produces the same effective permission set consumed by sidebar visibility and protected routes. The user detail page links authorized administrators to the corresponding role column with `/settings/user-access?role={membershipRole}`.

Business Owners may configure Business Admin, Staff Manager, and Staff User. Business Admins may configure Staff Manager and Staff User. Neither role may edit itself or a higher role, and no actor may grant a capability they do not effectively hold. Staff Manager, Staff User, and PUBLIC_USER cannot administer role access; `MANAGE_ROLE_PERMISSIONS` is system-denied to the two configurable staff roles even if a malformed override is encountered. The Business Owner continuity baseline (`VIEW_SETTINGS`, `VIEW_USERS`, `MANAGE_USERS`, `VIEW_ADMINISTRATION`, `MANAGE_ORGANIZATION_SETTINGS`, and `MANAGE_ROLE_PERMISSIONS`) is always restored by the effective resolver and is not editable in the UI.

Changes require an explicit **Save Access** action. Restoring recommended defaults deletes only the selected tenant/role overrides after confirmation. Both workflows derive the active organization server-side and call a security-definer RPC. Direct authenticated table writes are revoked; RLS scopes reads to the active tenant membership, and the RPC repeats role hierarchy, grant-boundary, role allowlist, permission allowlist, and protected-access checks.

## Platform identity privacy

`SUPER_ADMIN` remains a platform role, outside organization membership configuration, invitations, selectors, search, and User Access. Organization-facing member results and direct membership detail routes exclude active platform administrators. Where an organization-visible operational record must identify a platform support actor, its presentation profile is stripped of name, email, and avatar metadata and displayed exactly as **DM3Oi Sys Support**. The underlying actor UUID is not rewritten, preserving protected platform audit correlation and the authorized `/admin/*` audit/identity view. Privacy lookups fail closed: inability to resolve the protected platform-role set prevents the organization surface from rendering identity data.

Database row policies alone cannot conceal one column of an otherwise readable row. Authenticated access therefore has only column-level grants that omit operational actor fields, while security-barrier organization projections apply the existing row authorization functions and return ordinary member IDs unchanged. A platform actor is projected as a null UUID with the exact **DM3Oi Sys Support** label. Update RPCs similarly clear platform creator fields only in their returned composite value; stored audit rows are unchanged. The separately guarded `get_platform_operational_actor_audit` RPC returns true attribution only after a `SUPER_ADMIN` check.

`PUBLIC_USER` remains customer-portal-only through customer portal linkage and `ACCESS_CUSTOMER_PORTAL`; it cannot be promoted into the internal matrix. Existing role-count constraints are independent of User Access configuration. DM3Oi-03B uses these effective permissions for operational mutation controls and server actions while existing record-scoped RLS/RPC checks remain the database backstop.

## Current enforcement inventory

- Internal module loaders use authenticated access context and organization-scoped repositories. Users is intentionally readable by licensed internal users; invitation and role-changing mutations remain separately restricted.
- Questions definitions are readable by internal members. `MANAGE_QUESTIONS` is enforced in both UI and the save action and is also protected by `can_administer_questions` in PostgreSQL.
- Administration and organization-setting mutations use centralized capabilities and retain direct-request checks.
- Case visibility retains the existing `can_access_case` assignment/manager rules. Record-level visibility is intentionally not redesigned in 03A.
- Service Request reads are organization-member scoped. Management RPCs distinguish manager roles; application action wrappers still rely substantially on those authoritative RPC checks.
- Customer reads/writes currently use organization membership in RLS. This is intentional current behavior but is a candidate for later action-specific hardening.
- Communications combine recipient/user scoping with organization membership depending on the table and operation.

## RLS review and later hardening

Tenant membership is consistently checked for organizations, members, customers, question definitions, and Service Desk records. Cases, tasks, assignments, and case responses use `can_access_case`. Question and Service Desk mutation RPCs contain explicit role checks.

Several legacy policies deliberately permit any internal organization member to write customers and operational case/task records, with finer rules sometimes enforced inside security-definer RPCs. A later milestone should align each mutation wrapper and policy with the capability names here, after record-level workflow decisions are finalized. No RLS migration is included in 03A.
