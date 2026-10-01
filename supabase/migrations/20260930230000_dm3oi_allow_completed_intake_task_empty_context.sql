begin;

alter table public.case_tasks
  drop constraint if exists case_tasks_intake_follow_up_shape;

alter table public.case_tasks
  add constraint case_tasks_intake_follow_up_shape check (
    (
      intake_follow_up_id is null
      and intake_question_definition_id is null
      and intake_requirement_context is null
    )
    or
    (
      intake_follow_up_id is not null
      and intake_question_definition_id is not null
      and jsonb_typeof(intake_requirement_context)='object'
      and jsonb_typeof(
        intake_requirement_context->'missing_option_ids'
      )='array'
      and jsonb_typeof(
        intake_requirement_context->'missing_option_labels'
      )='array'
      and (
        status='COMPLETED'
        or jsonb_array_length(
          intake_requirement_context->'missing_option_ids'
        )>0
      )
    )
  );

comment on constraint case_tasks_intake_follow_up_shape
on public.case_tasks is
  'Guided Intake follow-up Tasks retain workflow provenance. Active Tasks require current missing requirements; completed Tasks may retain an empty current missing-item context as historical evidence.';

commit;
