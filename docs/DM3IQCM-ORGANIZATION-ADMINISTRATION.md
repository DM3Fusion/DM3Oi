# DM3Oi Organization Administration

## Administration contexts

Platform administration is restricted to the single active `SUPER_ADMIN` role in `platform_user_roles`. Organization administration is tenant-scoped through `organization_members`. A Super Admin never needs or receives an organization membership.

The platform Back Office provides live organization, user, portal-access, and pending-provisioning summaries. Super Admins can explicitly enter an active tenant workspace and return through **Back Office**. The `dm3iqcm-active-organization` cookie stores either an authorized active organization ID or the server-recognized platform-context sentinel. Inactive organizations are excluded from workspace resolution.

## Organization lifecycle

Organizations are created active with a normalized, unique slug. They can transition among the existing `ACTIVE`, `SUSPENDED`, and `ARCHIVED` states; they are never hard-deleted by this console. Suspending or archiving preserves tenant data while preventing the organization from conferring workspace access.

The local migration `20260903210000_dm3iqcm_organization_administration.sql` adds narrow `SECURITY DEFINER` RPCs for creation, organization updates, existing-profile provisioning, and membership updates. Each RPC independently checks `auth.uid()` and active Super Admin authorization, validates inputs, and uses an empty search path. The migration also makes organization-active status authoritative in membership helpers.

## User provisioning and roles

The first-version provisioning flow resolves an existing active application profile by email and assigns one of `BUSINESS_OWNER`, `BUSINESS_ADMIN`, `STAFF_MANAGER`, or `STAFF_USER`. It never creates `auth.users`, never accepts `SUPER_ADMIN` or `PUBLIC_USER` as an internal membership role, and keeps customer portal access separate.

No Supabase Admin API or service-role environment variable is required. If a person has not registered and therefore has no profile, the UI gives a registration-first message. Profiles without an active platform role, organization membership, or customer portal link appear as **Pending Access** in the platform register.

The database trigger remains authoritative for a maximum of two active Business Owners and two active Business Administrators per organization. Managers and staff users are unlimited. Role changes and reactivation pass through the same trigger. Deactivation retains membership history and revokes tenant access.

## Security boundaries

Platform pages and server actions call `requireSuperAdmin()`; navigation visibility is not an authorization control. Operational reads and mutations still require an active organization through the existing tenant context, organization filters, RLS, and workflow RPC authorization. No service key is used in browser or server application code, and case completion semantics are unchanged.

## Migration status

The DM3iQCM-04 migration is local and intentionally unpushed. The remote database must not receive this migration during this milestone.
