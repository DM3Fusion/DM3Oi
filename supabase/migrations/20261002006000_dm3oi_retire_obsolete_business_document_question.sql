begin;

-- The original business-record receipt Question is superseded by the
-- system-derived Required Documents workflow. Preserve the Question and
-- historical Case responses for referential/audit history, but remove it
-- from active Guided Intake configuration.
update public.question_definitions
set
  active = false,
  question_group = null
where organization_id = 'e5a00c5a-f028-47f8-bb34-5527219eb995'
  and id = '7668caec-7f75-46c2-8349-cd2611bcbf2b'
  and question_text =
    'Have required business income and expense records been received?';

-- Retire the obsolete Rule path that required the receipt Question when
-- self-employment/business income was selected. The source tax-fact Question
-- remains active because it now drives derived document requirements.
alter table public.rule_definitions
  disable trigger rule_definitions_stamp_actor;

alter table public.rule_actions
  disable trigger rule_actions_stamp_actor;

update public.rule_actions action
set retired_at = coalesce(action.retired_at, now())
from public.rule_definitions rule
where action.organization_id =
      'e5a00c5a-f028-47f8-bb34-5527219eb995'
  and rule.organization_id = action.organization_id
  and rule.id = action.rule_definition_id
  and rule.name =
      'Require business records when business income is involved'
  and action.action_type = 'REQUIRE_QUESTION'
  and action.target_question_id =
      '7668caec-7f75-46c2-8349-cd2611bcbf2b'
  and action.retired_at is null;

update public.rule_definitions
set active = false
where organization_id = 'e5a00c5a-f028-47f8-bb34-5527219eb995'
  and name = 'Require business records when business income is involved';

-- Flush deferred FK/constraint trigger work from the Rule updates before
-- changing trigger configuration again inside this transaction.
set constraints all immediate;

alter table public.rule_actions
  enable trigger rule_actions_stamp_actor;

alter table public.rule_definitions
  enable trigger rule_definitions_stamp_actor;

commit;
