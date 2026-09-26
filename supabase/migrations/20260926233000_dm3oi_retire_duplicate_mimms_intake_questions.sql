-- Retire Mimms' Tax Service intake questions that duplicate information
-- already established by Customer selection and Case Details.
--
-- Historical Case question snapshots remain unchanged. The question
-- definitions and options are retained for audit/history and only removed
-- from future Guided Intake by deactivating them.

do $$
declare
  target_organization_id uuid := 'e5a00c5a-f028-47f8-bb34-5527219eb995';
begin
  update public.question_definitions
  set
    active = false,
    question_group = null
  where organization_id = target_organization_id
    and id in (
      'c8e0016d-4172-4627-995c-331c78b10d14',
      'a74527d6-9cb7-4f6d-ac3c-e5a6ed259ac4'
    );

  if (
    select count(*)
    from public.question_definitions
    where organization_id = target_organization_id
      and id in (
        'c8e0016d-4172-4627-995c-331c78b10d14',
        'a74527d6-9cb7-4f6d-ac3c-e5a6ed259ac4'
      )
      and active = false
      and question_group is null
  ) <> 2 then
    raise exception 'Mimms duplicate intake question retirement did not complete';
  end if;
end
$$;
