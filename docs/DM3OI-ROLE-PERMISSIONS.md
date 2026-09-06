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
