begin;

-- Generic Guided Intake follow-up Tasks represent an answered but unresolved
-- required Question. Unlike Document Requirement Tasks, they intentionally
-- have no missing document/item option IDs.
--
-- Preserve the existing provenance rules and Document Requirement checklist
-- shape while explicitly allowing QUESTION_FOLLOW_UP with empty option arrays.

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
        (
          intake_requirement_context->>'kind'='DOCUMENT_REQUIREMENT'
          and jsonb_typeof(
            intake_requirement_context->'required_option_ids'
          )='array'
          and jsonb_typeof(
            intake_requirement_context->'required_option_labels'
          )='array'
          and jsonb_array_length(
            intake_requirement_context->'required_option_ids'
          )>0
        )
        or
        (
          intake_requirement_context->>'kind'='QUESTION_FOLLOW_UP'
          and jsonb_array_length(
            intake_requirement_context->'missing_option_ids'
          )=0
          and jsonb_array_length(
            intake_requirement_context->'missing_option_labels'
          )=0
        )
        or status='COMPLETED'
        or jsonb_array_length(
          intake_requirement_context->'missing_option_ids'
        )>0
      )
    )
  );

comment on constraint case_tasks_intake_follow_up_shape
on public.case_tasks is
  'Guided Intake Tasks retain workflow provenance. Document Requirement Tasks retain their required-document checklist. Generic QUESTION_FOLLOW_UP Tasks intentionally use empty missing-option arrays. Historical completed and legacy item-based follow-ups remain valid.';

commit;
