-- Permit server-only permanent organization deletion cleanup/reconciliation
-- to read and update its durable platform audit.
--
-- Migration 20260925180000 intentionally exposes SELECT to authenticated
-- SUPER_ADMIN users through RLS. Server cleanup uses the Supabase
-- service_role and also requires explicit table privileges even though
-- service_role bypasses RLS.

grant select, update
on table public.platform_organization_deletion_audit
to service_role;
