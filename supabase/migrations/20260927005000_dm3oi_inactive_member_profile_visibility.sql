begin;

-- Organization user administration must be able to resolve the canonical
-- profile identity attached to every membership row in the same organization,
-- including INVITED, VERIFIED, SUSPENDED, and REVOKED memberships.
--
-- Operational access is still controlled by organization_members.is_active
-- for the ACTOR. Removing the target membership's is_active requirement here
-- does not activate that target user or grant them application access.

drop policy if exists profiles_select
on public.profiles;

create policy profiles_select
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.organization_members me
    join public.organization_members them
      on them.organization_id = me.organization_id
    where me.user_id = auth.uid()
      and me.is_active
      and them.user_id = profiles.id
  )
);

comment on policy profiles_select on public.profiles is
  'An authenticated user may read their own profile; SUPER_ADMIN may read profiles; active organization members may read canonical profile identity for membership records in their same organization regardless of the target membership lifecycle state.';

commit;
