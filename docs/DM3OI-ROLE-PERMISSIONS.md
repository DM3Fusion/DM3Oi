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
| Cases: reassign customer | ✓ | ✓ | ✓ | ✓ | — | — |
| Service Desk: view/create | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Service Desk: manage/assign | ✓ | ✓ | ✓ | ✓ | — | — |
| Communications: view | ✓ | ✓ | ✓ | ✓ | R | — |
| Communications: respond/manage | ✓ | ✓ | ✓ | ✓ | — | — |
| Customers: view/create/edit | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Tasks: view/work | ✓ | ✓ | ✓ | ✓ | R | — |
| Tasks: assign | ✓ | ✓ | ✓ | ✓ | — | — |
| Questions: view | ✓ | ✓ | ✓ | ✓ | R | — |
| Questions: manage | ✓ | ✓ | ✓ | ✓ | — | — |
| Rules: view | ✓ | ✓ | ✓ | ✓ | — | — |
| Rules: manage | ✓ | ✓ | ✓ | — | — | — |
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
- Rule definitions/actions are separately governed by `VIEW_RULES` and `MANAGE_RULES`. Tenant overrides remain authoritative; Rules are not exposed to `PUBLIC_USER`, and the data foundation grants tenant reads only through platform-safe organization projections.
- Administration and organization-setting mutations use centralized capabilities and retain direct-request checks.
- Case visibility retains the existing `can_access_case` assignment/manager rules. Record-level visibility is intentionally not redesigned in 03A.
- Service Request reads are organization-member scoped. Management RPCs distinguish manager roles; application action wrappers still rely substantially on those authoritative RPC checks.
- Customer reads/writes currently use organization membership in RLS. This is intentional current behavior but is a candidate for later action-specific hardening.
- Communications combine recipient/user scoping with organization membership depending on the table and operation.

## Operational Mutation Enforcement

Operational server actions resolve the authenticated active-organization context and call `requirePermission()` before writing. UI controls use the same capability source; RPC and RLS checks remain authoritative record/tenant backstops. SUPER_ADMIN receives these capabilities only in an active organization context, and PUBLIC_USER portal actions remain governed by the separate portal authorization path.

| Area / operation | Capability | Roles | UI and server enforcement | DB/RPC alignment |
|---|---|---|---|---|
| Case creation | `CREATE_CASE` | SUPER_ADMIN, BUSINESS_OWNER, BUSINESS_ADMIN, STAFF_MANAGER | New Case control, route, and action | **Aligned:** `create_case_workflow` uses `can_manage_case` |
| Case workflow status | `WORK_CASES` | All internal roles | Status control and action; non-managers retain the existing reduced status list | **Aligned with record backstop:** RPC limits non-manager statuses and requires `can_access_case` |
| Case assignment | `ASSIGN_CASES` | SUPER_ADMIN, BUSINESS_OWNER, BUSINESS_ADMIN, STAFF_MANAGER | Assignment controls and action | **Aligned:** `set_case_assignment` uses `can_manage_case` |
| Case customer reassignment | `REASSIGN_CASE_CUSTOMER` | SUPER_ADMIN, BUSINESS_OWNER, BUSINESS_ADMIN, STAFF_MANAGER | Case Overview control and structured server action | **Aligned with record backstop:** `reassign_case_customer` enforces the effective permission, same-tenant active customer, and `can_access_case` |
| Task status/work | `WORK_TASKS` | All internal roles | Action permits work; non-manager fields are read-only in the UI | **Aligned with record backstop:** `update_case_task` permits STAFF_USER status-only changes only on assigned tasks |
| Task create/delete/reorder | `MANAGE_TASKS` | SUPER_ADMIN, BUSINESS_OWNER, BUSINESS_ADMIN, STAFF_MANAGER | Controls and actions | **Aligned:** task RPCs require `can_manage_case` |
| Task assignment | `ASSIGN_TASKS` | SUPER_ADMIN, BUSINESS_OWNER, BUSINESS_ADMIN, STAFF_MANAGER | Represented by manager-only task editing | **Aligned:** update RPC requires manager authority for assignment changes |
| Internal Service Desk creation | `CREATE_SERVICE_REQUEST` | All internal roles | New Request control, route, and action | **Application stricter for assignment:** creation RPC accepts any internal member; application requires `ASSIGN_SERVICE_REQUEST` when an assignee is supplied |
| Service Desk status/priority work | `WORK_SERVICE_REQUEST` | All internal roles | Edit controls and actions; STAFF_USER UI is limited to assigned requests | **Aligned with record backstop:** `can_manage_service_request` permits managers or the assigned STAFF_USER |
| Service Desk assignment | `ASSIGN_SERVICE_REQUEST` | SUPER_ADMIN, BUSINESS_OWNER, BUSINESS_ADMIN, STAFF_MANAGER | Assignment field/control and action | **Aligned:** assignment RPC uses the same manager-role set |
| Service Desk staff reply | `RESPOND_SERVICE_REQUEST` | All internal roles | Reply control and action; STAFF_USER UI is limited to assigned requests | **Aligned with record backstop:** message RPC uses `can_manage_service_request` |
| Customer creation | `CREATE_CUSTOMER` | All internal roles | New Customer control, route, and action | **Aligned for current matrix:** creation RPC accepts any internal member |
| Customer edit/status/archive | `EDIT_CUSTOMER` | All internal roles | Edit control, route, and action | **Legacy/broad DB policy:** `customers_internal_write` permits any internal member; the application capability is now explicit but currently grants the same roles |
| Communications read/unread/all-read | `VIEW_COMMUNICATIONS` | All internal roles | Inbox page and actions | **Aligned with recipient backstop:** RPCs constrain mutations to the authenticated recipient and active organization |

Notification archive has an authorized recipient-scoped RPC but no current application control/action. No unsupported mutation was added. Customer Portal submission and reply are not internal operational actions and retain their existing customer-link authorization.

Record-level visibility and ownership policy remain deferred to DM3Oi-03C. In particular, assigned-case/task/request scope continues to come from the existing `can_access_case`, task RPC, and `can_manage_service_request` checks rather than new application filtering.

## RLS review and later hardening

Tenant membership is consistently checked for organizations, members, customers, question definitions, and Service Desk records. Cases, tasks, assignments, and case responses use `can_access_case`. Question and Service Desk mutation RPCs contain explicit role checks.

Several legacy policies deliberately permit any internal organization member to write customers and operational case/task records, with finer rules sometimes enforced inside security-definer RPCs. A later milestone should align each mutation wrapper and policy with the capability names here, after record-level workflow decisions are finalized. No RLS migration is included in 03A.
