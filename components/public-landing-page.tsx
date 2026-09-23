import Link from "next/link";
import {
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Gauge,
  Layers3,
  MessageSquareText,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

const capabilities = [
  {
    icon: BriefcaseBusiness,
    title: "Organize",
    text: "Bring cases, customers, service requests, and communications into one operational workspace.",
  },
  {
    icon: UsersRound,
    title: "Assign",
    text: "Make ownership, responsibility, priorities, and due dates clear across your organization.",
  },
  {
    icon: ClipboardCheck,
    title: "Work",
    text: "Manage tasks, questions, rules, and repeatable workflows that move work forward.",
  },
  {
    icon: MessageSquareText,
    title: "Serve",
    text: "Connect customer requests and internal activity with visibility, history, and accountability.",
  },
  {
    icon: BarChart3,
    title: "Understand",
    text: "See progress, workload, bottlenecks, outcomes, and the operational intelligence behind them.",
  },
  {
    icon: Settings2,
    title: "Configure",
    text: "Adapt roles, access, workflows, and operating rules to the way your organization works.",
  },
];

const systems = [
  { icon: FileText, label: "Accounting" },
  { icon: ClipboardCheck, label: "Quoting" },
  { icon: UsersRound, label: "CRM" },
  { icon: Gauge, label: "Payments" },
  { icon: Layers3, label: "ERP" },
  { icon: BriefcaseBusiness, label: "And others" },
];

export function PublicLandingPage() {
  return (
    <div className="public-home">
      <header className="public-home-header">
        <Link className="public-home-brand" href="/" aria-label="DM3Oi home">
          <strong>DM3Oi™</strong>
          <span>Business Operations Intelligence</span>
        </Link>

        <nav className="public-home-nav" aria-label="Product navigation">
          <a href="#capabilities">Solutions</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#integrations">Integrations</a>
          <a href="#pricing">Pricing</a>
        </nav>
      </header>

      <main>
        <section className="public-home-hero">
          <div className="public-home-hero-copy">
            <p className="public-home-eyebrow">
              Business Operations Intelligence
            </p>

            <h1 className="public-home-headline">
              <span className="public-home-headline-dark">
                People. Work.
              </span>
              <span className="public-home-headline-blue">
                Progress. Intelligence.
              </span>
            </h1>

            <p className="public-home-lead">
              DM3Oi™ gives your organization one operational layer for
              managing the work that happens between your business systems.
            </p>

            <div className="public-home-actions">
              <Link className="public-home-primary" href="/login">
                Sign In to DM3Oi
              </Link>

              <span
                className="public-home-trial-button"
                aria-disabled="true"
              >
                Request Trial
                <small>Coming Soon</small>
              </span>
            </div>

            <div className="public-home-hero-points">
              <span>Organized operational work</span>
              <span>Clear responsibility</span>
              <span>Measurable progress</span>
            </div>
          </div>

          <div
            className="public-home-product"
            aria-label="Illustration of the DM3Oi operational workspace"
          >
            <div className="public-home-product-window">
              <div className="public-home-product-topbar">
                <div className="public-home-product-mini-brand">
                  <strong>DM3Oi</strong>
                  <span>Operational Intelligence</span>
                </div>
                <span>Workspace</span>
              </div>

              <div className="public-home-product-body">
                <nav aria-label="Illustrative workspace navigation">
                  <strong>DM3Oi</strong>
                  <span className="is-active">Dashboard</span>
                  <span>Cases</span>
                  <span>Inbox</span>
                  <span>Service Desk</span>
                  <span>Customers</span>
                  <span>Tasks</span>
                  <span>Reports</span>
                </nav>

                <div className="public-home-product-content">
                  <div className="public-home-product-heading">
                    <div>
                      <small>Dashboard</small>
                      <strong>Operational Dashboard</strong>
                    </div>
                    <span>+ New Case</span>
                  </div>

                  <div className="public-home-product-metrics">
                    <div>
                      <small>Open Cases</small>
                      <strong>24</strong>
                    </div>
                    <div>
                      <small>Active Tasks</small>
                      <strong>18</strong>
                    </div>
                    <div>
                      <small>Progress</small>
                      <strong>92%</strong>
                    </div>
                  </div>

                  <div className="public-home-product-panels">
                    <section>
                      <header>
                        <span>Needs Attention</span>
                        <b>4</b>
                      </header>
                      <div className="public-home-attention-row">
                        <i />
                        <span>
                          <strong>Customer response needed</strong>
                          <small>Case #1048 · Today</small>
                        </span>
                      </div>
                      <div className="public-home-attention-row">
                        <i />
                        <span>
                          <strong>Task approaching due date</strong>
                          <small>Case #1042 · Tomorrow</small>
                        </span>
                      </div>
                      <div className="public-home-attention-row">
                        <i />
                        <span>
                          <strong>Service request received</strong>
                          <small>New · 12 minutes ago</small>
                        </span>
                      </div>
                    </section>

                    <section>
                      <header>
                        <span>Work Progress</span>
                        <b>72%</b>
                      </header>
                      <div className="public-home-chart">
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                      <div className="public-home-chart-labels">
                        <span>Open</span>
                        <span>Working</span>
                        <span>Done</span>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>

            <div className="public-home-product-caption">
              <CheckCircle2 aria-hidden="true" />
              <div>
                <strong>People. Work. Progress. Intelligence.</strong>
                <span>
                  Operational visibility without replacing the systems you
                  already use.
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          className="public-home-feature-section"
          id="capabilities"
        >
          <div className="public-home-centered-heading">
            <p className="public-home-eyebrow">
              Operational capabilities
            </p>
            <h2>Everything you need to keep work moving.</h2>
            <p>
              Give operational work a consistent place across your
              organization while keeping the specialized business systems
              you already depend on.
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

        <section
          className="public-home-how"
          id="how-it-works"
        >
          <div className="public-home-section-heading">
            <p className="public-home-eyebrow">
              One operational layer
            </p>
            <h2>From activity to operational intelligence.</h2>
            <p>
              DM3Oi connects everyday work to the information your team
              needs to understand progress and decide what comes next.
            </p>
          </div>

          <div className="public-home-how-grid">
            <article>
              <span>01</span>
              <h3>Bring work together</h3>
              <p>
                Organize cases, requests, customers, communications, tasks,
                questions, and operating rules.
              </p>
            </article>

            <article>
              <span>02</span>
              <h3>Move work forward</h3>
              <p>
                Make ownership and next actions visible while preserving the
                history behind operational activity.
              </p>
            </article>

            <article>
              <span>03</span>
              <h3>Understand progress</h3>
              <p>
                Turn the work already happening across the organization into
                useful operational intelligence.
              </p>
            </article>
          </div>
        </section>

        <section className="public-home-systems" id="integrations">
          <div className="public-home-centered-heading">
            <p className="public-home-eyebrow">
              Works alongside what you already use
            </p>
            <h2>A better operational layer. Not a replacement.</h2>
            <p>
              DM3Oi complements specialized business systems by organizing
              the operational work that happens across them.
            </p>
          </div>

          <div className="public-home-system-grid">
            {systems.map(({ icon: Icon, label }) => (
              <div key={label}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section
          className="public-home-value"
          id="pricing"
        >
          <div className="public-home-value-copy">
            <p className="public-home-eyebrow">
              Business value
            </p>
            <h2>
              Keep operational work organized from request to outcome.
            </h2>
            <p>
              Give your organization a consistent place to manage
              responsibility, customer activity, work progress, and the
              information needed to make better operational decisions.
            </p>

            <div className="public-home-value-list">
              <div>
                <CheckCircle2 aria-hidden="true" />
                <span>Keep customer and operational work organized</span>
              </div>
              <div>
                <CheckCircle2 aria-hidden="true" />
                <span>Make ownership and next actions visible</span>
              </div>
              <div>
                <CheckCircle2 aria-hidden="true" />
                <span>Preserve activity and communication history</span>
              </div>
              <div>
                <CheckCircle2 aria-hidden="true" />
                <span>Identify workload and operational bottlenecks</span>
              </div>
              <div>
                <CheckCircle2 aria-hidden="true" />
                <span>Control access by organization role</span>
              </div>
            </div>
          </div>

          <aside className="public-home-value-panel">
            <span className="public-home-value-panel-icon">
              <ShieldCheck aria-hidden="true" />
            </span>
            <p className="public-home-eyebrow">
              Organization-based access
            </p>
            <h3>
              Your operational information stays within the appropriate
              workspace.
            </h3>
            <p>
              DM3Oi combines email verification, organization-based access,
              configurable permissions, and role-aware workflows so users
              work within the responsibilities assigned to them.
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
              Access your organization&apos;s DM3Oi workspace to continue
              managing the work that keeps your business moving.
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

        <div className="public-home-footer-detail">
          <span>People. Work. Progress. Intelligence.</span>
        </div>

        <nav className="public-home-legal-links" aria-label="Public links">
          <Link href="/login">Sign In</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </nav>
      </footer>
    </div>
  );
}
