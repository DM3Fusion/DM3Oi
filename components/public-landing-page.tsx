import Image from "next/image";
import Link from "next/link";

import {
  defaultPublicLandingPageContent,
  type PublicLandingPageContent,
} from "@/lib/public-landing-page";

type CapabilityType =
  | "inbox"
  | "service"
  | "cases"
  | "tasks"
  | "rules"
  | "secure";

function CapabilityIcon({
  type,
}: {
  type: CapabilityType;
}) {
  const common = {
    width: 48,
    height: 48,
    viewBox: "0 0 48 48",
    "aria-hidden": true,
  };

  if (type === "inbox") {
    return (
      <svg {...common}>
        <rect x="7" y="11" width="34" height="27" rx="5" fill="#2ca8da" />
        <path d="M10 16l14 11 14-11" fill="none" stroke="#dff5ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 35l10-10M38 35 28 25" fill="none" stroke="#8dd9f4" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "service") {
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="17" fill="#dff5ff" />
        <path d="M12 25v-3a12 12 0 0 1 24 0v3" fill="none" stroke="#2ca8da" strokeWidth="4" strokeLinecap="round" />
        <rect x="9" y="23" width="7" height="11" rx="3" fill="#177eae" />
        <rect x="32" y="23" width="7" height="11" rx="3" fill="#177eae" />
        <path d="M36 33c0 5-4 7-9 7" fill="none" stroke="#69c7ed" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="25" cy="40" r="2" fill="#177eae" />
      </svg>
    );
  }

  if (type === "cases") {
    return (
      <svg {...common}>
        <rect x="7" y="13" width="34" height="27" rx="5" fill="#2ca8da" />
        <path d="M17 13V9h14v4" fill="none" stroke="#69c7ed" strokeWidth="3" />
        <rect x="11" y="19" width="26" height="4" rx="2" fill="#dff5ff" />
        <rect x="15" y="28" width="18" height="3" rx="1.5" fill="#9be1f7" />
        <rect x="15" y="34" width="12" height="3" rx="1.5" fill="#4386ad" />
      </svg>
    );
  }

  if (type === "tasks") {
    return (
      <svg {...common}>
        <rect x="11" y="7" width="26" height="34" rx="4" fill="#dff5ff" />
        <rect x="16" y="4" width="16" height="6" rx="3" fill="#69c7ed" />
        <rect x="15" y="15" width="5" height="5" rx="1" fill="#2198c9" />
        <path d="m16.5 17.5 1.2 1.2 2-2.5" fill="none" stroke="#fff" strokeWidth="1.5" />
        <rect x="23" y="16" width="9" height="2.5" rx="1.25" fill="#4386ad" />
        <rect x="15" y="24" width="5" height="5" rx="1" fill="#2198c9" />
        <path d="m16.5 26.5 1.2 1.2 2-2.5" fill="none" stroke="#fff" strokeWidth="1.5" />
        <rect x="23" y="25" width="9" height="2.5" rx="1.25" fill="#4386ad" />
      </svg>
    );
  }

  if (type === "rules") {
    return (
      <svg {...common}>
        <path
          d="M21 5h6l1.4 5.1a15 15 0 0 1 3.5 1.5l4.7-2.6 4.2 4.2-2.6 4.7a15 15 0 0 1 1.5 3.5L45 23v6l-5.3 1.6a15 15 0 0 1-1.5 3.5l2.6 4.7-4.2 4.2-4.7-2.6a15 15 0 0 1-3.5 1.5L27 47h-6l-1.4-5.1a15 15 0 0 1-3.5-1.5L11.4 43l-4.2-4.2 2.6-4.7a15 15 0 0 1-1.5-3.5L3 29v-6l5.3-1.6a15 15 0 0 1 1.5-3.5l-2.6-4.7L11.4 9l4.7 2.6a15 15 0 0 1 3.5-1.5Z"
          fill="#56bee8"
        />
        <circle cx="24" cy="26" r="9" fill="#dff5ff" />
        <circle cx="24" cy="26" r="5" fill="#245f84" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M24 4 39 10v11c0 10-5.5 17.2-15 22-9.5-4.8-15-12-15-22V10Z" fill="#319fd2" />
      <path d="M24 8 35 12.5v8.2c0 7.6-3.8 13.2-11 17.3Z" fill="#55bde6" />
      <rect x="17" y="22" width="14" height="11" rx="2.5" fill="#e8f7fd" />
      <path d="M20 22v-3.5a4 4 0 0 1 8 0V22" fill="none" stroke="#e8f7fd" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="27" r="1.5" fill="#24769f" />
      <path d="M24 28.5v2" stroke="#24769f" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}



export function PublicLandingPage({
  content = defaultPublicLandingPageContent,
  deploymentVersion,
  preview = false,
}: {
  content?: PublicLandingPageContent;
  deploymentVersion?: string;
  preview?: boolean;
}) {
  void deploymentVersion;

  return (
    <main className="public-home">
      {preview && (
        <div className="public-home-preview-banner">
          <strong>Draft Preview</strong>
          <span>
            This is the SUPER_ADMIN working draft. It is not the
            published DM3Oi landing page.
          </span>
          <Link href="/admin/landing-page">
            Return to Landing Page Management
          </Link>
        </div>
      )}
        <section className="public-home-hero public-home-hero-showcase">
          <div className="public-home-brand-banner">
            <div className="public-home-brand-banner-logo">
              <Image
                src="/brand/DM3Oi_landing_page_top_left.webp"
                alt="DM3Oi Business Operations Intelligence"
                width={602}
                height={198}
                priority
                sizes="(max-width: 760px) 100vw, 34vw"
              />
            </div>

            <div className="public-home-brand-banner-copy">
              <h1>People. Work. Progress. Intelligence.</h1>

              <h2>
                Manage the work between your systems.
              </h2>

              <p>
                Turn everyday operational activity into measurable
                progress—without replacing the business systems you
                already rely on.
              </p>
            </div>

            <div className="public-home-brand-banner-side">
              <div
                className="public-home-brand-banner-promise"
                aria-label="Same people. Greater progress."
              >
                <span>Same</span>
                <span>People.</span>
                <strong>Greater</strong>
                <strong>Progress.</strong>
              </div>

              <div className="public-home-actions public-home-showcase-actions">
                <Link href="/login" className="public-home-primary">
                  {content.hero.signInLabel}
                </Link>

                <span
                  className="public-home-trial-button"
                  aria-disabled="true"
                >
                  {content.hero.trialLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="public-home-product-showcase">
            <div className="public-home-product-hero">
              <Image
                src="/brand/DM3Oi_laptop_iPhone.png"
                alt="DM3Oi dashboard on a laptop with the Cases workspace on a mobile phone"
                width={1774}
                height={887}
                priority
                sizes="(max-width: 760px) 100vw, 72vw"
              />
            </div>
          </div>
        </section>


      <section
        className="public-home-feature-section"
        aria-labelledby="features-heading"
      >
        <div className="public-home-centered-heading">
          <p className="public-home-eyebrow">
            {content.features.eyebrow}
          </p>
          <h2 id="features-heading">
            {content.features.heading}
          </h2>
          <p>
            {content.features.lead}
          </p>
        </div>

        <div className="public-home-feature-grid">
          {[...content.features.items]
            .sort(
              (a, b) =>
                ["service", "inbox", "cases", "tasks", "rules", "secure"].indexOf(a.key) -
                ["service", "inbox", "cases", "tasks", "rules", "secure"].indexOf(b.key),
            )
            .map((item) => (
            <article key={item.key}>
              <div className="public-home-feature-icon">
                <CapabilityIcon type={item.key} />
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="public-home-value"
        aria-labelledby="value-heading"
      >
          <div className="public-home-value-copy">
            <h2 id="value-heading">
              A smarter way to manage what matters.
            </h2>

            <div className="public-home-value-list">
              {[
                "Connect people, work and customers",
                "Increase accountability",
                "Improve response times",
                "Gain real operational insight",
              ].map((point) => (
                <div key={point}>
                  <span>✓</span>
                  {point}
                </div>
              ))}
            </div>
          </div>

        <aside className="public-home-value-panel">
          <div className="public-home-value-panel-icon">
            <CapabilityIcon type="secure" />
          </div>
          <p className="public-home-eyebrow">
            {content.value.panelEyebrow}
          </p>
          <h3>
            {content.value.panelHeading}
          </h3>
          <p>
            {content.value.panelBody}
          </p>
        </aside>
      </section>

      <footer className="public-home-footer">
        <div className="public-home-footer-brand">
          <strong>DM3Oi™</strong>

          <span className="public-home-footer-detail">
            Business Operations Intelligence
          </span>
        </div>

        <nav aria-label="Public links">
          <Link href="/login">Sign In</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </nav>
      </footer>
    </main>
  );
}
