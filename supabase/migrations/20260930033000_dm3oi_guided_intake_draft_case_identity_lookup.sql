begin;

-- ============================================================
-- GUIDED INTAKE DRAFT / MATERIALIZED CASE IDENTITY LOOKUP
--
-- protect_guided_case_intake_draft_identity() intentionally runs
-- with invoker rights so current_user continues to distinguish
-- ordinary authenticated writes from trusted server-managed writes.
--
-- Its one direct public.cases lookup cannot run under the reduced
-- table privileges used by the application. Keep the trigger
-- invoker-rights and move only that exact identity comparison behind
-- this narrow SECURITY DEFINER helper.
-- ============================================================

create function public.guided_intake_case_identity_matches(
  target_organization_id uuid,
  target_case_id uuid,
  target_customer_id uuid,
  target_tax_year integer,
  target_case_type_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.cases item
    where item.organization_id=target_organization_id
      and item.id=target_case_id
      and item.customer_id=target_customer_id
      and item.tax_year is not distinct from target_tax_year
      and item.case_type_id is not distinct from target_case_type_id
  )
$$;

alter function public.guided_intake_case_identity_matches(
  uuid,uuid,uuid,integer,uuid
) owner to postgres;

revoke all
  on function public.guided_intake_case_identity_matches(
    uuid,uuid,uuid,integer,uuid
  )
  from public,anon;

grant execute
  on function public.guided_intake_case_identity_matches(
    uuid,uuid,uuid,integer,uuid
  )
  to authenticated,service_role;

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

comment on function public.guided_intake_case_identity_matches(
  uuid,uuid,uuid,integer,uuid
) is
  'Narrow SECURITY DEFINER identity comparison used by the invoker-rights Guided Intake draft protection trigger. It does not expose Case rows.';

commit;
