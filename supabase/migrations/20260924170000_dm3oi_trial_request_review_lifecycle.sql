begin;

create table public.trial_request_status_history (
  id uuid primary key default gen_random_uuid(),

  trial_request_id uuid not null
    references public.trial_requests(id)
    on delete restrict,

  prior_status public.trial_request_status not null,
  resulting_status public.trial_request_status not null,

  review_note text
    check (
      review_note is null
      or char_length(trim(review_note)) between 1 and 1000
    ),

  actor_user_id uuid not null
    references public.profiles(id)
    on delete restrict,

  created_at timestamptz not null default now(),

  check (prior_status <> resulting_status)
);

create index trial_request_status_history_request_idx
  on public.trial_request_status_history(
    trial_request_id,
    created_at desc,
    id desc
  );

alter table public.trial_request_status_history
  enable row level security;

create policy trial_request_status_history_super_admin_select
on public.trial_request_status_history
for select
to authenticated
using (public.is_super_admin());

revoke all
on table public.trial_request_status_history
from anon, authenticated;

grant select
on table public.trial_request_status_history
to authenticated;


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


revoke update
on table public.trial_requests
from authenticated;

drop policy if exists trial_requests_super_admin_update
on public.trial_requests;


revoke all
on function public.transition_trial_request(
  uuid,
  public.trial_request_status,
  text
)
from public, anon;

grant execute
on function public.transition_trial_request(
  uuid,
  public.trial_request_status,
  text
)
to authenticated;

commit;
