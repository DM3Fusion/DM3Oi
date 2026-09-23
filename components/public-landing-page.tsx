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
    <div className="landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/" aria-label="DM3Oi home">
          <strong>DM3Oi™</strong>
          <span>Business Operations Intelligence</span>
        </Link>

        <nav className="landing-nav" aria-label="Product navigation">
          <a href="#solutions">Solutions</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#systems">Integrations</a>
          <a href="#pricing">Pricing</a>
        </nav>
      </header>

      <main>
        <section className="landing-hero" id="solutions">
          <div className="landing-hero-shade" />

          <div className="landing-hero-copy">
            <p className="landing-kicker">
              People. Work. Progress. Intelligence.
            </p>

            <h1>Manage the work between your systems.</h1>

            <p className="landing-lead">
              Turn everyday operational activity into measurable progress
              without replacing the business systems you already rely on.
            </p>

            <div className="landing-actions">
              <span
                className="landing-button landing-button-primary landing-button-disabled"
                aria-disabled="true"
              >
                Request Trial
                <small>Coming Soon</small>
              </span>

              <Link className="landing-button landing-button-secondary" href="/login">
                Sign In
              </Link>
            </div>

            <div className="landing-trust">
              <CheckCircle2 aria-hidden="true" />
              <span>Secure. Scalable. Built for your organization.</span>
            </div>
          </div>

          <div className="landing-hero-graphic" aria-hidden="true">
            <div className="landing-intelligence-card landing-card-main">
              <span>Operational Intelligence</span>
              <strong>Work in motion</strong>

              <div className="landing-mini-metrics">
                <div>
                  <b>24</b>
                  <small>Open Cases</small>
                </div>
                <div>
                  <b>18</b>
                  <small>Active Tasks</small>
                </div>
                <div>
                  <b>92%</b>
                  <small>Progress</small>
                </div>
              </div>

              <div className="landing-bars">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>

            <div className="landing-intelligence-card landing-card-side">
              <span>Today</span>
              <strong>What needs attention?</strong>
              <div className="landing-status-row">
                <i />
                <span>Customer requests</span>
              </div>
              <div className="landing-status-row">
                <i />
                <span>Assigned work</span>
              </div>
              <div className="landing-status-row">
                <i />
                <span>Due next</span>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-intro" id="how-it-works">
          <p className="landing-section-kicker">
            Business Operations Intelligence
          </p>
          <h2>
            One operational layer for the work that keeps your business moving.
          </h2>
          <p>
            DM3Oi connects people, work, customer activity, and operational
            decisions so your team can see what is happening, what needs
            attention, and what comes next.
          </p>
        </section>

        <section className="landing-capabilities" id="capabilities">
          {capabilities.map(({ icon: Icon, title, text }) => (
            <article key={title}>
              <span className="landing-capability-icon">
                <Icon aria-hidden="true" />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="landing-systems" id="systems">
          <div className="landing-systems-copy">
            <p className="landing-section-kicker">
              Works alongside what you already use
            </p>
            <h2>A better operational layer. Not a replacement.</h2>
            <p>
              Keep the specialized systems your business depends on. DM3Oi
              complements them by organizing the operational work that happens
              across people, customers, requests, cases, and decisions.
            </p>
          </div>

          <div className="landing-system-grid">
            {systems.map(({ icon: Icon, label }) => (
              <div key={label}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-pricing" id="pricing">
          <p className="landing-section-kicker">
            Built to grow with your organization
          </p>
          <h2>Operational clarity without replacing your business systems.</h2>
          <p>
            DM3Oi is being introduced through controlled customer access.
            Additional availability and trial information will follow.
          </p>
        </section>

        <section className="landing-final">
          <div className="landing-final-shade" />
          <div>
            <p>People. Work. Progress. Intelligence.</p>
            <h2>Turn your operations into what&apos;s next.</h2>
            <div className="landing-actions landing-final-actions">
              <span
                className="landing-button landing-button-primary landing-button-disabled"
                aria-disabled="true"
              >
                Request Trial
                <small>Coming Soon</small>
              </span>
              <Link className="landing-button landing-button-secondary" href="/login">
                Sign In
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div>
          <strong>DM3Oi™</strong>
          <span>Business Operations Intelligence</span>
        </div>
        <p>People. Work. Progress. Intelligence.</p>
      </footer>
    </div>
  );
}
