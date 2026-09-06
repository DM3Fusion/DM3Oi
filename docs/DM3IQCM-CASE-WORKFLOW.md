# DM3Oi Live Case Workflow

## Organization context

Every live read and mutation resolves the authenticated identity and active authorized organization server-side. Organization IDs and actor IDs are never trusted from browser forms. Internal members default deterministically to their first active organization; a secure, same-site cookie stores an explicit selection when multiple memberships exist. Super Admins select from active platform organizations. Customer portal identities never enter the internal case-management shell, and unprovisioned identities remain at the safe access-pending state.

## Case lifecycle and creation

Cases use `NEW`, `UNASSIGNED`, `ASSIGNED`, `IN_PROGRESS`, `WAITING`, `REVIEW`, `COMPLETED`, `CLOSED`, and `CANCELLED`. `/cases/new` collects a customer, title, description, type, priority, due date, optional manager/staff, and optional initial required tasks. It never accepts a case number.

`create_case_workflow` validates the authenticated manager-level capability, organization customer, manager, and staff. In one transaction it allocates the tenant-local number, creates the case, assignments, initial tasks, `CASE_CREATED`, `CASE_ASSIGNED`, and `TASK_CREATED` events. Any invalid relationship rolls back the entire operation.

## Assignment model

One active `MANAGER` and multiple active `STAFF` assignments are supported. `set_case_assignment` locks the case, validates a same-organization internal member, changes the manager or staff assignment, and appends `CASE_ASSIGNED` or `CASE_UNASSIGNED`. Public identities and members of another organization cannot be assigned.

## Tasks, ordering, and progress

Tasks use `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`, and `NOT_APPLICABLE`. Manager-level roles can create, edit, assign, reorder, and delete tasks. Staff Users can change the status of tasks assigned to them but cannot alter task definition or assignment. Completion stamps the authenticated actor and time; moving away from completion clears both. Move Up/Down swaps sequence within one locked case.

Progress has one definition across dashboard, register, and workspace:

`completed required applicable tasks ÷ all required applicable tasks × 100`

Optional and `NOT_APPLICABLE` tasks are excluded. Zero applicable required tasks returns 0%.

## Completion and status behavior

The database trigger `guard_case_completion` prevents every path—including direct privileged SQL updates—from entering `COMPLETED` while a required applicable task remains incomplete. This is the temporary pre-rules-engine safeguard. Entering `COMPLETED` sets `completed_at`; explicitly reopening into an active status clears it. Entering `CLOSED` independently sets `closed_at`, and reopening a closed case clears `closed_at`. `transition_case_status` locks the case, enforces role capability, applies this trigger, and writes a before/after activity event atomically.

## Activity

Event insertion is centralized in transactional RPCs. Normal UI renders human descriptions rather than raw JSON. `event_data` preserves case status before/after values, assignment identity/role, and task identity/status/assignee context. Direct authenticated inserts, updates, and deletes are revoked so workflow activity cannot be bypassed or rewritten through the public API.

## Dashboard and registers

The dashboard, case workload, staff workload, recent activity, cases register, case detail, and customer register read live RLS-filtered records from the active organization. Overdue means `due_at < now()` for a nonterminal case. Due Soon means a non-overdue, nonterminal due date through the end of the third calendar day from the current time. Search/status/priority/assignment filters are URL-backed.

## Authorization

| Role | Live workflow capability |
| --- | --- |
| `SUPER_ADMIN` | Full operations in the explicitly active organization |
| `BUSINESS_ADMIN` | Full organization case, assignment, and task operations |
| `BUSINESS_OWNER` | Full organization visibility and operational updates |
| `STAFF_MANAGER` | Create/update cases, assignments, tasks, and statuses |
| `STAFF_USER` | See directly assigned cases and cases with assigned tasks; update only assigned task status; limited active status transitions |
| `PUBLIC_USER` | No internal case-management access |

Field-specific Owner/Admin distinctions, formal transition graphs, and finer Staff User status permissions remain deferred. RLS is never weakened by application checks.

## Transactional RPCs

- `create_customer_record`
- `create_case_workflow`
- `transition_case_status`
- `set_case_assignment`
- `create_case_task`
- `update_case_task`
- `delete_case_task`
- `move_case_task`

These SECURITY DEFINER functions have fixed empty search paths, schema-qualified access, server-derived `auth.uid()`, explicit capability checks, and no uncontrolled dynamic SQL. Direct writes to core case/task/assignment/activity tables are revoked from authenticated clients.

## Remaining fixtures and deferred work

Service Desk remains backed by explicit DM3iQCM-01 fixtures while full customer-service intake/messaging is deferred. The dashboard, cases, tasks within cases, assignments, activity, and customers no longer use fixtures. Configurable Question/Response completion rules, attachments, messaging, email ingestion, customer self-service, and portal case projections remain future milestones.
