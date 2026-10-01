-- Activate the existing Mimms tax-document options consumed by the
-- system-derived Guided Intake document requirement engine.
--
-- Historical catalog options not currently derived by Guided Intake remain
-- unchanged.

update public.question_options
set is_active = true
where organization_id = 'e5a00c5a-f028-47f8-bb34-5527219eb995'
  and question_id = '911c69ee-14bd-4391-ae87-f5b34047ea60'
  and option_value in (
    '1099-int',
    '1099-div',
    '1099-r',
    'ssa-1099',
    '1098',
    'brokerage-investment-statement'
  );
