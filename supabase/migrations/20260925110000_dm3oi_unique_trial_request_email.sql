begin;

create unique index trial_requests_business_email_uidx
  on public.trial_requests (lower(trim(business_email)));

create or replace function public.submit_trial_request(
  p_business_name text,
  p_contact_name text,
  p_business_email text,
  p_phone text,
  p_primary_use_case public.trial_request_use_case,
  p_other_use_case text,
  p_estimated_users integer,
  p_workflow_notes text,
  p_privacy_acknowledged boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_other_use_case text;
  v_email text;
begin
  if p_privacy_acknowledged is distinct from true then
    raise exception 'privacy acknowledgement required';
  end if;

  if char_length(trim(coalesce(p_business_name, '')))
       not between 2 and 120 then
    raise exception 'invalid business name';
  end if;

  if char_length(trim(coalesce(p_contact_name, '')))
       not between 2 and 100 then
    raise exception 'invalid contact name';
  end if;

  v_email := lower(trim(coalesce(p_business_email, '')));

  if char_length(v_email) not between 3 and 254
     or position('@' in v_email) <= 1 then
    raise exception 'invalid business email';
  end if;

  if p_phone is not null
     and char_length(trim(p_phone)) > 0
     and char_length(trim(p_phone)) not between 7 and 30 then
    raise exception 'invalid phone';
  end if;

  if p_estimated_users is null
     or p_estimated_users not between 1 and 10000 then
    raise exception 'invalid estimated users';
  end if;

  if p_workflow_notes is not null
     and char_length(trim(p_workflow_notes)) > 2000 then
    raise exception 'workflow notes too long';
  end if;

  if p_primary_use_case = 'OTHER_OPERATIONAL_WORKFLOW' then
    v_other_use_case :=
      nullif(trim(coalesce(p_other_use_case, '')), '');

    if v_other_use_case is null
       or char_length(v_other_use_case) > 300 then
      raise exception 'other use case required';
    end if;
  else
    v_other_use_case := null;
  end if;

  if exists (
    select 1
    from public.trial_requests
    where lower(trim(business_email)) = v_email
  ) then
    raise exception 'trial request email already exists'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.profiles
    where lower(trim(email)) = v_email
  ) then
    raise exception 'trial request email already belongs to platform identity'
      using errcode = '23505';
  end if;

  begin
    insert into public.trial_requests (
      business_name,
      contact_name,
      business_email,
      phone,
      primary_use_case,
      other_use_case,
      estimated_users,
      workflow_notes,
      privacy_acknowledged_at
    )
    values (
      trim(p_business_name),
      trim(p_contact_name),
      v_email,
      nullif(trim(coalesce(p_phone, '')), ''),
      p_primary_use_case,
      v_other_use_case,
      p_estimated_users,
      nullif(trim(coalesce(p_workflow_notes, '')), ''),
      now()
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'trial request email already exists'
        using errcode = '23505';
  end;

  return v_id;
end;
$$;

revoke all
on function public.submit_trial_request(
  text,
  text,
  text,
  text,
  public.trial_request_use_case,
  text,
  integer,
  text,
  boolean
)
from public;

grant execute
on function public.submit_trial_request(
  text,
  text,
  text,
  text,
  public.trial_request_use_case,
  text,
  integer,
  text,
  boolean
)
to anon, authenticated;

commit;
