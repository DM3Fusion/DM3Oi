begin;

-- Guided Intake requirement Tasks are completed from the live Requirements
-- state. While an intake is unfinished, that authoritative state is stored in
-- guided_case_intake_drafts.answers rather than case_question_responses.
--
-- Preserve the existing completion guard, but allow it to validate against the
-- linked unfinished draft before falling back to the durable Case response.

create or replace function public.prepare_case_task_lifecycle()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  relative_days integer;
  requirement_satisfied boolean;
  draft_answer jsonb;
begin
  if tg_op='INSERT'
     and new.due_at is null
     and new.source_rule_action_id is not null
  then
    select action.task_due_in_days
    into relative_days
    from public.rule_actions action
    where action.id=new.source_rule_action_id
      and action.organization_id=new.organization_id
      and action.action_type='CREATE_TASK';

    if relative_days is not null then
      new.due_at:=public.organization_task_due_at(
        new.organization_id,
        relative_days
      );
    end if;
  end if;

  if tg_op='INSERT' and new.due_at is null then
    raise exception 'Task Due Date is required'
      using errcode='23514';
  end if;

  if tg_op='UPDATE'
     and old.due_at is not null
     and new.due_at is null
  then
    raise exception 'Task Due Date cannot be cleared'
      using errcode='23514';
  end if;

  if new.status='COMPLETED'
     and new.intake_follow_up_id is not null
     and (tg_op='INSERT' or old.status<>'COMPLETED')
  then
    requirement_satisfied:=false;
    draft_answer:=null;

    -- During an unfinished Guided Intake, Requirements are authoritative in
    -- the linked draft. This row is updated before Task lifecycle sync runs.
    select draft.answers->new.intake_question_definition_id::text
    into draft_answer
    from public.guided_case_intake_drafts draft
    where draft.organization_id=new.organization_id
      and draft.case_id=new.case_id
      and draft.finalized_at is null
    order by draft.updated_at desc
    limit 1;

    if jsonb_typeof(draft_answer)='array' then
      select not exists(
        select 1
        from jsonb_array_elements_text(
          coalesce(
            new.intake_requirement_context->'missing_option_ids',
            '[]'::jsonb
          )
        ) missing(value)
        where not (draft_answer ? missing.value)
      )
      into requirement_satisfied;
    end if;

    -- Outside an unfinished intake, or when the draft cannot satisfy the
    -- requirement, preserve the durable Case-response validation.
    if not coalesce(requirement_satisfied,false) then
      select exists(
        select 1
        from public.case_questions question
        join public.case_question_responses response
          on response.case_question_id=question.id
         and response.case_id=question.case_id
         and response.organization_id=question.organization_id
        where question.case_id=new.case_id
          and question.organization_id=new.organization_id
          and question.question_definition_id=
            new.intake_question_definition_id
          and jsonb_typeof(response.response_value)='array'
          and not exists(
            select 1
            from jsonb_array_elements_text(
              coalesce(
                new.intake_requirement_context->'missing_option_ids',
                '[]'::jsonb
              )
            ) missing(value)
            where not (response.response_value ? missing.value)
          )
      )
      into requirement_satisfied;
    end if;

    if not coalesce(requirement_satisfied,false) then
      raise exception
        'missing documents prevent follow-up Task completion'
        using errcode='23514';
    end if;
  end if;

  if new.status='COMPLETED' then
    if tg_op='INSERT' or old.status<>'COMPLETED' then
      new.completed_at:=now();
      new.completed_by_user_id:=
        coalesce(auth.uid(),new.created_by_user_id);
    else
      new.completed_at:=old.completed_at;
      new.completed_by_user_id:=old.completed_by_user_id;
    end if;
  else
    new.completed_at:=null;
    new.completed_by_user_id:=null;
  end if;

  return new;
end
$$;

alter function public.prepare_case_task_lifecycle()
  owner to postgres;

revoke all
  on function public.prepare_case_task_lifecycle()
  from public,anon,authenticated;

comment on function public.prepare_case_task_lifecycle() is
  'Prepares Task due/completion lifecycle and validates Guided Intake requirement completion against the authoritative unfinished intake draft before falling back to durable Case responses.';

commit;
