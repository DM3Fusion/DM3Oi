alter table public.organization_role_permissions
  drop constraint if exists organization_role_permissions_permission_check;

alter table public.organization_role_permissions
  add constraint organization_role_permissions_permission_check
  check (
    permission in (
      'VIEW_DASHBOARD',
      'VIEW_CASES',
      'CREATE_CASE',
      'WORK_CASES',
      'ASSIGN_CASES',
      'REASSIGN_CASE_CUSTOMER',
      'DELETE_DRAFT_INTAKES',
      'VIEW_SERVICE_DESK',
      'CREATE_SERVICE_REQUEST',
      'WORK_SERVICE_REQUEST',
      'MANAGE_SERVICE_REQUEST',
      'ASSIGN_SERVICE_REQUEST',
      'RESPOND_SERVICE_REQUEST',
      'VIEW_COMMUNICATIONS',
      'RESPOND_COMMUNICATIONS',
      'VIEW_CUSTOMERS',
      'CREATE_CUSTOMER',
      'EDIT_CUSTOMER',
      'VIEW_TASKS',
      'WORK_TASKS',
      'MANAGE_TASKS',
      'ASSIGN_TASKS',
      'VIEW_QUESTIONS',
      'MANAGE_QUESTIONS',
      'VIEW_RULES',
      'MANAGE_RULES',
      'VIEW_REPORTS',
      'VIEW_USERS',
      'MANAGE_USERS',
      'VIEW_ADMINISTRATION',
      'MANAGE_ORGANIZATION_SETTINGS',
      'MANAGE_ROLE_PERMISSIONS',
      'VIEW_SETTINGS'
    )
  );

create or replace function public.default_organization_role_permission(
  target_role public.application_role,
  target_permission text
)
returns boolean
language sql
immutable
set search_path=''
as $$
  select case
    when target_role in ('BUSINESS_OWNER','BUSINESS_ADMIN') then
      target_permission=any(array[
        'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES',
        'ASSIGN_CASES','REASSIGN_CASE_CUSTOMER','DELETE_DRAFT_INTAKES',
        'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST',
        'MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST',
        'RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS',
        'RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER',
        'EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS',
        'ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS',
        'VIEW_RULES','MANAGE_RULES','VIEW_REPORTS','VIEW_USERS',
        'MANAGE_USERS','VIEW_ADMINISTRATION',
        'MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS',
        'VIEW_SETTINGS'
      ])

    when target_role='STAFF_MANAGER' then
      target_permission=any(array[
        'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES',
        'ASSIGN_CASES','REASSIGN_CASE_CUSTOMER','DELETE_DRAFT_INTAKES',
        'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST',
        'MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST',
        'RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS',
        'RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER',
        'EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS',
        'ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS',
        'VIEW_RULES','VIEW_REPORTS','VIEW_USERS','VIEW_SETTINGS'
      ])

    when target_role='STAFF_USER' then
      target_permission=any(array[
        'VIEW_DASHBOARD','VIEW_CASES','WORK_CASES',
        'DELETE_DRAFT_INTAKES',
        'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST',
        'WORK_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
        'VIEW_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER',
        'EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS',
        'VIEW_QUESTIONS','VIEW_REPORTS','VIEW_USERS','VIEW_SETTINGS'
      ])

    else false
  end
$$;

create or replace function public.has_effective_organization_permission(
  target_organization_id uuid,
  target_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  actor_role public.application_role;
begin
  if target_organization_id is null
     or actor is null
     or target_permission is null
     or not target_permission=any(array[
       'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES',
       'ASSIGN_CASES','REASSIGN_CASE_CUSTOMER','DELETE_DRAFT_INTAKES',
       'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST',
       'MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST',
       'RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS',
       'RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER',
       'EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS',
       'ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS',
       'VIEW_RULES','MANAGE_RULES','VIEW_REPORTS','VIEW_USERS',
       'MANAGE_USERS','VIEW_ADMINISTRATION',
       'MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS',
       'VIEW_SETTINGS'
     ])
  then
    return false;
  end if;

  if public.is_super_admin(actor) then
    return exists(
      select 1
      from public.organizations o
      where o.id=target_organization_id
    );
  end if;

  select m.role
  into actor_role
  from public.organization_members m
  where m.organization_id=target_organization_id
    and m.user_id=actor
    and m.is_active
    and m.role in (
      'BUSINESS_OWNER',
      'BUSINESS_ADMIN',
      'STAFF_MANAGER',
      'STAFF_USER'
    );

  if actor_role is null then
    return false;
  end if;

  return public.effective_organization_role_permission(
    target_organization_id,
    actor_role,
    target_permission
  );
exception
  when others then
    return false;
end
$$;

create or replace function public.save_organization_role_permissions(
  target_organization_id uuid,
  target_role public.application_role,
  target_changes jsonb default '{}'::jsonb,
  target_restore boolean default false
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  actor_org uuid:=target_organization_id;
  actor_role public.application_role;
  item record;
begin
  select m.role
  into actor_role
  from public.organization_members m
  where m.organization_id=actor_org
    and m.user_id=actor
    and m.is_active;

  if not public.is_super_admin(actor)
     and (
       actor_role is null
       or not public.effective_organization_role_permission(
         actor_org,
         actor_role,
         'MANAGE_ROLE_PERMISSIONS'
       )
     )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if actor_org is null
     or target_role not in (
       'BUSINESS_OWNER',
       'BUSINESS_ADMIN',
       'STAFF_MANAGER',
       'STAFF_USER'
     )
  then
    raise exception 'invalid role' using errcode='22023';
  end if;

  if actor_role='BUSINESS_OWNER'
     and target_role='BUSINESS_OWNER'
  then
    raise exception 'owner baseline is protected' using errcode='42501';
  end if;

  if actor_role='BUSINESS_ADMIN'
     and target_role not in ('STAFF_MANAGER','STAFF_USER')
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if actor_role in ('STAFF_MANAGER','STAFF_USER') then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if target_restore then
    for item in
      select p.permission
      from public.organization_role_permissions p
      where p.organization_id=actor_org
        and p.role=target_role
    loop
      if public.default_organization_role_permission(
           target_role,
           item.permission
         )
         and not public.effective_organization_role_permission(
           actor_org,
           coalesce(actor_role,'BUSINESS_OWNER'),
           item.permission
         )
         and not public.is_super_admin(actor)
      then
        raise exception 'cannot grant unavailable permission'
          using errcode='42501';
      end if;
    end loop;

    delete from public.organization_role_permissions
    where organization_id=actor_org
      and role=target_role;

    return;
  end if;

  for item in
    select
      key as permission,
      (value#>>'{}')::boolean as allowed
    from jsonb_each(target_changes)
  loop
    if item.permission not in (
      select unnest(array[
        'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES',
        'ASSIGN_CASES','REASSIGN_CASE_CUSTOMER','DELETE_DRAFT_INTAKES',
        'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST',
        'WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST',
        'ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
        'VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS',
        'VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER',
        'VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS',
        'VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_RULES',
        'MANAGE_RULES','VIEW_REPORTS','VIEW_USERS','MANAGE_USERS',
        'VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS',
        'MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'
      ])
    ) then
      raise exception 'invalid permission' using errcode='22023';
    end if;

    if target_role in ('STAFF_MANAGER','STAFF_USER')
       and item.permission='MANAGE_ROLE_PERMISSIONS'
    then
      raise exception 'role cannot administer organization access'
        using errcode='42501';
    end if;

    if item.allowed
       and not public.effective_organization_role_permission(
         actor_org,
         coalesce(actor_role,'BUSINESS_OWNER'),
         item.permission
       )
       and not public.is_super_admin(actor)
    then
      raise exception 'cannot grant unavailable permission'
        using errcode='42501';
    end if;

    insert into public.organization_role_permissions(
      organization_id,
      role,
      permission,
      is_allowed,
      updated_by
    )
    values(
      actor_org,
      target_role,
      item.permission,
      item.allowed,
      actor
    )
    on conflict(organization_id,role,permission)
    do update
      set is_allowed=excluded.is_allowed,
          updated_by=excluded.updated_by;
  end loop;
end
$$;

drop policy if exists guided_case_intake_drafts_owner_select
  on public.guided_case_intake_drafts;

create policy guided_case_intake_drafts_select
on public.guided_case_intake_drafts
for select
to authenticated
using (
  (
    created_by_user_id=auth.uid()
    and (
      public.has_effective_organization_permission(
        organization_id,
        'CREATE_CASE'
      )
      or public.has_effective_organization_permission(
        organization_id,
        'DELETE_DRAFT_INTAKES'
      )
    )
  )
  or (
    public.has_effective_organization_permission(
      organization_id,
      'DELETE_DRAFT_INTAKES'
    )
    and (
      public.is_super_admin(auth.uid())
      or public.has_organization_role(
        organization_id,
        array[
          'BUSINESS_OWNER',
          'BUSINESS_ADMIN',
          'STAFF_MANAGER'
        ]::public.application_role[],
        auth.uid()
      )
    )
  )
);

drop policy if exists guided_case_intake_drafts_owner_delete
  on public.guided_case_intake_drafts;

create policy guided_case_intake_drafts_delete
on public.guided_case_intake_drafts
for delete
to authenticated
using (
  public.has_effective_organization_permission(
    organization_id,
    'DELETE_DRAFT_INTAKES'
  )
  and (
    created_by_user_id=auth.uid()
    or public.is_super_admin(auth.uid())
    or public.has_organization_role(
      organization_id,
      array[
        'BUSINESS_OWNER',
        'BUSINESS_ADMIN',
        'STAFF_MANAGER'
      ]::public.application_role[],
      auth.uid()
    )
  )
);

alter function public.default_organization_role_permission(
  public.application_role,
  text
) owner to postgres;

alter function public.has_effective_organization_permission(
  uuid,
  text
) owner to postgres;

alter function public.save_organization_role_permissions(
  uuid,
  public.application_role,
  jsonb,
  boolean
) owner to postgres;

revoke all on function public.default_organization_role_permission(
  public.application_role,
  text
) from public,anon;

revoke all on function public.has_effective_organization_permission(
  uuid,
  text
) from public,anon;

revoke all on function public.save_organization_role_permissions(
  uuid,
  public.application_role,
  jsonb,
  boolean
) from public,anon;

grant execute on function public.has_effective_organization_permission(
  uuid,
  text
) to authenticated;

grant execute on function public.save_organization_role_permissions(
  uuid,
  public.application_role,
  jsonb,
  boolean
) to authenticated;
