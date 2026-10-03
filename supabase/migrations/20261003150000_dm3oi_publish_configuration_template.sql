begin;

create or replace function public.publish_configuration_template(
  target_template_id uuid
)
returns public.configuration_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  updated_template public.configuration_templates;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  select *
  into updated_template
  from public.configuration_templates
  where id = target_template_id
  for update;

  if not found then
    raise exception 'configuration template not found'
      using errcode = 'P0002';
  end if;

  if updated_template.status <> 'DRAFT' then
    raise exception 'only draft configuration templates can be published'
      using errcode = '22023';
  end if;

  update public.configuration_templates
  set
    status = 'PUBLISHED',
    updated_at = now()
  where id = target_template_id
  returning *
  into updated_template;

  return updated_template;
end;
$$;

revoke all
on function public.publish_configuration_template(uuid)
from public, anon;

grant execute
on function public.publish_configuration_template(uuid)
to authenticated;

commit;
