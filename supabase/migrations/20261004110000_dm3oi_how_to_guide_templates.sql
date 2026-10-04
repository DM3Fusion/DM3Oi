begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.is_valid_how_to_guide_text(
  target_value text,
  target_max_length integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    target_value is not null
    and char_length(btrim(target_value)) between 1 and target_max_length
    and position('<' in target_value) = 0
    and position('>' in target_value) = 0;
$$;

create or replace function public.validate_how_to_guide_content(
  target_guide_key text,
  target_content jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  section jsonb;
  step jsonb;
  callout jsonb;
  section_key text;
  paragraph_text text;
  seen_sections text[] := '{}'::text[];
  allowed_sections text[];
  allowed_figures text[];
begin
  if target_guide_key = 'OWNER_ADMIN' then
    allowed_sections := array[
      'getting-started','dashboard','customers','cases','tasks',
      'service-desk','customer-portal','communications','reports',
      'users-access','settings','common-workflows','troubleshooting'
    ];
    allowed_figures := array[
      'customer-workspace','guided-intake-owner','task-register-owner',
      'service-request-flow-owner','portal-access','business-reach-owner',
      'invitation-flow','settings-cards'
    ];
  elsif target_guide_key = 'STAFF' then
    allowed_sections := array[
      'getting-started','dashboard','customers','cases','tasks',
      'service-desk','customer-portal','communications','questions-rules',
      'reports','common-workflows','troubleshooting'
    ];
    allowed_figures := array[
      'customer-register','guided-intake-staff','task-register-staff',
      'service-request-flow-staff','portal-interaction','inbox-pattern',
      'business-reach-staff'
    ];
  else
    return false;
  end if;

  if target_content is null
     or jsonb_typeof(target_content) <> 'object'
     or (select count(*) from jsonb_object_keys(target_content)) <> 3
     or not (target_content ?& array['title','intro','sections'])
  then
    return false;
  end if;

  if jsonb_typeof(target_content->'title') <> 'string'
     or not public.is_valid_how_to_guide_text(target_content->>'title', 120)
     or jsonb_typeof(target_content->'intro') <> 'string'
     or not public.is_valid_how_to_guide_text(target_content->>'intro', 500)
     or jsonb_typeof(target_content->'sections') <> 'array'
     or jsonb_array_length(target_content->'sections') not between 1 and 20
  then
    return false;
  end if;

  for section in
    select value from jsonb_array_elements(target_content->'sections')
  loop
    if jsonb_typeof(section) <> 'object'
       or (select count(*) from jsonb_object_keys(section)) <> 8
       or not (section ?& array[
         'key','title','enabled','paragraphs','steps',
         'callout','figure_key','figure_caption'
       ])
    then
      return false;
    end if;

    if jsonb_typeof(section->'key') <> 'string' then
      return false;
    end if;

    section_key := section->>'key';

    if not (section_key = any(allowed_sections))
       or section_key = any(seen_sections)
    then
      return false;
    end if;

    seen_sections := array_append(seen_sections, section_key);

    if jsonb_typeof(section->'title') <> 'string'
       or not public.is_valid_how_to_guide_text(section->>'title', 120)
       or jsonb_typeof(section->'enabled') <> 'boolean'
       or jsonb_typeof(section->'paragraphs') <> 'array'
       or jsonb_array_length(section->'paragraphs') > 8
       or jsonb_typeof(section->'steps') <> 'array'
       or jsonb_array_length(section->'steps') > 12
    then
      return false;
    end if;

    if exists (
      select 1
      from jsonb_array_elements(section->'paragraphs') item
      where jsonb_typeof(item) <> 'string'
    ) then
      return false;
    end if;

    for paragraph_text in
      select value
      from jsonb_array_elements_text(section->'paragraphs') as p(value)
    loop
      if not public.is_valid_how_to_guide_text(paragraph_text, 2000) then
        return false;
      end if;
    end loop;

    for step in
      select value from jsonb_array_elements(section->'steps')
    loop
      if jsonb_typeof(step) <> 'object'
         or (select count(*) from jsonb_object_keys(step)) <> 2
         or not (step ?& array['title','body'])
         or jsonb_typeof(step->'title') <> 'string'
         or jsonb_typeof(step->'body') <> 'string'
         or not public.is_valid_how_to_guide_text(step->>'title', 160)
         or not public.is_valid_how_to_guide_text(step->>'body', 1500)
      then
        return false;
      end if;
    end loop;

    if jsonb_typeof(section->'callout') = 'null' then
      null;
    elsif jsonb_typeof(section->'callout') = 'object' then
      callout := section->'callout';

      if (select count(*) from jsonb_object_keys(callout)) <> 2
         or not (callout ?& array['type','text'])
         or jsonb_typeof(callout->'type') <> 'string'
         or (
           target_guide_key = 'OWNER_ADMIN'
           and (callout->>'type') not in (
             'TIP','IMPORTANT','OWNER_ADMIN'
           )
         )
         or (
           target_guide_key = 'STAFF'
           and (callout->>'type') not in (
             'TIP','IMPORTANT','STAFF_BOUNDARY'
           )
         )
         or jsonb_typeof(callout->'text') <> 'string'
         or not public.is_valid_how_to_guide_text(callout->>'text', 1500)
      then
        return false;
      end if;
    else
      return false;
    end if;

    if jsonb_typeof(section->'figure_key') = 'null' then
      if jsonb_typeof(section->'figure_caption') <> 'null' then
        return false;
      end if;
    elsif jsonb_typeof(section->'figure_key') = 'string' then
      if not ((section->>'figure_key') = any(allowed_figures))
         or jsonb_typeof(section->'figure_caption') <> 'string'
         or not public.is_valid_how_to_guide_text(
           section->>'figure_caption',
           500
         )
      then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create table public.how_to_guide_templates (
  guide_key text primary key
    check (guide_key in ('OWNER_ADMIN','STAFF')),

  draft_content jsonb not null,
  published_content jsonb not null,

  draft_revision integer not null default 1
    check (draft_revision > 0),

  published_revision integer not null default 1
    check (published_revision > 0),

  draft_updated_at timestamptz not null default now(),
  draft_updated_by uuid null,

  published_at timestamptz not null default now(),
  published_by uuid null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint how_to_guide_templates_draft_valid
    check (
      public.validate_how_to_guide_content(
        guide_key,
        draft_content
      )
    ),

  constraint how_to_guide_templates_published_valid
    check (
      public.validate_how_to_guide_content(
        guide_key,
        published_content
      )
    )
);

alter table public.how_to_guide_templates enable row level security;
alter table public.how_to_guide_templates force row level security;

revoke all
on table public.how_to_guide_templates
from public, anon, authenticated, service_role;

insert into public.how_to_guide_templates (
  guide_key,
  draft_content,
  published_content,
  draft_revision,
  published_revision
)
values
(
  'OWNER_ADMIN',
  $owner${"title":"DM3Oi How to Guide","intro":"A practical guide for Owners and Business Admins operating their organization workspace. Available actions may vary with assigned permissions.","sections":[{"key":"getting-started","title":"Getting Started","enabled":true,"paragraphs":["Know your workspace: The organization name in the shell shows the workspace you are operating. If you belong to more than one organization, use the organization selector before starting work.","Use the main navigation: Dashboard, Cases, Inbox, Service Desk, Customers, Tasks, Questions & Rules, and Reports lead to daily operational work. Users, this guide, and Settings are grouped in the organization administration area.","Keep your profile current: Open your account menu and choose My Profile to review your display name, title, and profile image. Your organization role and permissions determine which actions appear.","Start with active work: Use Dashboard for priorities, Cases for customer engagements, Tasks for due work, and Service Desk or Inbox for customer communications."],"steps":[],"callout":{"type":"TIP","text":"Confirm the active organization before creating or updating records."},"figure_key":null,"figure_caption":null},{"key":"dashboard","title":"Dashboard / Operational Overview","enabled":true,"paragraphs":["The Operational Dashboard summarizes work that needs attention. Its action cards lead to due-today Tasks, open Cases, open Tasks, open Service Requests, and unread communications."],"steps":[{"title":"Review first","body":"Review All Needing Attention for overdue, due-today, unassigned, awaiting-response, and unread signals; Cases Needing Attention and completion readiness; and Task Status for open, completed, and customer-waiting work."},{"title":"Use the supporting views","body":"Review Customer Metrics for current-year, repeat, new, and inactive relationships; Case Progress for lifecycle status; and Recent Activity for the latest visible Case events."}],"callout":{"type":"IMPORTANT","text":"A healthy dashboard means no visible item currently matches an attention rule; continue reviewing active Cases and incoming work."},"figure_key":null,"figure_caption":null},{"key":"customers","title":"Customers","enabled":true,"paragraphs":["Owners and Business Admins can use Submit Customer Data for an Excel or CSV onboarding file. This workflow is intended for initial onboarding or occasional external customer lists, not everyday customer maintenance. Submission History shows its review state and file disposition."],"steps":[{"title":"Find a customer","body":"Open Customers and search by customer details or filter by status."},{"title":"Add a customer","body":"Choose New Customer, enter the customer information, and save."},{"title":"Review the record","body":"Open a row to see contact details, address, notes, open Cases, history, and Portal Access."},{"title":"Maintain accuracy","body":"Use Edit when contact or service-address information changes."}],"callout":null,"figure_key":"customer-workspace","figure_caption":"Search the register, open a customer, or begin a new record."},{"key":"cases","title":"Cases","enabled":true,"paragraphs":["Active and Completed Cases have separate register tabs. Case progress reflects required Questions and Tasks. Document requirements record what is needed and received; private files remain in the organization's external secure document system."],"steps":[{"title":"Start","body":"Choose New Case from Dashboard or Cases when Create Case access is available."},{"title":"Complete Guided Intake","body":"Select or create the Customer, enter Case details, answer applicable Questions, resolve Requirements, review, and finish intake."},{"title":"Work the Case","body":"Monitor status, progress, readiness, assigned staff, Tasks, document requirements, communications, and activity."},{"title":"Complete","body":"Resolve blocking Questions and Tasks. When readiness is complete, choose Complete Case and record the final Tax Prep Outcome."}],"callout":null,"figure_key":"guided-intake-owner","figure_caption":"The live intake follows these six stages in order."},{"key":"tasks","title":"Tasks","enabled":true,"paragraphs":["Tasks provides a searchable register of authorized organization work. Filter by status or due date to find open, completed, waiting-on-customer, due-today, and overdue work, then open the related Case."],"steps":[{"title":"Keep work current","body":"Update status as work advances and keep due dates and assignments accurate when permitted."},{"title":"Understand workflow work","body":"Tasks may be generated by Rules or created during Guided Intake for follow-up and requirements."},{"title":"Use the Case workspace","body":"The current Case workspace does not offer standalone Task creation."},{"title":"Preserve required work","body":"Workflow-required Tasks cannot be deleted or manually reordered."},{"title":"Track customer dependencies","body":"A required document Task remains Waiting on Customer while required items are outstanding."}],"callout":null,"figure_key":"task-register-owner","figure_caption":"Use status and due-date signals to choose the next item."},{"key":"service-desk","title":"Service Desk","enabled":true,"paragraphs":["Service Desk tracks customer support work. The landing page shows request metrics and recent requests; View All Service Requests opens searchable status, priority, assignment, and updated-date details."],"steps":[{"title":"Open or create","body":"Create an internal request linked to an existing Customer, or open a request submitted through Customer Portal."},{"title":"Assign","body":"Assign the request when assignment access is available."},{"title":"Reply","body":"Use Conversation to send a staff reply and review the customer's messages."},{"title":"Advance status","body":"Update priority and move the request through New, Open, Pending Customer, On Hold, Resolved, and Closed as appropriate."}],"callout":null,"figure_key":"service-request-flow-owner","figure_caption":"A request and its replies remain connected across staff and customer views."},{"key":"customer-portal","title":"Customer Portal","enabled":true,"paragraphs":["Customer Portal gives an enabled customer a customer-safe view of Service Requests, messages and replies, visible Case progress, and current document requirements. Customers use the configured external secure document system for private files and can report that requested documents were sent.","If the customer's email changes, update the Customer record, review Portal Access, and send a fresh invitation or reactivate access as the screen directs."],"steps":[{"title":"Open Portal Access","body":"Open the Customer record and locate Portal Access."},{"title":"Enable","body":"Add a valid customer email, then choose Enable Portal Access."},{"title":"Review","body":"Review the invitation state and resend the invitation when needed."},{"title":"Maintain","body":"Disable or reactivate access from the same Customer record."}],"callout":null,"figure_key":"portal-access","figure_caption":"Manage customer access from the Customer detail page."},{"key":"communications","title":"Communications","enabled":true,"paragraphs":["Choose Inbox in navigation to open the Communications workspace. Search communication text and filter by read state, source, and date. Sources include Service Requests, Cases, Tasks, email, and other operational notifications."],"steps":[{"title":"Open notifications","body":"Opening a notification marks it read and takes you to the related work when a destination is available."},{"title":"Manage read state","body":"Use Mark all as read for your unread notifications; individual items can also be marked read or unread."},{"title":"Review visibility","body":"Owners can see organization-wide notifications, while read status remains recipient-specific."},{"title":"Review history","body":"Service Request detail retains the related conversation, communication delivery entries, and activity history."}],"callout":null,"figure_key":null,"figure_caption":null},{"key":"reports","title":"Reports & Business Reach","enabled":true,"paragraphs":["Reports combines operational period metrics with current-state workload views. Choose a reporting period, comparison, or custom dates to review Case volume and completion, Task performance, Service Request throughput, customer activity, bottlenecks, and work distribution when permitted.","Business Reach shows mapped active customers, pending locations, and unmapped customers. Open the unmapped list to identify incomplete or unusable service addresses, then correct the Customer record for a future mapping pass."],"steps":[],"callout":{"type":"IMPORTANT","text":"Business Reach reflects the current customer footprint and is independent of the reporting-period filter below it."},"figure_key":"business-reach-owner","figure_caption":"The map summarizes the current geographic customer footprint."},{"key":"users-access","title":"Users & Access","enabled":true,"paragraphs":["Users lists organization members, roles, membership status, invitation state, and recent login information. Owners and Business Admins can invite staff when their access permits it.","From a user detail page, authorized Owners/Admins can change an assignable role, activate a verified invitation, suspend or reactivate access, revoke access, resend an eligible invitation, and reassign work when required."],"steps":[{"title":"Business Owner","body":"Maintains protected organization access and can assign Business Admin, Staff Manager, and Staff User roles."},{"title":"Business Admin","body":"Manages organization operations and can assign Staff Manager and Staff User roles."},{"title":"Staff Manager","body":"Coordinates Cases, assignments, Service Requests, Tasks, Questions, and Rules according to configured permissions."},{"title":"Staff User","body":"Performs day-to-day customer, Case, Task, and communication work according to configured permissions."}],"callout":null,"figure_key":"invitation-flow","figure_caption":"Invite, verify, and activate before the member begins work."},{"key":"settings","title":"Organization Settings","enabled":true,"paragraphs":["Use Settings for the organization controls currently available to Owners and Business Admins.","Questions & Rules has its own main-navigation workspace for defining intake questions and workflow behavior when your role has management access."],"steps":[{"title":"Case Configuration","body":"Manage Case Types and Task Purposes used by the organization."},{"title":"Customer Portal","body":"Control portal availability, request submission, priority visibility, onboarding mode, secure document link, and document instructions."},{"title":"User Access","body":"Review and configure navigation and management permissions for organization roles."}],"callout":null,"figure_key":"settings-cards","figure_caption":"Only settings available to the active organization role are shown."},{"key":"common-workflows","title":"Common Workflows","enabled":true,"paragraphs":[],"steps":[{"title":"How do I add a customer?","body":"Open Customers; choose New Customer; enter identity, contact, and service-address details; save and open the customer record."},{"title":"How do I start a Case?","body":"Choose New Case; complete each Guided Intake step; resolve Requirements; review and finish intake."},{"title":"How do I assign work?","body":"Open the Case or Service Request; use Assignments or Assigned To; select eligible staff; save and confirm the assignment."},{"title":"How do I respond to a Service Request?","body":"Open Service Desk; select the request; review Conversation and details; send the reply and update status."},{"title":"How do I invite a staff member?","body":"Open Users and choose Add User; enter name, title, email, and role; send the invitation; activate after verification."},{"title":"How do I manage Customer Portal access?","body":"Open the Customer record; confirm a valid email; enable, reactivate, disable, or resend; confirm the displayed state."},{"title":"How do I find overdue work?","body":"Review All Needing Attention; open Tasks; set the due filter to Overdue; open the related Case and update the work."},{"title":"How do I review reports?","body":"Open Reports; review current Business Reach; select the reporting period and comparison; follow metric links into operational records."}],"callout":null,"figure_key":null,"figure_caption":null},{"key":"troubleshooting","title":"Tips & Troubleshooting","enabled":true,"paragraphs":[],"steps":[{"title":"An option is missing","body":"Actions are permission-aware. Confirm the active organization and ask an Owner or Business Admin to review your role and User Access settings."},{"title":"A save did not complete","body":"Keep the page open, review highlighted fields, retry once, and refresh if the screen does not update. Avoid repeated submissions while processing."},{"title":"A customer cannot enter the portal","body":"Confirm the Customer email and Portal Access state, then resend the invitation or reactivate access when the controls allow it."},{"title":"Work looks incomplete","body":"Review Case readiness, required Questions, document requirements, Tasks, assignments, and status. Some work cannot advance until a required item is resolved."}],"callout":{"type":"OWNER_ADMIN","text":"Use Users and User Access for organization access changes. Staff members should contact an Owner or Business Admin when their role or permissions need adjustment."},"figure_key":null,"figure_caption":null}]}$owner$::jsonb,
  $owner${"title":"DM3Oi How to Guide","intro":"A practical guide for Owners and Business Admins operating their organization workspace. Available actions may vary with assigned permissions.","sections":[{"key":"getting-started","title":"Getting Started","enabled":true,"paragraphs":["Know your workspace: The organization name in the shell shows the workspace you are operating. If you belong to more than one organization, use the organization selector before starting work.","Use the main navigation: Dashboard, Cases, Inbox, Service Desk, Customers, Tasks, Questions & Rules, and Reports lead to daily operational work. Users, this guide, and Settings are grouped in the organization administration area.","Keep your profile current: Open your account menu and choose My Profile to review your display name, title, and profile image. Your organization role and permissions determine which actions appear.","Start with active work: Use Dashboard for priorities, Cases for customer engagements, Tasks for due work, and Service Desk or Inbox for customer communications."],"steps":[],"callout":{"type":"TIP","text":"Confirm the active organization before creating or updating records."},"figure_key":null,"figure_caption":null},{"key":"dashboard","title":"Dashboard / Operational Overview","enabled":true,"paragraphs":["The Operational Dashboard summarizes work that needs attention. Its action cards lead to due-today Tasks, open Cases, open Tasks, open Service Requests, and unread communications."],"steps":[{"title":"Review first","body":"Review All Needing Attention for overdue, due-today, unassigned, awaiting-response, and unread signals; Cases Needing Attention and completion readiness; and Task Status for open, completed, and customer-waiting work."},{"title":"Use the supporting views","body":"Review Customer Metrics for current-year, repeat, new, and inactive relationships; Case Progress for lifecycle status; and Recent Activity for the latest visible Case events."}],"callout":{"type":"IMPORTANT","text":"A healthy dashboard means no visible item currently matches an attention rule; continue reviewing active Cases and incoming work."},"figure_key":null,"figure_caption":null},{"key":"customers","title":"Customers","enabled":true,"paragraphs":["Owners and Business Admins can use Submit Customer Data for an Excel or CSV onboarding file. This workflow is intended for initial onboarding or occasional external customer lists, not everyday customer maintenance. Submission History shows its review state and file disposition."],"steps":[{"title":"Find a customer","body":"Open Customers and search by customer details or filter by status."},{"title":"Add a customer","body":"Choose New Customer, enter the customer information, and save."},{"title":"Review the record","body":"Open a row to see contact details, address, notes, open Cases, history, and Portal Access."},{"title":"Maintain accuracy","body":"Use Edit when contact or service-address information changes."}],"callout":null,"figure_key":"customer-workspace","figure_caption":"Search the register, open a customer, or begin a new record."},{"key":"cases","title":"Cases","enabled":true,"paragraphs":["Active and Completed Cases have separate register tabs. Case progress reflects required Questions and Tasks. Document requirements record what is needed and received; private files remain in the organization's external secure document system."],"steps":[{"title":"Start","body":"Choose New Case from Dashboard or Cases when Create Case access is available."},{"title":"Complete Guided Intake","body":"Select or create the Customer, enter Case details, answer applicable Questions, resolve Requirements, review, and finish intake."},{"title":"Work the Case","body":"Monitor status, progress, readiness, assigned staff, Tasks, document requirements, communications, and activity."},{"title":"Complete","body":"Resolve blocking Questions and Tasks. When readiness is complete, choose Complete Case and record the final Tax Prep Outcome."}],"callout":null,"figure_key":"guided-intake-owner","figure_caption":"The live intake follows these six stages in order."},{"key":"tasks","title":"Tasks","enabled":true,"paragraphs":["Tasks provides a searchable register of authorized organization work. Filter by status or due date to find open, completed, waiting-on-customer, due-today, and overdue work, then open the related Case."],"steps":[{"title":"Keep work current","body":"Update status as work advances and keep due dates and assignments accurate when permitted."},{"title":"Understand workflow work","body":"Tasks may be generated by Rules or created during Guided Intake for follow-up and requirements."},{"title":"Use the Case workspace","body":"The current Case workspace does not offer standalone Task creation."},{"title":"Preserve required work","body":"Workflow-required Tasks cannot be deleted or manually reordered."},{"title":"Track customer dependencies","body":"A required document Task remains Waiting on Customer while required items are outstanding."}],"callout":null,"figure_key":"task-register-owner","figure_caption":"Use status and due-date signals to choose the next item."},{"key":"service-desk","title":"Service Desk","enabled":true,"paragraphs":["Service Desk tracks customer support work. The landing page shows request metrics and recent requests; View All Service Requests opens searchable status, priority, assignment, and updated-date details."],"steps":[{"title":"Open or create","body":"Create an internal request linked to an existing Customer, or open a request submitted through Customer Portal."},{"title":"Assign","body":"Assign the request when assignment access is available."},{"title":"Reply","body":"Use Conversation to send a staff reply and review the customer's messages."},{"title":"Advance status","body":"Update priority and move the request through New, Open, Pending Customer, On Hold, Resolved, and Closed as appropriate."}],"callout":null,"figure_key":"service-request-flow-owner","figure_caption":"A request and its replies remain connected across staff and customer views."},{"key":"customer-portal","title":"Customer Portal","enabled":true,"paragraphs":["Customer Portal gives an enabled customer a customer-safe view of Service Requests, messages and replies, visible Case progress, and current document requirements. Customers use the configured external secure document system for private files and can report that requested documents were sent.","If the customer's email changes, update the Customer record, review Portal Access, and send a fresh invitation or reactivate access as the screen directs."],"steps":[{"title":"Open Portal Access","body":"Open the Customer record and locate Portal Access."},{"title":"Enable","body":"Add a valid customer email, then choose Enable Portal Access."},{"title":"Review","body":"Review the invitation state and resend the invitation when needed."},{"title":"Maintain","body":"Disable or reactivate access from the same Customer record."}],"callout":null,"figure_key":"portal-access","figure_caption":"Manage customer access from the Customer detail page."},{"key":"communications","title":"Communications","enabled":true,"paragraphs":["Choose Inbox in navigation to open the Communications workspace. Search communication text and filter by read state, source, and date. Sources include Service Requests, Cases, Tasks, email, and other operational notifications."],"steps":[{"title":"Open notifications","body":"Opening a notification marks it read and takes you to the related work when a destination is available."},{"title":"Manage read state","body":"Use Mark all as read for your unread notifications; individual items can also be marked read or unread."},{"title":"Review visibility","body":"Owners can see organization-wide notifications, while read status remains recipient-specific."},{"title":"Review history","body":"Service Request detail retains the related conversation, communication delivery entries, and activity history."}],"callout":null,"figure_key":null,"figure_caption":null},{"key":"reports","title":"Reports & Business Reach","enabled":true,"paragraphs":["Reports combines operational period metrics with current-state workload views. Choose a reporting period, comparison, or custom dates to review Case volume and completion, Task performance, Service Request throughput, customer activity, bottlenecks, and work distribution when permitted.","Business Reach shows mapped active customers, pending locations, and unmapped customers. Open the unmapped list to identify incomplete or unusable service addresses, then correct the Customer record for a future mapping pass."],"steps":[],"callout":{"type":"IMPORTANT","text":"Business Reach reflects the current customer footprint and is independent of the reporting-period filter below it."},"figure_key":"business-reach-owner","figure_caption":"The map summarizes the current geographic customer footprint."},{"key":"users-access","title":"Users & Access","enabled":true,"paragraphs":["Users lists organization members, roles, membership status, invitation state, and recent login information. Owners and Business Admins can invite staff when their access permits it.","From a user detail page, authorized Owners/Admins can change an assignable role, activate a verified invitation, suspend or reactivate access, revoke access, resend an eligible invitation, and reassign work when required."],"steps":[{"title":"Business Owner","body":"Maintains protected organization access and can assign Business Admin, Staff Manager, and Staff User roles."},{"title":"Business Admin","body":"Manages organization operations and can assign Staff Manager and Staff User roles."},{"title":"Staff Manager","body":"Coordinates Cases, assignments, Service Requests, Tasks, Questions, and Rules according to configured permissions."},{"title":"Staff User","body":"Performs day-to-day customer, Case, Task, and communication work according to configured permissions."}],"callout":null,"figure_key":"invitation-flow","figure_caption":"Invite, verify, and activate before the member begins work."},{"key":"settings","title":"Organization Settings","enabled":true,"paragraphs":["Use Settings for the organization controls currently available to Owners and Business Admins.","Questions & Rules has its own main-navigation workspace for defining intake questions and workflow behavior when your role has management access."],"steps":[{"title":"Case Configuration","body":"Manage Case Types and Task Purposes used by the organization."},{"title":"Customer Portal","body":"Control portal availability, request submission, priority visibility, onboarding mode, secure document link, and document instructions."},{"title":"User Access","body":"Review and configure navigation and management permissions for organization roles."}],"callout":null,"figure_key":"settings-cards","figure_caption":"Only settings available to the active organization role are shown."},{"key":"common-workflows","title":"Common Workflows","enabled":true,"paragraphs":[],"steps":[{"title":"How do I add a customer?","body":"Open Customers; choose New Customer; enter identity, contact, and service-address details; save and open the customer record."},{"title":"How do I start a Case?","body":"Choose New Case; complete each Guided Intake step; resolve Requirements; review and finish intake."},{"title":"How do I assign work?","body":"Open the Case or Service Request; use Assignments or Assigned To; select eligible staff; save and confirm the assignment."},{"title":"How do I respond to a Service Request?","body":"Open Service Desk; select the request; review Conversation and details; send the reply and update status."},{"title":"How do I invite a staff member?","body":"Open Users and choose Add User; enter name, title, email, and role; send the invitation; activate after verification."},{"title":"How do I manage Customer Portal access?","body":"Open the Customer record; confirm a valid email; enable, reactivate, disable, or resend; confirm the displayed state."},{"title":"How do I find overdue work?","body":"Review All Needing Attention; open Tasks; set the due filter to Overdue; open the related Case and update the work."},{"title":"How do I review reports?","body":"Open Reports; review current Business Reach; select the reporting period and comparison; follow metric links into operational records."}],"callout":null,"figure_key":null,"figure_caption":null},{"key":"troubleshooting","title":"Tips & Troubleshooting","enabled":true,"paragraphs":[],"steps":[{"title":"An option is missing","body":"Actions are permission-aware. Confirm the active organization and ask an Owner or Business Admin to review your role and User Access settings."},{"title":"A save did not complete","body":"Keep the page open, review highlighted fields, retry once, and refresh if the screen does not update. Avoid repeated submissions while processing."},{"title":"A customer cannot enter the portal","body":"Confirm the Customer email and Portal Access state, then resend the invitation or reactivate access when the controls allow it."},{"title":"Work looks incomplete","body":"Review Case readiness, required Questions, document requirements, Tasks, assignments, and status. Some work cannot advance until a required item is resolved."}],"callout":{"type":"OWNER_ADMIN","text":"Use Users and User Access for organization access changes. Staff members should contact an Owner or Business Admin when their role or permissions need adjustment."},"figure_key":null,"figure_caption":null}]}$owner$::jsonb,
  1,
  1
),
(
  'STAFF',
  $staff${"title":"DM3Oi Staff How to Guide","intro":"A practical guide to day-to-day organization work for Staff Managers and Staff Users. Available actions may vary with assigned permissions.","sections":[{"key":"getting-started","title":"Getting Started","enabled":true,"paragraphs":["Know your workspace: The organization name in the application shell identifies the workspace where you are working. Use the main navigation to move between daily work areas.","Find assigned work: Begin with Dashboard for attention items, Tasks for due work, Cases for customer engagements, and Service Desk or Inbox for customer requests.","Keep your profile current: Open your account menu and choose My Profile to review your display name, title, and profile image.","Expect permission differences: Your role and assigned permissions determine which links and actions appear. Staff Managers normally have additional assignment and coordination actions."],"steps":[],"callout":{"type":"TIP","text":"Confirm that you are in the correct organization before updating customer work."},"figure_key":null,"figure_caption":null},{"key":"dashboard","title":"Dashboard / Operational Overview","enabled":true,"paragraphs":["The Operational Dashboard brings together Cases, Tasks, Service Requests, unread communications, and other work that may need attention."],"steps":[{"title":"Review first","body":"Review overdue and due-today work, Cases or Tasks needing attention, and new or unresolved Service Requests."},{"title":"Then check progress","body":"Review Case readiness and completion, open versus completed Tasks, and recent visible Case activity."}],"callout":{"type":"IMPORTANT","text":"A clear attention list does not replace reviewing your assigned Cases and incoming work."},"figure_key":null,"figure_caption":null},{"key":"customers","title":"Customers","enabled":true,"paragraphs":["Customer creation and editing are available to the standard staff roles, but an organization can adjust permissions. File-based customer onboarding is not part of the staff workflow."],"steps":[{"title":"Find","body":"Open Customers and search by customer details or filter by status."},{"title":"Review","body":"Open a row to see contact information, address, notes, history, and related Cases."},{"title":"Create","body":"When New Customer is available, enter customer information and save."},{"title":"Update","body":"Use Edit when customer contact or service-address information changes."}],"callout":null,"figure_key":"customer-register","figure_caption":"Search the register and open the customer record you need."},{"key":"cases","title":"Cases","enabled":true,"paragraphs":["Document requirements record what is needed and whether it was received. Follow your organization's approved secure-document process for private files."],"steps":[{"title":"Find a Case","body":"Open Cases and use the active or completed view to locate it."},{"title":"Start when permitted","body":"Staff Managers normally see New Case and complete Guided Intake. Staff Users begin with existing assigned Cases unless case creation has been granted."},{"title":"Work requirements","body":"Review status, assigned staff, Questions, required Tasks, document requirements, communications, and activity."},{"title":"Complete","body":"Resolve blocking Questions and Tasks. When readiness is complete, use Complete Case and record the final outcome."}],"callout":null,"figure_key":"guided-intake-staff","figure_caption":"Staff Managers normally use these six stages when starting a Case."},{"key":"tasks","title":"Tasks","enabled":true,"paragraphs":[],"steps":[{"title":"Review work","body":"Open Tasks to review authorized work by title, Case, status, and due date."},{"title":"Filter","body":"Use search and status or due-date filters to find assigned, open, or overdue work."},{"title":"Update","body":"Open the related Case to update the Task and its supporting work."},{"title":"Coordinate","body":"Staff Managers normally create, assign, and coordinate Tasks; Staff Users update work available to them."}],"callout":{"type":"IMPORTANT","text":"Workflow-required Tasks cannot be deleted or manually reordered. Complete the required work or resolve the Case condition that created it."},"figure_key":"task-register-staff","figure_caption":"Use status and due dates to prioritize work."},{"key":"service-desk","title":"Service Desk","enabled":true,"paragraphs":["Replies become part of the request conversation. Keep responses focused on the customer's question and use the approved document channel for private files."],"steps":[{"title":"Review requests","body":"Open Service Desk to review customer and internally created requests."},{"title":"Open details","body":"Read the description, conversation, activity, and linked Case."},{"title":"Reply","body":"When assigned, reply to the customer and update the request as work progresses."},{"title":"Coordinate","body":"Staff Managers normally assign requests, change coordination details, and oversee status."}],"callout":null,"figure_key":"service-request-flow-staff","figure_caption":"An assigned request moves through staff review, reply, and resolution."},{"key":"customer-portal","title":"Customer Portal","enabled":true,"paragraphs":["Customers with active access can submit Service Requests, read staff replies, and review visible Case or document requirements. Portal messages appear in related operational records."],"steps":[{"title":"Respond","body":"Respond from the Service Request or Case source shown by the notification."},{"title":"Maintain requirements","body":"Keep requirement statuses current so customers receive accurate guidance."},{"title":"Escalate access issues","body":"If a customer cannot access the portal, record the issue and contact an Owner or Business Admin."}],"callout":{"type":"STAFF_BOUNDARY","text":"Portal access activation, invitation management, and portal-wide settings are not staff actions."},"figure_key":"portal-interaction","figure_caption":"Customer activity returns to the organization workspace for staff follow-up."},{"key":"communications","title":"Inbox / Communications","enabled":true,"paragraphs":["Response controls depend on your permission and whether work is assigned to you. If an action is unavailable, ask the responsible Staff Manager to review assignment."],"steps":[{"title":"Review","body":"Use Inbox to review unread and recent customer communication notifications."},{"title":"Open","body":"Open a notification to reach its Service Request or Case source."},{"title":"Track read state","body":"Mark items read as you review them, or use the available bulk read action."},{"title":"Check history","body":"Review the source conversation and activity history before responding."}],"callout":null,"figure_key":"inbox-pattern","figure_caption":"Open unread activity, review its source, then complete the follow-up."},{"key":"questions-rules","title":"Questions & Rules","enabled":true,"paragraphs":["Questions define information required during Case work. Staff Users can view configured Questions and respond within Cases. Staff Managers normally can add or edit Questions and can view Rules that automate requirements or work."],"steps":[{"title":"During Case work","body":"Read help text, provide an accurate response, and resolve any follow-up requirement created by the response."},{"title":"Manager coordination","body":"When manager controls are available, keep Question wording, options, order, and active state aligned with the organization's workflow. Rule editing remains unavailable unless separately permitted."}],"callout":null,"figure_key":null,"figure_caption":null},{"key":"reports","title":"Reports","enabled":true,"paragraphs":[],"steps":[{"title":"Review measures","body":"Open Reports to review operational Case, Task, Customer, and Service Request measures."},{"title":"Select a period","body":"Use reporting-period controls to compare work in the selected time range."},{"title":"Review reach","body":"Use Business Reach to understand mapped customer locations and review unmapped locations when available."}],"callout":{"type":"IMPORTANT","text":"Business Reach reflects the current customer footprint and is independent of the reporting-period filter below it."},"figure_key":"business-reach-staff","figure_caption":"Mapped and unmapped indicators summarize the current customer footprint."},{"key":"common-workflows","title":"Common Staff Workflows","enabled":true,"paragraphs":[],"steps":[{"title":"How do I find a customer?","body":"Open Customers; search or filter the register; open the matching row."},{"title":"How do I open or start a Case?","body":"Open Cases; search for existing work; if New Case is available, complete Guided Intake."},{"title":"How do I complete assigned work?","body":"Open Tasks or the related Case; review requirements and due date; update the Task after completing the work."},{"title":"How do I respond to a request?","body":"Open Service Desk; select the assigned request; review history, reply, and update status."},{"title":"How do I reply to a customer?","body":"Open the Inbox notification; review the source conversation; reply where the assigned-work control appears."},{"title":"How do I review required documents?","body":"Open the Case; review document requirements; update receipt status after verification."},{"title":"How do I find overdue work?","body":"Review Dashboard attention items; open Tasks; apply the overdue due-date filter."},{"title":"How do I review reports?","body":"Open Reports; select a reporting period; review metrics and current Business Reach."}],"callout":null,"figure_key":null,"figure_caption":null},{"key":"troubleshooting","title":"Tips & Troubleshooting","enabled":true,"paragraphs":[],"steps":[{"title":"If a page does not update","body":"Refresh once and retry the action; confirm required fields; return to the register and reopen the record."},{"title":"If an option does not appear","body":"The action may depend on role, permission, or assignment, and the record may be read-only. Contact an Owner or Business Admin for access changes."}],"callout":{"type":"TIP","text":"Include the page name and a brief description of what you were doing when asking for help. Do not include private customer documents."},"figure_key":null,"figure_caption":null}]}$staff$::jsonb,
  $staff${"title":"DM3Oi Staff How to Guide","intro":"A practical guide to day-to-day organization work for Staff Managers and Staff Users. Available actions may vary with assigned permissions.","sections":[{"key":"getting-started","title":"Getting Started","enabled":true,"paragraphs":["Know your workspace: The organization name in the application shell identifies the workspace where you are working. Use the main navigation to move between daily work areas.","Find assigned work: Begin with Dashboard for attention items, Tasks for due work, Cases for customer engagements, and Service Desk or Inbox for customer requests.","Keep your profile current: Open your account menu and choose My Profile to review your display name, title, and profile image.","Expect permission differences: Your role and assigned permissions determine which links and actions appear. Staff Managers normally have additional assignment and coordination actions."],"steps":[],"callout":{"type":"TIP","text":"Confirm that you are in the correct organization before updating customer work."},"figure_key":null,"figure_caption":null},{"key":"dashboard","title":"Dashboard / Operational Overview","enabled":true,"paragraphs":["The Operational Dashboard brings together Cases, Tasks, Service Requests, unread communications, and other work that may need attention."],"steps":[{"title":"Review first","body":"Review overdue and due-today work, Cases or Tasks needing attention, and new or unresolved Service Requests."},{"title":"Then check progress","body":"Review Case readiness and completion, open versus completed Tasks, and recent visible Case activity."}],"callout":{"type":"IMPORTANT","text":"A clear attention list does not replace reviewing your assigned Cases and incoming work."},"figure_key":null,"figure_caption":null},{"key":"customers","title":"Customers","enabled":true,"paragraphs":["Customer creation and editing are available to the standard staff roles, but an organization can adjust permissions. File-based customer onboarding is not part of the staff workflow."],"steps":[{"title":"Find","body":"Open Customers and search by customer details or filter by status."},{"title":"Review","body":"Open a row to see contact information, address, notes, history, and related Cases."},{"title":"Create","body":"When New Customer is available, enter customer information and save."},{"title":"Update","body":"Use Edit when customer contact or service-address information changes."}],"callout":null,"figure_key":"customer-register","figure_caption":"Search the register and open the customer record you need."},{"key":"cases","title":"Cases","enabled":true,"paragraphs":["Document requirements record what is needed and whether it was received. Follow your organization's approved secure-document process for private files."],"steps":[{"title":"Find a Case","body":"Open Cases and use the active or completed view to locate it."},{"title":"Start when permitted","body":"Staff Managers normally see New Case and complete Guided Intake. Staff Users begin with existing assigned Cases unless case creation has been granted."},{"title":"Work requirements","body":"Review status, assigned staff, Questions, required Tasks, document requirements, communications, and activity."},{"title":"Complete","body":"Resolve blocking Questions and Tasks. When readiness is complete, use Complete Case and record the final outcome."}],"callout":null,"figure_key":"guided-intake-staff","figure_caption":"Staff Managers normally use these six stages when starting a Case."},{"key":"tasks","title":"Tasks","enabled":true,"paragraphs":[],"steps":[{"title":"Review work","body":"Open Tasks to review authorized work by title, Case, status, and due date."},{"title":"Filter","body":"Use search and status or due-date filters to find assigned, open, or overdue work."},{"title":"Update","body":"Open the related Case to update the Task and its supporting work."},{"title":"Coordinate","body":"Staff Managers normally create, assign, and coordinate Tasks; Staff Users update work available to them."}],"callout":{"type":"IMPORTANT","text":"Workflow-required Tasks cannot be deleted or manually reordered. Complete the required work or resolve the Case condition that created it."},"figure_key":"task-register-staff","figure_caption":"Use status and due dates to prioritize work."},{"key":"service-desk","title":"Service Desk","enabled":true,"paragraphs":["Replies become part of the request conversation. Keep responses focused on the customer's question and use the approved document channel for private files."],"steps":[{"title":"Review requests","body":"Open Service Desk to review customer and internally created requests."},{"title":"Open details","body":"Read the description, conversation, activity, and linked Case."},{"title":"Reply","body":"When assigned, reply to the customer and update the request as work progresses."},{"title":"Coordinate","body":"Staff Managers normally assign requests, change coordination details, and oversee status."}],"callout":null,"figure_key":"service-request-flow-staff","figure_caption":"An assigned request moves through staff review, reply, and resolution."},{"key":"customer-portal","title":"Customer Portal","enabled":true,"paragraphs":["Customers with active access can submit Service Requests, read staff replies, and review visible Case or document requirements. Portal messages appear in related operational records."],"steps":[{"title":"Respond","body":"Respond from the Service Request or Case source shown by the notification."},{"title":"Maintain requirements","body":"Keep requirement statuses current so customers receive accurate guidance."},{"title":"Escalate access issues","body":"If a customer cannot access the portal, record the issue and contact an Owner or Business Admin."}],"callout":{"type":"STAFF_BOUNDARY","text":"Portal access activation, invitation management, and portal-wide settings are not staff actions."},"figure_key":"portal-interaction","figure_caption":"Customer activity returns to the organization workspace for staff follow-up."},{"key":"communications","title":"Inbox / Communications","enabled":true,"paragraphs":["Response controls depend on your permission and whether work is assigned to you. If an action is unavailable, ask the responsible Staff Manager to review assignment."],"steps":[{"title":"Review","body":"Use Inbox to review unread and recent customer communication notifications."},{"title":"Open","body":"Open a notification to reach its Service Request or Case source."},{"title":"Track read state","body":"Mark items read as you review them, or use the available bulk read action."},{"title":"Check history","body":"Review the source conversation and activity history before responding."}],"callout":null,"figure_key":"inbox-pattern","figure_caption":"Open unread activity, review its source, then complete the follow-up."},{"key":"questions-rules","title":"Questions & Rules","enabled":true,"paragraphs":["Questions define information required during Case work. Staff Users can view configured Questions and respond within Cases. Staff Managers normally can add or edit Questions and can view Rules that automate requirements or work."],"steps":[{"title":"During Case work","body":"Read help text, provide an accurate response, and resolve any follow-up requirement created by the response."},{"title":"Manager coordination","body":"When manager controls are available, keep Question wording, options, order, and active state aligned with the organization's workflow. Rule editing remains unavailable unless separately permitted."}],"callout":null,"figure_key":null,"figure_caption":null},{"key":"reports","title":"Reports","enabled":true,"paragraphs":[],"steps":[{"title":"Review measures","body":"Open Reports to review operational Case, Task, Customer, and Service Request measures."},{"title":"Select a period","body":"Use reporting-period controls to compare work in the selected time range."},{"title":"Review reach","body":"Use Business Reach to understand mapped customer locations and review unmapped locations when available."}],"callout":{"type":"IMPORTANT","text":"Business Reach reflects the current customer footprint and is independent of the reporting-period filter below it."},"figure_key":"business-reach-staff","figure_caption":"Mapped and unmapped indicators summarize the current customer footprint."},{"key":"common-workflows","title":"Common Staff Workflows","enabled":true,"paragraphs":[],"steps":[{"title":"How do I find a customer?","body":"Open Customers; search or filter the register; open the matching row."},{"title":"How do I open or start a Case?","body":"Open Cases; search for existing work; if New Case is available, complete Guided Intake."},{"title":"How do I complete assigned work?","body":"Open Tasks or the related Case; review requirements and due date; update the Task after completing the work."},{"title":"How do I respond to a request?","body":"Open Service Desk; select the assigned request; review history, reply, and update status."},{"title":"How do I reply to a customer?","body":"Open the Inbox notification; review the source conversation; reply where the assigned-work control appears."},{"title":"How do I review required documents?","body":"Open the Case; review document requirements; update receipt status after verification."},{"title":"How do I find overdue work?","body":"Review Dashboard attention items; open Tasks; apply the overdue due-date filter."},{"title":"How do I review reports?","body":"Open Reports; select a reporting period; review metrics and current Business Reach."}],"callout":null,"figure_key":null,"figure_caption":null},{"key":"troubleshooting","title":"Tips & Troubleshooting","enabled":true,"paragraphs":[],"steps":[{"title":"If a page does not update","body":"Refresh once and retry the action; confirm required fields; return to the register and reopen the record."},{"title":"If an option does not appear","body":"The action may depend on role, permission, or assignment, and the record may be read-only. Contact an Owner or Business Admin for access changes."}],"callout":{"type":"TIP","text":"Include the page name and a brief description of what you were doing when asking for help. Do not include private customer documents."},"figure_key":null,"figure_caption":null}]}$staff$::jsonb,
  1,
  1
);

create or replace function public.get_how_to_guide_template_for_admin(
  target_guide_key text
)
returns public.how_to_guide_templates
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result public.how_to_guide_templates;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if target_guide_key not in ('OWNER_ADMIN','STAFF') then
    raise exception 'invalid guide key'
      using errcode = '22023';
  end if;

  select *
  into result
  from public.how_to_guide_templates
  where guide_key = target_guide_key;

  if not found then
    raise exception 'guide template not found'
      using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create or replace function public.save_how_to_guide_draft(
  target_guide_key text,
  target_content jsonb
)
returns public.how_to_guide_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result public.how_to_guide_templates;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if target_guide_key not in ('OWNER_ADMIN','STAFF')
     or not public.validate_how_to_guide_content(
       target_guide_key,
       target_content
     )
  then
    raise exception 'invalid guide content'
      using errcode = '22023';
  end if;

  update public.how_to_guide_templates
  set
    draft_content = target_content,
    draft_revision = draft_revision + 1,
    draft_updated_at = now(),
    draft_updated_by = actor,
    updated_at = now()
  where guide_key = target_guide_key
  returning *
  into result;

  if not found then
    raise exception 'guide template not found'
      using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create or replace function public.publish_how_to_guide(
  target_guide_key text
)
returns public.how_to_guide_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_template public.how_to_guide_templates;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if target_guide_key not in ('OWNER_ADMIN','STAFF') then
    raise exception 'invalid guide key'
      using errcode = '22023';
  end if;

  select *
  into current_template
  from public.how_to_guide_templates
  where guide_key = target_guide_key
  for update;

  if not found then
    raise exception 'guide template not found'
      using errcode = 'P0002';
  end if;

  if not public.validate_how_to_guide_content(
    target_guide_key,
    current_template.draft_content
  ) then
    raise exception 'invalid guide content'
      using errcode = '22023';
  end if;

  update public.how_to_guide_templates
  set
    published_content = current_template.draft_content,
    published_revision = published_revision + 1,
    published_at = now(),
    published_by = actor,
    updated_at = now()
  where guide_key = target_guide_key
  returning *
  into current_template;

  return current_template;
end;
$$;

create or replace function public.get_published_how_to_guide_server(
  target_guide_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if target_guide_key not in ('OWNER_ADMIN','STAFF') then
    raise exception 'invalid guide key'
      using errcode = '22023';
  end if;

  select published_content
  into result
  from public.how_to_guide_templates
  where guide_key = target_guide_key;

  if not found then
    raise exception 'guide template not found'
      using errcode = 'P0002';
  end if;

  return result;
end;
$$;

revoke all
on function public.is_valid_how_to_guide_text(text, integer)
from public, anon, authenticated, service_role;

revoke all
on function public.validate_how_to_guide_content(text, jsonb)
from public, anon, authenticated, service_role;

revoke all
on function public.get_how_to_guide_template_for_admin(text)
from public, anon, authenticated, service_role;

revoke all
on function public.save_how_to_guide_draft(text, jsonb)
from public, anon, authenticated, service_role;

revoke all
on function public.publish_how_to_guide(text)
from public, anon, authenticated, service_role;

revoke all
on function public.get_published_how_to_guide_server(text)
from public, anon, authenticated, service_role;

grant execute
on function public.get_how_to_guide_template_for_admin(text)
to authenticated;

grant execute
on function public.save_how_to_guide_draft(text, jsonb)
to authenticated;

grant execute
on function public.publish_how_to_guide(text)
to authenticated;

grant execute
on function public.get_published_how_to_guide_server(text)
to service_role;

commit;
