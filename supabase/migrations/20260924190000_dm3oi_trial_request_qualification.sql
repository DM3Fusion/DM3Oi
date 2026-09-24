begin;

create type public.trial_request_workflow_fit as enum (
  'FIT',
  'NEEDS_REVIEW',
  'NOT_FIT'
);

alter table public.trial_requests
  add column workflow_fit public.trial_request_workflow_fit,
  add column qualification_notes text
    check (
      qualification_notes is null
      or char_length(qualification_notes) <= 2000
    ),
  add column qualification_reviewed_at timestamptz,
  add column qualification_reviewed_by uuid
    references public.profiles(id)
    on delete set null;


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


create or replace function public.transition_trial_request(
  target_trial_request_id uuid,
  target_status public.trial_request_status,
  target_review_note text default null
)
returns public.trial_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  item public.trial_requests;
  normalized_note text;
begin
  if actor is null
     or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if target_status not in (
    'NEW'::public.trial_request_status,
    'CONTACTED'::public.trial_request_status,
    'QUALIFIED'::public.trial_request_status,
    'DECLINED'::public.trial_request_status
  ) then
    raise exception 'unsupported trial request review status'
      using errcode = '22023';
  end if;

  normalized_note :=
    nullif(trim(coalesce(target_review_note, '')), '');

  if normalized_note is not null
     and char_length(normalized_note) > 1000 then
    raise exception 'review note too long'
      using errcode = '22023';
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
    raise exception 'converted trial requests cannot be changed'
      using errcode = '23514';
  end if;

  if item.status = target_status then
    raise exception 'trial request already has that status'
      using errcode = '23514';
  end if;

  if not (
    (item.status = 'NEW' and target_status in ('CONTACTED', 'DECLINED'))
    or
    (item.status = 'CONTACTED' and target_status in ('QUALIFIED', 'DECLINED'))
    or
    (item.status = 'QUALIFIED' and target_status in ('CONTACTED', 'DECLINED'))
    or
    (item.status = 'DECLINED' and target_status in ('NEW', 'CONTACTED'))
  ) then
    raise exception 'invalid trial request status transition'
      using errcode = '23514';
  end if;

  if target_status = 'QUALIFIED' then
    if item.workflow_fit is distinct from 'FIT'
       or item.qualification_reviewed_at is null
       or item.qualification_reviewed_by is null then
      raise exception 'qualification review must be completed as FIT before qualification'
        using errcode = '23514';
    end if;
  end if;

  insert into public.trial_request_status_history (
    trial_request_id,
    prior_status,
    resulting_status,
    review_note,
    actor_user_id
  )
  values (
    item.id,
    item.status,
    target_status,
    normalized_note,
    actor
  );

  update public.trial_requests
  set
    status = target_status,

    contacted_at = case
      when target_status = 'CONTACTED'
        then coalesce(contacted_at, now())
      else contacted_at
    end,

    qualified_at = case
      when target_status = 'QUALIFIED'
        then coalesce(qualified_at, now())
      else qualified_at
    end,

    declined_at = case
      when target_status = 'DECLINED'
        then now()
      when item.status = 'DECLINED'
        then null
      else declined_at
    end

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
