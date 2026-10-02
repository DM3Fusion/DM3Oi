-- Include organization Customer data submissions in the SUPER_ADMIN
-- organization test-data reset.
--
-- The database rows are removed transactionally by the reset RPC.
-- Private Storage objects are removed separately by the trusted server action.

alter function public.preview_organization_reset(uuid, uuid)
  rename to preview_organization_reset_without_customer_import_submissions;

revoke all on function public.preview_organization_reset_without_customer_import_submissions(uuid, uuid)
  from public, anon, authenticated;

create function public.preview_organization_reset(
  target_organization_id uuid,
  preserved_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  result := public.preview_organization_reset_without_customer_import_submissions(
    target_organization_id,
    preserved_owner_user_id
  );

  return result || jsonb_build_object(
    'customerImportSubmissions',
    (
      select count(*)
      from public.customer_import_submissions
      where organization_id = target_organization_id
    )
  );
end;
$$;


alter function public.reset_organization_company_and_users(uuid, uuid, text)
  rename to reset_organization_company_and_users_without_customer_import_submissions;

revoke all on function public.reset_organization_company_and_users_without_customer_import_submissions(uuid, uuid, text)
  from public, anon, authenticated;

create function public.reset_organization_company_and_users(
  target_organization_id uuid,
  preserved_owner_user_id uuid,
  confirmation_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  deleted_count bigint;
  actor uuid := auth.uid();
begin
  result :=
    public.reset_organization_company_and_users_without_customer_import_submissions(
      target_organization_id,
      preserved_owner_user_id,
      confirmation_text
    );

  delete from public.customer_import_submissions
  where organization_id = target_organization_id;

  get diagnostics deleted_count = row_count;

  result := result || jsonb_build_object(
    'customerImportSubmissions',
    deleted_count
  );

  update public.platform_organization_reset_audit
  set deleted_counts = result
  where id = (
    select id
    from public.platform_organization_reset_audit
    where organization_id = target_organization_id
      and actor_user_id = actor
    order by created_at desc, id desc
    limit 1
  );

  return result;
end;
$$;


revoke all on function public.preview_organization_reset(uuid, uuid)
  from public, anon;

revoke all on function public.reset_organization_company_and_users(uuid, uuid, text)
  from public, anon;

grant execute on function public.preview_organization_reset(uuid, uuid)
  to authenticated;

grant execute on function public.reset_organization_company_and_users(uuid, uuid, text)
  to authenticated;
