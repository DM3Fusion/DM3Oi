begin;

create function public.get_business_reach_unmapped_customers(
  target_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result jsonb;
begin
  if actor is null
     or not public.has_effective_organization_permission(target_organization_id, 'VIEW_REPORTS')
     or not public.has_effective_organization_permission(target_organization_id, 'VIEW_CUSTOMERS') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'customerId', c.id,
        'customerNumber', c.customer_number,
        'customerName', c.name,
        'streetAddress', c.street_address,
        'city', c.city,
        'state', c.state,
        'postalCode', c.postal_code,
        'mappingStatus', case
          when g.customer_id is null then 'PENDING'
          else 'UNMAPPABLE'
        end
      )
      order by c.customer_number, c.id
    ),
    '[]'::jsonb
  ) into result
  from public.customers c
  left join public.customer_geocodes g
    on g.organization_id = c.organization_id
   and g.customer_id = c.id
  where c.organization_id = target_organization_id
    and c.status = 'ACTIVE'
    and (
      g.customer_id is null
      or g.geocode_status = 'UNMAPPABLE'
    );

  return result;
end;
$$;

revoke all on function public.get_business_reach_unmapped_customers(uuid)
  from public, anon;
grant execute on function public.get_business_reach_unmapped_customers(uuid)
  to authenticated;

comment on function public.get_business_reach_unmapped_customers(uuid) is
  'Returns the tenant-scoped current ACTIVE Customers awaiting Business Reach mapping or classified as address-not-matched, without provider metadata or coordinates.';

commit;
