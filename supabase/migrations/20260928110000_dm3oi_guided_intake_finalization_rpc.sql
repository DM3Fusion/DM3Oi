-- Restore one canonical Guided Intake finalization signature after the Case
-- model refinement removed the legacy Case Title argument. The application
-- supplies the current Case-model payload plus the durable Portal resolution.

create function public.create_guided_case_intake(
  target_organization_id uuid,
  target_submission_key uuid,
  target_customer_id uuid,
  target_customer_mode text,
  target_description text,
  target_case_type_id uuid,
  target_priority public.priority_level,
  target_tax_year integer,
  target_manager_user_id uuid,
  target_staff_user_ids uuid[],
  target_answers jsonb,
  target_follow_up_tasks jsonb,
  target_portal_onboarding jsonb
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
  created public.cases;
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
    raise exception 'Customer Portal onboarding state must be an object'
      using errcode='22023';
  end if;

  select exists(
    select 1
    from public.cases existing
    where existing.organization_id=target_organization_id
      and existing.created_by_user_id=actor
      and existing.intake_submission_key=target_submission_key
  ) into existing_case;

  select coalesce(settings.portal_onboarding_mode,'MANUAL_ONLY')
    into onboarding_mode
  from public.organizations organization
  left join public.organization_settings settings
    on settings.organization_id=organization.id
  where organization.id=target_organization_id
    and organization.status='ACTIVE';

  if not found then
    raise exception 'organization is inactive' using errcode='42501';
  end if;

  -- A committed replay is allowed through to the Case-model function, which
  -- returns the existing submission and consumes any surviving draft. Portal
  -- state is revalidated only before the first atomic creation attempt.
  if onboarding_mode='PROMPT_DURING_CASE_INTAKE' and not existing_case then
    select lower(trim(customer.email))
      into customer_email
    from public.customers customer
    where customer.organization_id=target_organization_id
      and customer.id=target_customer_id
      and customer.status='ACTIVE';

    if not found then
      raise exception 'invalid Customer portal onboarding' using errcode='23514';
    end if;

    submitted_resolution:=coalesce(target_portal_onboarding->>'resolution','');
    begin
      submitted_customer_id:=
        nullif(target_portal_onboarding->>'customerId','')::uuid;
      submitted_invitation_id:=
        nullif(target_portal_onboarding->>'invitationId','')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid Customer portal onboarding' using errcode='23514';
    end;

    -- ACTIVE is derived from current effective access, never client state.
    select exists(
      select 1
      from public.customer_portal_users link
      join public.profiles profile
        on profile.id=link.user_id and profile.is_active
      join auth.users auth_user on auth_user.id=link.user_id
      join public.organizations organization
        on organization.id=link.organization_id
        and organization.status='ACTIVE'
      join public.organization_settings settings
        on settings.organization_id=link.organization_id
        and settings.portal_enabled
      where link.organization_id=target_organization_id
        and link.customer_id=target_customer_id
        and link.is_active
        and (
          auth_user.email_confirmed_at is not null
          or auth_user.last_sign_in_at is not null
        )
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
        join public.profiles profile
          on profile.id=link.user_id and profile.is_active
        join auth.users auth_user on auth_user.id=link.user_id
        join public.organizations organization
          on organization.id=invitation.organization_id
          and organization.status='ACTIVE'
        join public.organization_settings settings
          on settings.organization_id=invitation.organization_id
          and settings.portal_enabled
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
      raise exception 'Customer Portal onboarding is unresolved'
        using errcode='23514';
    end if;
  end if;

  -- The current Case-model overload remains the authoritative atomic boundary
  -- for Case Type/tax-year semantics, questions, assignments, generated and
  -- staged Tasks, uniqueness, draft consumption, and submission-key replay.
  select * into created
  from public.create_guided_case_intake(
    target_organization_id,
    target_submission_key,
    target_customer_id,
    target_customer_mode,
    target_description,
    target_case_type_id,
    target_priority,
    target_tax_year,
    target_manager_user_id,
    target_staff_user_ids,
    target_answers,
    target_follow_up_tasks
  );

  return created;
end
$$;

-- The Case-model overload must not remain an authenticated Portal-gate bypass.
revoke all on function public.create_guided_case_intake(
  uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb
) from public,anon,authenticated;

revoke all on function public.create_guided_case_intake(
  uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb
) from public,anon;

grant execute on function public.create_guided_case_intake(
  uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb
) to authenticated;

comment on function public.create_guided_case_intake(
  uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb
) is
  'Canonical atomic Guided Intake finalization with current Case semantics and durable Customer Portal resolution.';
