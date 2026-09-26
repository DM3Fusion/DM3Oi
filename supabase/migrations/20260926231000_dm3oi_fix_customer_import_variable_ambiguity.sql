-- Fix the deployed Customer import's Phase A2 PL/pgSQL variable/column
-- ambiguity without changing its authorization, classification, or atomicity.

create or replace function public.super_admin_import_customers(
  target_organization_id uuid,
  target_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  item jsonb;
  other_item jsonb;
  input_position bigint;
  row_number integer;
  normalized_first_name text;
  normalized_last_name text;
  normalized_street_address text;
  city_name text;
  state_code text;
  postal text;
  email_address text;
  phone_number text;
  display_name text;
  reason text;
  classification text;
  existing_number text;
  created_customer public.customers;
  prepared_rows jsonb:='[]'::jsonb;
  classified_rows jsonb:='[]'::jsonb;
  outcomes jsonb:='[]'::jsonb;
  created_count integer:=0;
  exact_count integer:=0;
  duplicate_count integer:=0;
  invalid_count integer:=0;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if not exists(select 1 from public.organizations where id=target_organization_id and status='ACTIVE') then
    raise exception 'target organization is not active' using errcode='23514';
  end if;
  if coalesce(jsonb_typeof(target_rows),'null')<>'array' then
    raise exception 'import rows must be a JSON array' using errcode='22023';
  end if;
  if jsonb_array_length(target_rows)=0 or jsonb_array_length(target_rows)>500 then
    raise exception 'import must contain between 1 and 500 rows' using errcode='22023';
  end if;

  -- PHASE A1: normalize and validate every input row. No Customer writes occur.
  for item,input_position in
    select value,ordinality
    from jsonb_array_elements(target_rows) with ordinality
  loop
    row_number:=(input_position+1)::integer;
    reason:=null;
    if coalesce(jsonb_typeof(item),'null')<>'object' then
      reason:='Row must be a JSON object.';
    elsif coalesce(item->>'row_number','') ~ '^[0-9]{1,9}$' then
      row_number:=(item->>'row_number')::integer;
      if row_number<2 then reason:='Invalid source row number.'; end if;
    else
      reason:='Invalid source row number.';
    end if;

    normalized_first_name:=trim(coalesce(item->>'first_name',''));
    normalized_last_name:=trim(coalesce(item->>'last_name',''));
    normalized_street_address:=trim(coalesce(item->>'street_address',''));
    city_name:=trim(coalesce(item->>'city',''));
    state_code:=upper(trim(coalesce(item->>'state','')));
    postal:=trim(coalesce(item->>'postal_code',''));
    email_address:=lower(trim(coalesce(item->>'email','')));
    phone_number:=regexp_replace(coalesce(item->>'phone',''),'[^0-9]','','g');
    display_name:=trim(concat_ws(' ',normalized_first_name,normalized_last_name));

    if reason is null then
      if normalized_first_name='' then reason:='First name is required.';
      elsif normalized_last_name='' then reason:='Last name is required.';
      elsif normalized_street_address='' then reason:='Street address is required.';
      elsif city_name='' then reason:='City is required.';
      elsif not (state_code=any(array['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']::text[])) then reason:='State must be a valid U.S. code.';
      elsif postal !~ '^[0-9]{5}(-[0-9]{4})?$' then reason:='Postal code must be ZIP or ZIP+4.';
      elsif email_address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then reason:='Email is invalid.';
      elsif length(phone_number) not in (10,11) or (length(phone_number)=11 and left(phone_number,1)<>'1') then reason:='Phone is invalid.';
      end if;
    end if;

    prepared_rows:=prepared_rows||jsonb_build_array(jsonb_build_object(
      '_source_index',input_position,'row_number',row_number,
      'first_name',normalized_first_name,'last_name',normalized_last_name,'name',display_name,
      'street_address',normalized_street_address,'city',city_name,'state',state_code,
      'postal_code',postal,'email',email_address,'phone',phone_number,
      'validation_reason',reason
    ));
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text,1));
  lock table public.customers in share row exclusive mode;
  -- PHASE A2: classify the complete normalized set against the locked Customer
  -- population and every other valid CSV row. Still no Customer writes occur.
  for item in select value from jsonb_array_elements(prepared_rows) loop
    row_number:=(item->>'row_number')::integer;
    normalized_first_name:=item->>'first_name';
    normalized_last_name:=item->>'last_name';
    normalized_street_address:=item->>'street_address';
    city_name:=item->>'city';
    state_code:=item->>'state';
    postal:=item->>'postal_code';
    email_address:=item->>'email';
    phone_number:=item->>'phone';
    display_name:=item->>'name';
    reason:=item->>'validation_reason';
    classification:='NEW';
    existing_number:=null;

    if reason is not null then
      classification:='INVALID'; invalid_count:=invalid_count+1;
    else
      select c.customer_number into existing_number from public.customers c
      where c.organization_id=target_organization_id
        and lower(coalesce(c.email,''))=email_address
        and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=phone_number
      order by c.created_at limit 1;
      if found then
        classification:='EXACT'; reason:='Email and phone match an existing Customer.'; exact_count:=exact_count+1;
      elsif exists(
        select 1 from public.customers c where c.organization_id=target_organization_id and (
          lower(coalesce(c.email,''))=email_address
          or regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=phone_number
          or (lower(regexp_replace(coalesce(c.first_name,''),'[^[:alnum:]]','','g'))=lower(regexp_replace(normalized_first_name,'[^[:alnum:]]','','g'))
              and lower(regexp_replace(coalesce(c.last_name,''),'[^[:alnum:]]','','g'))=lower(regexp_replace(normalized_last_name,'[^[:alnum:]]','','g'))
              and regexp_replace(coalesce(c.postal_code,''),'[^0-9]','','g')=regexp_replace(postal,'[^0-9]','','g'))
          or (lower(regexp_replace(c.name,'[^[:alnum:]]','','g'))=lower(regexp_replace(display_name,'[^[:alnum:]]','','g'))
              and lower(regexp_replace(coalesce(c.street_address,''),'[^[:alnum:]]','','g'))=lower(regexp_replace(normalized_street_address,'[^[:alnum:]]','','g')))
        )
      ) then
        classification:='DUPLICATE'; reason:='A strong identity signal matches an existing Customer.'; duplicate_count:=duplicate_count+1;
      else
        for other_item in select value from jsonb_array_elements(prepared_rows) loop
          if other_item->>'validation_reason' is null
             and (other_item->>'_source_index')::bigint<>(item->>'_source_index')::bigint
             and (
            other_item->>'email'=email_address
            or other_item->>'phone'=phone_number
            or (lower(regexp_replace(other_item->>'first_name','[^[:alnum:]]','','g'))=lower(regexp_replace(normalized_first_name,'[^[:alnum:]]','','g'))
                and lower(regexp_replace(other_item->>'last_name','[^[:alnum:]]','','g'))=lower(regexp_replace(normalized_last_name,'[^[:alnum:]]','','g'))
                and regexp_replace(other_item->>'postal_code','[^0-9]','','g')=regexp_replace(postal,'[^0-9]','','g'))
            or (lower(regexp_replace(other_item->>'name','[^[:alnum:]]','','g'))=lower(regexp_replace(display_name,'[^[:alnum:]]','','g'))
                and lower(regexp_replace(other_item->>'street_address','[^[:alnum:]]','','g'))=lower(regexp_replace(normalized_street_address,'[^[:alnum:]]','','g')))
          ) then
            classification:='DUPLICATE'; reason:='A strong identity signal matches another CSV row.'; duplicate_count:=duplicate_count+1;
            exit;
          end if;
        end loop;
      end if;
    end if;

    classified_rows:=classified_rows||jsonb_build_array(
      (item-'validation_reason')||jsonb_build_object(
        'classification',classification,'reason',reason,
        'customer_number',existing_number
      )
    );
  end loop;

  -- PHASE B: every row now has a final classification. Only NEW rows write.
  for item in select value from jsonb_array_elements(classified_rows) loop
    row_number:=(item->>'row_number')::integer;
    classification:=item->>'classification';
    if classification='NEW' then
      begin
        insert into public.customers(
          organization_id,customer_number,type,name,email,phone,status,notes,created_by_user_id,
          first_name,last_name,street_address,city,state,postal_code
        ) values (
          target_organization_id,public.next_customer_number(target_organization_id,'INDIVIDUAL'::public.customer_type),
          'INDIVIDUAL',item->>'name',item->>'email',item->>'phone','ACTIVE',null,actor,
          item->>'first_name',item->>'last_name',item->>'street_address',
          item->>'city',item->>'state',item->>'postal_code'
        ) returning * into created_customer;
      exception when others then
        raise exception 'customer import failed at CSV row %',row_number
          using errcode='P0001',detail=sqlerrm;
      end;
      created_count:=created_count+1;
      outcomes:=outcomes||jsonb_build_array(jsonb_build_object(
        'row_number',row_number,'classification','CREATED','customer_id',created_customer.id,
        'customer_number',created_customer.customer_number,'reason','Customer created.'
      ));
    else
      outcomes:=outcomes||jsonb_build_array(jsonb_build_object(
        'row_number',row_number,'classification',classification,
        'customer_number',item->>'customer_number','reason',item->>'reason'
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'created',created_count,'skipped_exact',exact_count,'held_duplicates',duplicate_count,
    'invalid',invalid_count,'outcomes',outcomes
  );
end
$$;

alter function public.super_admin_import_customers(uuid,jsonb) owner to postgres;
revoke all on function public.super_admin_import_customers(uuid,jsonb) from public,anon;
grant execute on function public.super_admin_import_customers(uuid,jsonb) to authenticated;

comment on function public.super_admin_import_customers(uuid,jsonb) is
  'SUPER_ADMIN-only atomic Customer CSV import boundary. Revalidates and reclassifies every row and allocates canonical annual Customer numbers.';
