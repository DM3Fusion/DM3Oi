begin;

create or replace function public.review_trial_request_qualification(
  target_trial_request_id uuid,
  target_workflow_fit public.trial_request_workflow_fit,
  target_notes text default null
)
returns public.trial_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  item public.trial_requests;
  normalized_notes text;
begin
  if actor is null
     or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  normalized_notes :=
    nullif(trim(coalesce(target_notes, '')), '');

  if normalized_notes is not null
     and char_length(normalized_notes) > 2000 then
    raise exception 'qualification notes too long'
      using errcode = '22023';
  end if;

  if target_workflow_fit in (
    'NEEDS_REVIEW'::public.trial_request_workflow_fit,
    'NOT_FIT'::public.trial_request_workflow_fit
  )
  and normalized_notes is null then
    raise exception 'qualification notes required for workflow fit'
      using errcode = '23514';
  end if;

  select *
  into item
  from public.trial_requests
  where id = target_trial_request_id
  for update;

  if not found then
    raise exception 'trial request not found'
      using errcode = 'P0002';
  end if;

  if item.status = 'CONVERTED' then
    raise exception 'converted trial requests cannot be reviewed'
      using errcode = '23514';
  end if;

  update public.trial_requests
  set
    workflow_fit = target_workflow_fit,
    qualification_notes = normalized_notes,
    qualification_reviewed_at = now(),
    qualification_reviewed_by = actor
  where id = item.id
  returning * into item;

  return item;
end;
$$;

revoke all
on function public.review_trial_request_qualification(
  uuid,
  public.trial_request_workflow_fit,
  text
)
from public, anon;

grant execute
on function public.review_trial_request_qualification(
  uuid,
  public.trial_request_workflow_fit,
  text
)
to authenticated;

commit;
