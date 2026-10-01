begin;

-- Repair unfinished materialized Guided Intake drafts whose stored
-- Customer mode conflicts with the explicit NEW/EXISTING Case Type.
-- ANY Case Types are intentionally left unchanged.

update public.guided_case_intake_drafts draft
set customer_mode =
  case
    when case_type.customer_mode = 'NEW' then 'new'
    when case_type.customer_mode = 'EXISTING' then 'existing'
    else draft.customer_mode
  end
from public.cases item
join public.organization_case_types case_type
  on case_type.organization_id = item.organization_id
 and case_type.id = item.case_type_id
where draft.organization_id = item.organization_id
  and draft.case_id = item.id
  and draft.finalized_at is null
  and case_type.customer_mode in ('NEW','EXISTING')
  and draft.customer_mode is distinct from
    case
      when case_type.customer_mode = 'NEW' then 'new'
      when case_type.customer_mode = 'EXISTING' then 'existing'
    end;

create or replace function public.protect_guided_case_intake_draft_identity()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if old.finalized_at is not null
    and current_user not in ('postgres','supabase_admin','service_role') then
    raise exception 'Finalized Guided Intake sessions are immutable'
      using errcode='42501';
  end if;

  if new.organization_id<>old.organization_id
     or new.created_by_user_id<>old.created_by_user_id
     or new.submission_key<>old.submission_key then
    raise exception 'Guided Intake draft identity cannot change'
      using errcode='23514';
  end if;

  if old.case_id is not null
    and new.case_id is distinct from old.case_id then
    raise exception 'Materialized Guided Intake Case identity cannot change'
      using errcode='23514';
  end if;

  if old.case_id is not null
    and new.customer_mode is distinct from old.customer_mode then
    raise exception 'Materialized Guided Intake Customer mode cannot change'
      using errcode='23514';
  end if;

  if old.case_id is not null and (
    new.customer_id is distinct from old.customer_id
    or new.tax_year is distinct from old.tax_year
    or new.case_type_id is distinct from old.case_type_id
  ) then
    if current_user not in ('postgres','supabase_admin','service_role')
      or not public.guided_intake_case_identity_matches(
        new.organization_id,
        old.case_id,
        new.customer_id,
        new.tax_year,
        new.case_type_id
      )
    then
      raise exception 'Materialized Guided Intake Case identity cannot change'
        using errcode='23514';
    end if;
  end if;

  if current_user not in ('postgres','supabase_admin','service_role') and (
    new.case_id is distinct from old.case_id
    or new.finalized_at is distinct from old.finalized_at
  ) then
    raise exception 'Guided Intake Case linkage is server managed'
      using errcode='42501';
  end if;

  return new;
end
$$;

alter function public.protect_guided_case_intake_draft_identity()
  owner to postgres;

revoke all
  on function public.protect_guided_case_intake_draft_identity()
  from public,anon,authenticated;

comment on function public.protect_guided_case_intake_draft_identity() is
  'Protects Guided Intake ownership, Case linkage, materialized Case identity, and the pre-materialization Customer mode.';

commit;
