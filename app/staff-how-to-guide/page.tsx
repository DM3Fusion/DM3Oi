import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { organizationGuideHref } from "@/lib/auth/permissions";

export const metadata = { title: "Staff How to Guide" };

const guideSections = [
  ["getting-started", "Getting Started"],
  ["dashboard", "Dashboard / Operational Overview"],
  ["customers", "Customers"],
  ["cases", "Cases"],
  ["tasks", "Tasks"],
  ["service-desk", "Service Desk"],
  ["customer-portal", "Customer Portal"],
  ["communications", "Inbox / Communications"],
  ["questions-rules", "Questions & Rules"],
  ["reports", "Reports"],
  ["common-workflows", "Common Staff Workflows"],
  ["troubleshooting", "Tips & Troubleshooting"],
] as const;

function GuideSection({ id, number, title, children }: {
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
      <a className="guide-back-to-top" href="#guide-top">Back to top</a>
    </section>
  );
}

function GuideFigure({ title, caption, children }: {
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <figure className="guide-figure">
      <div className="guide-figure-canvas" role="img" aria-label={title}>
        {children}
      </div>
      <figcaption><strong>{title}</strong><span>{caption}</span></figcaption>
    </figure>
  );
}

function GuideCallout({ label, children }: { label: string; children: ReactNode }) {
  return <aside className="guide-callout"><strong>{label}</strong><p>{children}</p></aside>;
}

export default async function StaffHowToGuidePage() {
  const access = await getAccessContext();
  if (organizationGuideHref(access) !== "/staff-how-to-guide") notFound();

  return (
    <div className="how-to-guide" id="guide-top">
      <PageHeader
        eyebrow="Help"
        title="DM3Oi Staff How to Guide"
        description="A practical guide to day-to-day organization work for Staff Managers and Staff Users. Available actions may vary with assigned permissions."
      />

      <nav className="panel guide-toc" aria-label="Staff How to Guide sections">
        <strong>On this page</strong>
        <ol>
          {guideSections.map(([id, label], index) => (
            <li key={id}><a href={`#${id}`}><span>{index + 1}</span>{label}</a></li>
          ))}
        </ol>
      </nav>

      <div className="guide-section-list">
        <GuideSection id="getting-started" number={1} title="Getting Started">
          <div className="guide-copy-grid">
            <div>
              <h3>Know your workspace</h3>
              <p>The organization name in the application shell identifies the workspace where you are working. Use the main navigation to move between daily work areas.</p>
              <h3>Find assigned work</h3>
              <p>Begin with Dashboard for attention items, Tasks for due work, Cases for customer engagements, and Service Desk or Inbox for customer requests.</p>
            </div>
            <div>
              <h3>Keep your profile current</h3>
              <p>Open your account menu and choose My Profile to review your display name, title, and profile image.</p>
              <h3>Expect permission differences</h3>
              <p>Your role and assigned permissions determine which links and actions appear. Staff Managers normally have additional assignment and coordination actions.</p>
            </div>
          </div>
          <GuideCallout label="Tip">Confirm that you are in the correct organization before updating customer work.</GuideCallout>
        </GuideSection>

        <GuideSection id="dashboard" number={2} title="Dashboard / Operational Overview">
          <p>The Operational Dashboard brings together Cases, Tasks, Service Requests, unread communications, and other work that may need attention.</p>
          <div className="guide-copy-grid">
            <div><h3>Review first</h3><ul><li>Overdue and due-today work.</li><li>Cases or Tasks needing attention.</li><li>New or unresolved Service Requests.</li></ul></div>
            <div><h3>Then check progress</h3><ul><li>Case readiness and completion progress.</li><li>Open versus completed Tasks.</li><li>Recent visible Case activity.</li></ul></div>
          </div>
          <GuideCallout label="Important">A clear attention list does not replace reviewing your assigned Cases and incoming work.</GuideCallout>
        </GuideSection>

        <GuideSection id="customers" number={3} title="Customers">
          <div className="guide-with-figure">
            <div>
              <ol className="guide-steps">
                <li><strong>Find.</strong> Open Customers and search by customer details or filter by status.</li>
                <li><strong>Review.</strong> Open a row to see contact information, address, notes, history, and related Cases.</li>
                <li><strong>Create.</strong> When New Customer is available, enter the customer information and save.</li>
                <li><strong>Update.</strong> Use Edit when customer contact or service-address information changes.</li>
              </ol>
              <p>Customer creation and editing are available to the standard staff roles, but an organization can adjust permissions. File-based customer onboarding is not part of the staff workflow.</p>
            </div>
            <GuideFigure title="Customer register example" caption="Search the register and open the customer record you need.">
              <div className="guide-mini-toolbar"><span>Search customers…</span><b>New Customer</b></div>
              <div className="guide-mini-row"><span><strong>Example Customer</strong><small>Active relationship</small></span><b>Open</b></div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="cases" number={4} title="Cases">
          <div className="guide-with-figure">
            <div>
              <ol className="guide-steps">
                <li><strong>Find a Case.</strong> Open Cases and use the active or completed view to locate it.</li>
                <li><strong>Start when permitted.</strong> Staff Managers normally see New Case and complete Guided Intake. Staff Users begin with existing assigned Cases unless case creation has been granted.</li>
                <li><strong>Work requirements.</strong> Review status, assigned staff, Questions, required Tasks, document requirements, communications, and activity.</li>
                <li><strong>Complete.</strong> Resolve blocking Questions and Tasks. When readiness is complete, use Complete Case and record the final outcome.</li>
              </ol>
              <p>Document requirements record what is needed and whether it was received. Follow your organization&apos;s approved secure-document process for private files.</p>
            </div>
            <GuideFigure title="Guided Case Intake sequence" caption="Staff Managers normally use these six stages when starting a Case.">
              <div className="guide-mini-steps">
                {[
                  "Customer", "Case Details", "Intake Questions", "Requirements", "Review", "Finish Intake",
                ].map((step, index) => <span key={step}><b>{index + 1}</b>{step}</span>)}
              </div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="tasks" number={5} title="Tasks">
          <div className="guide-with-figure">
            <div>
              <ul>
                <li>Open Tasks to review authorized work by title, Case, status, and due date.</li>
                <li>Use search and status or due-date filters to find assigned, open, or overdue work.</li>
                <li>Open the related Case to update the Task and its supporting work.</li>
                <li>Staff Managers normally create, assign, and coordinate Tasks; Staff Users update work available to them.</li>
              </ul>
              <GuideCallout label="Important">Workflow-required Tasks cannot be deleted or manually reordered. Complete the required work or resolve the Case condition that created it.</GuideCallout>
            </div>
            <GuideFigure title="Task register example" caption="Use status and due dates to prioritize work.">
              <div className="guide-mini-row"><span><strong>Review required information</strong><small>Due today · In progress</small></span><b>Open</b></div>
              <div className="guide-mini-row"><span><strong>Confirm customer response</strong><small>Due tomorrow · Open</small></span><b>Open</b></div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="service-desk" number={6} title="Service Desk">
          <div className="guide-with-figure">
            <div>
              <ol className="guide-steps">
                <li>Open Service Desk to review customer and internally created requests.</li>
                <li>Open a request to read its description, conversation, activity, and linked Case.</li>
                <li>When assigned, reply to the customer and update the request as work progresses.</li>
                <li>Staff Managers normally assign requests, change coordination details, and oversee status.</li>
              </ol>
              <p>Replies become part of the request conversation. Keep responses focused on the customer&apos;s question and use the approved document channel for private files.</p>
            </div>
            <GuideFigure title="Service Request work flow" caption="An assigned request moves through staff review, reply, and resolution.">
              <div className="guide-flow"><span>Customer Request</span><b>→</b><span>Assigned Staff</span><b>→</b><span>Reply &amp; Resolve</span></div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="customer-portal" number={7} title="Customer Portal">
          <div className="guide-with-figure">
            <div>
              <p>Customers with active access can submit Service Requests, read staff replies, and review visible Case or document requirements. Portal messages appear in the related operational records.</p>
              <ul>
                <li>Respond from the Service Request or Case source shown by the notification.</li>
                <li>Keep requirement statuses current so customers receive accurate guidance.</li>
                <li>If a customer cannot access the portal, record the issue and contact an Owner or Business Admin.</li>
              </ul>
              <GuideCallout label="Staff boundary">Portal access activation, invitation management, and portal-wide settings are not staff actions.</GuideCallout>
            </div>
            <GuideFigure title="Customer Portal interaction" caption="Customer activity returns to the organization workspace for staff follow-up.">
              <div className="guide-flow"><span>Customer Portal</span><b>→</b><span>Service Request</span><b>→</b><span>Staff Reply</span></div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="communications" number={8} title="Inbox / Communications">
          <div className="guide-with-figure">
            <div>
              <ul>
                <li>Use Inbox to review unread and recent customer communication notifications.</li>
                <li>Open a notification to reach its Service Request or Case source.</li>
                <li>Mark items read as you review them, or use the available bulk read action.</li>
                <li>Review the source conversation and activity history before responding.</li>
              </ul>
              <p>Response controls depend on your permission and whether the work is assigned to you. If an action is unavailable, ask the responsible Staff Manager to review assignment.</p>
            </div>
            <GuideFigure title="Inbox review pattern" caption="Open unread activity, review its source, then complete the follow-up.">
              <div className="guide-mini-row"><span><strong>New customer reply</strong><small>Unread · Service Request</small></span><b>Open</b></div>
              <div className="guide-mini-row"><span><strong>Requirement update</strong><small>Read · Case activity</small></span><b>Open</b></div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="questions-rules" number={9} title="Questions & Rules">
          <p>Questions define information required during Case work. Staff Users can view configured Questions and respond to applicable Questions within Cases. Staff Managers normally can add or edit Questions and can view the Rules that automate requirements or work.</p>
          <div className="guide-copy-grid">
            <div><h3>During Case work</h3><p>Read help text, provide an accurate response, and resolve any follow-up requirement created by the response.</p></div>
            <div><h3>Manager coordination</h3><p>When manager controls are available, keep Question wording, options, order, and active state aligned with the organization&apos;s workflow. Rule editing remains unavailable unless separately permitted.</p></div>
          </div>
        </GuideSection>

        <GuideSection id="reports" number={10} title="Reports">
          <div className="guide-with-figure">
            <div>
              <ul>
                <li>Open Reports to review operational Case, Task, Customer, and Service Request measures.</li>
                <li>Use reporting-period controls to compare work in the selected time range.</li>
                <li>Use Business Reach to understand mapped customer locations and review unmapped locations when available.</li>
              </ul>
              <GuideCallout label="Important">Business Reach reflects the current customer footprint and is independent of the reporting-period filter below it.</GuideCallout>
            </div>
            <GuideFigure title="Business Reach map key" caption="Mapped and unmapped indicators summarize the current customer footprint.">
              <div className="guide-map-mini"><span className="guide-map-point one">1</span><span className="guide-map-point two">2</span><span className="guide-map-point three">3</span></div>
              <div className="guide-map-legend"><span><i />Mapped customers</span><span><i />Needs location review</span></div>
            </GuideFigure>
          </div>
        </GuideSection>

        <GuideSection id="common-workflows" number={11} title="Common Staff Workflows">
          <div className="guide-workflows">
            <article><h3>How do I find a customer?</h3><ol><li>Open Customers.</li><li>Search or filter the register.</li><li>Open the matching row.</li></ol></article>
            <article><h3>How do I open or start a Case?</h3><ol><li>Open Cases.</li><li>Search for existing work.</li><li>If New Case is available, complete Guided Intake.</li></ol></article>
            <article><h3>How do I complete assigned work?</h3><ol><li>Open Tasks or the related Case.</li><li>Review requirements and due date.</li><li>Update the Task after completing the work.</li></ol></article>
            <article><h3>How do I respond to a request?</h3><ol><li>Open Service Desk.</li><li>Select the assigned request.</li><li>Review history, reply, and update status.</li></ol></article>
            <article><h3>How do I reply to a customer?</h3><ol><li>Open the Inbox notification.</li><li>Review the source conversation.</li><li>Reply where the assigned-work control appears.</li></ol></article>
            <article><h3>How do I review required documents?</h3><ol><li>Open the Case.</li><li>Review document requirements.</li><li>Update receipt status after verification.</li></ol></article>
            <article><h3>How do I find overdue work?</h3><ol><li>Review Dashboard attention items.</li><li>Open Tasks.</li><li>Apply the overdue due-date filter.</li></ol></article>
            <article><h3>How do I review reports?</h3><ol><li>Open Reports.</li><li>Select a reporting period.</li><li>Review metrics and current Business Reach.</li></ol></article>
          </div>
        </GuideSection>

        <GuideSection id="troubleshooting" number={12} title="Tips & Troubleshooting">
          <div className="guide-copy-grid">
            <div><h3>If a page does not update</h3><ul><li>Refresh once and retry the action.</li><li>Confirm required fields are complete.</li><li>Return to the register and reopen the record.</li></ul></div>
            <div><h3>If an option does not appear</h3><ul><li>The action may depend on your role, permission, or assignment.</li><li>The record may already be completed or otherwise read-only.</li><li>Contact an Owner or Business Admin for organization access or permission changes.</li></ul></div>
          </div>
          <GuideCallout label="Tip">Include the page name and a brief description of what you were doing when asking for help. Do not include private customer documents.</GuideCallout>
        </GuideSection>
      </div>
    </div>
  );
}
