# DM3Oi Question and Response Workflow

## Domain model

`question_definitions` stores tenant-owned master questions and their response type, requirement state, lifecycle state, and order. `question_options` provides normalized ordered choices for single- and multi-select definitions. Supported response types are text, long text, yes/no, single select, multi-select, date, and number.

Questions are unbounded and may be edited, reordered by changing display order, activated, or deactivated by a Business Owner, Business Administrator, Staff Manager, or Super Admin operating in an active workspace. Staff Users cannot administer definitions.

## Snapshot integrity

When a case is created, an `AFTER INSERT` trigger copies every active definition into `case_questions`, including wording, help text, response type, required state, display order, and a JSON snapshot of normalized options. Later master edits or deactivation do not rewrite the case snapshot or historical response meaning. Questions added later apply to newly created cases; future template/stage logic can extend the snapshot event explicitly.

## Responses and readiness

`case_question_responses` stores one typed JSON response per case snapshot with its responding profile and timestamps. The database RPC validates booleans, numbers, ISO-style dates, non-empty text, and configured select values before an upsert. Successful changes append `QUESTION_RESPONSE_UPDATED` case activity.

Question readiness is separate from the existing task progress percentage. Required snapshots without responses are shown as remaining and block transition to `COMPLETED`; optional unanswered snapshots do not. Completion therefore requires both the existing required-task rule and every required case question to have a valid stored response.

## Permissions and tenant isolation

All four tables have tenant-aware RLS. Definition writes require question-administration roles. Responses use `can_access_case`. That helper now permits either a platform-level Super Admin or a valid active internal member who also has a management role, active case assignment, or case task assignment. This prevents assignment records from bypassing inactive profiles or suspended/archived organizations.

Super Admin remains solely in `platform_user_roles`, can administer and respond inside a selected active organization without membership, and remains a valid profile-based DM3Oi actor. `organization_members` is unchanged and never stores `SUPER_ADMIN`.

## Future extension points

The snapshot boundary can later incorporate conditions, customer-facing visibility, templates, workflow stages, and version identifiers without mutating historical cases. Normalized master options and typed snapshot data provide stable inputs for reporting and automated intelligence.
