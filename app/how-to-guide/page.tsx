import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { organizationGuideHref } from "@/lib/auth/permissions";

export const metadata = { title: "How to Guide" };

const guideSections = [
  ["getting-started", "Getting Started"],
  ["dashboard", "Dashboard / Operational Overview"],
  ["customers", "Customers"],
  ["cases", "Cases"],
  ["tasks", "Tasks"],
  ["service-desk", "Service Desk"],
  ["customer-portal", "Customer Portal"],
  ["communications", "Communications"],
  ["reports", "Reports & Business Reach"],
  ["users-access", "Users & Access"],
  ["settings", "Organization Settings"],
  ["common-workflows", "Common Workflows"],
  ["troubleshooting", "Tips & Troubleshooting"],
] as const;

function GuideSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel guide-section" id={id}>
      <div className="guide-section-heading">
        <span aria-hidden="true">{number}</span>
        <h2>{title}</h2>
      </div>
      {children}
      <a className="guide-back-to-top" href="#guide-top">
        Back to top
      </a>
    </section>
  );
}

function GuideFigure({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <figure className="guide-figure">
      <div className="guide-figure-canvas" role="img" aria-label={title}>
        {children}
      </div>
      <figcaption>
        <strong>{title}</strong>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

function GuideCallout({
  label,
  children,
}: {
  label: "Tip" | "Important" | "Owner/Admin";
  children: ReactNode;
}) {
  return (
    <aside className="guide-callout">
      <strong>{label}</strong>
      <p>{children}</p>
    </aside>
  );
}

export default async function HowToGuidePage() {
  const access = await getAccessContext();
  if (organizationGuideHref(access) !== "/how-to-guide") notFound();

  return (
    <div className="how-to-guide" id="guide-top">
      <PageHeader
        eyebrow="Help"
        title="DM3Oi How to Guide"
        description="A practical guide for Owners and Business Admins operating their organization workspace. Available actions may vary with assigned permissions."
      />

      <nav className="panel guide-toc" aria-label="How to Guide sections">
        <strong>On this page</strong>
        <ol>
          {guideSections.map(([id, label], index) => (
            <li key={id}>
              <a href={`#${id}`}>
                <span>{index + 1}</span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="guide-section-list">
        <GuideSection id="getting-started" number={1} title="Getting Started">
          <div className="guide-copy-grid">
            <div>
              <h3>Know your workspace</h3>
              <p>
                The organization name in the shell shows the workspace you are
                operating. If you belong to more than one organization, use the
                organization selector before starting work.
              </p>
              <h3>Use the main navigation</h3>
              <p>
                Dashboard, Cases, Inbox, Service Desk, Customers, Tasks,
                Questions &amp; Rules, and Reports lead to daily operational work.
                Users, this guide, and Settings are grouped together in the
                organization administration area.
              </p>
            </div>
            <div>
              <h3>Keep your profile current</h3>
              <p>
                Open your account menu and choose My Profile to review your
                display name, title, and profile image. Your organization role
                and permissions determine which actions and navigation items
                appear.
              </p>
              <h3>Start with active work</h3>
              <p>
                Use Dashboard for priorities, Cases for customer engagements,
                Tasks for due work, and Service Desk or Inbox for customer
                communications.
              </p>
            </div>
          </div>
          <GuideCallout label="Tip">
            Confirm the active organization before creating or updating records.
          </GuideCallout>
        </GuideSection>

        <GuideSection id="dashboard" number={2} title="Dashboard / Operational Overview">
          <p>
            The Operational Dashboard summarizes work that needs attention. Its
            action cards lead to due-today Tasks, open Cases, open Tasks, open
            Service Requests, and unread communications.
          </p>
          <div className="guide-copy-grid">
            <div>
              <h3>Review first</h3>
              <ul>
                <li>All Needing Attention for overdue, due-today, unassigned, awaiting-response, and unread signals.</li>
                <li>Cases Needing Attention and current completion readiness.</li>
                <li>Task Status for open, completed, and customer-waiting work.</li>
              </ul>
            </div>
            <div>
              <h3>Use the supporting views</h3>
              <ul>
                <li>Customer Metrics for current-year, repeat, new, and inactive relationships.</li>
                <li>Case Progress for a quick lifecycle view.</li>
                <li>Recent Activity for the latest visible Case events.</li>
              </ul>
            </div>
          </div>
          <GuideCallout label="Important">
            A healthy dashboard means no visible item currently matches an
            attention rule; continue reviewing active Cases and incoming work.
          </GuideCallout>
        </GuideSection>

        <GuideSection id="customers" number={3} title="Customers">
          <div className="guide-with-figure">
            <div>
              <ol className="guide-steps">
                <li><strong>Find a customer.</strong> Open Customers and search by customer details or filter by status.</li>
                <li><strong>Add a customer.</strong> Choose New Customer, enter the customer information, and save.</li>
                <li><strong>Review the record.</strong> Open a row to see contact details, address, notes, open Cases, history, and Portal Access.</li>
                <li><strong>Maintain accuracy.</strong> Use Edit when contact or service-address information changes.</li>
              </ol>
              <p>
                Owners and Business Admins can use Submit Customer Data for an
                Excel or CSV onboarding file. This workflow is intended for
                initial onboarding or occasional external customer lists, not
                everyday customer maintenance. Submission History shows its
                review state and file disposition.
              </p>
            </div>
            <GuideFigure
              title="Customer workspace example"
              caption="Search the register, open a customer, or begin a new record."
            >
              <div className="guide-mini-toolbar">
                <span>Search customers…</span>
                <b>New Customer</b>
              </div>
              <div className="guide-mini-row">
                <span><strong>Sample Customer</strong><small>Active relationship</small></span>
                <b>Open</b>
              </div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="cases" number={4} title="Cases">
          <div className="guide-with-figure">
            <div>
              <ol className="guide-steps">
                <li><strong>Start.</strong> Choose New Case from Dashboard or Cases when Create Case access is available.</li>
                <li><strong>Complete Guided Intake.</strong> Select or create the Customer, enter Case details, answer applicable Questions, resolve Requirements, review, and finish intake.</li>
                <li><strong>Work the Case.</strong> Monitor status, progress, readiness, assigned staff, Tasks, document requirements, communications, and activity.</li>
                <li><strong>Complete.</strong> Resolve blocking Questions and Tasks. When readiness is complete, choose Complete Case and record the final Tax Prep Outcome.</li>
              </ol>
              <p>
                Active and Completed Cases have separate register tabs. Case
                progress reflects required Questions and Tasks. Document
                requirements record what is needed and received; private files
                remain in the organization&apos;s external secure document system.
              </p>
            </div>
            <GuideFigure
              title="Guided Case Intake steps"
              caption="The live intake follows these six stages in order."
            >
              <div className="guide-mini-steps">
                {[
                  "Customer",
                  "Case Details",
                  "Intake Questions",
                  "Requirements",
                  "Review",
                  "Finish Intake",
                ].map((step, index) => (
                  <span key={step}><b>{index + 1}</b>{step}</span>
                ))}
              </div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="tasks" number={5} title="Tasks">
          <div className="guide-with-figure">
            <div>
              <p>
                Tasks provides a searchable register of authorized organization
                work. Filter by status or due date to find open, completed,
                waiting-on-customer, due-today, and overdue work, then open the
                related Case.
              </p>
              <ul>
                <li>Update status as work advances and keep due dates and assignments accurate when permitted.</li>
                <li>Tasks may be generated by Rules or created during Guided Intake for follow-up and requirements.</li>
                <li>The current Case workspace does not offer standalone Task creation.</li>
                <li>Workflow-required Tasks cannot be deleted or manually reordered.</li>
                <li>A required document Task remains Waiting on Customer while required items are outstanding.</li>
              </ul>
            </div>
            <GuideFigure
              title="Task register example"
              caption="Use status and due-date signals to choose the next item."
            >
              <div className="guide-mini-task"><span><strong>Verify details</strong><small>Related Case</small></span><b>Open</b></div>
              <div className="guide-mini-task"><span><strong>Required documents</strong><small>Due today</small></span><b>Waiting on Customer</b></div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="service-desk" number={6} title="Service Desk">
          <div className="guide-with-figure">
            <div>
              <p>
                Service Desk tracks customer support work. The landing page
                shows request metrics and recent requests; View All Service
                Requests opens searchable status, priority, assignment, and
                updated-date details.
              </p>
              <ol className="guide-steps">
                <li>Create an internal request linked to an existing Customer, or open a request submitted through Customer Portal.</li>
                <li>Assign the request when assignment access is available.</li>
                <li>Use Conversation to send a staff reply and review the customer&apos;s messages.</li>
                <li>Update priority and move the request through New, Open, Pending Customer, On Hold, Resolved, and Closed as appropriate.</li>
              </ol>
            </div>
            <GuideFigure
              title="Service Request conversation flow"
              caption="A request and its replies remain connected across staff and customer views."
            >
              <div className="guide-mini-flow">
                <span>Service Request</span><i aria-hidden="true">→</i><span>Staff Reply</span><i aria-hidden="true">→</i><span>Customer Portal</span>
              </div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="customer-portal" number={7} title="Customer Portal">
          <div className="guide-with-figure">
            <div>
              <p>
                Customer Portal gives an enabled customer a customer-safe view of
                Service Requests, messages and replies, visible Case progress,
                and current document requirements. Customers use the configured
                external secure document system for private files and can report
                that requested documents were sent.
              </p>
              <ol className="guide-steps">
                <li>Open the Customer record and locate Portal Access.</li>
                <li>Add a valid customer email, then choose Enable Portal Access.</li>
                <li>Review the invitation state and resend the invitation when needed.</li>
                <li>Disable or reactivate access from the same Customer record.</li>
              </ol>
              <p>
                If the customer&apos;s email changes, update the Customer record,
                review Portal Access, and send a fresh invitation or reactivate
                access as the screen directs.
              </p>
            </div>
            <GuideFigure
              title="Portal Access controls"
              caption="Manage customer access from the Customer detail page."
            >
              <div className="guide-mini-card">
                <span><strong>Portal Access</strong><small>Invitation state</small></span>
                <b>Enable Portal Access</b>
                <em>Resend invitation</em>
              </div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="communications" number={8} title="Communications">
          <p>
            Choose Inbox in navigation to open the Communications workspace.
            Search communication text and filter by read state, source, and date.
            Sources include Service Requests, Cases, Tasks, email, and other
            operational notifications.
          </p>
          <ul>
            <li>Opening a notification marks it read and takes you to the related work when a destination is available.</li>
            <li>Use Mark all as read for your unread notifications; individual items can also be marked read or unread.</li>
            <li>Owners can see organization-wide notifications, while read status remains recipient-specific.</li>
            <li>Service Request detail retains the related conversation, communication delivery entries, and activity history.</li>
          </ul>
        </GuideSection>

        <GuideSection id="reports" number={9} title="Reports & Business Reach">
          <div className="guide-with-figure">
            <div>
              <p>
                Reports combines operational period metrics with current-state
                workload views. Choose a reporting period, optional comparison,
                or custom From and To dates to review Case volume and completion,
                Task performance, Service Request throughput, customer activity,
                bottlenecks, and work distribution when permitted.
              </p>
              <GuideCallout label="Important">
                Business Reach reflects the current customer footprint and is
                independent of the reporting-period filter below it.
              </GuideCallout>
              <p>
                Business Reach shows mapped active customers, pending locations,
                and unmapped customers. Open the unmapped list to identify
                incomplete or unusable service addresses, then correct the
                Customer record for a future mapping pass.
              </p>
            </div>
            <GuideFigure
              title="Business Reach map key"
              caption="The map summarizes the current geographic customer footprint."
            >
              <div className="guide-mini-map">
                <i className="guide-map-dot one" aria-hidden="true" />
                <i className="guide-map-dot two" aria-hidden="true" />
                <i className="guide-map-dot three" aria-hidden="true" />
              </div>
              <div className="guide-mini-key"><span><i />Mapped</span><span><i />Unmapped</span></div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="users-access" number={10} title="Users & Access">
          <div className="guide-with-figure">
            <div>
              <p>
                Users lists organization members, roles, membership status,
                invitation state, and recent login information. Owners and
                Business Admins can invite staff when their access permits it.
              </p>
              <dl className="guide-role-list">
                <div><dt>Business Owner</dt><dd>Maintains protected organization access and can assign Business Admin, Staff Manager, and Staff User roles.</dd></div>
                <div><dt>Business Admin</dt><dd>Manages organization operations and can assign Staff Manager and Staff User roles.</dd></div>
                <div><dt>Staff Manager</dt><dd>Coordinates Cases, assignments, Service Requests, Tasks, Questions, and Rules according to configured permissions.</dd></div>
                <div><dt>Staff User</dt><dd>Performs day-to-day customer, Case, Task, and communication work according to configured permissions.</dd></div>
              </dl>
              <p>
                From a user detail page, authorized Owners/Admins can change an
                assignable role, activate a verified invitation, suspend or
                reactivate access, revoke access, resend an eligible invitation,
                and reassign work when required.
              </p>
            </div>
            <GuideFigure
              title="Organization invitation flow"
              caption="Invite, verify, and activate before the member begins work."
            >
              <div className="guide-mini-flow">
                <span>Add User</span><i aria-hidden="true">→</i><span>Send Invitation</span><i aria-hidden="true">→</i><span>Activate User</span>
              </div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="settings" number={11} title="Organization Settings">
          <div className="guide-with-figure">
            <div>
              <p>Use Settings for the organization controls currently available to Owners and Business Admins:</p>
              <ul>
                <li><strong>Case Configuration:</strong> manage Case Types and Task Purposes used by the organization.</li>
                <li><strong>Customer Portal:</strong> control portal availability, request submission, priority visibility, onboarding mode, secure document link, and document instructions.</li>
                <li><strong>User Access:</strong> review and configure navigation and management permissions for organization roles.</li>
              </ul>
              <p>
                Questions &amp; Rules has its own main-navigation workspace for
                defining intake questions and workflow behavior when your role
                has management access.
              </p>
            </div>
            <GuideFigure
              title="Organization settings cards"
              caption="Only settings available to the active organization role are shown."
            >
              <div className="guide-mini-settings">
                <span>Case Configuration</span>
                <span>Customer Portal</span>
                <span>User Access</span>
              </div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="common-workflows" number={12} title="Common Workflows">
          <div className="guide-workflow-grid">
            <article><h3>How do I add a customer?</h3><ol><li>Open Customers.</li><li>Choose New Customer.</li><li>Enter identity, contact, and service-address details.</li><li>Save, then open the customer record.</li></ol></article>
            <article><h3>How do I start a Case?</h3><ol><li>Choose New Case.</li><li>Complete each Guided Intake step.</li><li>Resolve Requirements.</li><li>Review and finish intake.</li></ol></article>
            <article><h3>How do I assign work?</h3><ol><li>Open the Case or Service Request.</li><li>Use Assignments or Assigned To.</li><li>Select an eligible staff member.</li><li>Save and confirm the updated assignment.</li></ol></article>
            <article><h3>How do I respond to a Service Request?</h3><ol><li>Open Service Desk.</li><li>Select the request.</li><li>Review Conversation and details.</li><li>Send the staff reply and update status.</li></ol></article>
            <article><h3>How do I invite a staff member?</h3><ol><li>Open Users and choose Add User.</li><li>Enter name, title, email, and an assignable role.</li><li>Send Invitation.</li><li>Activate after verification.</li></ol></article>
            <article><h3>How do I manage Customer Portal access?</h3><ol><li>Open the Customer record.</li><li>Confirm a valid email.</li><li>Enable, reactivate, disable, or resend as needed.</li><li>Confirm the displayed access state.</li></ol></article>
            <article><h3>How do I find overdue work?</h3><ol><li>Review All Needing Attention.</li><li>Open Tasks.</li><li>Set the due filter to Overdue.</li><li>Open the related Case and update the work.</li></ol></article>
            <article><h3>How do I review reports?</h3><ol><li>Open Reports.</li><li>Review current Business Reach.</li><li>Select the reporting period and comparison.</li><li>Follow metric links into operational records.</li></ol></article>
          </div>
        </GuideSection>

        <GuideSection id="troubleshooting" number={13} title="Tips & Troubleshooting">
          <div className="guide-copy-grid">
            <div>
              <h3>An option is missing</h3>
              <p>
                Actions are permission-aware. Confirm the active organization
                and ask an Owner or Business Admin to review your role and User
                Access settings.
              </p>
              <h3>A save did not complete</h3>
              <p>
                Keep the page open, review any highlighted fields, retry once,
                and refresh if the screen does not update. Avoid submitting the
                same action repeatedly while it is processing.
              </p>
            </div>
            <div>
              <h3>A customer cannot enter the portal</h3>
              <p>
                Confirm the Customer email and Portal Access state, then resend
                the invitation or reactivate access when the controls allow it.
              </p>
              <h3>Work looks incomplete</h3>
              <p>
                Review Case readiness, required Questions, document requirements,
                Tasks, assignments, and status. Some work cannot advance until a
                required item is resolved.
              </p>
            </div>
          </div>
          <GuideCallout label="Owner/Admin">
            Use Users and User Access for organization access changes. Staff
            members should contact an Owner or Business Admin when their role or
            permissions need adjustment.
          </GuideCallout>
        </GuideSection>
      </div>

      <p className="guide-finish">
        Ready to work? <Link href="/">Return to Dashboard</Link>
      </p>
    </div>
  );
}
