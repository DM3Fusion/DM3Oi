import Link from "next/link";
import {
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Headphones,
  Inbox,
  ListChecks,
  ShieldCheck,
} from "lucide-react";

const capabilities = [
  {
    icon: Inbox,
    title: "Inbox",
    text: "Keep operational communications visible and connected to the work.",
  },
  {
    icon: Headphones,
    title: "Service Desk",
    text: "Receive, assign, track, and resolve customer service requests.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Cases",
    text: "Organize customer work, responsibility, progress, and history.",
  },
  {
    icon: ClipboardCheck,
    title: "Tasks",
    text: "Turn operational requirements into clear, accountable work.",
  },
  {
    icon: ListChecks,
    title: "Questions & Rules",
    text: "Use structured questions and rules to guide repeatable workflows.",
  },
  {
    icon: BarChart3,
    title: "Intelligence",
    text: "See workload, progress, bottlenecks, and operational outcomes.",
  },
];

export function PublicLandingPage() {
  return (
    <div className="public-home">
      <header className="public-home-header">
        <Link className="public-home-brand" href="/" aria-label="DM3Oi home">
          <strong>
            DM3<span>O</span>i™
          </strong>
          <small>Operational Intelligence</small>
        </Link>
      </header>

      <main>
        <section className="public-home-hero">
          <div className="public-home-hero-copy">
            <p className="public-home-eyebrow">
              Business Operations Intelligence
            </p>

            <h1 className="public-home-headline">
              <span>People. Work.</span>
              <strong>Progress. Intelligence.</strong>
            </h1>

            <p className="public-home-lead">
              DM3Oi™ brings customer requests, communications, cases, tasks,
              workflows, and operational insight together in one place.
            </p>

            <div className="public-home-actions">
              <Link className="public-home-primary" href="/login">
                Sign In to DM3Oi
              </Link>

              <span className="public-home-trial-button" aria-disabled="true">
                Request Trial
                <small>Coming Soon</small>
              </span>
            </div>

            <div className="public-home-hero-points">
              <span>Customer service</span>
              <span>Operational workflow</span>
              <span>Measurable progress</span>
            </div>
          </div>

          <div
            className="public-home-product"
            aria-label="DM3Oi Service Desk desktop and mobile Inbox illustration"
          >
            <div className="public-home-laptop">
              <div className="public-home-laptop-screen">
                <div className="public-home-app-rail">
                  <div className="public-home-app-brand">
                    <strong>
                      DM3<span>O</span>i
                    </strong>
                    <small>Operational Intelligence</small>
                  </div>

                  <div className="public-home-app-nav">
                    <span>Dashboard</span>
                    <span>Cases</span>
                    <span>Inbox</span>
                    <span className="is-active">Service Desk</span>
                    <span>Customers</span>
                    <span>Tasks</span>
                    <span>Questions &amp; Rules</span>
                    <span>Reports</span>
                  </div>
                </div>

                <div className="public-home-service-desk">
                  <div className="public-home-app-banner">
                    <div>
                      <strong>People. Work. Progress. Intelligence.</strong>
                      <span>for Your Organization</span>
                    </div>
                    <i />
                  </div>

                  <div className="public-home-service-content">
                    <div className="public-home-service-heading">
                      <div>
                        <small>Customer Service</small>
                        <strong>Service Desk</strong>
                      </div>
                      <span>+ New Service Request</span>
                    </div>

                    <div className="public-home-service-metrics">
                      <div>
                        <span>Urgent</span>
                        <strong>0</strong>
                      </div>
                      <div>
                        <span>Open</span>
                        <strong>12</strong>
                      </div>
                      <div>
                        <span>New</span>
                        <strong>11</strong>
                      </div>
                      <div>
                        <span>Unassigned</span>
                        <strong>10</strong>
                      </div>
                      <div>
                        <span>Resolved</span>
                        <strong>3</strong>
                      </div>
                    </div>

                    <div className="public-home-request-table">
                      <div className="public-home-request-title">
                        <strong>Recent Service Requests</strong>
                        <span>View All Service Requests ›</span>
                      </div>

                      <div className="public-home-request-header">
                        <span>Request</span>
                        <span>Customer</span>
                        <span>Subject</span>
                        <span>Status</span>
                      </div>

                      <div className="public-home-request-row">
                        <b>SR-2026-0015</b>
                        <span>Johnson &amp; Sons</span>
                        <strong>Customer account update</strong>
                        <em>New</em>
                      </div>

                      <div className="public-home-request-row">
                        <b>SR-2026-0014</b>
                        <span>Northfield Group</span>
                        <strong>Service request received</strong>
                        <em>Open</em>
                      </div>

                      <div className="public-home-request-row">
                        <b>SR-2026-0013</b>
                        <span>Harbor &amp; Co.</span>
                        <strong>Information requested</strong>
                        <em>New</em>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="public-home-laptop-base" />
            </div>

            <div className="public-home-phone">
              <div className="public-home-phone-screen">
                <div className="public-home-phone-status">
                  <span>9:41</span>
                  <i />
                </div>

                <div className="public-home-phone-brand">
                  <div>
                    <strong>
                      DM3<span>O</span>i
                    </strong>
                    <small>Operational Intelligence</small>
                  </div>
                  <b>DM</b>
                </div>

                <div className="public-home-phone-content">
                  <small>Communications</small>
                  <h3>Inbox</h3>

                  <div className="public-home-phone-search">
                    Search communications
                  </div>

                  <article className="is-unread">
                    <div>
                      <strong>New service request</strong>
                      <time>Now</time>
                    </div>
                    <p>Customer submitted a new request.</p>
                    <span>Service Desk</span>
                  </article>

                  <article>
                    <div>
                      <strong>Customer response</strong>
                      <time>9:18</time>
                    </div>
                    <p>New response received for Case #1048.</p>
                    <span>Customer Message</span>
                  </article>

                  <article>
                    <div>
                      <strong>Task update</strong>
                      <time>8:42</time>
                    </div>
                    <p>Assigned work was updated.</p>
                    <span>Staff Activity</span>
                  </article>
                </div>

                <div className="public-home-phone-nav">
                  <span>Home</span>
                  <span>Cases</span>
                  <span className="is-active">Inbox</span>
                  <span>More</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="public-home-feature-section">
          <div className="public-home-centered-heading">
            <p className="public-home-eyebrow">One operational workspace</p>
            <h2>Keep customer service and operational work moving.</h2>
            <p>
              From the first request through the work, communication, and
              outcome, DM3Oi keeps the activity your organization depends on
              visible and connected.
            </p>
          </div>

          <div className="public-home-feature-grid">
            {capabilities.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span className="public-home-feature-icon">
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="public-home-value">
          <div className="public-home-value-copy">
            <p className="public-home-eyebrow">Business operations</p>
            <h2>A better operational layer. Not a replacement.</h2>
            <p>
              Keep the accounting, quoting, CRM, payment, and other business
              systems you already rely on. DM3Oi manages the operational work
              that happens between them.
            </p>

            <div className="public-home-value-list">
              <div>
                <CheckCircle2 aria-hidden="true" />
                <span>One place for customer requests and communications</span>
              </div>
              <div>
                <CheckCircle2 aria-hidden="true" />
                <span>Clear ownership from request through resolution</span>
              </div>
              <div>
                <CheckCircle2 aria-hidden="true" />
                <span>Operational progress your team can see</span>
              </div>
            </div>
          </div>

          <aside className="public-home-value-panel">
            <span className="public-home-value-panel-icon">
              <ShieldCheck aria-hidden="true" />
            </span>
            <p className="public-home-eyebrow">Your organization</p>
            <h3>Built around the people responsible for the work.</h3>
            <p>
              Organization-based access, configurable permissions, customer
              service workflows, and role-aware workspaces keep the right
              information with the right people.
            </p>
          </aside>
        </section>

        <section className="public-home-final">
          <div>
            <p className="public-home-eyebrow">
              DM3Oi™ Business Operations Intelligence
            </p>
            <h2>People. Work. Progress. Intelligence.</h2>
            <p>
              Bring customer service and operational work into one connected
              workspace.
            </p>
            <Link className="public-home-primary" href="/login">
              Sign In to DM3Oi
            </Link>
          </div>
        </section>
      </main>

      <footer className="public-home-footer">
        <div className="public-home-footer-brand">
          <strong>DM3Oi™</strong>
          <small>Business Operations Intelligence</small>
        </div>

        <span>People. Work. Progress. Intelligence.</span>

        <nav className="public-home-legal-links" aria-label="Public links">
          <Link href="/login">Sign In</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </nav>
      </footer>
    </div>
  );
}
