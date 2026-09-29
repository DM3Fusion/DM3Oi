begin;

update public.platform_email_templates
set
  closing_message =
    'View your Case and document-submission instructions in the Customer Portal: {{action_url}}',
  updated_at = now()
where template_key = 'MISSING_DOCUMENTS_NOTICE'
  and closing_message =
    'Please use the Customer Portal to provide the requested information: {{action_url}}';

commit;
