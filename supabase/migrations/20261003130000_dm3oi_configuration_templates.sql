begin;

-- ============================================================
-- PLATFORM CONFIGURATION TEMPLATE LIBRARY
-- ============================================================

create table public.configuration_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','PUBLISHED','RETIRED')),
  version integer not null default 1
    check (version > 0),
  source_organization_id uuid
    references public.organizations(id) on delete set null,
  created_by_user_id uuid not null
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, version)
);

create table public.configuration_template_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null
    references public.configuration_templates(id) on delete cascade,
  source_question_id uuid not null,
  question_text text not null,
  description text not null default '',
  response_type public.question_response_type not null,
  required boolean not null default false,
  require_all_options boolean not null default false,
  track_required_options boolean not null default false,
  active boolean not null default true,
  display_order integer not null default 0,
  question_group text,
  completion_condition text not null default 'ANY_ANSWER'
    check (completion_condition in ('ANY_ANSWER','YES_REQUIRED')),
  unique (template_id, source_question_id),
  unique (template_id, id)
);

create table public.configuration_template_question_options (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null
    references public.configuration_templates(id) on delete cascade,
  template_question_id uuid not null,
  source_option_id uuid not null,
  option_label text not null,
  option_value text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  unique (template_id, source_option_id),
  unique (template_id, template_question_id, id),
  foreign key (template_id, template_question_id)
    references public.configuration_template_questions(template_id, id)
    on delete cascade
);

create table public.configuration_template_rules (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null
    references public.configuration_templates(id) on delete cascade,
  source_rule_id uuid not null,
  name text not null,
  description text not null default '',
  source_template_question_id uuid not null,
  condition_operator public.rule_condition_operator not null,
  condition_template_option_id uuid,
  active boolean not null default true,
  display_order integer not null default 0,
  unique (template_id, source_rule_id),
  unique (template_id, id),
  foreign key (template_id, source_template_question_id)
    references public.configuration_template_questions(template_id, id)
    on delete restrict,
  foreign key (
    template_id,
    source_template_question_id,
    condition_template_option_id
  )
    references public.configuration_template_question_options(
      template_id,
      template_question_id,
      id
    )
    on delete restrict
);

create table public.configuration_template_rule_actions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null
    references public.configuration_templates(id) on delete cascade,
  template_rule_id uuid not null,
  source_action_id uuid not null,
  action_type public.rule_action_type not null,
  target_template_question_id uuid,
  task_title text,
  task_description text,
  task_priority public.priority_level,
  task_required boolean,
  task_blocking boolean,
  task_due_in_days integer,
  display_order integer not null default 0,
  unique (template_id, source_action_id),
  foreign key (template_id, template_rule_id)
    references public.configuration_template_rules(template_id, id)
    on delete cascade,
  foreign key (template_id, target_template_question_id)
    references public.configuration_template_questions(template_id, id)
    on delete restrict,
  constraint configuration_template_rule_actions_shape check (
    (
      action_type in ('SHOW_QUESTION','REQUIRE_QUESTION')
      and target_template_question_id is not null
      and task_title is null
      and task_description is null
      and task_priority is null
      and task_required is null
      and task_blocking is null
      and task_due_in_days is null
    )
    or
    (
      action_type = 'CREATE_TASK'
      and target_template_question_id is null
      and task_title is not null
      and length(trim(task_title)) > 0
      and task_description is not null
      and task_priority is not null
      and task_required is not null
      and task_blocking is not null
      and task_due_in_days between 0 and 3650
    )
  )
);

create table public.organization_configuration_template_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  configuration_template_id uuid not null
    references public.configuration_templates(id) on delete restrict,
  template_version integer not null,
  applied_by_user_id uuid not null
    references public.profiles(id) on delete restrict,
  applied_at timestamptz not null default now(),
  unique (
    organization_id,
    configuration_template_id,
    template_version
  )
);

create index configuration_templates_status_name_idx
  on public.configuration_templates(status, name, version);

create index configuration_template_questions_order_idx
  on public.configuration_template_questions(
    template_id,
    display_order
  );

create index configuration_template_options_order_idx
  on public.configuration_template_question_options(
    template_id,
    template_question_id,
    display_order
  );

create index configuration_template_rules_order_idx
  on public.configuration_template_rules(
    template_id,
    display_order
  );

create index configuration_template_rule_actions_order_idx
  on public.configuration_template_rule_actions(
    template_id,
    template_rule_id,
    display_order
  );

create trigger configuration_templates_updated_at
before update on public.configuration_templates
for each row execute function public.set_updated_at();

-- Platform-owned tables are never directly tenant-readable.
alter table public.configuration_templates enable row level security;
alter table public.configuration_template_questions enable row level security;
alter table public.configuration_template_question_options enable row level security;
alter table public.configuration_template_rules enable row level security;
alter table public.configuration_template_rule_actions enable row level security;
alter table public.organization_configuration_template_applications
  enable row level security;

revoke all on
  public.configuration_templates,
  public.configuration_template_questions,
  public.configuration_template_question_options,
  public.configuration_template_rules,
  public.configuration_template_rule_actions,
  public.organization_configuration_template_applications
from public, anon, authenticated;

-- ============================================================
-- PUBLISHED TEMPLATE PICKER
-- ============================================================

create or replace function public.get_published_configuration_templates()
returns table (
  id uuid,
  name text,
  description text,
  version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    template.id,
    template.name,
    template.description,
    template.version
  from public.configuration_templates template
  where template.status = 'PUBLISHED'
  order by template.name, template.version desc;
end;
$$;

revoke all
on function public.get_published_configuration_templates()
from public, anon, authenticated;

grant execute
on function public.get_published_configuration_templates()
to authenticated;

-- ============================================================
-- CAPTURE EXISTING ORGANIZATION CONFIGURATION AS TEMPLATE
-- SUPER_ADMIN ONLY
-- ============================================================

create or replace function public.capture_configuration_template(
  target_source_organization_id uuid,
  target_name text,
  target_description text default null,
  target_status text default 'DRAFT'
)
returns public.configuration_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  created_template public.configuration_templates;
  next_version integer;
  source_question public.question_definitions;
  source_option public.question_options;
  source_rule public.rule_definitions;
  source_action public.rule_actions;
  template_question_id uuid;
  template_option_id uuid;
  template_rule_id uuid;
  question_map jsonb := '{}'::jsonb;
  option_map jsonb := '{}'::jsonb;
  rule_map jsonb := '{}'::jsonb;
  normalized_status text :=
    upper(trim(coalesce(target_status, 'DRAFT')));
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations
    where id = target_source_organization_id
  ) then
    raise exception 'source organization not found'
      using errcode = 'P0002';
  end if;

  if length(trim(coalesce(target_name, ''))) = 0 then
    raise exception 'template name is required'
      using errcode = '22023';
  end if;

  if normalized_status not in ('DRAFT','PUBLISHED','RETIRED') then
    raise exception 'invalid template status'
      using errcode = '22023';
  end if;

  -- Serialize version allocation for this logical template name so
  -- concurrent captures cannot allocate the same version.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      lower(trim(target_name)),
      0
    )
  );

  select coalesce(max(template.version), 0) + 1
  into next_version
  from public.configuration_templates template
  where lower(trim(template.name)) = lower(trim(target_name));

  insert into public.configuration_templates (
    name,
    description,
    status,
    version,
    source_organization_id,
    created_by_user_id
  )
  values (
    trim(target_name),
    nullif(trim(coalesce(target_description, '')), ''),
    normalized_status,
    next_version,
    target_source_organization_id,
    actor
  )
  returning * into created_template;

  for source_question in
    select *
    from public.question_definitions
    where organization_id = target_source_organization_id
    order by display_order, id
  loop
    insert into public.configuration_template_questions (
      template_id,
      source_question_id,
      question_text,
      description,
      response_type,
      required,
      require_all_options,
      track_required_options,
      active,
      display_order,
      question_group,
      completion_condition
    )
    values (
      created_template.id,
      source_question.id,
      source_question.question_text,
      source_question.description,
      source_question.response_type,
      source_question.required,
      source_question.require_all_options,
      source_question.track_required_options,
      source_question.active,
      source_question.display_order,
      source_question.question_group,
      source_question.completion_condition
    )
    returning id into template_question_id;

    question_map :=
      jsonb_set(
        question_map,
        array[source_question.id::text],
        to_jsonb(template_question_id::text),
        true
      );

    for source_option in
      select *
      from public.question_options
      where organization_id = target_source_organization_id
        and question_id = source_question.id
      order by display_order, id
    loop
      insert into public.configuration_template_question_options (
        template_id,
        template_question_id,
        source_option_id,
        option_label,
        option_value,
        display_order,
        is_active
      )
      values (
        created_template.id,
        template_question_id,
        source_option.id,
        source_option.option_label,
        source_option.option_value,
        source_option.display_order,
        source_option.is_active
      )
      returning id into template_option_id;

      option_map :=
        jsonb_set(
          option_map,
          array[source_option.id::text],
          to_jsonb(template_option_id::text),
          true
        );
    end loop;
  end loop;

  for source_rule in
    select *
    from public.rule_definitions
    where organization_id = target_source_organization_id
    order by display_order, id
  loop
    insert into public.configuration_template_rules (
      template_id,
      source_rule_id,
      name,
      description,
      source_template_question_id,
      condition_operator,
      condition_template_option_id,
      active,
      display_order
    )
    values (
      created_template.id,
      source_rule.id,
      source_rule.name,
      source_rule.description,
      (question_map ->> source_rule.source_question_id::text)::uuid,
      source_rule.condition_operator,
      case
        when source_rule.condition_option_id is null then null
        else (option_map ->> source_rule.condition_option_id::text)::uuid
      end,
      source_rule.active,
      source_rule.display_order
    )
    returning id into template_rule_id;

    rule_map :=
      jsonb_set(
        rule_map,
        array[source_rule.id::text],
        to_jsonb(template_rule_id::text),
        true
      );

    for source_action in
      select *
      from public.rule_actions
      where organization_id = target_source_organization_id
        and rule_definition_id = source_rule.id
        and retired_at is null
      order by display_order, id
    loop
      insert into public.configuration_template_rule_actions (
        template_id,
        template_rule_id,
        source_action_id,
        action_type,
        target_template_question_id,
        task_title,
        task_description,
        task_priority,
        task_required,
        task_blocking,
        task_due_in_days,
        display_order
      )
      values (
        created_template.id,
        template_rule_id,
        source_action.id,
        source_action.action_type,
        case
          when source_action.target_question_id is null then null
          else (
            question_map ->> source_action.target_question_id::text
          )::uuid
        end,
        source_action.task_title,
        source_action.task_description,
        source_action.task_priority,
        source_action.task_required,
        source_action.task_blocking,
        source_action.task_due_in_days,
        source_action.display_order
      );
    end loop;
  end loop;

  return created_template;
end;
$$;

revoke all
on function public.capture_configuration_template(
  uuid,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute
on function public.capture_configuration_template(
  uuid,
  text,
  text,
  text
)
to authenticated;

-- ============================================================
-- APPLY PUBLISHED TEMPLATE TO A NEW / EMPTY ORGANIZATION
-- SUPER_ADMIN ONLY
-- ============================================================

create or replace function public.apply_configuration_template(
  target_organization_id uuid,
  target_template_id uuid
)
returns public.organization_configuration_template_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  selected_template public.configuration_templates;
  template_question public.configuration_template_questions;
  template_option public.configuration_template_question_options;
  template_rule public.configuration_template_rules;
  template_action public.configuration_template_rule_actions;
  created_question_id uuid;
  created_option_id uuid;
  created_rule_id uuid;
  question_map jsonb := '{}'::jsonb;
  option_map jsonb := '{}'::jsonb;
  rule_map jsonb := '{}'::jsonb;
  application public.organization_configuration_template_applications;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations
    where id = target_organization_id
  ) then
    raise exception 'organization not found'
      using errcode = 'P0002';
  end if;

  select *
  into selected_template
  from public.configuration_templates
  where id = target_template_id
  for share;

  if not found then
    raise exception 'configuration template not found'
      using errcode = 'P0002';
  end if;

  if selected_template.status <> 'PUBLISHED' then
    raise exception 'configuration template is not published'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.question_definitions
    where organization_id = target_organization_id
  )
  or exists (
    select 1
    from public.rule_definitions
    where organization_id = target_organization_id
  ) then
    raise exception 'organization configuration must be empty before template application'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.organization_configuration_template_applications
    where organization_id = target_organization_id
      and configuration_template_id = selected_template.id
      and template_version = selected_template.version
  ) then
    raise exception 'configuration template version already applied'
      using errcode = '23505';
  end if;

  for template_question in
    select *
    from public.configuration_template_questions
    where template_id = selected_template.id
    order by display_order, id
  loop
    insert into public.question_definitions (
      organization_id,
      question_text,
      description,
      response_type,
      required,
      require_all_options,
      track_required_options,
      active,
      display_order,
      question_group,
      completion_condition,
      created_by_user_id
    )
    values (
      target_organization_id,
      template_question.question_text,
      template_question.description,
      template_question.response_type,
      template_question.required,
      template_question.require_all_options,
      template_question.track_required_options,
      template_question.active,
      template_question.display_order,
      template_question.question_group,
      template_question.completion_condition,
      actor
    )
    returning id into created_question_id;

    question_map :=
      jsonb_set(
        question_map,
        array[template_question.id::text],
        to_jsonb(created_question_id::text),
        true
      );

    for template_option in
      select *
      from public.configuration_template_question_options
      where template_id = selected_template.id
        and template_question_id = template_question.id
      order by display_order, id
    loop
      insert into public.question_options (
        organization_id,
        question_id,
        option_label,
        option_value,
        display_order,
        is_active
      )
      values (
        target_organization_id,
        created_question_id,
        template_option.option_label,
        template_option.option_value,
        template_option.display_order,
        template_option.is_active
      )
      returning id into created_option_id;

      option_map :=
        jsonb_set(
          option_map,
          array[template_option.id::text],
          to_jsonb(created_option_id::text),
          true
        );
    end loop;
  end loop;

  for template_rule in
    select *
    from public.configuration_template_rules
    where template_id = selected_template.id
    order by display_order, id
  loop
    insert into public.rule_definitions (
      organization_id,
      name,
      description,
      source_question_id,
      condition_operator,
      condition_option_id,
      active,
      display_order,
      created_by_user_id,
      updated_by_user_id
    )
    values (
      target_organization_id,
      template_rule.name,
      template_rule.description,
      (
        question_map
        ->> template_rule.source_template_question_id::text
      )::uuid,
      template_rule.condition_operator,
      case
        when template_rule.condition_template_option_id is null then null
        else (
          option_map
          ->> template_rule.condition_template_option_id::text
        )::uuid
      end,
      template_rule.active,
      template_rule.display_order,
      actor,
      actor
    )
    returning id into created_rule_id;

    rule_map :=
      jsonb_set(
        rule_map,
        array[template_rule.id::text],
        to_jsonb(created_rule_id::text),
        true
      );

    for template_action in
      select *
      from public.configuration_template_rule_actions
      where template_id = selected_template.id
        and template_rule_id = template_rule.id
      order by display_order, id
    loop
      insert into public.rule_actions (
        organization_id,
        rule_definition_id,
        action_type,
        target_question_id,
        task_title,
        task_description,
        task_priority,
        task_required,
        task_blocking,
        task_due_in_days,
        display_order,
        created_by_user_id,
        updated_by_user_id
      )
      values (
        target_organization_id,
        created_rule_id,
        template_action.action_type,
        case
          when template_action.target_template_question_id is null then null
          else (
            question_map
            ->> template_action.target_template_question_id::text
          )::uuid
        end,
        template_action.task_title,
        template_action.task_description,
        template_action.task_priority,
        template_action.task_required,
        template_action.task_blocking,
        template_action.task_due_in_days,
        template_action.display_order,
        actor,
        actor
      );
    end loop;
  end loop;

  insert into public.organization_configuration_template_applications (
    organization_id,
    configuration_template_id,
    template_version,
    applied_by_user_id
  )
  values (
    target_organization_id,
    selected_template.id,
    selected_template.version,
    actor
  )
  returning * into application;

  return application;
end;
$$;

revoke all
on function public.apply_configuration_template(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.apply_configuration_template(uuid, uuid)
to authenticated;

-- ============================================================
-- TRANSACTIONAL ORGANIZATION CREATION WRAPPER
-- Existing create_organization() remains unchanged.
-- ============================================================

create or replace function public.create_organization_with_configuration_template(
  target_name text,
  target_slug text,
  target_template_id uuid default null
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  created public.organizations;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select *
  into created
  from public.create_organization(
    target_name,
    target_slug
  );

  if target_template_id is not null then
    perform public.apply_configuration_template(
      created.id,
      target_template_id
    );
  end if;

  return created;
end;
$$;

revoke all
on function public.create_organization_with_configuration_template(
  text,
  text,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.create_organization_with_configuration_template(
  text,
  text,
  uuid
)
to authenticated;

-- ============================================================
-- TRANSACTIONAL TRIAL CONVERSION WRAPPER
-- Existing conversion function remains unchanged.
-- ============================================================

create or replace function public.convert_trial_request_to_organization_with_configuration_template(
  target_trial_request_id uuid,
  target_organization_name text,
  target_organization_slug text,
  target_conversion_note text,
  target_owner_user_id uuid,
  target_owner_email text,
  target_owner_identity_verified boolean,
  target_template_id uuid default null
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  created public.organizations;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select *
  into created
  from public.convert_trial_request_to_organization(
    target_trial_request_id,
    target_organization_name,
    target_organization_slug,
    target_conversion_note,
    target_owner_user_id,
    target_owner_email,
    target_owner_identity_verified
  );

  if target_template_id is not null then
    perform public.apply_configuration_template(
      created.id,
      target_template_id
    );
  end if;

  return created;
end;
$$;

revoke all
on function public.convert_trial_request_to_organization_with_configuration_template(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.convert_trial_request_to_organization_with_configuration_template(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  uuid
)
to authenticated;

comment on table public.configuration_templates is
  'SUPER_ADMIN-managed reusable Question and Rule configuration templates. Templates contain configuration only, never tenant operational data.';

comment on function public.capture_configuration_template(uuid,text,text,text) is
  'SUPER_ADMIN-only snapshot of an organization Question/Rule configuration into an independent reusable template.';

comment on function public.apply_configuration_template(uuid,uuid) is
  'SUPER_ADMIN-only transactional initialization of an empty organization from a published configuration template using newly generated live IDs.';

commit;
