begin;

create or replace function public.convert_qualified_trial_with_template(
  target_trial_request_id uuid,
  target_organization_name text,
  target_organization_slug text,
  target_conversion_note text,
  target_owner_user_id uuid,
  target_owner_email text,
  target_owner_identity_verified boolean,
  target_template_id uuid
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  created public.organizations;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  select *
  into created
  from public.convert_trial_request_to_organization(
    target_trial_request_id,
    target_organization_name,
    target_organization_slug,
    target_conversion_note,
    target_owner_user_id,
    target_owner_email,
    target_owner_identity_verified
  );

  perform public.apply_configuration_template(
    created.id,
    target_template_id
  );

  return created;
end;
$$;

revoke all
on function public.convert_qualified_trial_with_template(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.convert_qualified_trial_with_template(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  uuid
)
to authenticated;

notify pgrst, 'reload schema';

commit;
