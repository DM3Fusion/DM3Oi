begin;

-- Server-only legal-review projection.
-- Returns the current published document plus the exact document version
-- most recently accepted by the organization, when one exists.
create or replace function public.get_organization_legal_review_server(
  target_organization_id uuid,
  target_document_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_row public.legal_document_versions;
  accepted_version_id uuid;
  accepted_row public.legal_document_versions;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if target_document_key not in (
    'TERMS_OF_SERVICE',
    'PRIVACY_POLICY'
  ) then
    return null;
  end if;

  select version.*
  into current_row
  from public.legal_document_publications publication
  join public.legal_document_versions version
    on version.document_key = publication.document_key
   and version.id = publication.version_id
  where publication.document_key = target_document_key;

  if current_row.id is null then
    return null;
  end if;

  select
    case
      when target_document_key = 'TERMS_OF_SERVICE'
        then event.terms_version_id
      else event.privacy_version_id
    end
  into accepted_version_id
  from public.organization_legal_authorization_events event
  where event.organization_id = target_organization_id
    and event.event_type = 'ACCEPTED'
  order by event.acted_at desc, event.id desc
  limit 1;

  if accepted_version_id is not null then
    select version.*
    into accepted_row
    from public.legal_document_versions version
    where version.document_key = target_document_key
      and version.id = accepted_version_id;
  end if;

  return jsonb_build_object(
    'current',
      jsonb_build_object(
        'document_key', current_row.document_key,
        'content', current_row.content,
        'version', current_row.version,
        'effective_date', current_row.effective_date
      ),
    'previous',
      case
        when accepted_row.id is null then null
        else jsonb_build_object(
          'document_key', accepted_row.document_key,
          'content', accepted_row.content,
          'version', accepted_row.version,
          'effective_date', accepted_row.effective_date
        )
      end
  );
end;
$$;

alter function public.get_organization_legal_review_server(uuid, text)
  owner to postgres;

revoke all on function
  public.get_organization_legal_review_server(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_organization_legal_review_server(uuid, text)
  to service_role;

comment on function
  public.get_organization_legal_review_server(uuid, text)
is
  'Server-only projection of the current legal document and the exact immutable version most recently accepted by an organization for legal update review.';

notify pgrst, 'reload schema';

commit;
