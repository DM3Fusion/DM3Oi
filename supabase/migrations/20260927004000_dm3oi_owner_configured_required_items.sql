-- Required intake items are organization configuration.
-- Staff records whether configured required items have been received.
-- The legacy per-Case "track required options" mode is retired from active use
-- but the historical column and RPC argument remain for deployment compatibility.

update public.question_definitions
set
  require_all_options = true,
  track_required_options = false
where response_type = 'MULTI_SELECT'
  and track_required_options;

-- Existing Guided Intake drafts may contain staff-selected required-option IDs
-- from the retired mode. They must not survive into the authoritative RPC.
update public.guided_case_intake_drafts
set required_option_ids = '{}'::jsonb
where required_option_ids <> '{}'::jsonb;

alter table public.question_definitions
  drop constraint if exists question_definitions_track_required_options_retired;

alter table public.question_definitions
  add constraint question_definitions_track_required_options_retired
  check (track_required_options = false);

-- Keep the compatibility RPC parameter but make the database authoritative:
-- callers can no longer re-enable per-Case required-item selection.
create or replace function public.enforce_question_required_item_configuration()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.track_required_options then
    raise exception
      'per-Case required-item selection is retired; configure required displayed items instead'
      using errcode='23514';
  end if;

  return new;
end
$$;

drop trigger if exists enforce_question_required_item_configuration
  on public.question_definitions;

create trigger enforce_question_required_item_configuration
before insert or update of track_required_options
on public.question_definitions
for each row
execute function public.enforce_question_required_item_configuration();

revoke all on function public.enforce_question_required_item_configuration()
from public,anon,authenticated;

-- Mimms Required Documents now uses organization-configured displayed items.
update public.question_definitions
set
  require_all_options = true,
  track_required_options = false,
  description =
    'Each document listed below is required for this Case. Mark a document Received only after it has been provided.'
where organization_id = 'e5a00c5a-f028-47f8-bb34-5527219eb995'
  and id = '911c69ee-14bd-4391-ae87-f5b34047ea60'
  and response_type = 'MULTI_SELECT';

do $$
begin
  if not exists(
    select 1
    from public.question_definitions
    where organization_id = 'e5a00c5a-f028-47f8-bb34-5527219eb995'
      and id = '911c69ee-14bd-4391-ae87-f5b34047ea60'
      and require_all_options
      and not track_required_options
  ) then
    raise exception 'Mimms Required Documents configuration was not converted';
  end if;
end
$$;
