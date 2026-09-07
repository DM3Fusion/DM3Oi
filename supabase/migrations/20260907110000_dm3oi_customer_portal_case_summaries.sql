-- Customer-safe Case summaries for the currently selected portal relationship.
create or replace function public.get_customer_portal_cases(target_portal_access_id uuid)
returns table(
  case_number text,
  service_label text,
  customer_status text,
  progress_percent integer
)
language sql
stable
security definer
set search_path=''
as $$
  with authorized_portal_access as (
    select access.organization_id, access.customer_id
    from public.customer_portal_users access
    join public.profiles profile
      on profile.id=access.user_id
      and profile.is_active
    join public.organizations organization
      on organization.id=access.organization_id
      and organization.status='ACTIVE'
    join public.customers customer
      on customer.id=access.customer_id
      and customer.organization_id=access.organization_id
      and customer.status='ACTIVE'
    left join public.organization_settings settings
      on settings.organization_id=access.organization_id
    where access.id=target_portal_access_id
      and access.user_id=auth.uid()
      and access.is_active
      and coalesce(settings.portal_enabled,true)
  )
  select
    item.case_number,
    item.case_type as service_label,
    case item.status
      when 'NEW' then 'Getting Started'
      when 'UNASSIGNED' then 'Getting Started'
      when 'ASSIGNED' then 'Getting Started'
      when 'IN_PROGRESS' then 'In Progress'
      when 'WAITING' then 'Waiting'
      when 'REVIEW' then 'Under Review'
    end as customer_status,
    greatest(0,least(100,progress.percentage)) as progress_percent
  from authorized_portal_access access
  join public.cases item
    on item.organization_id=access.organization_id
    and item.customer_id=access.customer_id
  cross join lateral public.get_case_progress(item.id) progress
  where item.status not in ('COMPLETED','CLOSED','CANCELLED')
  order by item.opened_at desc,item.case_number desc
$$;

alter function public.get_customer_portal_cases(uuid) owner to postgres;
revoke all on function public.get_customer_portal_cases(uuid) from public,anon,authenticated;
grant execute on function public.get_customer_portal_cases(uuid) to authenticated;
