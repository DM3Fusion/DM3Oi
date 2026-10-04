begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.is_valid_how_to_guide_rich_text(
  target_value jsonb,
  target_max_length integer
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  run jsonb;
  combined_text text := '';
  run_text text;
begin
  if target_value is null then
    return false;
  end if;

  -- Backward-compatible plain text.
  if jsonb_typeof(target_value) = 'string' then
    return public.is_valid_how_to_guide_text(
      target_value #>> '{}',
      target_max_length
    );
  end if;

  if jsonb_typeof(target_value) <> 'object'
     or (select count(*) from jsonb_object_keys(target_value)) <> 2
     or not (target_value ?& array['align','runs'])
     or jsonb_typeof(target_value->'align') <> 'string'
     or (target_value->>'align') not in ('left','center','right')
     or jsonb_typeof(target_value->'runs') <> 'array'
     or jsonb_array_length(target_value->'runs') not between 1 and 100
  then
    return false;
  end if;

  for run in
    select value
    from jsonb_array_elements(target_value->'runs')
  loop
    if jsonb_typeof(run) <> 'object'
       or not (run ? 'text')
       or jsonb_typeof(run->'text') <> 'string'
       or exists (
         select 1
         from jsonb_object_keys(run) key
         where key not in ('text','bold','italic','underline')
       )
       or (
         run ? 'bold'
         and (
           jsonb_typeof(run->'bold') <> 'boolean'
           or run->>'bold' <> 'true'
         )
       )
       or (
         run ? 'italic'
         and (
           jsonb_typeof(run->'italic') <> 'boolean'
           or run->>'italic' <> 'true'
         )
       )
       or (
         run ? 'underline'
         and (
           jsonb_typeof(run->'underline') <> 'boolean'
           or run->>'underline' <> 'true'
         )
       )
    then
      return false;
    end if;

    run_text := run->>'text';

    if run_text = ''
       or position('<' in run_text) <> 0
       or position('>' in run_text) <> 0
    then
      return false;
    end if;

    combined_text := combined_text || run_text;

    if char_length(combined_text) > target_max_length then
      return false;
    end if;
  end loop;

  return
    char_length(btrim(combined_text)) between 1 and target_max_length
    and position('<' in combined_text) = 0
    and position('>' in combined_text) = 0;
end;
$$;

create or replace function public.validate_how_to_guide_content(
  target_guide_key text,
  target_content jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  section jsonb;
  step jsonb;
  callout jsonb;
  section_key text;
  paragraph_value jsonb;
  seen_sections text[] := '{}'::text[];
  allowed_sections text[];
  allowed_figures text[];
begin
  if target_guide_key = 'OWNER_ADMIN' then
    allowed_sections := array[
      'getting-started','dashboard','customers','cases','tasks',
      'service-desk','customer-portal','communications','reports',
      'users-access','settings','common-workflows','troubleshooting'
    ];
    allowed_figures := array[
      'customer-workspace','guided-intake-owner','task-register-owner',
      'service-request-flow-owner','portal-access','business-reach-owner',
      'invitation-flow','settings-cards'
    ];
  elsif target_guide_key = 'STAFF' then
    allowed_sections := array[
      'getting-started','dashboard','customers','cases','tasks',
      'service-desk','customer-portal','communications','questions-rules',
      'reports','common-workflows','troubleshooting'
    ];
    allowed_figures := array[
      'customer-register','guided-intake-staff','task-register-staff',
      'service-request-flow-staff','portal-interaction','inbox-pattern',
      'business-reach-staff'
    ];
  else
    return false;
  end if;

  if target_content is null
     or jsonb_typeof(target_content) <> 'object'
     or (select count(*) from jsonb_object_keys(target_content)) <> 3
     or not (target_content ?& array['title','intro','sections'])
  then
    return false;
  end if;

  if jsonb_typeof(target_content->'title') <> 'string'
     or not public.is_valid_how_to_guide_text(
       target_content->>'title',
       120
     )
     or jsonb_typeof(target_content->'intro') <> 'string'
     or not public.is_valid_how_to_guide_text(
       target_content->>'intro',
       500
     )
     or jsonb_typeof(target_content->'sections') <> 'array'
     or jsonb_array_length(target_content->'sections')
       not between 1 and 20
  then
    return false;
  end if;

  for section in
    select value
    from jsonb_array_elements(target_content->'sections')
  loop
    if jsonb_typeof(section) <> 'object'
       or (select count(*) from jsonb_object_keys(section)) <> 8
       or not (
         section ?& array[
           'key','title','enabled','paragraphs','steps',
           'callout','figure_key','figure_caption'
         ]
       )
    then
      return false;
    end if;

    if jsonb_typeof(section->'key') <> 'string' then
      return false;
    end if;

    section_key := section->>'key';

    if not (section_key = any(allowed_sections))
       or section_key = any(seen_sections)
    then
      return false;
    end if;

    seen_sections := array_append(
      seen_sections,
      section_key
    );

    if jsonb_typeof(section->'title') <> 'string'
       or not public.is_valid_how_to_guide_text(
         section->>'title',
         120
       )
       or jsonb_typeof(section->'enabled') <> 'boolean'
       or jsonb_typeof(section->'paragraphs') <> 'array'
       or jsonb_array_length(section->'paragraphs') > 8
       or jsonb_typeof(section->'steps') <> 'array'
       or jsonb_array_length(section->'steps') > 12
    then
      return false;
    end if;

    for paragraph_value in
      select value
      from jsonb_array_elements(section->'paragraphs')
    loop
      if not public.is_valid_how_to_guide_rich_text(
        paragraph_value,
        2000
      ) then
        return false;
      end if;
    end loop;

    for step in
      select value
      from jsonb_array_elements(section->'steps')
    loop
      if jsonb_typeof(step) <> 'object'
         or (select count(*) from jsonb_object_keys(step)) <> 2
         or not (step ?& array['title','body'])
         or jsonb_typeof(step->'title') <> 'string'
         or not public.is_valid_how_to_guide_text(
           step->>'title',
           160
         )
         or not public.is_valid_how_to_guide_rich_text(
           step->'body',
           1500
         )
      then
        return false;
      end if;
    end loop;

    if jsonb_typeof(section->'callout') = 'null' then
      null;
    elsif jsonb_typeof(section->'callout') = 'object' then
      callout := section->'callout';

      if (select count(*) from jsonb_object_keys(callout)) <> 2
         or not (callout ?& array['type','text'])
         or jsonb_typeof(callout->'type') <> 'string'
         or (
           target_guide_key = 'OWNER_ADMIN'
           and (callout->>'type') not in (
             'TIP','IMPORTANT','OWNER_ADMIN'
           )
         )
         or (
           target_guide_key = 'STAFF'
           and (callout->>'type') not in (
             'TIP','IMPORTANT','STAFF_BOUNDARY'
           )
         )
         or not public.is_valid_how_to_guide_rich_text(
           callout->'text',
           1500
         )
      then
        return false;
      end if;
    else
      return false;
    end if;

    if jsonb_typeof(section->'figure_key') = 'null' then
      if jsonb_typeof(section->'figure_caption') <> 'null' then
        return false;
      end if;
    elsif jsonb_typeof(section->'figure_key') = 'string' then
      if not ((section->>'figure_key') = any(allowed_figures))
         or not public.is_valid_how_to_guide_rich_text(
           section->'figure_caption',
           500
         )
      then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all
on function public.is_valid_how_to_guide_rich_text(jsonb, integer)
from public, anon, authenticated, service_role;

commit;
