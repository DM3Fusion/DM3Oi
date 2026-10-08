begin;

-- organization_service_requests is an authenticated security-barrier view that
-- invokes can_access_service_request(...). PostgreSQL requires the querying
-- role to retain EXECUTE on functions referenced by the view.
--
-- 20261008120000 correctly hardened the helper itself as SECURITY DEFINER, but
-- revoking authenticated EXECUTE made every authenticated read through
-- organization_service_requests fail with SQLSTATE 42501.
--
-- Keep anonymous/public execution denied while restoring the minimum privilege
-- required by authenticated organization and Customer Portal reads.

revoke execute
on function public.can_access_service_request(uuid, uuid, uuid)
from public, anon;

grant execute
on function public.can_access_service_request(uuid, uuid, uuid)
to authenticated;

comment on function public.can_access_service_request(uuid, uuid, uuid) is
  'Determines Service Request read visibility. EXECUTE is required by authenticated callers because organization_service_requests invokes this SECURITY DEFINER helper; anonymous execution remains denied.';

commit;
