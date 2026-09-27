-- Explicit Customer Portal onboarding during Guided Intake. Invitation delivery
-- remains an intentional staff action; Case creation only verifies durable state.

alter table public.organization_settings
  add column portal_onboarding_mode text not null default 'MANUAL_ONLY'
  constraint organization_settings_portal_onboarding_mode_check
  check(portal_onboarding_mode in ('MANUAL_ONLY','PROMPT_DURING_CASE_INTAKE'));

alter table public.guided_case_intake_drafts
  add column portal_onboarding jsonb not null default '{"resolution":"UNRESOLVED"}'::jsonb;

alter table public.guided_case_intake_drafts
  add constraint guided_case_intake_drafts_portal_onboarding_object
  check(jsonb_typeof(portal_onboarding)='object');

create table public.customer_portal_invitations(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  user_id uuid not null,
  recipient_email text not null check(
    recipient_email=lower(trim(recipient_email)) and length(recipient_email)>3
  ),
  status text not null check(status in ('PENDING','SENT','ACTIVATED','FAILED','CANCELLED')),
  sent_at timestamptz,
  last_sent_at timestamptz,
  activated_at timestamptz,
  send_count integer not null default 0 check(send_count>=0),
  created_by_user_id uuid references public.profiles(id) on delete set null,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_portal_invitations_portal_user_fkey
  foreign key(organization_id,customer_id,user_id)
    references public.customer_portal_users(organization_id,customer_id,user_id)
    on update cascade on delete cascade
);

create index customer_portal_invitations_customer_status_idx
  on public.customer_portal_invitations(
    organization_id,customer_id,status,last_sent_at desc,created_at desc
  );
create index customer_portal_invitations_user_idx
  on public.customer_portal_invitations(user_id);

create trigger customer_portal_invitations_updated_at
before update on public.customer_portal_invitations
for each row execute function public.set_updated_at();

alter table public.customer_portal_invitations enable row level security;
create policy customer_portal_invitations_intake_select
on public.customer_portal_invitations for select to authenticated
using(
  public.is_super_admin(auth.uid())
  or public.has_effective_organization_permission(organization_id,'CREATE_CASE')
);

revoke all on public.customer_portal_invitations from public,anon,authenticated;
grant select on public.customer_portal_invitations to authenticated;
grant select,insert,update,delete on public.customer_portal_invitations to service_role;

comment on table public.customer_portal_invitations is
  'Durable delivery and activation lifecycle for explicit Customer Portal invitations. URLs and tokens are never stored.';
comment on column public.guided_case_intake_drafts.portal_onboarding is
  'Intake-local portal resolution only; authoritative SENT/ACTIVE state is revalidated at load and Case creation.';

-- Preserve the complete required-document implementation behind a private
-- boundary, then add the portal gate without exposing a bypass RPC.
alter function public.create_guided_case_intake(
  uuid,uuid,uuid,uuid,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb
) set schema private;
alter function private.create_guided_case_intake(
  uuid,uuid,uuid,uuid,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb
) rename to create_guided_case_intake_with_required_options;
revoke all on function private.create_guided_case_intake_with_required_options(
  uuid,uuid,uuid,uuid,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb
) from public,anon,authenticated;

create function public.create_guided_case_intake(
  target_organization_id uuid,
  target_submission_key uuid,
  target_customer_id uuid,
  target_case_title_id uuid,
  target_description text,
  target_case_type_id uuid,
  target_priority public.priority_level,
  target_tax_year integer,
  target_manager_user_id uuid default null,
  target_staff_user_ids uuid[] default '{}'::uuid[],
  target_answers jsonb default '{}'::jsonb,
  target_required_option_ids jsonb default '{}'::jsonb,
  target_follow_up_tasks jsonb default '[]'::jsonb,
  target_portal_onboarding jsonb default '{"resolution":"UNRESOLVED"}'::jsonb
)
returns public.cases
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  onboarding_mode text;
  customer_email text;
  submitted_resolution text;
  submitted_customer_id uuid;
  submitted_invitation_id uuid;
  portal_resolved boolean:=false;
  existing_case boolean:=false;
begin
  if actor is null
    or not public.has_effective_organization_permission(
      target_organization_id,'CREATE_CASE'
    )
    or not public.has_effective_organization_permission(
      target_organization_id,'VIEW_CUSTOMERS'
    )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if jsonb_typeof(target_portal_onboarding)<>'object' then
    raise exception 'portal onboarding state must be an object' using errcode='22023';
  end if;

  select exists(
    select 1 from public.cases existing
    where existing.organization_id=target_organization_id
      and existing.created_by_user_id=actor
      and existing.intake_submission_key=target_submission_key
  ) into existing_case;

  select coalesce(settings.portal_onboarding_mode,'MANUAL_ONLY')
    into onboarding_mode
  from public.organizations organization
  left join public.organization_settings settings
    on settings.organization_id=organization.id
  where organization.id=target_organization_id;

  if not found then
    raise exception 'organization not found' using errcode='P0002';
  end if;

  -- A retry for the same actor/submission remains idempotent even if Portal
  -- access changed after the Case committed. The private boundary still
  -- revalidates every existing Guided Intake replay invariant.
  if onboarding_mode='PROMPT_DURING_CASE_INTAKE' and not existing_case then
    select lower(trim(customer.email)) into customer_email
    from public.customers customer
    where customer.organization_id=target_organization_id
      and customer.id=target_customer_id
      and customer.status='ACTIVE';
    if not found then
      raise exception 'invalid Customer portal onboarding' using errcode='23514';
    end if;

    submitted_resolution:=coalesce(target_portal_onboarding->>'resolution','');
    begin
      submitted_customer_id:=nullif(target_portal_onboarding->>'customerId','')::uuid;
      submitted_invitation_id:=nullif(target_portal_onboarding->>'invitationId','')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid Customer portal onboarding' using errcode='23514';
    end;

    -- ACTIVE is always derived from current identity/access state, never from
    -- a client assertion or stale draft snapshot.
    select exists(
      select 1
      from public.customer_portal_users link
      join public.profiles profile on profile.id=link.user_id and profile.is_active
      join auth.users auth_user on auth_user.id=link.user_id
      join public.organizations organization
        on organization.id=link.organization_id and organization.status='ACTIVE'
      join public.organization_settings settings
        on settings.organization_id=link.organization_id and settings.portal_enabled
      where link.organization_id=target_organization_id
        and link.customer_id=target_customer_id
        and link.is_active
        and (auth_user.email_confirmed_at is not null or auth_user.last_sign_in_at is not null)
    ) into portal_resolved;

    if not portal_resolved
      and submitted_resolution='INVITATION_SENT'
      and submitted_customer_id=target_customer_id
      and submitted_invitation_id is not null
      and customer_email is not null
    then
      select exists(
        select 1
        from public.customer_portal_invitations invitation
        join public.customer_portal_users link
          on link.organization_id=invitation.organization_id
          and link.customer_id=invitation.customer_id
          and link.user_id=invitation.user_id
          and link.is_active
        join public.profiles profile on profile.id=link.user_id and profile.is_active
        join auth.users auth_user on auth_user.id=link.user_id
        join public.organizations organization
          on organization.id=invitation.organization_id and organization.status='ACTIVE'
        join public.organization_settings settings
          on settings.organization_id=invitation.organization_id and settings.portal_enabled
        where invitation.id=submitted_invitation_id
          and invitation.organization_id=target_organization_id
          and invitation.customer_id=target_customer_id
          and invitation.status in ('SENT','ACTIVATED')
          and invitation.send_count>0
          and invitation.last_sent_at is not null
          and invitation.recipient_email=customer_email
          and lower(coalesce(auth_user.email,''))=customer_email
      ) into portal_resolved;
    end if;

    if not portal_resolved
      and submitted_resolution='NOT_REQUIRED'
      and submitted_customer_id=target_customer_id
      and submitted_invitation_id is null
    then
      portal_resolved:=true;
    end if;

    if not portal_resolved then
      raise exception 'Customer Portal onboarding is unresolved' using errcode='23514';
    end if;
  end if;

  return private.create_guided_case_intake_with_required_options(
    target_organization_id,target_submission_key,target_customer_id,
    target_case_title_id,target_description,target_case_type_id,target_priority,
    target_tax_year,target_manager_user_id,target_staff_user_ids,target_answers,
    target_required_option_ids,target_follow_up_tasks
  );
end $$;

revoke all on function public.create_guided_case_intake(
  uuid,uuid,uuid,uuid,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb,jsonb
) from public,anon;
grant execute on function public.create_guided_case_intake(
  uuid,uuid,uuid,uuid,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb,jsonb
) to authenticated;

do $$
declare affected integer;
begin
  insert into public.organization_settings(organization_id,portal_onboarding_mode)
  select id,'PROMPT_DURING_CASE_INTAKE'
  from public.organizations
  where id='e5a00c5a-f028-47f8-bb34-5527219eb995'
  on conflict(organization_id) do update
    set portal_onboarding_mode=excluded.portal_onboarding_mode;
  get diagnostics affected=row_count;
  if affected<>1 then
    raise exception 'Mimms Tax Service organization was not found';
  end if;
end $$;
