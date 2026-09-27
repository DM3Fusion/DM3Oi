-- Permanently remove obsolete Mimms' Tax Service Question definitions that
-- belong to post-intake tax preparation / Early Payment workflows or duplicate
-- information already represented by Case and Customer data.
--
-- Historical Case Question snapshots are intentionally preserved. The
-- case_questions.question_definition_id foreign key uses ON DELETE SET NULL.

do $$
declare
  target_organization_id constant uuid :=
    'e5a00c5a-f028-47f8-bb34-5527219eb995'::uuid;

  target_question_ids constant uuid[] := array[
    'c8e0016d-4172-4627-995c-331c78b10d14'::uuid,
    'a74527d6-9cb7-4f6d-ac3c-e5a6ed259ac4'::uuid,
    'f22f5767-9e3f-4cab-9eab-e2bf12fc89e4'::uuid,
    '1f5c2dc2-d67c-475f-96af-398cf1635b2e'::uuid,
    'f0d6133c-f974-41eb-8ed9-98e81f8b0123'::uuid,
    '8866a609-3a86-490e-8fd0-ab153565598b'::uuid,
    '87faefb5-5218-42f1-965a-0750699d8d4c'::uuid,
    '68e99e88-2b12-4861-9bb3-3465bb12b5a2'::uuid,
    '899e0116-dd59-4b05-b05a-76afba046c8d'::uuid,
    'a6695ee1-b130-40e4-8003-e2db236b01f5'::uuid,
    'b13be4e9-5e56-43cf-91ae-0a3e8e6dd537'::uuid,
    '0f78f410-3735-4e26-9204-bb98a546f89b'::uuid,
    'bea28c03-a676-457d-959a-8321087bae2e'::uuid,
    '5b53bf52-8dd6-41f0-a210-3f22f673be0f'::uuid,
    '6d43cdb6-7d3c-4a6f-98f4-c4ead152e450'::uuid,
    'e5db03c9-71ba-4954-be75-51f71c9b3e34'::uuid
  ];

  snapshot_ids uuid[];
  target_count integer;
  detached_snapshot_count integer;
  deleted_count integer;
  blocker_count integer;
begin
  if not exists (
    select 1
    from public.organizations
    where id = target_organization_id
      and name = 'Mimms'' Tax Service'
  ) then
    raise exception
      'Expected Mimms'' Tax Service organization was not found';
  end if;

  select count(*)
  into target_count
  from public.question_definitions q
  where q.organization_id = target_organization_id
    and q.id = any(target_question_ids);

  if target_count <> 16 then
    raise exception
      'Expected 16 obsolete Mimms Questions, found %',
      target_count;
  end if;

  if exists (
    select 1
    from public.question_definitions q
    where q.organization_id = target_organization_id
      and q.id = any(target_question_ids)
      and q.active
  ) then
    raise exception
      'One or more obsolete Mimms Questions are active; deletion aborted';
  end if;

  select count(*)
  into blocker_count
  from public.rule_definitions r
  where r.organization_id = target_organization_id
    and r.source_question_id = any(target_question_ids);

  if blocker_count > 0 then
    raise exception
      'Obsolete Mimms Questions are referenced by % Rule definitions',
      blocker_count;
  end if;

  select count(*)
  into blocker_count
  from public.rule_actions a
  where a.organization_id = target_organization_id
    and a.target_question_id = any(target_question_ids);

  if blocker_count > 0 then
    raise exception
      'Obsolete Mimms Questions are referenced by % Rule actions',
      blocker_count;
  end if;

  select count(*)
  into blocker_count
  from public.case_tasks t
  where t.organization_id = target_organization_id
    and t.intake_question_definition_id = any(target_question_ids);

  if blocker_count > 0 then
    raise exception
      'Obsolete Mimms Questions are referenced by % Case Tasks',
      blocker_count;
  end if;

  select count(*)
  into blocker_count
  from public.guided_case_intake_drafts d
  where d.organization_id = target_organization_id
    and (
      exists (
        select 1
        from unnest(target_question_ids) target_question_id
        where d.answers ? target_question_id::text
      )
      or exists (
        select 1
        from unnest(target_question_ids) target_question_id
        where d.required_option_ids ? target_question_id::text
      )
    );

  if blocker_count > 0 then
    raise exception
      'Obsolete Mimms Questions are referenced by % Guided Intake drafts',
      blocker_count;
  end if;

  select coalesce(array_agg(cq.id), '{}'::uuid[])
  into snapshot_ids
  from public.case_questions cq
  where cq.organization_id = target_organization_id
    and cq.question_definition_id = any(target_question_ids);

  -- case_questions uses a composite FK:
  -- (organization_id, question_definition_id) -> question_definitions.
  -- ON DELETE SET NULL on that composite FK would attempt to null both
  -- child columns, but organization_id is NOT NULL. Detach only the
  -- definition pointer explicitly so the historical snapshot remains
  -- tenant-scoped and fully preserved.
  update public.case_questions cq
  set question_definition_id = null
  where cq.organization_id = target_organization_id
    and cq.question_definition_id = any(target_question_ids);

  get diagnostics detached_snapshot_count = row_count;

  if detached_snapshot_count <> cardinality(snapshot_ids) then
    raise exception
      'Expected to detach % historical Case Question snapshots, detached %',
      cardinality(snapshot_ids),
      detached_snapshot_count;
  end if;

  delete from public.question_definitions q
  where q.organization_id = target_organization_id
    and q.id = any(target_question_ids);

  get diagnostics deleted_count = row_count;

  if deleted_count <> 16 then
    raise exception
      'Expected to delete 16 obsolete Mimms Questions, deleted %',
      deleted_count;
  end if;

  if exists (
    select 1
    from public.question_definitions q
    where q.organization_id = target_organization_id
      and q.id = any(target_question_ids)
  ) then
    raise exception
      'One or more obsolete Mimms Questions remain after deletion';
  end if;

  if cardinality(snapshot_ids) > 0 then
    if (
      select count(*)
      from public.case_questions cq
      where cq.id = any(snapshot_ids)
    ) <> cardinality(snapshot_ids) then
      raise exception
        'Historical Case Question snapshots were unexpectedly removed';
    end if;

    if exists (
      select 1
      from public.case_questions cq
      where cq.id = any(snapshot_ids)
        and cq.question_definition_id is not null
    ) then
      raise exception
        'Historical Case Question snapshots did not detach from deleted definitions';
    end if;
  end if;
end
$$;
