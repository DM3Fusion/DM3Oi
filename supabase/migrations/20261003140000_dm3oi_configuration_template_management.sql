begin;

create or replace function public.get_configuration_templates()
returns table (
  id uuid,
  name text,
  description text,
  status text,
  version integer,
  source_organization_id uuid,
  source_organization_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not public.is_super_admin(auth.uid()) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  return query
  select
    template.id,
    template.name,
    template.description,
    template.status,
    template.version,
    template.source_organization_id,
    organization.name,
    template.created_at
  from public.configuration_templates as template
  left join public.organizations as organization
    on organization.id = template.source_organization_id
  order by
    lower(template.name),
    template.version desc,
    template.created_at desc;
end;
$$;

revoke all
on function public.get_configuration_templates()
from public, anon;

grant execute
on function public.get_configuration_templates()
to authenticated;

commit;
