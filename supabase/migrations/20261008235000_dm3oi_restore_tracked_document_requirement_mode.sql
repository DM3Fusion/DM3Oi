begin;

-- Guided Intake now derives the Mimms Required Documents checklist from
-- intake answers. Restore tracked-option mode only for that system-owned
-- Question. All other Questions continue to use organization-configured
-- required displayed items.

alter table public.question_definitions
  drop constraint if exists question_definitions_track_required_options_retired;

alter table public.question_definitions
  add constraint question_definitions_track_required_options_retired
  check (
    track_required_options = false
    or (
      organization_id = 'e5a00c5a-f028-47f8-bb34-5527219eb995'
      and id = '911c69ee-14bd-4391-ae87-f5b34047ea60'
      and response_type = 'MULTI_SELECT'
      and require_all_options = false
    )
  );

create or replace function public.enforce_question_required_item_configuration()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.track_required_options
     and not (
       new.organization_id = 'e5a00c5a-f028-47f8-bb34-5527219eb995'
       and new.id = '911c69ee-14bd-4391-ae87-f5b34047ea60'
       and new.response_type = 'MULTI_SELECT'
       and not new.require_all_options
     )
  then
    raise exception
      'per-Case required-item selection is retired; configure required displayed items instead'
      using errcode='23514';
  end if;

  return new;
end
$$;

revoke all
on function public.enforce_question_required_item_configuration()
from public,anon,authenticated;

do $$
declare
  affected integer;
begin
  update public.question_definitions
  set
    track_required_options = true,
    require_all_options = false
  where organization_id = 'e5a00c5a-f028-47f8-bb34-5527219eb995'
    and id = '911c69ee-14bd-4391-ae87-f5b34047ea60'
    and response_type = 'MULTI_SELECT';

  get diagnostics affected = row_count;

  if affected <> 1 then
    raise exception
      'Expected exactly one Mimms Required Documents question, updated %',
      affected;
  end if;

  if not exists (
    select 1
    from public.question_definitions
    where organization_id = 'e5a00c5a-f028-47f8-bb34-5527219eb995'
      and id = '911c69ee-14bd-4391-ae87-f5b34047ea60'
      and response_type = 'MULTI_SELECT'
      and track_required_options
      and not require_all_options
  ) then
    raise exception
      'Mimms Required Documents question is not in tracked-option mode';
  end if;
end
$$;

commit;
