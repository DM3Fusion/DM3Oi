-- Trusted server-only privacy checks need to identify active platform actors.
-- Limit service_role to the four columns used by those UUID-scoped lookups;
-- organization-facing clients continue to receive no new privilege here.
revoke all privileges on table public.platform_user_roles from public, anon;
revoke select on table public.platform_user_roles from service_role;
revoke select (created_at, updated_at) on table public.platform_user_roles from service_role;

grant select (id, user_id, role, is_active)
on table public.platform_user_roles
to service_role;
