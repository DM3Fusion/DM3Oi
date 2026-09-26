alter table public.question_definitions
  add column if not exists require_all_options boolean not null default false;

grant select(require_all_options)
  on public.question_definitions
  to authenticated;

create or replace view public.organization_question_definitions
with (security_barrier=true) as
select
  q.id,
  q.organization_id,
  q.question_text,
  q.description,
  q.response_type,
  q.required,
  q.active,
  q.display_order,
  public.organization_actor_id(q.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(q.created_by_user_id) as created_by_display_name,
  q.created_at,
  q.updated_at,
  q.require_all_options
from public.question_definitions q
where public.is_super_admin(auth.uid())
   or public.is_internal_member(q.organization_id,auth.uid());

drop function if exists public.save_question_definition(
  uuid,
  uuid,
  text,
  text,
  public.question_response_type,
  boolean,
  boolean,
  integer,
  jsonb
);

create function public.save_question_definition(
  target_organization_id uuid,
  target_question_id uuid,
  target_question_text text,
  target_description text,
  target_response_type public.question_response_type,
  target_required boolean,
  target_require_all_options boolean,
  target_active boolean,
  target_display_order integer,
  target_options jsonb default '[]'
)
returns public.question_definitions
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  item public.question_definitions;
  opt jsonb;
  option_id uuid;
  seen_option_ids uuid[]:='{}'::uuid[];
begin
  if not public.has_effective_organization_permission(
    target_organization_id,
    'MANAGE_QUESTIONS'
  ) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if jsonb_typeof(target_options)<>'array' then
    raise exception 'options must be an array' using errcode='22023';
  end if;

  if target_response_type in ('SINGLE_SELECT','MULTI_SELECT')
    and not exists(
      select 1
      from jsonb_array_elements(target_options) candidate
      where coalesce((candidate->>'is_active')::boolean,true)
        and length(trim(coalesce(candidate->>'label','')))>0
    )
  then
    raise exception 'select questions require at least one displayed option'
      using errcode='23514';
  end if;

  if target_question_id is null then
    insert into public.question_definitions(
      organization_id,
      question_text,
      description,
      response_type,
      required,
      require_all_options,
      active,
      display_order,
      created_by_user_id
    )
    values(
      target_organization_id,
      trim(target_question_text),
      coalesce(target_description,''),
      target_response_type,
      target_required,
      target_response_type='MULTI_SELECT'
        and coalesce(target_require_all_options,false),
      target_active,
      target_display_order,
      actor
    )
    returning * into item;
  else
    update public.question_definitions
    set
      question_text=trim(target_question_text),
      description=coalesce(target_description,''),
      response_type=target_response_type,
      required=target_required,
      require_all_options=(
        target_response_type='MULTI_SELECT'
        and coalesce(target_require_all_options,false)
      ),
      active=target_active,
      display_order=target_display_order
    where id=target_question_id
      and organization_id=target_organization_id
    returning * into item;

    if not found then
      raise exception 'question not found' using errcode='P0002';
    end if;
  end if;

  for opt in
    select value from jsonb_array_elements(target_options)
  loop
    if length(trim(coalesce(opt->>'label','')))=0 then
      raise exception 'question option label is required'
        using errcode='23514';
    end if;

    option_id:=nullif(opt->>'id','')::uuid;

    if option_id is not null then
      update public.question_options
      set
        option_label=trim(opt->>'label'),
        display_order=coalesce((opt->>'display_order')::integer,0),
        is_active=coalesce((opt->>'is_active')::boolean,true)
      where id=option_id
        and organization_id=target_organization_id
        and question_id=item.id;

      if not found then
        raise exception 'invalid question option'
          using errcode='23514';
      end if;
    else
      insert into public.question_options(
        organization_id,
        question_id,
        option_label,
        option_value,
        display_order,
        is_active
      )
      values(
        target_organization_id,
        item.id,
        trim(opt->>'label'),
        trim(opt->>'value'),
        coalesce((opt->>'display_order')::integer,0),
        coalesce((opt->>'is_active')::boolean,true)
      )
      returning id into option_id;
    end if;

    seen_option_ids:=array_append(seen_option_ids,option_id);
  end loop;

  update public.question_options
  set is_active=false
  where organization_id=target_organization_id
    and question_id=item.id
    and not (id=any(seen_option_ids));

  if not public.is_super_admin(actor)
    and public.is_super_admin(item.created_by_user_id)
  then
    item.created_by_user_id:=null;
  end if;

  return item;
end $$;

revoke all on function public.save_question_definition(
  uuid,
  uuid,
  text,
  text,
  public.question_response_type,
  boolean,
  boolean,
  boolean,
  integer,
  jsonb
) from public,anon;

grant execute on function public.save_question_definition(
  uuid,
  uuid,
  text,
  text,
  public.question_response_type,
  boolean,
  boolean,
  boolean,
  integer,
  jsonb
) to authenticated;

create or replace function public.guided_intake_response_valid(
  target_organization_id uuid,
  target_question_id uuid,
  target_response_type public.question_response_type,
  target_value jsonb
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case target_response_type
    when 'YES_NO' then
      jsonb_typeof(target_value)='boolean'

    when 'NUMBER' then
      jsonb_typeof(target_value)='number'

    when 'DATE' then
      jsonb_typeof(target_value)='string'
      and (target_value#>>'{}')~'^\d{4}-\d{2}-\d{2}$'
      and to_char(
        (target_value#>>'{}')::date,
        'YYYY-MM-DD'
      )=target_value#>>'{}'

    when 'TEXT' then
      jsonb_typeof(target_value)='string'
      and length(trim(target_value#>>'{}'))>0

    when 'LONG_TEXT' then
      jsonb_typeof(target_value)='string'
      and length(trim(target_value#>>'{}'))>0

    when 'SINGLE_SELECT' then
      jsonb_typeof(target_value)='string'
      and exists(
        select 1
        from public.question_options option_row
        where option_row.organization_id=target_organization_id
          and option_row.question_id=target_question_id
          and option_row.id::text=target_value#>>'{}'
          and option_row.is_active
      )

    when 'MULTI_SELECT' then
      jsonb_typeof(target_value)='array'
      and jsonb_array_length(target_value)>0
      and not exists(
        select 1
        from jsonb_array_elements_text(target_value) selected(value)
        where not exists(
          select 1
          from public.question_options option_row
          where option_row.organization_id=target_organization_id
            and option_row.question_id=target_question_id
            and option_row.id::text=selected.value
            and option_row.is_active
        )
      )
      and (
        not coalesce((
          select question_row.require_all_options
          from public.question_definitions question_row
          where question_row.organization_id=target_organization_id
            and question_row.id=target_question_id
        ),false)
        or not exists(
          select 1
          from public.question_options required_option
          where required_option.organization_id=target_organization_id
            and required_option.question_id=target_question_id
            and required_option.is_active
            and not exists(
              select 1
              from jsonb_array_elements_text(target_value) selected(value)
              where selected.value=required_option.id::text
            )
        )
      )

    else false
  end
$$;

update public.question_definitions
set require_all_options=true
where id='911c69ee-14bd-4391-ae87-f5b34047ea60'
  and organization_id='e5a00c5a-f028-47f8-bb34-5527219eb995'
  and response_type='MULTI_SELECT';
