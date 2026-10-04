export const howToGuideKeys = ["OWNER_ADMIN", "STAFF"] as const;
export type HowToGuideKey = (typeof howToGuideKeys)[number];

export const howToGuideCalloutTypes = [
  "TIP",
  "IMPORTANT",
  "OWNER_ADMIN",
  "STAFF_BOUNDARY",
] as const;
export type HowToGuideCalloutType = (typeof howToGuideCalloutTypes)[number];

export const howToGuideAllowedCalloutTypes = {
  OWNER_ADMIN: ["TIP", "IMPORTANT", "OWNER_ADMIN"],
  STAFF: ["TIP", "IMPORTANT", "STAFF_BOUNDARY"],
} as const;

export const howToGuideSectionKeys = {
  OWNER_ADMIN: [
    "getting-started", "dashboard", "customers", "cases", "tasks", "goals",
    "service-desk", "customer-portal", "communications", "reports",
    "users-access", "settings", "common-workflows", "troubleshooting",
  ],
  STAFF: [
    "getting-started", "dashboard", "customers", "cases", "tasks",
    "service-desk", "customer-portal", "communications", "questions-rules",
    "reports", "common-workflows", "troubleshooting",
  ],
} as const;

export const howToGuideFigureKeys = {
  OWNER_ADMIN: [
    "customer-workspace", "guided-intake-owner", "task-register-owner",
    "service-request-flow-owner", "portal-access", "business-reach-owner",
    "invitation-flow", "settings-cards",
  ],
  STAFF: [
    "customer-register", "guided-intake-staff", "task-register-staff",
    "service-request-flow-staff", "portal-interaction", "inbox-pattern",
    "business-reach-staff",
  ],
} as const;

export type HowToGuideFigureKey =
  (typeof howToGuideFigureKeys)[HowToGuideKey][number];

export const howToGuideTextAlignments = [
  "left",
  "center",
  "right",
] as const;

export type HowToGuideTextAlignment =
  (typeof howToGuideTextAlignments)[number];

export type HowToGuideRichTextRun = {
  text: string;
  bold?: true;
  italic?: true;
  underline?: true;
};

export type HowToGuideRichText = {
  align: HowToGuideTextAlignment;
  runs: HowToGuideRichTextRun[];
};

export type HowToGuideText = string | HowToGuideRichText;

export type HowToGuideStep = {
  title: string;
  body: HowToGuideText;
};

export type HowToGuideCallout = {
  type: HowToGuideCalloutType;
  text: HowToGuideText;
};

export type HowToGuideSection = {
  key: string;
  title: string;
  enabled: boolean;
  paragraphs: HowToGuideText[];
  steps: HowToGuideStep[];
  callout: HowToGuideCallout | null;
  figure_key: HowToGuideFigureKey | null;
  figure_caption: HowToGuideText | null;
};
export type HowToGuideContent = {
  title: string;
  intro: string;
  sections: HowToGuideSection[];
};

const ownerAdminContent: HowToGuideContent = {
  title: "DM3Oi How to Guide",
  intro: "A practical guide for Owners and Business Admins operating their organization workspace. Available actions may vary with assigned permissions.",
  sections: [
    { key: "getting-started", title: "Getting Started", enabled: true, paragraphs: [
      "Know your workspace: The organization name in the shell shows the workspace you are operating. If you belong to more than one organization, use the organization selector before starting work.",
      "Use the main navigation: Dashboard, Service Desk, Inbox, Cases, Tasks, Goals, Reports, and Customers lead to daily operational work. Users, this guide, and Settings are grouped in the organization administration area; Questions & Rules is available under Settings.",
      "Keep your profile current: Open your account menu and choose My Profile to review your display name, title, and profile image. Your organization role and permissions determine which actions appear.",
      "Start with active work: Use Dashboard for priorities, Cases for customer engagements, Tasks for due work, and Service Desk or Inbox for customer communications.",
    ], steps: [], callout: { type: "TIP", text: "Confirm the active organization before creating or updating records." }, figure_key: null, figure_caption: null },
    { key: "dashboard", title: "Dashboard / Operational Overview", enabled: true, paragraphs: [
      "The Operational Dashboard summarizes work that needs attention. Its action cards lead to due-today Tasks, open Cases, open Tasks, open Service Requests, and unread communications.",
    ], steps: [
      { title: "Review first", body: "Review All Needing Attention for overdue, due-today, unassigned, awaiting-response, and unread signals; Cases Needing Attention and completion readiness; and Task Status for open, completed, and customer-waiting work." },
      { title: "Use the supporting views", body: "Review Customer Metrics for current-year, repeat, new, and inactive relationships; Case Progress for lifecycle status; and Recent Activity for the latest visible Case events." },
    ], callout: { type: "IMPORTANT", text: "A healthy dashboard means no visible item currently matches an attention rule; continue reviewing active Cases and incoming work." }, figure_key: null, figure_caption: null },
    { key: "customers", title: "Customers", enabled: true, paragraphs: [
      "Owners and Business Admins can use Submit Customer Data for an Excel or CSV onboarding file. This workflow is intended for initial onboarding or occasional external customer lists, not everyday customer maintenance. Submission History shows its review state and file disposition.",
    ], steps: [
      { title: "Find a customer", body: "Open Customers and search by customer details or filter by status." },
      { title: "Add a customer", body: "Choose New Customer, enter the customer information, and save." },
      { title: "Review the record", body: "Open a row to see contact details, address, notes, open Cases, history, and Portal Access." },
      { title: "Maintain accuracy", body: "Use Edit when contact or service-address information changes." },
    ], callout: null, figure_key: "customer-workspace", figure_caption: "Search the register, open a customer, or begin a new record." },
    { key: "cases", title: "Cases", enabled: true, paragraphs: [
      "Active and Completed Cases have separate register tabs. Case progress reflects required Questions and Tasks. Document requirements record what is needed and received; private files remain in the organization's external secure document system.",
    ], steps: [
      { title: "Start", body: "Choose New Case from Dashboard or Cases when Create Case access is available." },
      { title: "Complete Guided Intake", body: "Select or create the Customer, enter Case details, answer applicable Questions, resolve Requirements, review, and finish intake." },
      { title: "Work the Case", body: "Monitor status, progress, readiness, assigned staff, Tasks, document requirements, communications, and activity." },
      { title: "Complete", body: "Resolve blocking Questions and Tasks. When readiness is complete, choose Complete Case and record the final Tax Prep Outcome." },
    ], callout: null, figure_key: "guided-intake-owner", figure_caption: "The live intake follows these six stages in order." },
    { key: "tasks", title: "Tasks", enabled: true, paragraphs: [
      "Tasks provides a searchable register of authorized organization work. Filter by status or due date to find open, completed, waiting-on-customer, due-today, and overdue work, then open the related Case.",
    ], steps: [
      { title: "Keep work current", body: "Update status as work advances and keep due dates and assignments accurate when permitted." },
      { title: "Understand workflow work", body: "Tasks may be generated by Rules or created during Guided Intake for follow-up and requirements." },
      { title: "Use the Case workspace", body: "The current Case workspace does not offer standalone Task creation." },
      { title: "Preserve required work", body: "Workflow-required Tasks cannot be deleted or manually reordered." },
      { title: "Track customer dependencies", body: "A required document Task remains Waiting on Customer while required items are outstanding." },
    ], callout: null, figure_key: "task-register-owner", figure_caption: "Use status and due-date signals to choose the next item." },
    { key: "goals", title: "Goals", enabled: true, paragraphs: [
      "Goals track measurable organization or individual outcomes over a defined period. Starter Goals are editable examples and begin as Draft so they do not become performance commitments until an Owner or Business Admin reviews and activates them.",
      "Goal progress is entered manually in this release. Review the target, baseline, ownership, and period before activation, then record progress from the Goal detail page as work advances.",
    ], steps: [
      { title: "Start with an example or blank Goal", body: "Choose New Goal, then select a starter template or begin with a Blank Goal. Starter values can be changed before saving." },
      { title: "Review the commitment", body: "Confirm the measure, direction, target, baseline, period, and ownership before activating the Goal." },
      { title: "Assign individual Goals deliberately", body: "Individual starter Goals require an explicit active organization user. DM3Oi does not automatically assign an employee." },
      { title: "Record progress", body: "After activation, record the current actual value and as-of date. DM3Oi uses the Goal definition and period to show its current performance state." },
    ], callout: { type: "IMPORTANT", text: "Starter Goals remain Draft until explicitly activated. They are examples for review, not automatic commitments." }, figure_key: null, figure_caption: null },
    { key: "service-desk", title: "Service Desk", enabled: true, paragraphs: [
      "Service Desk tracks customer support work. The landing page shows request metrics and recent requests; View All Service Requests opens searchable status, priority, assignment, and updated-date details.",
    ], steps: [
      { title: "Open or create", body: "Create an internal request linked to an existing Customer, or open a request submitted through Customer Portal." },
      { title: "Assign", body: "Assign the request when assignment access is available." },
      { title: "Reply", body: "Use Conversation to send a staff reply and review the customer's messages." },
      { title: "Advance status", body: "Update priority and move the request through New, Open, Pending Customer, On Hold, Resolved, and Closed as appropriate." },
    ], callout: null, figure_key: "service-request-flow-owner", figure_caption: "A request and its replies remain connected across staff and customer views." },
    { key: "customer-portal", title: "Customer Portal", enabled: true, paragraphs: [
      "Customer Portal gives an enabled customer a customer-safe view of Service Requests, messages and replies, visible Case progress, and current document requirements. Customers use the configured external secure document system for private files and can report that requested documents were sent.",
      "If the customer's email changes, update the Customer record, review Portal Access, and send a fresh invitation or reactivate access as the screen directs.",
    ], steps: [
      { title: "Open Portal Access", body: "Open the Customer record and locate Portal Access." },
      { title: "Enable", body: "Add a valid customer email, then choose Enable Portal Access." },
      { title: "Review", body: "Review the invitation state and resend the invitation when needed." },
      { title: "Maintain", body: "Disable or reactivate access from the same Customer record." },
    ], callout: null, figure_key: "portal-access", figure_caption: "Manage customer access from the Customer detail page." },
    { key: "communications", title: "Communications", enabled: true, paragraphs: [
      "Choose Inbox in navigation to open the Communications workspace. Search communication text and filter by read state, source, and date. Sources include Service Requests, Cases, Tasks, email, and other operational notifications.",
    ], steps: [
      { title: "Open notifications", body: "Opening a notification marks it read and takes you to the related work when a destination is available." },
      { title: "Manage read state", body: "Use Mark all as read for your unread notifications; individual items can also be marked read or unread." },
      { title: "Review visibility", body: "Owners can see organization-wide notifications, while read status remains recipient-specific." },
      { title: "Review history", body: "Service Request detail retains the related conversation, communication delivery entries, and activity history." },
    ], callout: null, figure_key: null, figure_caption: null },
    { key: "reports", title: "Reports & Business Reach", enabled: true, paragraphs: [
      "Reports combines operational period metrics with current-state workload views. Choose a reporting period, comparison, or custom dates to review Case volume and completion, Task performance, Service Request throughput, customer activity, bottlenecks, and work distribution when permitted.",
      "Business Reach shows mapped active customers, pending locations, and unmapped customers. Open the unmapped list to identify incomplete or unusable service addresses, then correct the Customer record for a future mapping pass.",
    ], steps: [], callout: { type: "IMPORTANT", text: "Business Reach reflects the current customer footprint and is independent of the reporting-period filter below it." }, figure_key: "business-reach-owner", figure_caption: "The map summarizes the current geographic customer footprint." },
    { key: "users-access", title: "Users & Access", enabled: true, paragraphs: [
      "Users lists organization members, roles, membership status, invitation state, and recent login information. Owners and Business Admins can invite staff when their access permits it.",
      "From a user detail page, authorized Owners/Admins can change an assignable role, activate a verified invitation, suspend or reactivate access, revoke access, resend an eligible invitation, and reassign work when required.",
    ], steps: [
      { title: "Business Owner", body: "Maintains protected organization access and can assign Business Admin, Staff Manager, and Staff User roles." },
      { title: "Business Admin", body: "Manages organization operations and can assign Staff Manager and Staff User roles." },
      { title: "Staff Manager", body: "Coordinates Cases, assignments, Service Requests, Tasks, Questions, and Rules according to configured permissions." },
      { title: "Staff User", body: "Performs day-to-day customer, Case, Task, and communication work according to configured permissions." },
    ], callout: null, figure_key: "invitation-flow", figure_caption: "Invite, verify, and activate before the member begins work." },
    { key: "settings", title: "Organization Settings", enabled: true, paragraphs: [
      "Use Settings for the organization controls currently available to Owners and Business Admins.",
      "Questions & Rules is available under Settings for defining intake questions and workflow behavior when your role has management access.",
    ], steps: [
      { title: "Case Configuration", body: "Manage Case Types and Task Purposes used by the organization." },
      { title: "Customer Portal", body: "Control portal availability, request submission, priority visibility, onboarding mode, secure document link, and document instructions." },
      { title: "User Access", body: "Review and configure navigation and management permissions for organization roles." },
    ], callout: null, figure_key: "settings-cards", figure_caption: "Only settings available to the active organization role are shown." },
    { key: "common-workflows", title: "Common Workflows", enabled: true, paragraphs: [], steps: [
      { title: "How do I add a customer?", body: "Open Customers; choose New Customer; enter identity, contact, and service-address details; save and open the customer record." },
      { title: "How do I start a Case?", body: "Choose New Case; complete each Guided Intake step; resolve Requirements; review and finish intake." },
      { title: "How do I assign work?", body: "Open the Case or Service Request; use Assignments or Assigned To; select eligible staff; save and confirm the assignment." },
      { title: "How do I respond to a Service Request?", body: "Open Service Desk; select the request; review Conversation and details; send the reply and update status." },
      { title: "How do I invite a staff member?", body: "Open Users and choose Add User; enter name, title, email, and role; send the invitation; activate after verification." },
      { title: "How do I manage Customer Portal access?", body: "Open the Customer record; confirm a valid email; enable, reactivate, disable, or resend; confirm the displayed state." },
      { title: "How do I find overdue work?", body: "Review All Needing Attention; open Tasks; set the due filter to Overdue; open the related Case and update the work." },
      { title: "How do I review reports?", body: "Open Reports; review current Business Reach; select the reporting period and comparison; follow metric links into operational records." },
    ], callout: null, figure_key: null, figure_caption: null },
    { key: "troubleshooting", title: "Tips & Troubleshooting", enabled: true, paragraphs: [], steps: [
      { title: "An option is missing", body: "Actions are permission-aware. Confirm the active organization and ask an Owner or Business Admin to review your role and User Access settings." },
      { title: "A save did not complete", body: "Keep the page open, review highlighted fields, retry once, and refresh if the screen does not update. Avoid repeated submissions while processing." },
      { title: "A customer cannot enter the portal", body: "Confirm the Customer email and Portal Access state, then resend the invitation or reactivate access when the controls allow it." },
      { title: "Work looks incomplete", body: "Review Case readiness, required Questions, document requirements, Tasks, assignments, and status. Some work cannot advance until a required item is resolved." },
    ], callout: { type: "OWNER_ADMIN", text: "Use Users and User Access for organization access changes. Staff members should contact an Owner or Business Admin when their role or permissions need adjustment." }, figure_key: null, figure_caption: null },
  ],
};

const staffContent: HowToGuideContent = {
  title: "DM3Oi Staff How to Guide",
  intro: "A practical guide to day-to-day organization work for Staff Managers and Staff Users. Available actions may vary with assigned permissions.",
  sections: [
    { key: "getting-started", title: "Getting Started", enabled: true, paragraphs: [
      "Know your workspace: The organization name in the application shell identifies the workspace where you are working. Use the main navigation to move between daily work areas.",
      "Find assigned work: Begin with Dashboard for attention items, Tasks for due work, Cases for customer engagements, and Service Desk or Inbox for customer requests.",
      "Keep your profile current: Open your account menu and choose My Profile to review your display name, title, and profile image.",
      "Expect permission differences: Your role and assigned permissions determine which links and actions appear. Staff Managers normally have additional assignment and coordination actions.",
    ], steps: [], callout: { type: "TIP", text: "Confirm that you are in the correct organization before updating customer work." }, figure_key: null, figure_caption: null },
    { key: "dashboard", title: "Dashboard / Operational Overview", enabled: true, paragraphs: [
      "The Operational Dashboard brings together Cases, Tasks, Service Requests, unread communications, and other work that may need attention.",
    ], steps: [
      { title: "Review first", body: "Review overdue and due-today work, Cases or Tasks needing attention, and new or unresolved Service Requests." },
      { title: "Then check progress", body: "Review Case readiness and completion, open versus completed Tasks, and recent visible Case activity." },
    ], callout: { type: "IMPORTANT", text: "A clear attention list does not replace reviewing your assigned Cases and incoming work." }, figure_key: null, figure_caption: null },
    { key: "customers", title: "Customers", enabled: true, paragraphs: [
      "Customer creation and editing are available to the standard staff roles, but an organization can adjust permissions. File-based customer onboarding is not part of the staff workflow.",
    ], steps: [
      { title: "Find", body: "Open Customers and search by customer details or filter by status." },
      { title: "Review", body: "Open a row to see contact information, address, notes, history, and related Cases." },
      { title: "Create", body: "When New Customer is available, enter customer information and save." },
      { title: "Update", body: "Use Edit when customer contact or service-address information changes." },
    ], callout: null, figure_key: "customer-register", figure_caption: "Search the register and open the customer record you need." },
    { key: "cases", title: "Cases", enabled: true, paragraphs: [
      "Document requirements record what is needed and whether it was received. Follow your organization's approved secure-document process for private files.",
    ], steps: [
      { title: "Find a Case", body: "Open Cases and use the active or completed view to locate it." },
      { title: "Start when permitted", body: "Staff Managers normally see New Case and complete Guided Intake. Staff Users begin with existing assigned Cases unless case creation has been granted." },
      { title: "Work requirements", body: "Review status, assigned staff, Questions, required Tasks, document requirements, communications, and activity." },
      { title: "Complete", body: "Resolve blocking Questions and Tasks. When readiness is complete, use Complete Case and record the final outcome." },
    ], callout: null, figure_key: "guided-intake-staff", figure_caption: "Staff Managers normally use these six stages when starting a Case." },
    { key: "tasks", title: "Tasks", enabled: true, paragraphs: [], steps: [
      { title: "Review work", body: "Open Tasks to review authorized work by title, Case, status, and due date." },
      { title: "Filter", body: "Use search and status or due-date filters to find assigned, open, or overdue work." },
      { title: "Update", body: "Open the related Case to update the Task and its supporting work." },
      { title: "Coordinate", body: "Staff Managers normally create, assign, and coordinate Tasks; Staff Users update work available to them." },
    ], callout: { type: "IMPORTANT", text: "Workflow-required Tasks cannot be deleted or manually reordered. Complete the required work or resolve the Case condition that created it." }, figure_key: "task-register-staff", figure_caption: "Use status and due dates to prioritize work." },
    { key: "service-desk", title: "Service Desk", enabled: true, paragraphs: [
      "Replies become part of the request conversation. Keep responses focused on the customer's question and use the approved document channel for private files.",
    ], steps: [
      { title: "Review requests", body: "Open Service Desk to review customer and internally created requests." },
      { title: "Open details", body: "Read the description, conversation, activity, and linked Case." },
      { title: "Reply", body: "When assigned, reply to the customer and update the request as work progresses." },
      { title: "Coordinate", body: "Staff Managers normally assign requests, change coordination details, and oversee status." },
    ], callout: null, figure_key: "service-request-flow-staff", figure_caption: "An assigned request moves through staff review, reply, and resolution." },
    { key: "customer-portal", title: "Customer Portal", enabled: true, paragraphs: [
      "Customers with active access can submit Service Requests, read staff replies, and review visible Case or document requirements. Portal messages appear in related operational records.",
    ], steps: [
      { title: "Respond", body: "Respond from the Service Request or Case source shown by the notification." },
      { title: "Maintain requirements", body: "Keep requirement statuses current so customers receive accurate guidance." },
      { title: "Escalate access issues", body: "If a customer cannot access the portal, record the issue and contact an Owner or Business Admin." },
    ], callout: { type: "STAFF_BOUNDARY", text: "Portal access activation, invitation management, and portal-wide settings are not staff actions." }, figure_key: "portal-interaction", figure_caption: "Customer activity returns to the organization workspace for staff follow-up." },
    { key: "communications", title: "Inbox / Communications", enabled: true, paragraphs: [
      "Response controls depend on your permission and whether work is assigned to you. If an action is unavailable, ask the responsible Staff Manager to review assignment.",
    ], steps: [
      { title: "Review", body: "Use Inbox to review unread and recent customer communication notifications." },
      { title: "Open", body: "Open a notification to reach its Service Request or Case source." },
      { title: "Track read state", body: "Mark items read as you review them, or use the available bulk read action." },
      { title: "Check history", body: "Review the source conversation and activity history before responding." },
    ], callout: null, figure_key: "inbox-pattern", figure_caption: "Open unread activity, review its source, then complete the follow-up." },
    { key: "questions-rules", title: "Questions & Rules", enabled: true, paragraphs: [
      "Questions define information required during Case work. Staff Users can view configured Questions and respond within Cases. Staff Managers normally can add or edit Questions and can view Rules that automate requirements or work.",
    ], steps: [
      { title: "During Case work", body: "Read help text, provide an accurate response, and resolve any follow-up requirement created by the response." },
      { title: "Manager coordination", body: "When manager controls are available, keep Question wording, options, order, and active state aligned with the organization's workflow. Rule editing remains unavailable unless separately permitted." },
    ], callout: null, figure_key: null, figure_caption: null },
    { key: "reports", title: "Reports", enabled: true, paragraphs: [], steps: [
      { title: "Review measures", body: "Open Reports to review operational Case, Task, Customer, and Service Request measures." },
      { title: "Select a period", body: "Use reporting-period controls to compare work in the selected time range." },
      { title: "Review reach", body: "Use Business Reach to understand mapped customer locations and review unmapped locations when available." },
    ], callout: { type: "IMPORTANT", text: "Business Reach reflects the current customer footprint and is independent of the reporting-period filter below it." }, figure_key: "business-reach-staff", figure_caption: "Mapped and unmapped indicators summarize the current customer footprint." },
    { key: "common-workflows", title: "Common Staff Workflows", enabled: true, paragraphs: [], steps: [
      { title: "How do I find a customer?", body: "Open Customers; search or filter the register; open the matching row." },
      { title: "How do I open or start a Case?", body: "Open Cases; search for existing work; if New Case is available, complete Guided Intake." },
      { title: "How do I complete assigned work?", body: "Open Tasks or the related Case; review requirements and due date; update the Task after completing the work." },
      { title: "How do I respond to a request?", body: "Open Service Desk; select the assigned request; review history, reply, and update status." },
      { title: "How do I reply to a customer?", body: "Open the Inbox notification; review the source conversation; reply where the assigned-work control appears." },
      { title: "How do I review required documents?", body: "Open the Case; review document requirements; update receipt status after verification." },
      { title: "How do I find overdue work?", body: "Review Dashboard attention items; open Tasks; apply the overdue due-date filter." },
      { title: "How do I review reports?", body: "Open Reports; select a reporting period; review metrics and current Business Reach." },
    ], callout: null, figure_key: null, figure_caption: null },
    { key: "troubleshooting", title: "Tips & Troubleshooting", enabled: true, paragraphs: [], steps: [
      { title: "If a page does not update", body: "Refresh once and retry the action; confirm required fields; return to the register and reopen the record." },
      { title: "If an option does not appear", body: "The action may depend on role, permission, or assignment, and the record may be read-only. Contact an Owner or Business Admin for access changes." },
    ], callout: { type: "TIP", text: "Include the page name and a brief description of what you were doing when asking for help. Do not include private customer documents." }, figure_key: null, figure_caption: null },
  ],
};

export const defaultHowToGuideContent: Readonly<Record<HowToGuideKey, HowToGuideContent>> = {
  OWNER_ADMIN: ownerAdminContent,
  STAFF: staffContent,
};

const plainText = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length > 0 &&
  value.length <= max && !/[<>]/.test(value);

export function howToGuideTextPlainText(
  value: HowToGuideText,
): string {
  return typeof value === "string"
    ? value
    : value.runs.map((run) => run.text).join("");
}

function richText(value: unknown, max: number): boolean {
  if (plainText(value, max)) return true;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const rich = value as Record<string, unknown>;

  if (
    !exactKeys(rich, ["align", "runs"]) ||
    typeof rich.align !== "string" ||
    !howToGuideTextAlignments.some(
      (alignment) => alignment === rich.align,
    ) ||
    !Array.isArray(rich.runs) ||
    rich.runs.length < 1 ||
    rich.runs.length > 100
  ) {
    return false;
  }

  let combined = "";

  for (const rawRun of rich.runs) {
    if (!rawRun || typeof rawRun !== "object" || Array.isArray(rawRun)) {
      return false;
    }

    const run = rawRun as Record<string, unknown>;
    const keys = Object.keys(run);

    if (
      !keys.every((key) =>
        ["text", "bold", "italic", "underline"].includes(key),
      ) ||
      !Object.hasOwn(run, "text") ||
      typeof run.text !== "string" ||
      run.text.length === 0 ||
      /[<>]/.test(run.text)
    ) {
      return false;
    }

    for (const mark of ["bold", "italic", "underline"] as const) {
      if (
        Object.hasOwn(run, mark) &&
        run[mark] !== true
      ) {
        return false;
      }
    }

    combined += run.text;
  }

  return (
    combined.trim().length > 0 &&
    combined.length <= max &&
    !/[<>]/.test(combined)
  );
}
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key)) &&
  keys.every((key) => Object.hasOwn(value, key));

export function isHowToGuideKey(value: string): value is HowToGuideKey {
  return howToGuideKeys.some((key) => key === value);
}

export function parseHowToGuideContent(
  guideKey: HowToGuideKey,
  value: unknown,
): HowToGuideContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const content = value as Record<string, unknown>;
  if (!exactKeys(content, ["title", "intro", "sections"]) ||
      !plainText(content.title, 120) || !plainText(content.intro, 500) ||
      !Array.isArray(content.sections) || content.sections.length < 1 ||
      content.sections.length > 20) return null;

  const allowedSections = new Set<string>(howToGuideSectionKeys[guideKey]);
  const allowedFigures = new Set<string>(howToGuideFigureKeys[guideKey]);
  const seen = new Set<string>();
  for (const raw of content.sections) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const section = raw as Record<string, unknown>;
    if (!exactKeys(section, ["key", "title", "enabled", "paragraphs", "steps", "callout", "figure_key", "figure_caption"]) ||
        typeof section.key !== "string" || !allowedSections.has(section.key) ||
        seen.has(section.key) || !plainText(section.title, 120) ||
        typeof section.enabled !== "boolean" || !Array.isArray(section.paragraphs) ||
        section.paragraphs.length > 8 || !section.paragraphs.every((item) => richText(item, 2000)) ||
        !Array.isArray(section.steps) || section.steps.length > 12) return null;
    seen.add(section.key);
    for (const rawStep of section.steps) {
      if (!rawStep || typeof rawStep !== "object" || Array.isArray(rawStep)) return null;
      const step = rawStep as Record<string, unknown>;
      if (!exactKeys(step, ["title", "body"]) ||
          !plainText(step.title, 160) || !richText(step.body, 1500)) return null;
    }
    if (section.callout !== null) {
      if (!section.callout || typeof section.callout !== "object" || Array.isArray(section.callout)) return null;
      const callout = section.callout as Record<string, unknown>;
      if (!exactKeys(callout, ["type", "text"]) ||
          typeof callout.type !== "string" ||
          !howToGuideCalloutTypes.some((type) => type === callout.type) ||
          !howToGuideAllowedCalloutTypes[guideKey].some(
            (type) => type === callout.type,
          ) ||
          !richText(callout.text, 1500)) return null;
    }
    if (section.figure_key === null) {
      if (section.figure_caption !== null) return null;
    } else if (typeof section.figure_key !== "string" ||
               !allowedFigures.has(section.figure_key) ||
               !richText(section.figure_caption, 500)) return null;
  }
  return value as HowToGuideContent;
}
