# DM3Oi User Invitation & Provisioning

DM3iQCM-05A adds platform user creation to the SUPER_ADMIN Back Office. From **Users / Access**, a SUPER_ADMIN can invite a new identity, create one without immediately sending an email, optionally grant initial organization access, and manage the resulting profile and memberships.

## Architecture and flow

The browser submits a Next.js Server Action. Every invitation, profile update, and membership action first calls `requireSuperAdmin()`. Auth administration is performed by a separate Supabase client in `lib/supabase/admin.ts`; that module is marked `server-only` and is never imported by a Client Component.

The creation sequence is:

1. Normalize and validate the email, display name, optional organization, and role.
2. Verify that any selected organization is currently `ACTIVE`.
3. Look up the profile email case-insensitively. An existing identity is not duplicated; when an organization is selected, access can instead be provisioned for that profile.
4. Invite the user with Supabase Admin Auth, or create a confirmed Auth identity when email delivery is deliberately unchecked.
5. Reuse the existing `auth.users` profile bootstrap and upsert the expected display name and active state.
6. Provision the optional membership through `provision_organization_member`.
7. If profile or membership provisioning fails after Auth creation, delete the newly created Auth identity as a compensating rollback.

Auth identity and application profile remain separate concepts. `auth.users` owns authentication; `profiles` owns the application-facing name and active state. The implementation does not create a competing identity table or bypass the existing profile trigger.

## Invitations and access states

Invitation email delivery uses the Supabase Auth email configuration and redirects through the existing `/auth/callback` route. `DM3IQCM_SITE_URL` defines the canonical application origin; production defaults to `https://dm-3i-qcm.vercel.app` when it is not explicitly set.

A profile with no platform role, active organization membership, or active portal assignment is shown as **Pending Access**. An active internal membership changes that state to **Organization User**. Authentication alone never grants tenant access.

Password and Email Code sign-in remain unchanged. The invitation workflow only adds an administrative route for establishing the Auth identity.

## Organization provisioning

Only these organization roles are accepted by both the UI and server action:

- `BUSINESS_OWNER`
- `BUSINESS_ADMIN`
- `STAFF_MANAGER`
- `STAFF_USER`

`SUPER_ADMIN` is platform-level and is stored only in `platform_user_roles`; it is never inserted into `organization_members`. `PUBLIC_USER` remains a customer-portal concern and cannot be selected as an internal organization role.

The database RPC and triggers remain authoritative for membership policy. In particular, the maximum of two active Business Owners and two active Business Administrators per organization is database-enforced. Membership deactivation and reactivation use the same protected RPC path.

## Credentials and deployment

Set these server deployment values:

- `DM3IQCM_SUPABASE_SERVICE_ROLE_KEY` — required Supabase Admin Auth credential; server-only and secret.
- `DM3IQCM_SITE_URL` — canonical invitation origin, normally `https://dm-3i-qcm.vercel.app`.

Never prefix the service-role variable with `NEXT_PUBLIC_`, expose it to browser code, print it in logs, or commit its value. Configure the secret for Vercel Production and Preview environments. The public URL and anonymous/publishable key continue to use their existing `NEXT_PUBLIC_` variables.

No schema change is required for 05A: existing Auth/profile bootstrapping, platform authorization, membership RPCs, role-limit triggers, RLS, and tenant isolation are reused without weakening them.

## Follow-up administration

Each register row opens `/admin/users/[userId]`, where a SUPER_ADMIN can inspect profile status, platform role state, portal-access count, and all organization memberships. The page supports display-name and profile-state updates, adding access to an active organization, changing internal roles, and membership activation/deactivation. Auth-account deletion is intentionally not implemented.
