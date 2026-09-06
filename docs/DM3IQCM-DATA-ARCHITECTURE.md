# DM3Oi Permanent Data Architecture

## Platform and tenant boundaries

DM3Oi is the product identity for **DM3Oi™ — Operational Intelligence**. The platform is multi-tenant. `organizations` are the tenant boundary, and every operational record carries `organization_id`. PostgreSQL Row Level Security (RLS), not UI filtering, enforces tenant visibility.

The permanent hierarchy is platform → organization → internal membership → customers → cases → assignments/tasks/activity. Service requests are customer-service intake objects and can exist independently or link to a case.

## Identities and access

`profiles` is the application-facing 1:1 companion to `auth.users`. It stores presentation/contact data but never credentials. An `auth.users` trigger creates or reconciles profiles, and the migration reconciles users that already exist. Authentication does not provision authorization.

`platform_user_roles` is separate from organizations and accepts only `SUPER_ADMIN`. `organization_members` accepts only `BUSINESS_ADMIN`, `BUSINESS_OWNER`, `STAFF_MANAGER`, and `STAFF_USER`. It is the internal workforce boundary. `customer_portal_users` links an authenticated external user to a specific customer and organization; it never creates internal membership.

After authentication, the proxy resolves active platform roles, memberships, and portal links. An identity with none is sent to `/account/unprovisioned`, where it receives no operational access. The reusable `getAccessContext()` provides the same resolution for later server-side application work.

## Constrained roles

One partial unique index on the constant `SUPER_ADMIN` role allows at most one active platform Super Admin. PostgreSQL uniqueness remains correct under concurrent transactions.

For `BUSINESS_ADMIN` and `BUSINESS_OWNER`, a `BEFORE INSERT OR UPDATE` trigger obtains a transaction-level advisory lock derived from organization and role, then evaluates the active allocation. This serializes even the first allocation, where row locking alone has no row to lock. Two active memberships are allowed; the third fails with SQLSTATE `23514`. Deactivation and replacement use the same lock.

## First Super Admin bootstrap

Never choose an account automatically and never hard-code an email in a migration. First authenticate or create the intended identity through the approved Supabase administrative process, confirm its UUID, then run this deliberately as a trusted database administrator (local `psql` or the hosted SQL editor):

```sql
begin;
select id, email from auth.users where id = '<verified-auth-user-uuid>'::uuid for update;
insert into public.profiles (id, email, display_name)
select id, email, coalesce(raw_user_meta_data->>'display_name', email)
from auth.users
where id = '<verified-auth-user-uuid>'::uuid
on conflict (id) do update set email = excluded.email, updated_at = now();
insert into public.platform_user_roles (user_id, role, is_active)
values ('<verified-auth-user-uuid>'::uuid, 'SUPER_ADMIN', true);
commit;
```

The transaction fails if the UUID is invalid or an active Super Admin already exists. Do not use a service-role key in a browser or commit it to the repository.

## Organizations and operational records

Organizations have unique normalized slugs and `ACTIVE`, `SUSPENDED`, or `ARCHIVED` status. Customers are independent business records and do not require portal identities. Customer numbers and case numbers are unique per organization.

Cases use the fixed lifecycle and priority enums. `OVERDUE` is not a status. `case_operational_status` derives it when the due date is past and the lifecycle is not `COMPLETED`, `CLOSED`, or `CANCELLED`.

`organization_case_number_counters` provides atomic tenant-local allocation via `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`. New cases without an explicit number receive `CASE-000001`, independently per organization. A composite unique constraint remains the final duplicate guard.

## Assignments, tasks, and progress

`case_assignments` supports one active manager (partial unique index) and multiple active staff. Composite foreign keys require the case and member to belong to the same organization. Cases also retain `manager_user_id` as the direct operational manager field.

Task assignment, completion, and creation actors are constrained to internal members of the same organization. Completed tasks require both completion timestamp and completing member. Progress is not stored. `get_case_progress(case_id)` and the security-invoker `case_progress` view return percentage, completed, total, and remaining required tasks. Optional and `NOT_APPLICABLE` tasks do not enter the denominator. Zero applicable required tasks deliberately returns 0%.

## Activity and service requests

`case_activity` stores append-oriented events with flexible object-shaped `event_data`. Authenticated clients receive `SELECT` and `INSERT`, but no `UPDATE` or `DELETE` grant or policy. Later milestones may add immutable audit capture for other security-sensitive entities.

`service_requests` remains distinct from cases. A request can have no case or link to one in the same organization. A portal requester must match the request’s organization and customer through a composite foreign key. Message threads and email intake remain deferred.

## Cross-tenant integrity

Composite keys and foreign keys enforce organization agreement for customers/cases, cases/assignments, member assignments, task assignees/completers/creators, activity actors, service-request customers/cases/staff, and portal identities. These constraints protect against malicious service-role or buggy backend writes even when RLS is bypassed.

## RLS strategy

SECURITY DEFINER helpers use a fixed empty `search_path`, schema-qualified objects, no dynamic SQL, and minimal boolean results. They avoid recursively applying policies to the membership table. Anonymous access is revoked.

- Super Admins receive platform visibility.
- Business Admins and Owners receive organization-wide visibility and membership administration.
- Staff Managers receive organization operational visibility and assignment management.
- Staff Users see cases, tasks, assignments, and activity only when actively assigned to the case.
- Portal users can see only their linked customer and that customer’s service requests. Internal memberships, cases, tasks, and activity are deliberately not exposed in DM3iQCM-02.

DM3iQCM-03 adds controlled activity emission through transactional workflow RPCs, revokes direct authenticated writes to core case/task/assignment/activity records, and expands Staff User case visibility only when the user has a direct active assignment or an assigned task. Finer distinctions between Owner and Admin, portal case-summary projections, and suspended-organization handling remain deferred. The current policy favors isolation and least privilege.

## Fixture transition and generated types

The DM3iQCM-03 dashboard, case register/workspace, assignments, tasks, activity, and customer register use typed Supabase repositories. `data/sample-data.ts` remains only for the explicitly deferred Service Desk presentation. Fixture records are never seeded into production tables.

`types/database.generated.ts` is generated from the applied schema with `supabase gen types typescript --local`; it must be regenerated after schema changes, never hand-edited.

## Validation

`npm run db:test` performs a local destructive reset only, then executes transactional SQL regressions inside the local Supabase database container for role caps, replacement slots, RLS isolation, portal isolation, cross-tenant integrity, progress, overdue derivation, and tenant-local case numbering. It rolls test records back. Never point this command at a hosted database.
