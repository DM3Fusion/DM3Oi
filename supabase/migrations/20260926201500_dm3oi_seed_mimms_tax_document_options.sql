do $$
declare
  target_organization_id uuid := 'e5a00c5a-f028-47f8-bb34-5527219eb995';
  target_question_id uuid := '911c69ee-14bd-4391-ae87-f5b34047ea60';
begin
  if not exists (
    select 1
    from public.question_definitions
    where id = target_question_id
      and organization_id = target_organization_id
      and question_text = 'Have all required tax documents been received?'
  ) then
    raise exception 'Mimms tax-document question was not found';
  end if;

  update public.question_definitions
  set
    question_text = 'Required tax documents received',
    description = 'Select each required tax document received from the customer.',
    response_type = 'MULTI_SELECT',
    required = true,
    active = true
  where id = target_question_id
    and organization_id = target_organization_id;

  insert into public.question_options (
    organization_id,
    question_id,
    option_label,
    option_value,
    display_order,
    is_active
  )
  values
    (target_organization_id, target_question_id, 'W-2', 'w-2', 0, true),
    (target_organization_id, target_question_id, '1099-INT', '1099-int', 1, true),
    (target_organization_id, target_question_id, '1099-DIV', '1099-div', 2, true),
    (target_organization_id, target_question_id, '1099-NEC', '1099-nec', 3, true),
    (target_organization_id, target_question_id, '1099-MISC', '1099-misc', 4, true),
    (target_organization_id, target_question_id, '1099-R', '1099-r', 5, true),
    (target_organization_id, target_question_id, 'SSA-1099', 'ssa-1099', 6, true),
    (target_organization_id, target_question_id, '1098 Mortgage Interest', '1098', 7, true),
    (target_organization_id, target_question_id, '1098-T Tuition Statement', '1098-t', 8, true),
    (target_organization_id, target_question_id, '1095-A Health Insurance Marketplace', '1095-a', 9, true),
    (target_organization_id, target_question_id, 'Schedule K-1', 'schedule-k-1', 10, true),
    (target_organization_id, target_question_id, 'Brokerage / Investment Statement', 'brokerage-investment-statement', 11, true),
    (target_organization_id, target_question_id, 'Other Tax Document', 'other-tax-document', 12, true)
  on conflict (question_id, option_value)
  do update set
    option_label = excluded.option_label,
    display_order = excluded.display_order,
    is_active = true;
end
$$;
