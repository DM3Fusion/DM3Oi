# DM3Oi™ Product Foundation

## Purpose and workflow

**DM3Oi™ — Operational Intelligence** is an extensible operational system for service businesses, not a demonstration. Its positioning is Operational Intelligence for the Real World, with a core promise to turn daily work into measurable progress.

The master workflow is:

> Customer / Request → Case → Requirements → Tasks → Staff Work → Review → Completion

DM3iQCM-01 supplies the permanent UI shell, domain/view-model contracts, reusable business selectors, operational dashboard, case register, case workspace, Service Desk boundary, and representative data.

## Role model

| Role | Scope | Limit | Purpose |
| --- | --- | ---: | --- |
| `SUPER_ADMIN` | Platform | 1 platform-wide | Full platform administration |
| `BUSINESS_ADMIN` | Organization | 2 per organization | Configuration and user administration |
| `BUSINESS_OWNER` | Organization | 2 per organization | Executive ownership and oversight |
| `STAFF_MANAGER` | Organization | Unlimited | Assignment, review, and workload management |
| `STAFF_USER` | Organization | Unlimited | Operational case and task work |
| `PUBLIC_USER` | Public/customer | Unlimited | Requester and future portal access |

The TypeScript configuration describes these constraints but is not the enforcement boundary. A future database milestone must enforce constrained role counts transactionally, including concurrent assignment attempts. Authentication and authorization must also validate tenant membership and scope server-side.

## Case lifecycle

The initial lifecycle is `NEW`, `UNASSIGNED`, `ASSIGNED`, `IN_PROGRESS`, `WAITING`, `REVIEW`, `COMPLETED`, `CLOSED`, and `CANCELLED`. These states represent workflow, not calculated presentation conditions. Priorities are `LOW`, `NORMAL`, `HIGH`, and `URGENT`.

Overdue is deliberately not a status. It is derived whenever `dueAt` is earlier than the evaluation time and status is not `COMPLETED`, `CLOSED`, or `CANCELLED`. Centralizing this selector prevents saved state from becoming inconsistent with deadlines.

## Case and Service Request boundary

A Service Request is a customer communication/service object. It may remain independent, create a Case, or link to an existing Case. A Case is an operational work object with ownership, tasks, lifecycle, review, and completion. Keeping the records separate allows communication to continue without manufacturing casework and lets multiple support interactions relate to operational work over time.

## Task-derived progress

Case progress is never independently editable. `calculateCaseProgress(tasks)` selects required tasks, excludes `NOT_APPLICABLE`, and returns:

`completed required applicable tasks ÷ total required applicable tasks × 100`

It also returns completed, total, and remaining required task counts. With no applicable required tasks, progress is reported as zero until future completion policy defines an alternative.

## Planned questions and completion engine

Requirements / Questions will eventually provide versioned, configurable prompts, typed customer/staff responses, conditional visibility, validation, and completion rules. Rules should be evaluated by a domain service against an immutable definition version associated with each case. This milestone reserves the navigation and workspace surfaces without prematurely encoding that engine.

## Authentication foundation and future database requirements

DM3iQCM-01 includes only the Supabase authentication boundary: browser/server clients, password sign-in, email-code request and verification, PKCE callback exchange, cookie-backed session refresh, protected application routes, safe redirects, and sign-out. The application requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; credentials are never fabricated. Public responses to code requests do not reveal whether an account exists, and automatic account creation is disabled.

DM3iQCM-02 introduces stable database identifiers, organization isolation, row-level authorization, transaction-safe role caps, lifecycle constraints, task ownership, and server-derived timestamps. Authentication resolves platform, internal organization, and external customer-portal access from public application records. Unprovisioned identities receive no tenant access. See `DM3IQCM-DATA-ARCHITECTURE.md` for the permanent model and deliberately deferred permission distinctions.

DM3iQCM-03 activates the internal Customer → Case → Assignment → Tasks → Progress → Review → Completion workflow with live organization-scoped queries and transactional PostgreSQL mutations. The temporary required-task completion guard is intentionally designed for later extension by the Question/Response rules engine.

## Audit and event history

`CaseActivity` establishes the view-model for an append-only event history. Future persistence should record actor, organization, entity, event type, timestamp, structured before/after context where appropriate, and correlation metadata. Events should be append-only and written in the same transaction as the change they describe. Sensitive values require explicit redaction and retention policy. Customer communication events may reference Service Requests while operational events reference Cases, preserving the domain boundary.

## Deferred capabilities

DM3iQCM-01 intentionally does not implement a case-management database, tenant RLS for cases or tasks, dynamic questions/rules, messaging, email, attachments, or external integrations. The Supabase usage is limited to authentication. Application routes and workspace placeholders define where later capabilities can be added without replacing this foundation.
