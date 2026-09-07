-- Organization projections execute expressions as the querying role. Keep the
-- actor helpers callable, but bind their output to identity context the caller
-- is already authorized to see so they cannot become cross-tenant lookup RPCs.
create or replace function public.can_view_organization_actor(target_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select target_actor is not null and (
    public.is_super_admin(auth.uid())
    or target_actor=auth.uid()
    or (
      not public.is_super_admin(target_actor)
      and exists(
        select 1
        from public.organization_members me
        join public.organization_members them on them.organization_id=me.organization_id
        where me.user_id=auth.uid() and me.is_active
          and them.user_id=target_actor and them.is_active
      )
    )
    or exists(select 1 from public.cases c where c.created_by_user_id=target_actor and public.can_access_case(c.id,c.organization_id,auth.uid()))
    or exists(select 1 from public.case_activity a where a.actor_user_id=target_actor and public.can_access_case(a.case_id,a.organization_id,auth.uid()))
    or exists(select 1 from public.case_tasks t where (t.created_by_user_id=target_actor or t.completed_by_user_id=target_actor) and public.can_access_case(t.case_id,t.organization_id,auth.uid()))
    or exists(select 1 from public.customers c where c.created_by_user_id=target_actor and (public.is_internal_member(c.organization_id,auth.uid()) or public.is_customer_portal_user(c.organization_id,c.id,auth.uid())))
    or exists(select 1 from public.question_definitions q where q.created_by_user_id=target_actor and public.is_internal_member(q.organization_id,auth.uid()))
    or exists(select 1 from public.service_requests r where r.created_by_user_id=target_actor and (public.can_access_service_request(r.id,r.organization_id,auth.uid()) or public.is_customer_portal_user(r.organization_id,r.customer_id,auth.uid())))
    or exists(select 1 from public.service_request_activity a where a.actor_user_id=target_actor and public.can_access_service_request(a.service_request_id,a.organization_id,auth.uid()))
    or exists(select 1 from public.service_request_messages m where m.author_user_id=target_actor and public.can_read_service_request_messages(m.service_request_id,m.organization_id))
    or exists(select 1 from public.service_request_communications c where c.actor_user_id=target_actor and public.can_manage_service_request(c.service_request_id,c.organization_id,auth.uid()))
  )
$$;

create or replace function public.organization_actor_id(target_actor uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select case
    when not public.can_view_organization_actor(target_actor) then null
    when not public.is_super_admin(auth.uid()) and public.is_super_admin(target_actor) then null
    else target_actor
  end
$$;

create or replace function public.organization_actor_label(target_actor uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when not public.can_view_organization_actor(target_actor) then null
    when not public.is_super_admin(auth.uid()) and public.is_super_admin(target_actor)
      then 'DM3Oi Sys Support'
    else coalesce(nullif(trim(p.display_name),''),p.email)
  end
  from public.profiles p where p.id=target_actor
$$;

revoke all on function public.can_view_organization_actor(uuid) from public,anon,authenticated;
revoke all on function public.organization_actor_id(uuid),public.organization_actor_label(uuid) from public,anon;
grant execute on function public.organization_actor_id(uuid),public.organization_actor_label(uuid) to authenticated;

-- The communications projection needs the existing manager/assignment test,
-- but authenticated callers must not be able to supply another user's UUID.
create or replace function public.can_manage_own_service_request(
  target_service_request_id uuid,
  target_organization_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select public.can_manage_service_request(target_service_request_id,target_organization_id,auth.uid())
$$;
revoke all on function public.can_manage_own_service_request(uuid,uuid) from public,anon;
grant execute on function public.can_manage_own_service_request(uuid,uuid) to authenticated;

create or replace view public.organization_service_request_communications with (security_barrier=true) as
select c.id,c.organization_id,c.service_request_id,c.communication_type,c.channel,c.direction,
  public.organization_actor_id(c.actor_user_id) as actor_user_id,
  public.organization_actor_label(c.actor_user_id) as actor_display_name,
  c.recipient_user_id,c.recipient_email,c.subject,c.related_message_id,c.status,c.error_code,c.error_summary,
  c.delivered_at,c.created_at
from public.service_request_communications c
where public.can_manage_own_service_request(c.service_request_id,c.organization_id);

revoke all on public.organization_service_request_communications from public,anon;
grant select on public.organization_service_request_communications to authenticated;
